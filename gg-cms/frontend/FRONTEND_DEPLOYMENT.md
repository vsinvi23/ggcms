# Frontend Deployment Guide

**Project:** React CMS Frontend  
**Framework:** React + Vite + TypeScript + Shadcn/UI  
**Date:** March 30, 2026

---

## 📦 Project Structure

```
frontend/react-ui/
├── src/                    # Source code
│   ├── api/               # API client & services
│   ├── components/        # React components
│   ├── contexts/          # React contexts
│   ├── pages/             # Page components
│   ├── hooks/             # Custom hooks
│   ├── lib/               # Utilities
│   └── types/             # TypeScript types
├── public/                # Static assets
├── package.json           # Dependencies
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript config
└── tailwind.config.ts     # Tailwind CSS config
```

---

## 🚀 Development Deployment

### Prerequisites

- Node.js 18+ or 20+
- npm 6+ or yarn/pnpm
- Backend API running (Strapi on port 1337)

### Quick Start

```bash
# Navigate to frontend directory
cd frontend/react-ui

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Start development server
npm run dev
```

### Environment Configuration

**File:** `frontend/react-ui/.env.local` (Development)

```env
# API Configuration
VITE_API_URL=http://localhost:1337

# Optional: Enable debug mode
VITE_DEBUG=true

# Optional: Environment
VITE_ENV=development
```

### Development Scripts

```bash
# Start dev server (with hot reload)
npm run dev

# Build for development testing
npm run build:dev

# Preview production build locally
npm run preview

# Run linting
npm run lint
```

### Development Server

- **URL:** http://localhost:5173
- **Port:** 5173 (default Vite)
- **Hot Reload:** Enabled
- **Source Maps:** Enabled

---

## 🏭 Production Deployment

### Build for Production

```bash
# Navigate to frontend
cd frontend/react-ui

# Install dependencies (production only)
npm ci --production=false

# Build for production
npm run build

# Output directory: dist/
```

### Environment Configuration

**File:** `frontend/react-ui/.env.production`

```env
# API Configuration
VITE_API_URL=https://api.yourdomain.com

# Environment
VITE_ENV=production

# Optional: Analytics
VITE_GA_ID=G-XXXXXXXXXX
```

### Production Build Output

```
dist/
├── index.html              # Entry point
├── assets/                 # Compiled assets
│   ├── index-[hash].js    # Bundled JavaScript
│   ├── index-[hash].css   # Bundled CSS
│   └── [images/fonts]     # Static assets
└── favicon.ico            # Favicon
```

### Build Optimization

The production build includes:
- ✅ Minified JavaScript/CSS
- ✅ Tree shaking (unused code removal)
- ✅ Code splitting (lazy loading)
- ✅ Asset optimization
- ✅ Hashed filenames (caching)
- ✅ Source maps (optional)

---

## 🐳 Docker Deployment

### Dockerfile

**File:** `frontend/react-ui/Dockerfile`

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build for production
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built app
COPY --from=build /app/dist /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Nginx Configuration

**File:** `frontend/react-ui/nginx.conf`

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
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/json
        application/xml+rss
        application/x-javascript
        image/svg+xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' http://localhost:1337 https:;" always;

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # API proxy (optional - if same domain needed)
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
        proxy_read_timeout 90s;
    }

    # Static files with long cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # React router - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }

    # Error pages
    error_page 404 /index.html;
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
```

### Build Docker Image

```bash
# Build image
docker build \
  --build-arg VITE_API_URL=http://localhost:1337 \
  -t cms-frontend:latest \
  -f frontend/react-ui/Dockerfile \
  frontend/react-ui

# Run container
docker run -d \
  --name cms-frontend \
  -p 80:80 \
  cms-frontend:latest

# Check logs
docker logs -f cms-frontend
```

---

## 🌐 Static Hosting Deployment

### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Navigate to frontend
cd frontend/react-ui

# Deploy
vercel

# Production deployment
vercel --prod
```

**File:** `frontend/react-ui/vercel.json`

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "env": {
    "VITE_API_URL": "@vite_api_url"
  }
}
```

### Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy

# Production deployment
netlify deploy --prod
```

**File:** `frontend/react-ui/netlify.toml`

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  VITE_API_URL = "https://api.yourdomain.com"
```

### AWS S3 + CloudFront

```bash
# Build
npm run build

# Sync to S3
aws s3 sync dist/ s3://your-bucket-name/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

---

## 🔧 Configuration Management

### Environment Variables

All environment variables must be prefixed with `VITE_` to be accessible in the frontend.

**Available Variables:**

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `VITE_API_URL` | Backend API URL | ✅ Yes | `http://localhost:1337` |
| `VITE_ENV` | Environment name | ❌ No | `development` |
| `VITE_DEBUG` | Enable debug mode | ❌ No | `true` |
| `VITE_GA_ID` | Google Analytics ID | ❌ No | `G-XXXXXXXXXX` |

### API Client Configuration

**File:** `frontend/react-ui/src/api/client.ts`

The API client automatically uses `VITE_API_URL` from environment:

```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:1337';
```

---

## 📊 Performance Optimization

### Bundle Analysis

```bash
# Install analyzer
npm install --save-dev rollup-plugin-visualizer

# Build with analysis
npm run build

# View bundle report
open stats.html
```

### Code Splitting

Routes are automatically code-split for optimal loading:

```typescript
// Lazy load pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
```

### Asset Optimization

- **Images:** Compressed and optimized
- **Fonts:** Subset and preloaded
- **CSS:** Purged unused styles
- **JS:** Minified and tree-shaken

---

## 🧪 Testing Before Deployment

### Build Verification

```bash
# Build for production
npm run build

# Preview locally
npm run preview

# Test in browser
open http://localhost:4173
```

### Check List

- [ ] Build completes without errors
- [ ] All routes accessible
- [ ] API calls working
- [ ] Authentication flows working
- [ ] Images/assets loading
- [ ] No console errors
- [ ] Responsive design working
- [ ] Performance acceptable

---

## 🔒 Security Checklist

### Frontend Security

- [ ] Environment variables not exposed
- [ ] API keys secured (backend only)
- [ ] XSS protection enabled
- [ ] CORS configured properly
- [ ] Content Security Policy set
- [ ] HTTPS enabled (production)
- [ ] Secure cookies
- [ ] Input validation
- [ ] Authentication tokens secured

### Nginx Security

- [ ] Security headers configured
- [ ] Gzip enabled
- [ ] Rate limiting (if needed)
- [ ] SSL/TLS configured
- [ ] Access logs enabled

---

## 🐛 Troubleshooting

### Build Errors

```bash
# Clear cache and rebuild
rm -rf node_modules dist .vite
npm install
npm run build
```

### API Connection Issues

```bash
# Check VITE_API_URL is set
echo $VITE_API_URL

# Test API endpoint
curl http://localhost:1337/_health
```

### Nginx Issues

```bash
# Test nginx config
nginx -t

# Reload nginx
nginx -s reload

# Check nginx logs
tail -f /var/log/nginx/error.log
```

### Docker Issues

```bash
# Check container logs
docker logs cms-frontend

# Rebuild without cache
docker build --no-cache -t cms-frontend .

# Inspect container
docker exec -it cms-frontend sh
```

---

## 📚 Additional Resources

- **Vite Docs:** https://vitejs.dev
- **React Docs:** https://react.dev
- **Nginx Docs:** https://nginx.org/en/docs
- **Docker Docs:** https://docs.docker.com

---

**Last Updated:** March 30, 2026  
**Status:** Production Ready ✅
