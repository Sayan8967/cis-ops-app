# Frontend Dockerfile (frontend/Dockerfile) - FIXED VERSION
# Multi-stage build for optimized production image

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Accept build arguments for build-time environment variables
ARG REACT_APP_HF_API_KEY
ARG REACT_APP_GOOGLE_CLIENT_ID
ARG REACT_APP_BACKEND_URL

# Set environment variables for build (with fallbacks)
ENV REACT_APP_HF_API_KEY=${REACT_APP_HF_API_KEY}
ENV REACT_APP_GOOGLE_CLIENT_ID=${REACT_APP_GOOGLE_CLIENT_ID}
ENV REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL}

# Build the application - ENSURE this runs successfully
RUN npm run build

# Verify build output exists
RUN ls -la /app/build && ls -la /app/build/index.html

# Production stage
FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Create runtime environment script for dynamic configuration
COPY <<EOF /docker-entrypoint.d/30-environment-runtime.sh
#!/bin/sh
set -e

# Create runtime environment file
cat <<EOL > /usr/share/nginx/html/runtime-env.js
window.RUNTIME_CONFIG = {
  REACT_APP_BACKEND_URL: '\${REACT_APP_BACKEND_URL:-}',
  REACT_APP_HF_API_KEY: '\${REACT_APP_HF_API_KEY:-}',
  REACT_APP_GOOGLE_CLIENT_ID: '\${REACT_APP_GOOGLE_CLIENT_ID:-}'
};
EOL

# Replace placeholders with actual environment variables
envsubst < /usr/share/nginx/html/runtime-env.js > /tmp/runtime-env.js
mv /tmp/runtime-env.js /usr/share/nginx/html/runtime-env.js

echo "Runtime environment configuration created"

# Create a simple health check file as backup
echo "healthy" > /usr/share/nginx/html/health.txt

echo "Container initialization complete"
EOF

# Make the script executable
RUN chmod +x /docker-entrypoint.d/30-environment-runtime.sh

# Copy enhanced nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application from builder stage - CRITICAL FIX
COPY --from=builder /app/build /usr/share/nginx/html

# Verify the copy worked
RUN ls -la /usr/share/nginx/html && ls -la /usr/share/nginx/html/index.html

# Update index.html to include runtime environment script
RUN sed -i 's|<head>|<head>\n  <script src="/runtime-env.js"></script>|' /usr/share/nginx/html/index.html

# Create health check file as backup (in case nginx config fails)
RUN echo "healthy" > /usr/share/nginx/html/health.txt

# Enhanced healthcheck with multiple fallbacks
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:80/health || curl -f http://localhost:80/health.txt || curl -f http://localhost:80/ || exit 1

# Labels for better container management
LABEL maintainer="CIS Operations Team"
LABEL version="2.1"
LABEL description="CIS Operations Frontend with Runtime Environment Support"

# Expose port 80
EXPOSE 80

# Start nginx (will also run the environment script)
CMD ["nginx", "-g", "daemon off;"]