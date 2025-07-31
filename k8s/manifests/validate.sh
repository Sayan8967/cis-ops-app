#!/bin/bash

echo "🔍 Validating CIS-OPS Deployment..."

# Check namespace
echo "Checking namespace..."
kubectl get namespace cis-ops

# Check deployments
echo "Checking deployments..."
kubectl get deployments -n cis-ops

# Check pods
echo "Checking pods..."
kubectl get pods -n cis-ops

# Check services
echo "Checking services..."
kubectl get services -n cis-ops

# Check ingress
echo "Checking ingress..."
kubectl get ingress -n cis-ops

# Check ingress controller
echo "Checking ingress controller..."
kubectl get pods -n ingress-nginx

# Test health endpoints
echo "Testing application health..."

# Get ingress IP
INGRESS_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "localhost")

if [ "$INGRESS_IP" != "localhost" ]; then
  echo "Testing backend health..."
  curl -f http://$INGRESS_IP/api/health || echo "Backend health check failed"
  
  echo "Testing frontend..."
  curl -f http://$INGRESS_IP/ || echo "Frontend check failed"
else
  echo "⚠️  No external IP found, skipping HTTP tests"
fi

echo "✅ Validation completed!"
