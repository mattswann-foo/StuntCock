# StuntCock — Docker image for Cloud Run deployment
# Build: docker build -t stuntcock-api .
# Run:   docker run -e GOOGLE_APPLICATION_CREDENTIALS=... -p 3001:3001 stuntcock-api

FROM node:20-slim AS base

# Install only the OS packages needed at runtime
# (signal-cli requires Java, but Cloud Run deployment runs API-only mode)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Install dependencies ----
# Copy manifests first for layer caching
COPY package.json package-lock.json ./

RUN npm ci --omit=dev

# ---- Copy application source ----
COPY backend/ ./backend/
COPY scripts/ ./scripts/

# ---- Runtime configuration ----
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Health check — /api/health is unauthenticated
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "backend/server.js"]
