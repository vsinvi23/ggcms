###############################################################################
# Development Deployment Script (PowerShell)
# CMS Project - Full Stack (Database + Backend + Frontend)
# Date: March 30, 2026
###############################################################################

# Enable strict mode
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Configuration
$PROJECT_ROOT = Get-Location
$BACKEND_DIR = Join-Path $PROJECT_ROOT "backend\cms-backend"
$FRONTEND_DIR = Join-Path $PROJECT_ROOT "frontend\react-ui"
$DB_NAME = "gfg_udemy"
$DB_USER = "strapi_admin"
$DB_PASSWORD = "your_password"
$DB_PORT = "5432"
$BACKEND_PORT = "1337"
$FRONTEND_PORT = "5173"

###############################################################################
# Helper Functions
###############################################################################

function Write-Header {
    param([string]$Message)
    Write-Host "`n================================" -ForegroundColor Blue
    Write-Host $Message -ForegroundColor Blue
    Write-Host "================================`n" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor Cyan
}

function Test-Command {
    param([string]$Command)
    
    if (Get-Command $Command -ErrorAction SilentlyContinue) {
        Write-Success "$Command is installed"
        return $true
    } else {
        Write-Error-Custom "$Command is not installed"
        return $false
    }
}

###############################################################################
# Pre-flight Checks
###############################################################################

function Test-Prerequisites {
    Write-Header "Pre-flight Checks"
    
    # Check required commands
    $allInstalled = $true
    $allInstalled = (Test-Command "node") -and $allInstalled
    $allInstalled = (Test-Command "npm") -and $allInstalled
    $allInstalled = (Test-Command "psql") -and $allInstalled
    
    if (-not $allInstalled) {
        Write-Error-Custom "Missing required dependencies"
        Write-Info "Install Node.js from: https://nodejs.org"
        Write-Info "Install PostgreSQL from: https://www.postgresql.org/download/windows/"
        exit 1
    }
    
    # Check Node version
    $nodeVersion = node -v
    $nodeMajor = [int]($nodeVersion.Substring(1).Split('.')[0])
    
    if ($nodeMajor -lt 18) {
        Write-Error-Custom "Node.js version 18+ required (found: $nodeVersion)"
        exit 1
    }
    Write-Success "Node.js version OK ($nodeVersion)"
}

###############################################################################
# Database Setup
###############################################################################

function Initialize-Database {
    Write-Header "Database Setup"
    
    # Check if PostgreSQL service is running
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    
    if ($null -eq $pgService) {
        Write-Warning-Custom "PostgreSQL service not found"
        Write-Info "Please ensure PostgreSQL is installed and running"
        Write-Info "Download from: https://www.postgresql.org/download/windows/"
        $continue = Read-Host "Continue anyway? (y/n)"
        if ($continue -ne 'y') { exit 1 }
    } elseif ($pgService.Status -ne 'Running') {
        Write-Warning-Custom "PostgreSQL service is not running. Attempting to start..."
        Start-Service $pgService.Name
        Start-Sleep -Seconds 3
        Write-Success "PostgreSQL service started"
    } else {
        Write-Success "PostgreSQL is running"
    }
    
    # Set PGPASSWORD environment variable for psql commands
    $env:PGPASSWORD = "postgres"  # Default postgres password
    
    # Check if database exists
    $dbExists = psql -U postgres -lqt | Select-String -Pattern $DB_NAME -Quiet
    
    if ($dbExists) {
        Write-Warning-Custom "Database '$DB_NAME' already exists"
    } else {
        Write-Info "Creating database '$DB_NAME'..."
        try {
            psql -U postgres -c "CREATE DATABASE $DB_NAME;"
            Write-Success "Database created"
        } catch {
            Write-Error-Custom "Failed to create database: $_"
            Write-Info "Try running: psql -U postgres -c 'CREATE DATABASE $DB_NAME;'"
            exit 1
        }
    }
    
    # Check if user exists (suppress error if user doesn't exist)
    $userExists = $false
    try {
        $result = psql -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>$null
        $userExists = ($result -eq "1")
    } catch {
        $userExists = $false
    }
    
    if ($userExists) {
        Write-Warning-Custom "User '$DB_USER' already exists"
    } else {
        Write-Info "Creating user '$DB_USER'..."
        try {
            psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
            psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
            psql -U postgres -c "ALTER DATABASE $DB_NAME OWNER TO $DB_USER;"
            Write-Success "User created and privileges granted"
        } catch {
            Write-Error-Custom "Failed to create user: $_"
            exit 1
        }
    }
    
    # Test connection
    Write-Info "Testing database connection..."
    $env:PGPASSWORD = $DB_PASSWORD
    try {
        psql -h localhost -U $DB_USER -d $DB_NAME -c "SELECT 1;" | Out-Null
        Write-Success "Database connection test passed"
    } catch {
        Write-Error-Custom "Database connection test failed"
        exit 1
    }
}

###############################################################################
# Backend Setup
###############################################################################

function Initialize-Backend {
    Write-Header "Backend Setup (Strapi)"
    
    Set-Location $BACKEND_DIR
    
    # Check if .env exists
    if (-not (Test-Path .env)) {
        Write-Warning-Custom ".env file not found. Creating from template..."
        
        # Generate secrets using Node.js
        $JWT_SECRET = node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
        $ADMIN_JWT_SECRET = node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
        $API_TOKEN_SALT = node -e "console.log(require('crypto').randomBytes(16).toString('base64'))"
        $TRANSFER_TOKEN_SALT = node -e "console.log(require('crypto').randomBytes(16).toString('base64'))"
        $APP_KEYS = node -e "console.log(Array(4).fill(null).map(() => require('crypto').randomBytes(16).toString('base64')).join(','))"
        
        # Create .env file
        $envContent = @"
# Server
HOST=0.0.0.0
PORT=$BACKEND_PORT

# Secrets
APP_KEYS=$APP_KEYS
API_TOKEN_SALT=$API_TOKEN_SALT
ADMIN_JWT_SECRET=$ADMIN_JWT_SECRET
JWT_SECRET=$JWT_SECRET
TRANSFER_TOKEN_SALT=$TRANSFER_TOKEN_SALT

# Database
DATABASE_CLIENT=postgres
DATABASE_HOST=localhost
DATABASE_PORT=$DB_PORT
DATABASE_NAME=$DB_NAME
DATABASE_USERNAME=$DB_USER
DATABASE_PASSWORD=$DB_PASSWORD
DATABASE_SSL=false

# Node Environment
NODE_ENV=development
"@
        
        $envContent | Out-File -FilePath .env -Encoding utf8
        Write-Success ".env file created with secure secrets"
    } else {
        Write-Success ".env file already exists"
    }
    
    # Install dependencies
    Write-Info "Installing backend dependencies..."
    try {
        npm install
        Write-Success "Backend dependencies installed"
    } catch {
        Write-Error-Custom "Failed to install backend dependencies"
        exit 1
    }
    
    # Build admin panel
    Write-Info "Building admin panel..."
    try {
        npm run build
    } catch {
        Write-Warning-Custom "Admin panel build failed (this is OK for first-time setup)"
    }
    
    Set-Location $PROJECT_ROOT
}

###############################################################################
# Frontend Setup
###############################################################################

function Initialize-Frontend {
    Write-Header "Frontend Setup (React)"
    
    Set-Location $FRONTEND_DIR
    
    # Check if .env.local exists
    if (-not (Test-Path .env.local)) {
        Write-Warning-Custom ".env.local file not found. Creating..."
        
        $envContent = @"
# API Configuration
VITE_API_URL=http://localhost:$BACKEND_PORT

# Environment
VITE_ENV=development
VITE_DEBUG=true
"@
        
        $envContent | Out-File -FilePath .env.local -Encoding utf8
        Write-Success ".env.local file created"
    } else {
        Write-Success ".env.local file already exists"
    }
    
    # Install dependencies
    Write-Info "Installing frontend dependencies..."
    try {
        npm install
        Write-Success "Frontend dependencies installed"
    } catch {
        Write-Error-Custom "Failed to install frontend dependencies"
        exit 1
    }
    
    Set-Location $PROJECT_ROOT
}

###############################################################################
# Display Information
###############################################################################

function Show-DeploymentInfo {
    Write-Header "Deployment Summary"
    
    Write-Host "✓ Development environment setup complete!`n" -ForegroundColor Green
    
    Write-Host "Database Information:" -ForegroundColor Blue
    Write-Host "  - Host: localhost:$DB_PORT"
    Write-Host "  - Database: $DB_NAME"
    Write-Host "  - User: $DB_USER"
    Write-Host ""
    
    Write-Host "Backend (Strapi):" -ForegroundColor Blue
    Write-Host "  - API URL: http://localhost:$BACKEND_PORT"
    Write-Host "  - Admin Panel: http://localhost:$BACKEND_PORT/admin"
    Write-Host "  - Health Check: http://localhost:$BACKEND_PORT/_health"
    Write-Host "  - Start Command: cd backend\cms-backend; npm run develop"
    Write-Host ""
    
    Write-Host "Frontend (React):" -ForegroundColor Blue
    Write-Host "  - URL: http://localhost:$FRONTEND_PORT"
    Write-Host "  - Start Command: cd frontend\react-ui; npm run dev"
    Write-Host ""
    
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Open a new terminal and start backend:"
    Write-Host "     cd backend\cms-backend"
    Write-Host "     npm run develop"
    Write-Host ""
    Write-Host "  2. Open another terminal and start frontend:"
    Write-Host "     cd frontend\react-ui"
    Write-Host "     npm run dev"
    Write-Host ""
    Write-Host "  3. Open http://localhost:$BACKEND_PORT/admin and create admin user"
    Write-Host "  4. Open http://localhost:$FRONTEND_PORT to access the app"
    Write-Host ""
    
    Write-Host "Useful Commands:" -ForegroundColor Blue
    Write-Host "  - Database backup:"
    Write-Host "    pg_dump -U $DB_USER -h localhost $DB_NAME > backup.sql"
    Write-Host ""
    Write-Host "  - Database restore:"
    Write-Host "    psql -U $DB_USER -h localhost $DB_NAME < backup.sql"
    Write-Host ""
}

###############################################################################
# Main Execution
###############################################################################

function Main {
    Clear-Host
    Write-Header "CMS Development Deployment"
    
    try {
        Test-Prerequisites
        Initialize-Database
        Initialize-Backend
        Initialize-Frontend
        Show-DeploymentInfo
        
        Write-Success "Setup completed successfully!"
    } catch {
        Write-Error-Custom "Deployment failed: $_"
        exit 1
    }
}

# Run main function
Main
