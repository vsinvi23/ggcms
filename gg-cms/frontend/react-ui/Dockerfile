# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_API_BASE_URL must be passed as a build arg so it is baked into the bundle
ARG VITE_API_BASE_URL
ARG VITE_APP_NAME=GeekGully
ARG VITE_APP_ENV=production
ARG VITE_ENABLE_REGISTRATION=true
ARG VITE_ENABLE_SOCIAL_LOGIN=false

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_APP_ENV=$VITE_APP_ENV \
    VITE_ENABLE_REGISTRATION=$VITE_ENABLE_REGISTRATION \
    VITE_ENABLE_SOCIAL_LOGIN=$VITE_ENABLE_SOCIAL_LOGIN

RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing: unknown paths fall back to index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s \
    CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
