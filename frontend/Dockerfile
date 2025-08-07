# Frontend Dockerfile (frontend/Dockerfile) - Simplified for Kubernetes
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Accept build arguments
ARG REACT_APP_HF_API_KEY
ARG REACT_APP_GOOGLE_CLIENT_ID
ARG REACT_APP_BACKEND_URL

# Set environment variables for build
ENV REACT_APP_HF_API_KEY=${REACT_APP_HF_API_KEY}
ENV REACT_APP_GOOGLE_CLIENT_ID=${REACT_APP_GOOGLE_CLIENT_ID}
ENV REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL}
ENV CI=false

# Build the application
RUN npm run build

# Verify build output
RUN ls -la /app/build

# Production stage
FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application
COPY --from=builder /app/build /usr/share/nginx/html

# Create health check file
RUN echo "healthy" > /usr/share/nginx/html/health.txt

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:80/health || exit 1

# Labels
LABEL maintainer="CIS Operations Team"
LABEL version="2.0"
LABEL description="CIS Operations Frontend - Kubernetes Ready"

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]