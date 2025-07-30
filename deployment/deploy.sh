#!/bin/bash
set -e

echo "Deploying CIS Operations Dashboard..."

# Check if NGINX Ingress Controller is installed
if ! kubectl get namespace ingress-nginx >/dev/null 2>&1; then
  echo "NGINX Ingress Controller not found. Installing..."
  
  # Detect if running on cloud provider or bare metal
  if kubectl get nodes -o jsonpath='{.items[*].spec.providerID}' | grep -q "^$"; then
    echo "Installing NGINX Ingress Controller for bare metal..."
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/baremetal/deploy.yaml
  else
    echo "Installing NGINX Ingress Controller for cloud provider..."
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
  fi
  
  echo "Waiting for NGINX Ingress Controller to be ready..."
  kubectl wait --namespace ingress-nginx     --for=condition=ready pod     --selector=app.kubernetes.io/component=controller     --timeout=300s
else
  echo "NGINX Ingress Controller already installed."
fi

# Apply Kubernetes manifests
echo "Applying Kubernetes manifests..."
kubectl apply -f k8s/namespace.yml
kubectl apply -f k8s/configmap.yml
kubectl apply -f k8s/backend-deployment.yml
kubectl apply -f k8s/frontend-deployment.yml

# Apply ingress with retry logic
echo "Applying ingress configuration..."
for i in {1..3}; do
  if kubectl apply -f k8s/ingress.yml; then
    echo "Ingress applied successfully"
    break
  else
    echo "Ingress application failed, attempt $i/3"
    if [ $i -eq 3 ]; then
      echo "Failed to apply ingress after 3 attempts"
      exit 1
    fi
    sleep 10
  fi
done

# Apply NodePort service for ingress controller if needed
if kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.spec.type}' | grep -q "ClusterIP"; then
  echo "Creating NodePort service for ingress access..."
  kubectl apply -f k8s/ingress-controller-install.yml
fi

# Install/Upgrade Grafana Cloud K8s Monitoring using Helm
echo "Installing Grafana Cloud monitoring..."
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm upgrade --install --atomic --timeout 300s grafana-k8s-monitoring grafana/k8s-monitoring \
  --namespace "monitoring" \
  --create-namespace \
  --values helm/grafana-cloud-values.yml

echo "Deployment completed successfully!"
echo ""
echo "=== Access Information ==="

# Get ingress controller service info
INGRESS_SERVICE=$(kubectl get svc -n ingress-nginx -o jsonpath='{.items[0].metadata.name}')
SERVICE_TYPE=$(kubectl get svc -n ingress-nginx $INGRESS_SERVICE -o jsonpath='{.spec.type}')

if [ "$SERVICE_TYPE" = "LoadBalancer" ]; then
  EXTERNAL_IP=$(kubectl get svc -n ingress-nginx $INGRESS_SERVICE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
  if [ -z "$EXTERNAL_IP" ]; then
    EXTERNAL_IP=$(kubectl get svc -n ingress-nginx $INGRESS_SERVICE -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
  fi
  echo "Access your application at: http://$EXTERNAL_IP"
elif [ "$SERVICE_TYPE" = "NodePort" ]; then
  NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="ExternalIP")].address}')
  if [ -z "$NODE_IP" ]; then
    NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
  fi
  NODE_PORT=$(kubectl get svc -n ingress-nginx $INGRESS_SERVICE -o jsonpath='{.spec.ports[?(@.name=="http")].nodePort}')
  echo "Access your application at: http://$NODE_IP:$NODE_PORT"
else
  echo "Use kubectl port-forward to access your application:"
  echo "kubectl port-forward -n ingress-nginx svc/$INGRESS_SERVICE 8080:80"
  echo "Then visit: http://localhost:8080"
fi

echo "Access Grafana Cloud dashboard at your Grafana Cloud instance"
echo "Monitoring data will be sent to Grafana Cloud automatically"

echo ""
echo "=== Useful Commands ==="
echo "Check application status: kubectl get all -n cis-ops"
echo "Check ingress status: kubectl get ingress -n cis-ops"
echo "View application logs: kubectl logs -n cis-ops deployment/cis-ops-frontend"
echo "View backend logs: kubectl logs -n cis-ops deployment/cis-ops-backend"
