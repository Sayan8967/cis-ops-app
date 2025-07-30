#!/bin/bash
set -e

echo "🚀 Deploying CIS Operations Dashboard (Complete Manifest)..."

# Apply the complete manifest
echo "📋 Applying complete Kubernetes manifest..."
kubectl apply -f complete-manifest.yaml

# Wait for NGINX Ingress Controller
echo "⏳ Waiting for NGINX Ingress Controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/name=ingress-nginx \
  --timeout=300s

# Wait for deployments
echo "⏳ Waiting for application deployments to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/cis-ops-backend -n cis-ops
kubectl wait --for=condition=available --timeout=300s deployment/cis-ops-frontend -n cis-ops

echo "✅ Deployment completed successfully!"
echo ""
echo "📊 Deployment Status:"
kubectl get pods -n cis-ops
echo ""
kubectl get ingress -n cis-ops
echo ""
echo "🌐 Access your application:"
echo "  - Kind cluster: http://localhost"
echo "  - Port forward: kubectl port-forward svc/cis-ops-frontend-service 8080:80 -n cis-ops"
echo ""
echo "🔍 Useful commands:"
echo "  kubectl logs -f deployment/cis-ops-backend -n cis-ops"
echo "  kubectl logs -f deployment/cis-ops-frontend -n cis-ops"
echo "  kubectl get pods -n cis-ops"
