# 🚀 Complete Deployment Guide

**React CMS + Strapi Backend - Production Ready**

---

## � Documentation Index

### Quick Start Guides
- **This File (DEPLOY_README.md):** Quick production deployment
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md):** Complete deployment guide
- **[FRONTEND_DEPLOYMENT.md](frontend/FRONTEND_DEPLOYMENT.md):** Frontend-specific guide
- **[BACKEND_DEPLOYMENT.md](backend/BACKEND_DEPLOYMENT.md):** Backend-specific guide
- **[PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md):** Detailed production setup

### Deployment Scripts
- **dev-deploy.sh / dev-deploy.ps1:** Automated development setup
- **prod-deploy.sh / prod-deploy.ps1:** Automated production deployment

---

## �📦 What's Included

```
testcms/
├── frontend/
│   ├── react-ui/                   ✅ React + Vite + TypeScript
│   └── FRONTEND_DEPLOYMENT.md      ✅ Frontend guide
│
├── backend/
│   ├── cms-backend/                ✅ Strapi backend
│   │   ├── Dockerfile             ✅ Production-ready
│   │   └── ecosystem.config.js    ✅ PM2 cluster mode
│   └── BACKEND_DEPLOYMENT.md       ✅ Backend guide
│
├── Deployment Scripts:
│   ├── dev-deploy.sh              ✅ Development (Linux/Mac)
│   ├── dev-deploy.ps1             ✅ Development (Windows)
│   ├── prod-deploy.sh             ✅ Production (Linux/Mac)
│   └── prod-deploy.ps1            ✅ Production (Windows)
│
├── Docker & Config:
│   ├── docker-compose.production.yml  ✅ Production setup
│   └── .env.production.example        ✅ Environment template
│
└── Documentation:
    ├── DEPLOYMENT_GUIDE.md         ✅ Complete guide
    ├── DEPLOY_README.md            ✅ This file
    └── PRODUCTION_DEPLOYMENT.md    ✅ Detailed production guide
```

---

## 🎯 Deployment Options

### Option 1: Automated Scripts (Recommended)

#### Development Deployment

**Windows:**
```powershell
.\dev-deploy.ps1
```

**Linux/Mac:**
```bash
chmod +x dev-deploy.sh
./dev-deploy.sh
```

#### Production Deployment

**Windows:**
```powershell
.\prod-deploy.ps1
```

**Linux/Mac:**
```bash
chmod +x prod-deploy.sh
./prod-deploy.sh
```

### Option 2: Manual Deployment

See detailed steps below for manual setup.

---

## ⚡ Manual Quick Start (5 Minutes)

### Step 1: Generate Secrets (2 min)

```bash
# Generate secure secrets
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('ADMIN_JWT_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('API_TOKEN_SALT=' + require('crypto').randomBytes(16).toString('base64'))"
node -e "console.log('TRANSFER_TOKEN_SALT=' + require('crypto').randomBytes(16).toString('base64'))"
node -e "console.log('APP_KEYS=' + Array(4).fill(null).map(() => require('crypto').randomBytes(16).toString('base64')).join(','))"
```

### Step 2: Configure Environment (1 min)

```bash
# Copy template
cp .env.production.example .env

# Edit with your secrets
notepad .env  # Windows
# OR
nano .env     # Linux/Mac
```

**Update these values:**
- `DATABASE_PASSWORD` - Strong password
- `JWT_SECRET` - From Step 1
- `ADMIN_JWT_SECRET` - From Step 1
- `APP_KEYS` - From Step 1
- `API_TOKEN_SALT` - From Step 1
- `TRANSFER_TOKEN_SALT` - From Step 1

### Step 3: Deploy (2 min)

```bash
# Build and start
docker-compose -f docker-compose.production.yml up -d --build

# Check status
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f
```

### Step 4: Create Admin User

1. Open: **http://localhost:1337/admin**
2. Register admin account
3. Done! ✅

---

## 🎯 Access Your Application

- **Backend API:** http://localhost:1337
- **Admin Panel:** http://localhost:1337/admin  
- **API Docs:** http://localhost:1337/documentation
- **Health Check:** http://localhost:1337/_health

---

## 📊 Management Commands

### View Logs
```bash
# All services
docker-compose -f docker-compose.production.yml logs -f

# Backend only
docker-compose -f docker-compose.production.yml logs -f backend

# Database only
docker-compose -f docker-compose.production.yml logs -f postgres
```

### Restart Services
```bash
# Restart all
docker-compose -f docker-compose.production.yml restart

# Restart backend only
docker-compose -f docker-compose.production.yml restart backend
```

### Stop Services
```bash
docker-compose -f docker-compose.production.yml down
```

### Backup Database
```bash
# Create backup
docker exec cms-postgres-prod pg_dump -U strapi strapi_production > backup_$(date +%Y%m%d).sql

# Restore backup
docker exec -i cms-postgres-prod psql -U strapi strapi_production < backup.sql
```

---

## 🔧 Configuration Details

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_PASSWORD` | PostgreSQL password | ✅ Yes |
| `JWT_SECRET` | JWT signing secret | ✅ Yes |
| `ADMIN_JWT_SECRET` | Admin JWT secret | ✅ Yes |
| `APP_KEYS` | Comma-separated keys (4+) | ✅ Yes |
| `API_TOKEN_SALT` | API token salt | ✅ Yes |
| `TRANSFER_TOKEN_SALT` | Transfer token salt | ✅ Yes |

### Docker Compose Services

**postgres** - PostgreSQL 15 Alpine
- Port: 5432 (internal)
- Data: Persistent volume `postgres_data`
- Health Check: Enabled

**backend** - Strapi CMS
- Port: 1337 (exposed)
- Mode: PM2 Cluster (2 instances)
- Uploads: Persistent volume `backend_uploads`
- Logs: Persistent volume `backend_logs`
- Auto-restart: Enabled

---

## 📋 Production Checklist

### Before Deployment
- [ ] Generated secure secrets
- [ ] Configured `.env` file
- [ ] Docker & Docker Compose installed
- [ ] Ports 1337 available
- [ ] Sufficient disk space (5GB+)

### After Deployment
- [ ] Services running (`docker-compose ps`)
- [ ] Backend accessible (http://localhost:1337)
- [ ] Admin user created
- [ ] Database backup configured
- [ ] Monitoring setup (optional)
- [ ] SSL configured (production)

---

## 🐛 Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose -f docker-compose.production.yml logs backend

# Rebuild
docker-compose -f docker-compose.production.yml build --no-cache
```

### Database connection error
```bash
# Check database is running
docker-compose -f docker-compose.production.yml ps postgres

# Check database logs
docker-compose -f docker-compose.production.yml logs postgres
```

### Port already in use
```bash
# Find process using port 1337
netstat -ano | findstr :1337  # Windows
lsof -i :1337                  # Linux/Mac

# Change port in docker-compose.yml
ports:
  - "8080:1337"  # Use 8080 instead
```

---

## 📚 Complete Documentation

### Deployment Guides

| Guide | Description | Use Case |
|-------|-------------|----------|
| **DEPLOYMENT_GUIDE.md** | Complete deployment guide | All deployment scenarios |
| **DEPLOY_README.md** | Quick start (this file) | Fast production setup |
| **FRONTEND_DEPLOYMENT.md** | Frontend-specific | React app deployment |
| **BACKEND_DEPLOYMENT.md** | Backend-specific | Strapi deployment |
| **PRODUCTION_DEPLOYMENT.md** | Detailed production | Full production setup |

### Scripts Reference

| Script | Platform | Purpose |
|--------|----------|---------|
| `dev-deploy.sh` | Linux/Mac | Automated dev setup |
| `dev-deploy.ps1` | Windows | Automated dev setup |
| `prod-deploy.sh` | Linux/Mac | Automated production |
| `prod-deploy.ps1` | Windows | Automated production |

### Additional Resources

- **Test Cases:** `backend/TEST_CASES.md`
- **Integration Guide:** `INTEGRATION_COMPLETE.md`
- **API Documentation:** `backend/cms-backend/API_DOCUMENTATION.md`
- **Architecture:** `ARCHITECTURE_ANALYSIS.md`

### Script Usage Examples

```bash
# Development setup
./dev-deploy.sh                    # Linux/Mac
.\dev-deploy.ps1                   # Windows

# Production deployment
./prod-deploy.sh deploy            # Deploy
./prod-deploy.sh secrets           # Generate secrets
./prod-deploy.sh backup            # Create backup
./prod-deploy.sh logs              # View logs
./prod-deploy.sh status            # Check status
```

---

## 🔒 Security Notes

⚠️ **Important for Production:**

1. **Change all secrets** in `.env`
2. **Use strong passwords** (16+ characters)
3. **Enable HTTPS/SSL** with reverse proxy
4. **Configure firewall** (ports 80, 443 only)
5. **Regular backups** (database + uploads)
6. **Keep updated** (security patches)

---

## 🆘 Need Help?

1. Check logs: `docker-compose logs -f`
2. Review `PRODUCTION_DEPLOYMENT.md`
3. Check Strapi docs: https://docs.strapi.io
4. Check Docker docs: https://docs.docker.com

---

## ✅ Success Indicators

Your deployment is successful when:

- ✅ `docker-compose ps` shows all services as "Up"
- ✅ http://localhost:1337 returns JSON response
- ✅ http://localhost:1337/admin shows login page
- ✅ Admin user can login
- ✅ API endpoints respond correctly

---

**Ready to deploy? Follow Steps 1-4 above!** 🚀

Last Updated: March 30, 2026
