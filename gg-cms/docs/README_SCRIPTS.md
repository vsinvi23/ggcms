# 🚀 Quick Start Scripts

Run the CMS platform (Backend + Frontend) easily from the root directory.

---

## 🪟 Windows (Batch Scripts)

### Start Backend Only
```cmd
start-backend.bat
```

### Start Frontend Only
```cmd
start-frontend.bat
```

### Start Both (Recommended)
```cmd
start-all.bat
```
Opens 2 terminal windows - one for backend, one for frontend.

### Stop Services
Press `Ctrl+C` in each terminal window.

---

## 🐧 Linux/Mac (Shell Scripts)

### Start Backend Only
```bash
./start-backend.sh
```

### Start Frontend Only
```bash
./start-frontend.sh
```

### Start Both (Recommended)
```bash
./start-all.sh
```
Runs both services in background and saves logs to files.

### Stop All Services
```bash
./stop-all.sh
```

### View Logs
```bash
# Backend logs
tail -f backend.log

# Frontend logs
tail -f frontend.log
```

---

## 📝 What Each Script Does

### Backend Scripts
- Navigates to `backend/cms-backend`
- Checks if `node_modules` exists
- Runs `npm install` if needed (first time)
- Starts Strapi with `npm run develop`
- Backend runs on: **http://localhost:1337**
- Admin panel: **http://localhost:1337/admin**

### Frontend Scripts
- Navigates to `frontend/react-ui`
- Checks if `node_modules` exists
- Runs `npm install` if needed (first time)
- Starts React dev server with `npm run dev`
- Frontend runs on: **http://localhost:5173**

### Combined Scripts
**Windows (`start-all.bat`):**
- Opens TWO separate terminal windows
- One for backend (Strapi)
- One for frontend (React)
- Waits 5 seconds between starts

**Linux/Mac (`start-all.sh`):**
- Runs both services in background
- Saves logs to `backend.log` and `frontend.log`
- Saves PIDs to `.backend.pid` and `.frontend.pid`
- Use `stop-all.sh` to stop both services

---

## ⚡ First Time Setup

### 1. Make Scripts Executable (Linux/Mac only)
```bash
chmod +x *.sh
```

### 2. Ensure PostgreSQL is Running
```bash
# Check if running
docker ps

# Or if installed locally
# Mac: brew services start postgresql
# Linux: sudo systemctl start postgresql
```

### 3. Start the Platform
**Windows:**
```cmd
start-all.bat
```

**Linux/Mac:**
```bash
./start-all.sh
```

### 4. First Time Admin Setup
1. Wait for backend to start (check terminal)
2. Go to http://localhost:1337/admin
3. Register your first admin user
4. Configure permissions

### 5. Access the Application
- **Frontend UI:** http://localhost:5173
- **Backend API:** http://localhost:1337/api
- **Admin Panel:** http://localhost:1337/admin

---

## 🔧 Troubleshooting

### Port Already in Use
**Backend (1337):**
```bash
# Windows
netstat -ano | findstr :1337
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:1337 | xargs kill -9
```

**Frontend (5173):**
```bash
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:5173 | xargs kill -9
```

### Dependencies Not Installing
```bash
# Clear cache and reinstall
cd backend/cms-backend
rm -rf node_modules package-lock.json
npm install

cd ../../frontend/react-ui
rm -rf node_modules package-lock.json
npm install
```

### Database Connection Error
Check `backend/cms-backend/.env`:
```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=gfg_udemy
DATABASE_USERNAME=strapi_admin
DATABASE_PASSWORD=StrongPassword123
```

---

## 🎯 Quick Reference

| Script | Platform | Action |
|--------|----------|--------|
| `start-backend.bat` | Windows | Start Strapi only |
| `start-frontend.bat` | Windows | Start React only |
| `start-all.bat` | Windows | Start both (2 windows) |
| `start-backend.sh` | Linux/Mac | Start Strapi only |
| `start-frontend.sh` | Linux/Mac | Start React only |
| `start-all.sh` | Linux/Mac | Start both (background) |
| `stop-all.sh` | Linux/Mac | Stop all services |

---

## 📚 Additional Resources

- [INTEGRATION_REVIEW_REPORT.md](./INTEGRATION_REVIEW_REPORT.md) - Integration analysis
- [PHASE1_PHASE2_IMPLEMENTATION.md](./PHASE1_PHASE2_IMPLEMENTATION.md) - Implementation details
- [backend/TEST_CASES.md](./backend/TEST_CASES.md) - API testing guide

---

**Enjoy coding!** 🚀
