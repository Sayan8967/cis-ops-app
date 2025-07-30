#!/bin/bash
set -e

echo "🚀 Deploying CIS Operations Dashboard..."

# Function to check if a resource exists
resource_exists() {
  kubectl get "$1" "$2" -n "$3" >/dev/null 2>&1
}

# Function to wait for deployment to be ready
wait_for_deployment() {
  echo "⏳ Waiting for $1 deployment to be ready..."
  kubectl wait --for=condition=available --timeout=300s deployment/$1 -n $2
}

# Check if NGINX Ingress Controller is installed
echo "🔍 Checking NGINX Ingress Controller installation..."

if ! kubectl get namespace ingress-nginx >/dev/null 2>&1; then
  echo "📦 NGINX Ingress Controller not found. Installing..."
  
  # Detect if running on cloud provider or bare metal
  if kubectl get nodes -o jsonpath='{.items[*].spec.providerID}' | grep -q "^$"; then
    echo "🏗️  Installing NGINX Ingress Controller for bare metal..."
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/baremetal/deploy.yaml
  else
    echo "☁️  Installing NGINX Ingress Controller for cloud provider..."
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
  fi
  
  echo "⏳ Waiting for NGINX Ingress Controller to be ready..."
  kubectl wait --namespace ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=300s
    
  echo "✅ NGINX Ingress Controller installation completed"
else
  echo "✅ NGINX Ingress Controller already installed"
  
  # Check if the controller is running
  if ! kubectl get pods -n ingress-nginx -l app.kubernetes.io/component=controller --field-selector=status.phase=Running | grep -q Running; then
    echo "⚠️  NGINX Ingress Controller pods are not running. Waiting for them to be ready..."
    kubectl wait --namespace ingress-nginx \
      --for=condition=ready pod \
      --selector=app.kubernetes.io/component=controller \
      --timeout=300s
  fi
fi

# Verify Ingress API availability and generate appropriate manifest
echo "🔍 Detecting supported Ingress API version..."
cd deployment
bash k8s/ingress-detection.sh || {
  echo "⚠️  Ingress API detection failed, using fallback configuration"
}

# Apply Kubernetes manifests in order
echo ""
echo "📋 Applying Kubernetes manifests..."

echo "📁 Creating namespace..."
kubectl apply -f k8s/namespace.yml

echo "⚙️  Applying configuration..."
kubectl apply -f k8s/configmap.yml

echo "🏗️  Creating IngressClass..."
kubectl apply -f k8s/ingress-class.yml

echo "🖥️  Deploying backend service..."
kubectl apply -f k8s/backend-deployment.yml
wait_for_deployment "cis-ops-backend" "cis-ops"

echo "🌐 Deploying frontend service..."
kubectl apply -f k8s/frontend-deployment.yml
wait_for_deployment "cis-ops-frontend" "cis-ops"

# Apply ingress with retry logic and validation
echo "🌍 Configuring ingress..."

# First, verify that Ingress CRD exists
echo "🔍 Verifying Ingress Custom Resource Definition..."
if ! kubectl get crd ingresses.networking.k8s.io >/dev/null 2>&1 && ! kubectl get crd ingresses.extensions >/dev/null 2>&1; then
  echo "❌ Ingress CRD not found! This might indicate an issue with the cluster setup."
  echo "Available CRDs:"
  kubectl get crd | grep ingress || echo "No ingress-related CRDs found"
  echo "Available API resources:"
  kubectl api-resources | grep -i ingress || echo "No ingress API resources found"
  
  echo "⚠️  Attempting to continue without ingress (services will still be accessible via port-forward)"
else
  echo "✅ Ingress CRD exists"
  
  # Validate NGINX ingress controller admission webhook
  echo "🔍 Validating NGINX admission webhook..."
  for i in {1..5}; do
    if kubectl get validatingadmissionwebhooks.admissionregistration.k8s.io ingress-nginx-admission >/dev/null 2>&1; then
      echo "✅ NGINX admission webhook is available"
      WEBHOOK_READY=true
      break
    else
      echo "⏳ Waiting for NGINX admission webhook (attempt $i/5)..."
      sleep 10
    fi
  done
  
  # Check if ingress resource already exists and delete if necessary
  if kubectl get ingress -n cis-ops cis-ops-ingress >/dev/null 2>&1; then
    echo "🗑️  Removing existing ingress to ensure clean deployment..."
    kubectl delete ingress -n cis-ops cis-ops-ingress --ignore-not-found=true
    sleep 5
  fi
  
  # Apply ingress with comprehensive retry logic
  INGRESS_APPLIED=false
  for i in {1..5}; do
    echo "🔧 Applying ingress configuration (attempt $i/5)..."
    
    # Try different approaches based on attempt number
    case $i in
      1|2)
        # Standard approach
        if kubectl apply -f k8s/ingress.yml; then
          echo "✅ Ingress applied successfully"
          INGRESS_APPLIED=true
          break
        fi
        ;;
      3)
        # Try with server-side apply
        echo "🔄 Trying server-side apply..."
        if kubectl apply --server-side -f k8s/ingress.yml; then
          echo "✅ Ingress applied successfully with server-side apply"
          INGRESS_APPLIED=true
          break
        fi
        ;;
      4)
        # Try with force override
        echo "🔄 Trying with force override..."
        if kubectl apply -f k8s/ingress.yml --force; then
          echo "✅ Ingress applied successfully with force"
          INGRESS_APPLIED=true
          break
        fi
        ;;
      5)
        # Try creating directly with kubectl create
        echo "🔄 Trying direct creation..."
        kubectl delete ingress -n cis-ops cis-ops-ingress --ignore-not-found=true
        sleep 5
        if kubectl create -f k8s/ingress.yml; then
          echo "✅ Ingress created successfully"
          INGRESS_APPLIED=true
          break
        fi
        ;;
    esac
    
    echo "❌ Ingress application failed, attempt $i/5"
    echo "🔍 Debugging information:"
    kubectl api-resources | grep -i ingress
    kubectl get crd | grep ingress
    
    if [ $i -lt 5 ]; then
      echo "⏳ Waiting 15 seconds before retry..."
      sleep 15
    fi
  done
  
  if [ "$INGRESS_APPLIED" = "false" ]; then
    echo "💥 Failed to apply ingress after 5 attempts"
    echo "🔍 Final debugging information:"
    echo "Available ingress API versions:"
    kubectl api-versions | grep -E "(networking|extensions)"
    echo "Available ingress resources:"
    kubectl api-resources | grep -i ingress
    echo "Ingress controller status:"
    kubectl get pods -n ingress-nginx
    kubectl get svc -n ingress-nginx
    echo ""
    echo "⚠️  Continuing deployment without ingress. Services can be accessed via:"
    echo "   kubectl port-forward -n cis-ops svc/cis-ops-frontend-service 8080:80"
    echo "   kubectl port-forward -n cis-ops svc/cis-ops-backend-service 8081:4000"
  else
    # Verify ingress configuration
    echo "🔍 Verifying ingress configuration..."
    kubectl get ingress -n cis-ops cis-ops-ingress -o wide
    kubectl describe ingress -n cis-ops cis-ops-ingress
  fi
fi

# Install/Upgrade Grafana Cloud K8s Monitoring using Helm
echo ""
echo "📊 Setting up Grafana Cloud monitoring..."

# Check if helm is available
if command -v helm >/dev/null 2>&1; then
  helm repo add grafana https://grafana.github.io/helm-charts
  helm repo update
  
  helm upgrade --install --atomic --timeout 300s grafana-k8s-monitoring grafana/k8s-monitoring \
    --namespace "monitoring" \
    --create-namespace \
    --values helm/grafana-cloud-values.yml
  
  echo "✅ Grafana Cloud monitoring configured"
else
  echo "⚠️  Helm not found. Skipping Grafana Cloud monitoring setup."
  echo "   Install Helm and run the monitoring setup manually."
fi

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "=== 📊 Access Information ==="

# Get ingress controller service info
INGRESS_SERVICE=$(kubectl get svc -n ingress-nginx -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -n "$INGRESS_SERVICE" ]; then
  SERVICE_TYPE=$(kubectl get svc -n ingress-nginx $INGRESS_SERVICE -o jsonpath='{.spec.type}')
  
  if [ "$SERVICE_TYPE" = "LoadBalancer" ]; then
    EXTERNAL_IP=$(kubectl get svc -n ingress-nginx $INGRESS_SERVICE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    if [ -z "$EXTERNAL_IP" ]; then
      EXTERNAL_IP=$(kubectl get svc -n ingress-nginx $INGRESS_SERVICE -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    fi
    if [ -n "$EXTERNAL_IP" ]; then
      echo "🌐 Access your application at: http://$EXTERNAL_IP"
    else
      echo "⏳ LoadBalancer IP pending. Check with: kubectl get svc -n ingress-nginx"
    fi
  elif [ "$SERVICE_TYPE" = "NodePort" ]; then
    NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="ExternalIP")].address}')
    if [ -z "$NODE_IP" ]; then
      NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
    fi
    NODE_PORT=$(kubectl get svc -n ingress-nginx $INGRESS_SERVICE -o jsonpath='{.spec.ports[?(@.name=="http")].nodePort}')
    echo "🌐 Access your application at: http://$NODE_IP:$NODE_PORT"
  else
    echo "🔧 Use kubectl port-forward to access your application:"
    echo "   kubectl port-forward -n ingress-nginx svc/$INGRESS_SERVICE 8080:80"
    echo "   Then visit: http://localhost:8080"
  fi
else
  echo "⚠️  Could not determine ingress access method"
fi

echo "📈 Access Grafana Cloud dashboard at your Grafana Cloud instance"
echo "📊 Monitoring data will be sent to Grafana Cloud automatically"

echo ""
echo "=== 🛠️  Useful Commands ==="
echo "Check application status: kubectl get all -n cis-ops"
echo "Check ingress status: kubectl get ingress -n cis-ops"
echo "View ingress controller logs: kubectl logs -n ingress-nginx deployment/ingress-nginx-controller"
echo "View frontend logs: kubectl logs -n cis-ops deployment/cis-ops-frontend"
echo "View backend logs: kubectl logs -n cis-ops deployment/cis-ops-backend"
echo "Check ingress controller admission webhook: kubectl get validatingadmissionwebhooks.admissionregistration.k8s.io"

echo ""
echo "=== 🔍 Troubleshooting ==="
echo "If ingress issues persist:"
echo "1. Check ingress controller pods: kubectl get pods -n ingress-nginx"
echo "2. Check admission webhook: kubectl get validatingadmissionwebhooks.admissionregistration.k8s.io ingress-nginx-admission"
echo "3. Restart ingress controller: kubectl rollout restart deployment/ingress-nginx-controller -n ingress-nginx"
echo "4. Check ingress events: kubectl describe ingress -n cis-ops cis-ops-ingress"
