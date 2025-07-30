#!/bin/bash

# Function to detect supported Ingress API version
detect_ingress_api() {
  if kubectl api-versions | grep -q "networking.k8s.io/v1" && kubectl api-resources | grep -q "ingresses.*networking.k8s.io/v1"; then
    echo "networking.k8s.io/v1"
  elif kubectl api-versions | grep -q "networking.k8s.io/v1beta1"; then
    echo "networking.k8s.io/v1beta1"
  elif kubectl api-versions | grep -q "extensions/v1beta1"; then
    echo "extensions/v1beta1"
  else
    echo "none"
  fi
}

# Get the supported API version
API_VERSION=$(detect_ingress_api)
echo "Detected Ingress API version: $API_VERSION"

# Generate appropriate ingress manifest based on API version
if [ "$API_VERSION" = "networking.k8s.io/v1" ]; then
  cat > k8s/ingress.yml <<'INGRESS_EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cis-ops-ingress
  namespace: cis-ops
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    nginx.ingress.kubernetes.io/use-regex: "true"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "300"
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, PUT, POST, DELETE, PATCH, OPTIONS"
    nginx.ingress.kubernetes.io/cors-allow-origin: "*"
    nginx.ingress.kubernetes.io/cors-allow-credentials: "true"
    nginx.ingress.kubernetes.io/cors-allow-headers: "*"
    nginx.ingress.kubernetes.io/proxy-body-size: "8m"
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /api(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: cis-ops-backend-service
            port:
              number: 4000
      - path: /socket.io(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: cis-ops-backend-service
            port:
              number: 4000
      - path: /()(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: cis-ops-frontend-service
            port:
              number: 80
INGRESS_EOF

elif [ "$API_VERSION" = "networking.k8s.io/v1beta1" ]; then
  cat > k8s/ingress.yml <<'INGRESS_EOF'  
apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: cis-ops-ingress
  namespace: cis-ops
  annotations:
    kubernetes.io/ingress.class: "nginx"
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    nginx.ingress.kubernetes.io/use-regex: "true"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "300"
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, PUT, POST, DELETE, PATCH, OPTIONS"
    nginx.ingress.kubernetes.io/cors-allow-origin: "*"
    nginx.ingress.kubernetes.io/cors-allow-credentials: "true"
    nginx.ingress.kubernetes.io/cors-allow-headers: "*"
    nginx.ingress.kubernetes.io/proxy-body-size: "8m"
spec:
  rules:
  - http:
      paths:
      - path: /api(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          serviceName: cis-ops-backend-service
          servicePort: 4000
      - path: /socket.io(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          serviceName: cis-ops-backend-service
          servicePort: 4000
      - path: /()(.*)
        pathType: ImplementationSpecific
        backend:
          serviceName: cis-ops-frontend-service
          servicePort: 80
INGRESS_EOF

elif [ "$API_VERSION" = "extensions/v1beta1" ]; then
  cat > k8s/ingress.yml <<'INGRESS_EOF'
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: cis-ops-ingress
  namespace: cis-ops
  annotations:
    kubernetes.io/ingress.class: "nginx"
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    nginx.ingress.kubernetes.io/use-regex: "true"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "300"
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, PUT, POST, DELETE, PATCH, OPTIONS"
    nginx.ingress.kubernetes.io/cors-allow-origin: "*"
    nginx.ingress.kubernetes.io/cors-allow-credentials: "true"
    nginx.ingress.kubernetes.io/cors-allow-headers: "*"
    nginx.ingress.kubernetes.io/proxy-body-size: "8m"
spec:
  rules:
  - http:
      paths:
      - path: /api(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          serviceName: cis-ops-backend-service
          servicePort: 4000
      - path: /socket.io(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          serviceName: cis-ops-backend-service
          servicePort: 4000
      - path: /()(.*)
        pathType: ImplementationSpecific
        backend:
          serviceName: cis-ops-frontend-service
          servicePort: 80
INGRESS_EOF

else
  echo "❌ No supported Ingress API version found!"
  echo "Available API versions:"
  kubectl api-versions | grep -E "(networking|extensions)"
  echo "Available ingress resources:"
  kubectl api-resources | grep ingress
  exit 1
fi

echo "✅ Generated ingress manifest for API version: $API_VERSION"
