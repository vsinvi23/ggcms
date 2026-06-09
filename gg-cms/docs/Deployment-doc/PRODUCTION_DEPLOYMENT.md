# Production Deployment Guide

**Date:** March 30, 2026  
**Project:** React CMS + Strapi Backend  
**Deployment:** Docker + Docker Compose

---

## 📦 Production Package Structure

```
production-cms/
├── backend/                    # Strapi Backend
│   ├── cms-backend/           # Strapi app
│   ├── Dockerfile             # Backend Docker config
│   ├── .env.production        # Production env vars
│   └── ecosystem.config.js    # PM2 config
│
├── frontend/                   # React Frontend
│   ├── build/                 # Production build
│   ├── Dockerfile             # Frontend Docker config
│   ├── nginx.conf             # Nginx configuration
│   └── .env.production        # Frontend env vars
│
├── docker-compose.yml         # Orchestration
├── docker-compose.prod.yml    # Production overrides
├── .env                       # Root environment
├── deploy.sh                  # Deployment script
└── README.md                  # Deployment instructions
```

---

## 🐳 Docker Setup

### Backend Dockerfile

**File:** `backend/cms-backend/Dockerfile`

```dockerfile
# Stage 1: Build
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build admin panel
ENV NODE_ENV=production
RUN npm run build

# Stage 2: Production
FROM node:18-alpine

WORKDIR /app

# Copy built app from build stage
COPY --from=build /app .

# Install PM2 globally
RUN npm install -g pm2

# Expose port
EXPOSE 1337

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:1337/_health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start with PM2
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
```

---

### Frontend Dockerfile

**File:** `frontend/Dockerfile`

```dockerfile
# Stage 1: Build React App
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build for production
ENV NODE_ENV=production
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built app
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
```

---

### Docker Compose (Development)

**File:** `docker-compose.yml`

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    container_name: cms-postgres
    environment:
      POSTGRES_USER: ${DATABASE_USERNAME:-strapi}
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD:-strapi}
      POSTGRES_DB: ${DATABASE_NAME:-strapi}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    networks:
      - cms-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U strapi"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Strapi Backend
  backend:
    build:
      context: ./backend/cms-backend
      dockerfile: Dockerfile
    container_name: cms-backend
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      DATABASE_CLIENT: postgres
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_NAME: ${DATABASE_NAME:-strapi}
      DATABASE_USERNAME: ${DATABASE_USERNAME:-strapi}
      DATABASE_PASSWORD: ${DATABASE_PASSWORD:-strapi}
      JWT_SECRET: ${JWT_SECRET:-your-secret-key-change-in-production}
      ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET:-your-admin-secret-key}
      APP_KEYS: ${APP_KEYS:-key1,key2,key3,key4}
      API_TOKEN_SALT: ${API_TOKEN_SALT:-your-api-token-salt}
      TRANSFER_TOKEN_SALT: ${TRANSFER_TOKEN_SALT:-your-transfer-token-salt}
    volumes:
      - ./backend/cms-backend/public:/app/public
      - backend_uploads:/app/public/uploads
    ports:
      - "1337:1337"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - cms-network
    restart: unless-stopped

  # React Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: cms-frontend
    environment:
      VITE_API_URL: ${VITE_API_URL:-http://localhost:1337}
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - cms-network
    restart: unless-stopped

volumes:
  postgres_data:
  backend_uploads:

networks:
  cms-network:
    driver: bridge
```

---

### Docker Compose (Production)

**File:** `docker-compose.prod.yml`

```yaml
version: '3.8'

services:
  postgres:
    environment:
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G

  backend:
    environment:
      NODE_ENV: production
      DATABASE_SSL: true
    restart: always
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
      replicas: 2
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## ⚙️ Configuration Files

### Nginx Configuration

**File:** `frontend/nginx.conf`

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript 
               application/x-javascript application/xml+rss 
               application/javascript application/json;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # API proxy
    location /api {
        proxy_pass http://backend:1337;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static files with cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # React router - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Error pages
    error_page 404 /index.html;
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
```

---

### PM2 Configuration

**File:** `backend/cms-backend/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'cms-backend',
      script: './node_modules/@strapi/strapi/bin/strapi.js',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
```

---

### Environment Variables

**File:** `.env` (Root)

```env
# Database
DATABASE_CLIENT=postgres
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=strapi_production
DATABASE_USERNAME=strapi
DATABASE_PASSWORD=your-secure-password-here

# Strapi Secrets (Generate with: openssl rand -base64 32)
JWT_SECRET=your-jwt-secret-here
ADMIN_JWT_SECRET=your-admin-jwt-secret-here
APP_KEYS=key1,key2,key3,key4
API_TOKEN_SALT=your-api-token-salt
TRANSFER_TOKEN_SALT=your-transfer-token-salt

# Frontend
VITE_API_URL=https://api.yourdomain.com

# Node
NODE_ENV=production
```

**File:** `backend/cms-backend/.env.production`

```env
HOST=0.0.0.0
PORT=1337
APP_KEYS=${APP_KEYS}
API_TOKEN_SALT=${API_TOKEN_SALT}
ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
JWT_SECRET=${JWT_SECRET}
TRANSFER_TOKEN_SALT=${TRANSFER_TOKEN_SALT}

DATABASE_CLIENT=postgres
DATABASE_HOST=${DATABASE_HOST}
DATABASE_PORT=${DATABASE_PORT}
DATABASE_NAME=${DATABASE_NAME}
DATABASE_USERNAME=${DATABASE_USERNAME}
DATABASE_PASSWORD=${DATABASE_PASSWORD}
DATABASE_SSL=false
```

**File:** `frontend/.env.production`

```env
VITE_API_URL=http://backend:1337
```

---

## 🚀 Deployment Scripts

### Deploy Script

**File:** `deploy.sh`

```bash
#!/bin/bash

set -e

echo "🚀 Starting deployment..."

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Build images
echo "📦 Building Docker images..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# Start services
echo "▶️  Starting services..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Wait for services
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check health
echo "🏥 Checking service health..."
docker-compose ps

# Show logs
echo "📋 Recent logs:"
docker-compose logs --tail=50

echo "✅ Deployment complete!"
echo "Backend: http://localhost:1337"
echo "Frontend: http://localhost"
```

---

### Build Script

**File:** `build.sh`

```bash
#!/bin/bash

set -e

echo "🏗️  Building project..."

# Backend
echo "📦 Building backend..."
cd backend/cms-backend
npm install --production
npm run build
cd ../..

# Frontend
echo "📦 Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo "✅ Build complete!"
```

---

## 📋 Deployment Checklist

### Pre-Deployment

- [ ] Update `.env` with production values
- [ ] Generate secure secrets (JWT, passwords)
- [ ] Configure domain DNS
- [ ] Set up SSL certificates (Let's Encrypt)
- [ ] Configure firewall rules
- [ ] Set up monitoring (optional)
- [ ] Configure backup strategy

### Deployment Steps

```bash
# 1. Clone repository
git clone <your-repo-url>
cd production-cms

# 2. Configure environment
cp .env.example .env
nano .env  # Edit with production values

# 3. Make scripts executable
chmod +x deploy.sh build.sh

# 4. Deploy
./deploy.sh
```

### Post-Deployment

- [ ] Create Strapi admin user
- [ ] Configure Strapi settings
- [ ] Test API endpoints
- [ ] Test frontend functionality
- [ ] Set up automated backups
- [ ] Configure monitoring/alerts
- [ ] Document credentials securely

---

## 🔒 Security Checklist

### Environment

- [ ] Strong database passwords
- [ ] Secure JWT secrets (32+ characters)
- [ ] HTTPS/SSL enabled
- [ ] Environment variables not in code
- [ ] .env files in .gitignore

### Strapi

- [ ] Change default admin credentials
- [ ] Configure CORS properly
- [ ] Set up rate limiting
- [ ] Enable API authentication
- [ ] Configure user permissions

### Frontend

- [ ] API keys not exposed
- [ ] XSS protection enabled
- [ ] CSRF tokens configured
- [ ] Secure cookies
- [ ] Content Security Policy

### Infrastructure

- [ ] Firewall configured (ports 80, 443 only)
- [ ] Regular security updates
- [ ] Backup encryption
- [ ] Access logs enabled
- [ ] Fail2ban configured

---

## 📊 Monitoring & Logging

### Docker Logs

```bash
# View all logs
docker-compose logs -f

# Backend logs
docker-compose logs -f backend

# Frontend logs
docker-compose logs -f frontend

# Database logs
docker-compose logs -f postgres
```

### Health Checks

```bash
# Backend health
curl http://localhost:1337/_health

# Frontend health
curl http://localhost/health

# Database health
docker exec cms-postgres pg_isready -U strapi
```

---

## 🔄 Backup & Restore

### Database Backup

```bash
# Backup
docker exec cms-postgres pg_dump -U strapi strapi_production > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
docker exec -i cms-postgres psql -U strapi strapi_production < backup.sql
```

### Files Backup

```bash
# Backup uploads
docker cp cms-backend:/app/public/uploads ./uploads_backup_$(date +%Y%m%d_%H%M%S)

# Restore uploads
docker cp ./uploads_backup cms-backend:/app/public/uploads
```

---

## 🆙 Scaling

### Horizontal Scaling

```yaml
# In docker-compose.prod.yml
backend:
  deploy:
    replicas: 3  # Run 3 instances
```

### Load Balancer (Nginx)

```nginx
upstream backend {
    least_conn;
    server backend1:1337;
    server backend2:1337;
    server backend3:1337;
}
```

---

## 🐛 Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs backend

# Check environment
docker-compose config

# Rebuild
docker-compose build --no-cache backend
```

### Database connection issues

```bash
# Check database is running
docker-compose ps postgres

# Test connection
docker exec -it cms-postgres psql -U strapi -d strapi_production
```

### Out of memory

```bash
# Check resource usage
docker stats

# Increase memory limits in docker-compose.prod.yml
```

---

## 📚 Additional Resources

- **Strapi Docs:** https://docs.strapi.io
- **Docker Docs:** https://docs.docker.com
- **Nginx Docs:** https://nginx.org/en/docs
- **PM2 Docs:** https://pm2.keymetrics.io

---

**Last Updated:** March 30, 2026  
**Ready for Production:** YES ✅
