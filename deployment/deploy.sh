#!/bin/bash
set -e

echo "Deploying CIS Operations Dashboard..."

# Apply Kubernetes manifests
kubectl apply -f k8s/namespace.yml
kubectl apply -f k8s/configmap.yml
kubectl apply -f k8s/backend-deployment.yml
kubectl apply -f k8s/frontend-deployment.yml
kubectl apply -f k8s/ingress.yml

# Install/Upgrade Grafana Cloud K8s Monitoring using Helm
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm upgrade --install --atomic --timeout 300s grafana-k8s-monitoring grafana/k8s-monitoring \
  --namespace "monitoring" \
  --create-namespace \
  --values helm/grafana-cloud-values.yml

echo "Deployment completed successfully!"
echo "Access your application at: http://cis-ops.example.com"
echo "Access Grafana Cloud dashboard at your Grafana Cloud instance"
echo "Monitoring data will be sent to Grafana Cloud automatically"
