# Production Node.js Dockerfile for Polling Backend Service
# Stage 1: Install production dependencies
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Stage 2: Minimal runtime image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

# Run container as non-root user for security
USER node

# Copy dependencies and application source
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src

EXPOSE 8080

CMD ["node", "src/server.js"]
