# Multi-stage build: compile the frontend, then build the Rust backend
# that serves it from the same origin.

# ---------- Stage 1: build the frontend ----------
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: build the Rust backend ----------
FROM rust:1.97-slim-bookworm AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/Cargo.toml ./
COPY backend/src ./src
COPY backend/migrations ./migrations

# Bring in the compiled frontend so the binary can serve it.
COPY --from=frontend-builder /app/frontend/dist ../frontend/dist

RUN cargo build --release

# ---------- Stage 3: runtime ----------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/calendarshare /app/calendarshare
COPY --from=builder /app/migrations /app/migrations
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

EXPOSE 8080

ENV RUST_LOG=info
ENV PORT=8080
ENV FRONTEND_DIR=/app/frontend/dist

ENTRYPOINT ["/app/calendarshare"]