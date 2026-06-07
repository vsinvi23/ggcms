# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# All VITE_ vars are baked into the bundle at build time
ARG VITE_API_BASE_URL=/api
ARG VITE_APP_NAME=GeekGully CMS
ARG VITE_APP_ENV=production
ARG VITE_ENABLE_REGISTRATION=true
ARG VITE_ENABLE_SOCIAL_LOGIN=false
ARG VITE_ADMIN_GROUP_NAME=Admin

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_APP_ENV=$VITE_APP_ENV \
    VITE_ENABLE_REGISTRATION=$VITE_ENABLE_REGISTRATION \
    VITE_ENABLE_SOCIAL_LOGIN=$VITE_ENABLE_SOCIAL_LOGIN \
    VITE_ADMIN_GROUP_NAME=$VITE_ADMIN_GROUP_NAME

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Default nginx config — overridden at runtime via volume mount in compose
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s \
    CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
