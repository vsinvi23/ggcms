# Backend Deployment Guide

**Project:** Strapi CMS Backend  
**Framework:** Strapi 5.35.0 + PostgreSQL  
**Date:** March 30, 2026

---

## 📦 Project Structure

```
backend/cms-backend/
├── src/                        # Source code
│   ├── api/                   # API endpoints
│   │   ├── article/          # Article management
│   │   ├── category/         # Category management
│   │   ├── role/             # Role management
│   │   ├── user-group/       # User group management
│   │   ├── custom-user/      # Custom user endpoints
│   │   └── [other APIs]      # Additional APIs
│   ├── components/           # Reusable components
│   ├── extensions/           # Strapi extensions
│   ├── policies/             # Custom policies
│   └── index.ts              # Entry point
├── config/                   # Configuration files
│   ├── database.ts          # Database config
│   ├── server.ts            # Server config
│   ├── admin.ts             # Admin panel config
│   └── plugins.ts           # Plugin config
├── database/                # Database migrations
├── public/                  # Static files & uploads
├── package.json            # Dependencies
├── Dockerfile              # Docker configuration
├── ecosystem.config.js     # PM2 configuration
└── .env                    # Environment variables
```

---

## 🚀 Development Deployment

### Prerequisites

- Node.js 20+ (LTS recommended)
- PostgreSQL 15+
- npm 6+

### Database Setup

#### Option 1: Local PostgreSQL

```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql

CREATE DATABASE gfg_udemy;
CREATE USER strapi_admin WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE gfg_udemy TO strapi_admin;
ALTER DATABASE gfg_udemy OWNER TO strapi_admin;
\q
```

#### Option 2: Docker PostgreSQL

```bash
# Run PostgreSQL in Docker
docker run -d \
  --name postgres-dev \
  -e POSTGRES_DB=gfg_udemy \
  -e POSTGRES_USER=strapi_admin \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:15-alpine

# Verify connection
docker exec -it postgres-dev psql -U strapi_admin -d gfg_udemy
```

### Backend Setup

```bash
# Navigate to backend directory
cd backend/cms-backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit environment variables
# Update database credentials, JWT secrets, etc.

# Run database migrations (if any)
npm run strapi migration:run

# Start development server
npm run develop
```

### Environment Configuration

**File:** `backend/cms-backend/.env` (Development)

```env
# Server
HOST=0.0.0.0
PORT=1337

# Secrets (Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
APP_KEYS=your_app_key1,your_app_key2,your_app_key3,your_app_key4
API_TOKEN_SALT=your_api_token_salt
ADMIN_JWT_SECRET=your_admin_jwt_secret
JWT_SECRET=your_jwt_secret
TRANSFER_TOKEN_SALT=your_transfer_token_salt

# Database
DATABASE_CLIENT=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=gfg_udemy
DATABASE_USERNAME=strapi_admin
DATABASE_PASSWORD=your_password
DATABASE_SSL=false

# Node Environment
NODE_ENV=development
```

### Development Scripts

```bash
# Start with auto-reload
npm run develop

# Start console (REPL)
npm run console

# Build admin panel
npm run build

# Start production mode
npm run start

# Generate types
npm run strapi ts:generate-types
```

### Development Server

- **API URL:** http://localhost:1337
- **Admin Panel:** http://localhost:1337/admin
- **API Docs:** http://localhost:1337/documentation
- **Health Check:** http://localhost:1337/_health

### First Time Setup

1. **Access Admin Panel:**
   ```
   http://localhost:1337/admin
   ```

2. **Create Admin User:**
   - Email: admin@example.com
   - Password: (secure password)
   - First Name: Admin
   - Last Name: User

3. **Configure Settings:**
   - Enable API documentation
   - Set up roles & permissions
   - Configure email provider (optional)

---

## 🏭 Production Deployment

### Environment Configuration

**File:** `backend/cms-backend/.env` (Production)

```env
# Server
HOST=0.0.0.0
PORT=1337

# Secrets (MUST be different from development!)
APP_KEYS=${APP_KEYS}
API_TOKEN_SALT=${API_TOKEN_SALT}
ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
JWT_SECRET=${JWT_SECRET}
TRANSFER_TOKEN_SALT=${TRANSFER_TOKEN_SALT}

# Database
DATABASE_CLIENT=postgres
DATABASE_HOST=${DATABASE_HOST}
DATABASE_PORT=${DATABASE_PORT}
DATABASE_NAME=${DATABASE_NAME}
DATABASE_USERNAME=${DATABASE_USERNAME}
DATABASE_PASSWORD=${DATABASE_PASSWORD}
DATABASE_SSL=false

# Node Environment
NODE_ENV=production
```

### Build for Production

```bash
# Navigate to backend
cd backend/cms-backend

# Install production dependencies only
npm ci --production=false

# Build admin panel
npm run build

# Output: build/ directory
```

### PM2 Cluster Mode

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
      instances: 2,              // Number of instances
      exec_mode: 'cluster',      // Cluster mode
      max_memory_restart: '1G',  // Restart if exceeds
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

### Start with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Create logs directory
mkdir -p logs

# Start application
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs cms-backend

# Monitor
pm2 monit

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
```

---

## 🐳 Docker Deployment

### Dockerfile

**File:** `backend/cms-backend/Dockerfile`

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production=false

# Copy source code
COPY . .

# Build admin panel
ENV NODE_ENV=production
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Install PM2 globally
RUN npm install -g pm2

# Copy built application
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY --from=build /app/config ./config
COPY --from=build /app/src ./src
COPY --from=build /app/database ./database
COPY --from=build /app/package*.json ./
COPY --from=build /app/ecosystem.config.js ./

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 1337

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:1337/_health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start with PM2
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
```

### Build & Run Docker

```bash
# Build image
docker build \
  -t cms-backend:latest \
  -f backend/cms-backend/Dockerfile \
  backend/cms-backend

# Run container
docker run -d \
  --name cms-backend \
  -p 1337:1337 \
  --env-file backend/cms-backend/.env \
  -v $(pwd)/backend/cms-backend/public/uploads:/app/public/uploads \
  cms-backend:latest

# Check logs
docker logs -f cms-backend

# Check health
curl http://localhost:1337/_health
```

---

## 🗄️ Database Management

### Backup Database

```bash
# Local backup
pg_dump -U strapi_admin -h localhost gfg_udemy > backup_$(date +%Y%m%d_%H%M%S).sql

# Docker backup
docker exec postgres-dev pg_dump -U strapi_admin gfg_udemy > backup_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup
pg_dump -U strapi_admin gfg_udemy | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Restore Database

```bash
# Local restore
psql -U strapi_admin -h localhost gfg_udemy < backup.sql

# Docker restore
docker exec -i postgres-dev psql -U strapi_admin gfg_udemy < backup.sql

# Compressed restore
gunzip -c backup.sql.gz | psql -U strapi_admin gfg_udemy
```

### Database Migrations

```bash
# Create migration
npm run strapi migration:create migration-name

# Run migrations
npm run strapi migration:run

# List migrations
npm run strapi migration:list
```

---

## 🔧 Configuration Details

### Database Configuration

**File:** `backend/cms-backend/config/database.ts`

```typescript
export default ({ env }) => ({
  connection: {
    client: 'postgres',
    connection: {
      host: env('DATABASE_HOST', '127.0.0.1'),
      port: env.int('DATABASE_PORT', 5432),
      database: env('DATABASE_NAME', 'strapi'),
      user: env('DATABASE_USERNAME', 'strapi'),
      password: env('DATABASE_PASSWORD', 'strapi'),
      ssl: env.bool('DATABASE_SSL', false),
    },
    pool: {
      min: 2,
      max: 10,
    },
    acquireConnectionTimeout: 60000,
  },
});
```

### Server Configuration

**File:** `backend/cms-backend/config/server.ts`

```typescript
export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
});
```

---

## 📊 Monitoring & Logging

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# List all processes
pm2 list

# Show detailed info
pm2 show cms-backend

# Restart
pm2 restart cms-backend

# Stop
pm2 stop cms-backend

# Delete from PM2
pm2 delete cms-backend
```

### Log Management

```bash
# View logs
pm2 logs cms-backend

# Clear logs
pm2 flush

# Rotate logs
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### Health Monitoring

```bash
# Health check endpoint
curl http://localhost:1337/_health

# Expected response
{"status":"ok"}
```

---

## 🔒 Security Checklist

### Environment Security

- [ ] Strong JWT secrets (32+ characters)
- [ ] Strong database password (16+ characters)
- [ ] APP_KEYS rotated regularly
- [ ] .env file not committed to git
- [ ] Different secrets for dev/prod

### Strapi Security

- [ ] Admin panel secured with strong password
- [ ] API tokens configured properly
- [ ] CORS configured for frontend domain
- [ ] Rate limiting enabled
- [ ] API permissions configured
- [ ] User roles properly set up
- [ ] File upload restrictions configured

### Database Security

- [ ] Database user has limited privileges
- [ ] Database firewall configured
- [ ] SSL/TLS enabled (if remote)
- [ ] Regular backups configured
- [ ] Access logs enabled

### Server Security

- [ ] HTTPS/SSL enabled
- [ ] Firewall configured
- [ ] Security headers set
- [ ] Regular updates applied
- [ ] Monitoring enabled

---

## 🐛 Troubleshooting

### Database Connection Errors

```bash
# Test database connection
psql -U strapi_admin -h localhost -d gfg_udemy

# Check PostgreSQL status
sudo systemctl status postgresql

# View PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

### Port Already in Use

```bash
# Find process using port 1337
# Windows
netstat -ano | findstr :1337

# Linux/Mac
lsof -i :1337

# Kill process
kill -9 <PID>
```

### Build Errors

```bash
# Clear cache
rm -rf node_modules build .cache .tmp
npm install
npm run build
```

### Permission Issues

```bash
# Fix upload directory permissions
chmod -R 755 public/uploads
chown -R $USER:$USER public/uploads
```

---

## 📚 API Documentation

### Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/articles` | GET | List articles |
| `/api/articles/:id` | GET | Get article |
| `/api/articles` | POST | Create article |
| `/api/articles/:id` | PUT | Update article |
| `/api/articles/:id` | DELETE | Delete article |
| `/api/categories` | GET | List categories |
| `/api/roles` | GET | List roles |
| `/api/user-groups` | GET | List user groups |
| `/api/custom-users` | GET | List users |
| `/api/auth/local/register` | POST | Register user |
| `/api/auth/local` | POST | Login user |

### Authentication

```bash
# Register user
curl -X POST http://localhost:1337/api/auth/local/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@test.com","password":"Test123!"}'

# Login
curl -X POST http://localhost:1337/api/auth/local \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@test.com","password":"Test123!"}'

# Use JWT in requests
curl -X GET http://localhost:1337/api/articles \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🆙 Scaling

### Horizontal Scaling

Use PM2 cluster mode or multiple Docker containers with load balancer.

```javascript
// ecosystem.config.js
instances: 4,  // Run 4 instances
exec_mode: 'cluster',
```

### Database Connection Pooling

```typescript
// config/database.ts
pool: {
  min: 2,
  max: 10,  // Adjust based on load
}
```

---

## 📚 Additional Resources

- **Strapi Docs:** https://docs.strapi.io
- **PostgreSQL Docs:** https://www.postgresql.org/docs
- **PM2 Docs:** https://pm2.keymetrics.io
- **Node.js Docs:** https://nodejs.org/docs

---

**Last Updated:** March 30, 2026  
**Status:** Production Ready ✅
