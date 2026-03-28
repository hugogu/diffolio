ARG REGISTRY_PREFIX=""
FROM ${REGISTRY_PREFIX}node:22.22.1-alpine3.23 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN NODE_OPTIONS="--max-old-space-size=1024" npm run build:docker

ARG REGISTRY_PREFIX=""
FROM ${REGISTRY_PREFIX}nginx:1.29.5-alpine AS production

# Install envsubst for environment variable substitution
RUN apk add --no-cache gettext

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Default upload size if not specified
ENV UPLOAD_MAX_SIZE_MB=30

ENTRYPOINT ["/docker-entrypoint.sh"]
