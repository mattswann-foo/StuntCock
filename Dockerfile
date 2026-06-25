# Dockerfile — StuntCock backend container image for Cloud Run deployment
FROM node:20-slim

# Create app directory
WORKDIR /app

# Copy dependency manifests first (layer cache optimisation)
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy backend source
COPY backend/ ./backend/
COPY scripts/ ./scripts/

# Cloud Run injects PORT at runtime (default 3001)
ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "backend/server.js"]
