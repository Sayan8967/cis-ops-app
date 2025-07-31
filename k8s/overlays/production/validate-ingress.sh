#!/bin/bash

echo "🔍 Validating Ingress Setup..."

# Check if ingress controller is running
echo "Checking NGINX Ingress Controller..."
kubectl get pods -n ingress-nginx -l app.kubernetes.io/component=controller

# Check ingress class
echo "Checking IngressClass..."
kubectl get ingressclass

# Check application ingress
echo "Checking application ingress..."
kubectl get ingress -n cis-ops

# Describe ingress for detailed info
echo "Ingress details:"
kubectl describe ingress cis-ops-ingress -n cis-ops

# Check ingress controller service
echo "Checking ingress controller service..."
kubectl get svc -n ingress-nginx

echo "✅ Ingress validation completed!"
