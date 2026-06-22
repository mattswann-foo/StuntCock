# ── Stage 1: Build the React frontend ─────────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /build/frontend

# Install frontend dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --prefer-offline

# Copy source and build
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Runtime image ─────────────────────────────────────────────────────
# Node 20 on Debian Bookworm (slim) — we add OpenJDK 17, Chromium, and ffmpeg
FROM node:20-slim AS runtime

# Avoid interactive prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies:
#   openjdk-17-jre-headless — required to run signal-cli (JVM build ≥ 17)
#   chromium                — required by whatsapp-web.js (Puppeteer-driven)
#   ffmpeg                  — required by @whiskeysockets/baileys for GIF→MP4
#   fonts-liberation + shared X11 libs — headless Chromium runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
      openjdk-17-jre-headless \
      chromium \
      ffmpeg \
      ca-certificates \
      curl \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libdrm2 \
      libgbm1 \
      libnss3 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Download and install signal-cli 0.13.9 (JVM build — requires Java ≥ 17).
# Pin to 0.13.9 because it is the last release that targets JRE 17.
# The tar.gz extracts to signal-cli-{VERSION}/ following the standard layout:
#   signal-cli-0.13.9/bin/signal-cli
ARG SIGNAL_CLI_VERSION=0.13.9
RUN curl -sSL \
      "https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/signal-cli-${SIGNAL_CLI_VERSION}.tar.gz" \
      -o /tmp/signal-cli.tar.gz \
    && tar -xzf /tmp/signal-cli.tar.gz -C /opt \
    && ln -sf "/opt/signal-cli-${SIGNAL_CLI_VERSION}/bin/signal-cli" /usr/local/bin/signal-cli \
    && rm /tmp/signal-cli.tar.gz

# Tell whatsapp-web.js / Puppeteer to use the system Chromium binary and
# skip its own bundled download at npm-install time.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

# Install production Node dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --prefer-offline

# Copy backend source
COPY backend/ ./backend/
COPY scripts/ ./scripts/

# Copy built frontend from Stage 1
COPY --from=frontend-build /build/frontend/dist ./frontend/dist

# Ensure the persistent data directory exists at build time.
# On Fly.io this path is backed by the volume declared in fly.toml.
RUN mkdir -p /data

# Runtime environment defaults — real secrets are provided via `fly secrets set`
# or `docker run --env` / `--env-file`.
ENV PORT=3001 \
    SIGNAL_CLI_PATH=/usr/local/bin/signal-cli \
    NODE_ENV=production

EXPOSE 3001

CMD ["node", "backend/server.js"]
