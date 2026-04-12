# ─────────────────────────────────────────────────────────────
# Stage 1: builder
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Native build tools required by better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install ALL dependencies (including devDependencies needed for the build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 2: production
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

LABEL org.opencontainers.image.title="Ultra Computer" \
      org.opencontainers.image.description="Express + Vite + React + SQLite application" \
      org.opencontainers.image.base.name="node:20-alpine"

# wget is available in alpine by default; add curl for the health check
RUN apk add --no-cache curl \
    # Native build tools needed to rebuild better-sqlite3 for the production environment
    python3 make g++

WORKDIR /app

# Install production-only dependencies
# (better-sqlite3 will be compiled here against the production node binary)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled application from builder
COPY --from=builder /app/dist ./dist

# Data directory for SQLite database persistence
RUN mkdir -p /app/data

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app

USER appuser

# Environment defaults
ENV NODE_ENV=production \
    PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -fs http://localhost:5000/api/health || exit 1

CMD ["node", "dist/index.cjs"]
