# Multi-stage production Dockerfile for API Gateway Service
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY services/api-gateway/package*.json ./services/api-gateway/
COPY packages/*/package*.json ./packages/*/

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
WORKDIR /app/services/api-gateway
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Add security updates and curl for health checks
RUN apk upgrade --no-cache && \
    apk add --no-cache curl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY services/api-gateway/package*.json ./services/api-gateway/
COPY packages/*/package*.json ./packages/*/

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/services/api-gateway/dist ./services/api-gateway/dist
COPY --from=builder /app/packages/*/dist ./packages/*/dist

# Set working directory to service
WORKDIR /app/services/api-gateway

# Change ownership to non-root user
RUN chown -R nodeuser:nodejs /app
USER nodeuser

# Expose port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]