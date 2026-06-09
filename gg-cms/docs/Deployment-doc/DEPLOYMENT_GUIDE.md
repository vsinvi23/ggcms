# Complete Deployment Guide

**CMS Project - Full Stack Deployment**  
**Date:** March 30, 2026  
**Version:** 1.0

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Development Deployment](#development-deployment)
4. [Production Deployment](#production-deployment)
5. [Deployment Scripts](#deployment-scripts)
6. [Documentation Index](#documentation-index)
7. [Quick Reference](#quick-reference)

---

## Overview

This CMS project consists of:
- **Backend:** Strapi 5.35.0 (Node.js + PostgreSQL)
- **Frontend:** React + Vite + TypeScript + Shadcn/UI
- **Database:** PostgreSQL 15

### Architecture

```
┌─────────────────────────────────────────────┐
│                 FRONTEND                     │
│          React + Vite + TypeScript           │
│            Port: 5173 (dev)                  │
│            Port: 80 (prod)                   │
└─────────────────────────────────────────────┘
                     │
                     ↓ API Calls
┌─────────────────────────────────────────────┐
│                 BACKEND                      │
│         Strapi CMS + Node.js                 │
│            Port: 1337                        │
└─────────────────────────────────────────────┘
                     │
                     ↓ SQL Queries
┌─────────────────────────────────────────────┐
│                DATABASE                      │
│            PostgreSQL 15                     │
│            Port: 5432                        │
└─────────────────────────────────────────────┘
```

---

## Project Structure

```
testcms/
├── frontend/
│   ├── react-ui/                    # React frontend
│   └── FRONTEND_DEPLOYMENT.md       # ✅ Frontend deployment guide
│
├── backend/
│   ├── cms-backend/                 # Strapi backend
│   └── BACKEND_DEPLOYMENT.md        # ✅ Backend deployment guide
│
├── docs/                            # Additional documentation
│
├── Deployment Scripts:
│   ├── dev-deploy.sh               # ✅ Development (Linux/Mac)
│   ├── dev-deploy.ps1              # ✅ Development (Windows)
│   ├── prod-deploy.sh              # ✅ Production (Linux/Mac)
│   └── prod-deploy.ps1             # ✅ Production (Windows)
│
├── Docker Configuration:
│   ├── docker-compose.production.yml  # Production Docker setup
│   ├── .env.production.example        # Environment template
│   └── backend/cms-backend/Dockerfile # Backend Docker image
│
└── Documentation:
    ├── DEPLOYMENT_GUIDE.md          # ✅ This file
    ├── DEPLOY_README.md             # Quick start guide
    ├── PRODUCTION_DEPLOYMENT.md     # Detailed production guide
    └── INTEGRATION_COMPLETE.md      # Integration documentation
```

---

## Development Deployment

### Prerequisites

**Required:**
- Node.js 18+ or 20+
- PostgreSQL 15+
- npm 6+

**Optional:**
- Git
- Docker (for containerized database)

### Quick Start - Automated

#### Windows (PowerShell)

```powershell
# Run automated setup
.\dev-deploy.ps1
```

#### Linux/Mac (Bash)

```bash
# Make script executable
chmod +x dev-deploy.sh

# Run automated setup
./dev-deploy.sh
```

### Quick Start - Manual

#### Step 1: Database Setup

```bash
# Create PostgreSQL database
createdb gfg_udemy

# Create user
psql -c "CREATE USER strapi_admin WITH PASSWORD 'your_password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE gfg_udemy TO strapi_admin;"
```

#### Step 2: Backend Setup

```bash
# Navigate to backend
cd backend/cms-backend

# Install dependencies
npm install

# Create .env file (use template)
cp .env.example .env

# Edit .env with your database credentials
# Then start development server
npm run develop
```

#### Step 3: Frontend Setup

```bash
# Navigate to frontend
cd frontend/react-ui

# Install dependencies
npm install

# Create .env.local
echo "VITE_API_URL=http://localhost:1337" > .env.local

# Start development server
npm run dev
```

### Access URLs (Development)

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:1337
- **Admin Panel:** http://localhost:1337/admin
- **API Docs:** http://localhost:1337/documentation

### Development Workflow

```bash
# Terminal 1: Backend
cd backend/cms-backend
npm run develop

# Terminal 2: Frontend
cd frontend/react-ui
npm run dev
```

---

## Production Deployment

### Prerequisites

**Required:**
- Docker
- Docker Compose

**Optional:**
- Node.js (for generating secrets)
- Reverse proxy (Nginx/Traefik)
- SSL certificates

### Quick Start - Automated

#### Windows (PowerShell)

```powershell
# Run production deployment
.\prod-deploy.ps1

# Or run specific command
.\prod-deploy.ps1 deploy
.\prod-deploy.ps1 secrets
.\prod-deploy.ps1 backup
```

#### Linux/Mac (Bash)

```bash
# Make script executable
chmod +x prod-deploy.sh

# Run production deployment
./prod-deploy.sh

# Or run specific command
./prod-deploy.sh deploy
./prod-deploy.sh secrets
./prod-deploy.sh backup
```

### Quick Start - Manual

#### Step 1: Configure Environment

```bash
# Copy environment template
cp .env.production.example .env

# Generate secrets
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Edit .env with generated secrets
```

#### Step 2: Deploy with Docker

```bash
# Build and start services
docker-compose -f docker-compose.production.yml up -d --build

# Check status
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f
```

#### Step 3: Create Admin User

1. Open http://localhost:1337/admin
2. Register first admin user
3. Configure Strapi settings

### Access URLs (Production)

- **Backend API:** http://localhost:1337
- **Admin Panel:** http://localhost:1337/admin
- **Health Check:** http://localhost:1337/_health

### Production Management

```bash
# View logs
docker-compose -f docker-compose.production.yml logs -f

# Restart services
docker-compose -f docker-compose.production.yml restart

# Stop services
docker-compose -f docker-compose.production.yml down

# Create backup
docker exec cms-postgres-prod pg_dump -U strapi strapi_production > backup.sql
```

---

## Deployment Scripts

### Development Scripts

#### `dev-deploy.sh` / `dev-deploy.ps1`

**Features:**
- ✅ Checks prerequisites (Node.js, npm, PostgreSQL)
- ✅ Creates and configures database
- ✅ Generates secure secrets
- ✅ Installs dependencies
- ✅ Creates environment files
- ✅ Provides startup instructions

**Usage:**

```bash
# Linux/Mac
./dev-deploy.sh

# Windows
.\dev-deploy.ps1
```

### Production Scripts

#### `prod-deploy.sh` / `prod-deploy.ps1`

**Features:**
- ✅ Interactive menu
- ✅ Environment validation
- ✅ Secret generation
- ✅ Docker deployment
- ✅ Health checks
- ✅ Database backups

**Commands:**

```bash
# Interactive mode
./prod-deploy.sh

# Direct commands
./prod-deploy.sh deploy    # Deploy application
./prod-deploy.sh secrets   # Generate secrets
./prod-deploy.sh backup    # Create backup
./prod-deploy.sh logs      # View logs
./prod-deploy.sh status    # Check status
./prod-deploy.sh stop      # Stop services
./prod-deploy.sh restart   # Restart services
```

---

## Documentation Index

### Main Documentation

| Document | Description | Location |
|----------|-------------|----------|
| **DEPLOYMENT_GUIDE.md** | Complete deployment guide (this file) | `/` |
| **DEPLOY_README.md** | Quick start guide | `/` |
| **PRODUCTION_DEPLOYMENT.md** | Detailed production guide | `/` |

### Component-Specific

| Document | Description | Location |
|----------|-------------|----------|
| **FRONTEND_DEPLOYMENT.md** | Frontend deployment guide | `/frontend/` |
| **BACKEND_DEPLOYMENT.md** | Backend deployment guide | `/backend/` |
| **API_DOCUMENTATION.md** | API reference | `/backend/cms-backend/` |

### Additional Resources

| Document | Description | Location |
|----------|-------------|----------|
| **INTEGRATION_COMPLETE.md** | Integration documentation | `/` |
| **TEST_CASES.md** | API test cases | `/backend/` |
| **ARCHITECTURE_ANALYSIS.md** | System architecture | `/` |

---

## Quick Reference

### Common Commands

#### Development

```bash
# Start backend
cd backend/cms-backend && npm run develop

# Start frontend
cd frontend/react-ui && npm run dev

# Database backup
pg_dump -U strapi_admin gfg_udemy > backup.sql

# Database restore
psql -U strapi_admin gfg_udemy < backup.sql
```

#### Production

```bash
# Deploy
docker-compose -f docker-compose.production.yml up -d --build

# View logs
docker-compose -f docker-compose.production.yml logs -f backend

# Backup database
docker exec cms-postgres-prod pg_dump -U strapi strapi_production > backup.sql

# Restart backend
docker-compose -f docker-compose.production.yml restart backend
```

### Environment Variables

#### Backend (.env)

```env
# Server
HOST=0.0.0.0
PORT=1337

# Database
DATABASE_CLIENT=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=gfg_udemy
DATABASE_USERNAME=strapi_admin
DATABASE_PASSWORD=your_password

# Secrets
JWT_SECRET=generated_secret
ADMIN_JWT_SECRET=generated_secret
APP_KEYS=key1,key2,key3,key4
API_TOKEN_SALT=generated_salt
TRANSFER_TOKEN_SALT=generated_salt

# Environment
NODE_ENV=development
```

#### Frontend (.env.local)

```env
# API Configuration
VITE_API_URL=http://localhost:1337

# Environment
VITE_ENV=development
```

### Port Reference

| Service | Development | Production |
|---------|-------------|------------|
| Frontend | 5173 | 80 |
| Backend | 1337 | 1337 |
| Database | 5432 | 5432 (internal) |

### Health Checks

```bash
# Backend health
curl http://localhost:1337/_health

# Database health (Docker)
docker exec cms-postgres-prod pg_isready -U strapi

# Container status
docker-compose -f docker-compose.production.yml ps
```

### Backup & Restore

```bash
# Create backup (Development)
pg_dump -U strapi_admin gfg_udemy > backup_$(date +%Y%m%d).sql

# Create backup (Production)
docker exec cms-postgres-prod pg_dump -U strapi strapi_production > backup_$(date +%Y%m%d).sql

# Restore backup (Development)
psql -U strapi_admin gfg_udemy < backup.sql

# Restore backup (Production)
docker exec -i cms-postgres-prod psql -U strapi strapi_production < backup.sql
```

---

## Troubleshooting

### Common Issues

#### Backend won't start

```bash
# Check logs
cd backend/cms-backend
npm run develop

# Common fixes:
# 1. Check database connection
# 2. Verify .env configuration
# 3. Clear cache: rm -rf .cache build
# 4. Reinstall: rm -rf node_modules && npm install
```

#### Frontend build errors

```bash
# Clear cache
cd frontend/react-ui
rm -rf node_modules dist .vite
npm install
npm run build
```

#### Database connection failed

```bash
# Check PostgreSQL is running
# Linux: sudo systemctl status postgresql
# Mac: brew services list
# Windows: Check services

# Test connection
psql -U strapi_admin -h localhost -d gfg_udemy
```

#### Docker issues

```bash
# Check Docker is running
docker info

# View logs
docker-compose -f docker-compose.production.yml logs backend

# Rebuild
docker-compose -f docker-compose.production.yml build --no-cache

# Clean restart
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d
```

---

## Security Checklist

### Development

- [ ] Use strong database passwords
- [ ] Don't commit .env files
- [ ] Keep dependencies updated
- [ ] Use HTTPS locally (optional)

### Production

- [ ] Generate strong secrets
- [ ] Configure firewall
- [ ] Enable HTTPS/SSL
- [ ] Set up regular backups
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] Use environment variables
- [ ] Rotate secrets regularly
- [ ] Monitor logs
- [ ] Keep system updated

---

## Support & Resources

### Official Documentation

- **Strapi:** https://docs.strapi.io
- **React:** https://react.dev
- **Vite:** https://vitejs.dev
- **PostgreSQL:** https://www.postgresql.org/docs
- **Docker:** https://docs.docker.com

### Project Documentation

- See `/docs/` folder for additional guides
- Check component README files
- Review test cases in `/backend/TEST_CASES.md`

---

## Changelog

### Version 1.0 (March 30, 2026)

- ✅ Created comprehensive deployment guide
- ✅ Added frontend deployment documentation
- ✅ Added backend deployment documentation
- ✅ Created development deployment scripts (Bash & PowerShell)
- ✅ Created production deployment scripts (Bash & PowerShell)
- ✅ Updated Docker configuration
- ✅ Added environment templates
- ✅ Documented all processes

---

**Last Updated:** March 30, 2026  
**Maintained By:** Development Team  
**Status:** Production Ready ✅
