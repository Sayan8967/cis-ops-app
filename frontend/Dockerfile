# Frontend Dockerfile - Alternative approach with better error handling
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Configure npm for better reliability
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set audit false

# Build stage
FROM base AS builder

# Accept build arguments
ARG REACT_APP_HF_API_KEY
ARG REACT_APP_GOOGLE_CLIENT_ID
ARG REACT_APP_BACKEND_URL

# Set environment variables
ENV REACT_APP_HF_API_KEY=${REACT_APP_HF_API_KEY}
ENV REACT_APP_GOOGLE_CLIENT_ID=${REACT_APP_GOOGLE_CLIENT_ID}
ENV REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL}
ENV CI=false
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies with retry logic
RUN set -e; \
    for i in 1 2 3; do \
        echo "Install attempt $i..."; \
        if npm ci --no-audit --prefer-offline; then \
            echo "npm ci succeeded on attempt $i"; \
            break; \
        else \
            echo "npm ci failed on attempt $i"; \
            if [ $i -eq 3 ]; then \
                echo "All install attempts failed"; \
                exit 1; \
            fi; \
            echo "Cleaning cache and retrying in 10 seconds..."; \
            npm cache clean --force; \
            sleep 10; \
        fi; \
    done

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Verify build output
RUN ls -la /app/build && \
    test -f /app/build/index.html || (echo "Build failed: index.html not found" && exit 1)

# Production stage
FROM nginx:alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Create health check file
RUN echo "healthy" > /usr/share/nginx/html/health.txt && \
    echo "OK" > /usr/share/nginx/html/health

# Verify files exist
RUN test -f /usr/share/nginx/html/index.html || (echo "Frontend files not found" && exit 1)

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:80/health || curl -f http://localhost:80/health.txt || exit 1

# Labels
LABEL maintainer="CIS Operations Team"
LABEL version="2.1"
LABEL description="CIS Operations Frontend - Kubernetes Ready with Error Handling"

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]