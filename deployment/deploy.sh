#!/bin/bash
set -e

echo "🚀 Deploying CIS Operations Dashboard..."

# Check if NGINX Ingress Controller is installed
if ! kubectl get namespace ingress-nginx >/dev/null 2>&1; then
  echo "📦 Installing NGINX Ingress Controller..."
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
  echo "⏳ Waiting for NGINX Ingress Controller to be ready..."
  kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=300s
fi

# Apply manifests
echo "📋 Applying Kubernetes manifests..."
kubectl apply -f namespace.yml
kubectl apply -f backend.yml
kubectl apply -f frontend.yml
kubectl apply -f ingress.yml

# Wait for deployments
echo "⏳ Waiting for deployments to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/cis-ops-backend -n cis-ops
kubectl wait --for=condition=available --timeout=300s deployment/cis-ops-frontend -n cis-ops

echo "✅ Deployment completed successfully!"
echo "🌐 Check ingress status: kubectl get ingress -n cis-ops"
