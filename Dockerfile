# StuntCock — Fly.io production image
# Multi-stage build: build frontend, then serve everything from a slim Node image

# ── Stage 1: build the React frontend ─────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline
COPY frontend/ ./
RUN npm run build

# ── Stage 2: production image ──────────────────────────────────────────────────
FROM node:20-slim AS runner

# Install signal-cli's Java runtime dependency (optional; signal-cli needs Java
# but on Fly we skip signal-cli at container level — it runs via the volume).
# We only need Node and the backend deps for the API + SQLite.

WORKDIR /app

# Copy backend deps separately so Docker layer-caches them
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline

# Copy source
COPY backend/ ./backend/
COPY scripts/ ./scripts/

# Copy built frontend into public directory served by Express (or Firebase Hosting)
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Persistent data directory — Fly.io mounts a volume here
# (fly.toml: [mounts] source="stuntcock_data" destination="/data")
# db.js uses process.cwd()/data, but we point it to /data via DATA_DIR env.
RUN mkdir -p /data

ENV PORT=8080
ENV NODE_ENV=production
# DATA_DIR lets db.js write to the Fly volume instead of the container fs
ENV DATA_DIR=/data

EXPOSE 8080

# Health check — Fly uses this to decide if the machine is healthy
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "backend/server.js"]
