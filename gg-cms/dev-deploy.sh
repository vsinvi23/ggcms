#!/bin/bash

###############################################################################
# Development Deployment Script
# CMS Project - Full Stack (Database + Backend + Frontend)
# Date: March 30, 2026
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT=$(pwd)
BACKEND_DIR="$PROJECT_ROOT/backend/cms-backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend/react-ui"
DB_NAME="gfg_udemy"
DB_USER="strapi_admin"
DB_PASSWORD="your_password"
DB_PORT="5432"
BACKEND_PORT="1337"
FRONTEND_PORT="5173"

###############################################################################
# Helper Functions
###############################################################################

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed"
        exit 1
    fi
    print_success "$1 is installed"
}

###############################################################################
# Pre-flight Checks
###############################################################################

preflight_checks() {
    print_header "Pre-flight Checks"
    
    # Check required commands
    check_command "node"
    check_command "npm"
    check_command "psql"
    
    # Check Node version
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ required (found: $(node -v))"
        exit 1
    fi
    print_success "Node.js version OK ($(node -v))"
    
    echo ""
}

###############################################################################
# Database Setup
###############################################################################

setup_database() {
    print_header "Database Setup"
    
    # Check if PostgreSQL is running
    if ! pg_isready -q; then
        print_warning "PostgreSQL is not running. Starting..."
        sudo systemctl start postgresql || {
            print_error "Failed to start PostgreSQL"
            print_info "Try running: sudo systemctl start postgresql"
            exit 1
        }
    fi
    print_success "PostgreSQL is running"
    
    # Check if database exists
    if psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
        print_warning "Database '$DB_NAME' already exists"
    else
        print_info "Creating database '$DB_NAME'..."
        sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;" || {
            print_error "Failed to create database"
            exit 1
        }
        print_success "Database created"
    fi
    
    # Check if user exists
    if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
        print_warning "User '$DB_USER' already exists"
    else
        print_info "Creating user '$DB_USER'..."
        sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" || {
            print_error "Failed to create user"
            exit 1
        }
        sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
        sudo -u postgres psql -c "ALTER DATABASE $DB_NAME OWNER TO $DB_USER;"
        print_success "User created and privileges granted"
    fi
    
    # Test connection
    print_info "Testing database connection..."
    PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null || {
        print_error "Database connection test failed"
        exit 1
    }
    print_success "Database connection test passed"
    
    echo ""
}

###############################################################################
# Backend Setup
###############################################################################

setup_backend() {
    print_header "Backend Setup (Strapi)"
    
    cd "$BACKEND_DIR"
    
    # Check if .env exists
    if [ ! -f .env ]; then
        print_warning ".env file not found. Creating from template..."
        
        # Generate secrets
        JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
        ADMIN_JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
        API_TOKEN_SALT=$(node -e "console.log(require('crypto').randomBytes(16).toString('base64'))")
        TRANSFER_TOKEN_SALT=$(node -e "console.log(require('crypto').randomBytes(16).toString('base64'))")
        APP_KEYS=$(node -e "console.log(Array(4).fill(null).map(() => require('crypto').randomBytes(16).toString('base64')).join(','))")
        
        # Create .env file
        cat > .env << EOF
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
EOF
        print_success ".env file created with secure secrets"
    else
        print_success ".env file already exists"
    fi
    
    # Install dependencies
    print_info "Installing backend dependencies..."
    npm install || {
        print_error "Failed to install backend dependencies"
        exit 1
    }
    print_success "Backend dependencies installed"
    
    # Build admin panel
    print_info "Building admin panel..."
    npm run build || {
        print_warning "Admin panel build failed (this is OK for first-time setup)"
    }
    
    echo ""
}

###############################################################################
# Frontend Setup
###############################################################################

setup_frontend() {
    print_header "Frontend Setup (React)"
    
    cd "$FRONTEND_DIR"
    
    # Check if .env.local exists
    if [ ! -f .env.local ]; then
        print_warning ".env.local file not found. Creating..."
        cat > .env.local << EOF
# API Configuration
VITE_API_URL=http://localhost:$BACKEND_PORT

# Environment
VITE_ENV=development
VITE_DEBUG=true
EOF
        print_success ".env.local file created"
    else
        print_success ".env.local file already exists"
    fi
    
    # Install dependencies
    print_info "Installing frontend dependencies..."
    npm install || {
        print_error "Failed to install frontend dependencies"
        exit 1
    }
    print_success "Frontend dependencies installed"
    
    echo ""
}

###############################################################################
# Start Services
###############################################################################

start_services() {
    print_header "Starting Services"
    
    # Start backend
    print_info "Starting backend server (Strapi)..."
    cd "$BACKEND_DIR"
    
    # Check if port is in use
    if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null ; then
        print_warning "Port $BACKEND_PORT is already in use"
        print_info "Backend might already be running"
    else
        print_info "Run: cd backend/cms-backend && npm run develop"
    fi
    
    # Start frontend
    print_info "Starting frontend server (Vite)..."
    cd "$FRONTEND_DIR"
    
    # Check if port is in use
    if lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null ; then
        print_warning "Port $FRONTEND_PORT is already in use"
        print_info "Frontend might already be running"
    else
        print_info "Run: cd frontend/react-ui && npm run dev"
    fi
    
    echo ""
}

###############################################################################
# Display Information
###############################################################################

display_info() {
    print_header "Deployment Summary"
    
    echo -e "${GREEN}✓ Development environment setup complete!${NC}"
    echo ""
    echo -e "${BLUE}Database Information:${NC}"
    echo "  - Host: localhost:$DB_PORT"
    echo "  - Database: $DB_NAME"
    echo "  - User: $DB_USER"
    echo ""
    echo -e "${BLUE}Backend (Strapi):${NC}"
    echo "  - API URL: http://localhost:$BACKEND_PORT"
    echo "  - Admin Panel: http://localhost:$BACKEND_PORT/admin"
    echo "  - Health Check: http://localhost:$BACKEND_PORT/_health"
    echo "  - Start Command: cd backend/cms-backend && npm run develop"
    echo ""
    echo -e "${BLUE}Frontend (React):${NC}"
    echo "  - URL: http://localhost:$FRONTEND_PORT"
    echo "  - Start Command: cd frontend/react-ui && npm run dev"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Start backend: cd backend/cms-backend && npm run develop"
    echo "  2. Start frontend: cd frontend/react-ui && npm run dev"
    echo "  3. Open http://localhost:$BACKEND_PORT/admin and create admin user"
    echo "  4. Open http://localhost:$FRONTEND_PORT to access the app"
    echo ""
    echo -e "${BLUE}Useful Commands:${NC}"
    echo "  - Backend logs: cd backend/cms-backend && npm run develop"
    echo "  - Frontend logs: cd frontend/react-ui && npm run dev"
    echo "  - Database backup: pg_dump -U $DB_USER $DB_NAME > backup.sql"
    echo "  - Database restore: psql -U $DB_USER $DB_NAME < backup.sql"
    echo ""
}

###############################################################################
# Main Execution
###############################################################################

main() {
    clear
    print_header "CMS Development Deployment"
    echo ""
    
    preflight_checks
    setup_database
    setup_backend
    setup_frontend
    start_services
    display_info
    
    print_success "Setup completed successfully!"
}

# Run main function
main
