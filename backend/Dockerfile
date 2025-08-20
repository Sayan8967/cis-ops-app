# Backend Dockerfile (backend/Dockerfile) - Enhanced version
FROM node:18-alpine

WORKDIR /app

# Install curl and postgresql-client for health checks and DB operations
RUN apk add --no-cache curl postgresql-client

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001 -G nodejs && \
    chown -R backend:nodejs /app

USER backend

# Expose ports (app + Prometheus metrics)
EXPOSE 4000 9400

# Environment variables
ENV NODE_ENV=production
ENV PORT=4000

# Enhanced health check that also verifies API health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:4000/api/health || exit 1

# Start the application
CMD ["node", "server.js"]