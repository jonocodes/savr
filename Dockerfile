# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build:prod

# Production stage
FROM caddy:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /srv

# Caddy config for SPA routing
COPY <<EOF /etc/caddy/Caddyfile
:80 {
    root * /srv
    file_server
    try_files {path} /index.html
    encode gzip
}
EOF

EXPOSE 80

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
