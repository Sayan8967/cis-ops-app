# Backend Dockerfile (backend/Dockerfile)
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Add curl for health checks (alpine doesn't have it by default)
RUN apk add --no-cache curl

# Copy package files first (for better Docker layer caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001 -G nodejs && \
    chown -R backend:nodejs /app

# Switch to non-root user
USER backend

# Expose port
EXPOSE 4000

# Environment variables with defaults
ENV NODE_ENV=production
ENV PORT=4000
ENV CORS_ORIGIN=*

# Enhanced health check using the /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Labels for better container management
LABEL maintainer="CIS Operations Team"
LABEL version="2.0"
LABEL description="CIS Operations Backend Service with Enhanced Connectivity"

# Start the application
CMD ["node", "server.js"]