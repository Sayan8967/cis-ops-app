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
INGRESS_IP=localhost

if [ "" != "localhost" ]; then
  echo "Testing backend health..."
  curl -f http:///api/health || echo "Backend health check failed"

  echo "Testing frontend..."
  curl -f http:/// || echo "Frontend check failed"
else
  echo "⚠️  No external IP found, skipping HTTP tests"
fi

echo "✅ Validation completed!"
