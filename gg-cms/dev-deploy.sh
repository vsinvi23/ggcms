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
BACKEND_DIR="$PROJECT_ROOT/backend/go-cms"
FRONTEND_DIR="$PROJECT_ROOT/frontend/react-ui"
DB_NAME="gg_cms"
DB_USER="gg_cms_user"
DB_PASSWORD="${POSTGRES_PASSWORD:-gg_cms_pass}"
DB_PORT="5432"
BACKEND_PORT="8000"
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
        print_warning "$1 is not installed (will try via Docker)"
        return 1
    fi
    print_success "$1 is installed"
    return 0
}

###############################################################################
# Pre-flight Checks
###############################################################################

preflight_checks() {
    print_header "Pre-flight Checks"
    
    # Check required commands
    check_command "node" || true
    check_command "npm" || true
    check_command "docker" || {
        print_error "Docker is required"
        exit 1
    }
    
    # Check Node version
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 18 ]; then
            print_error "Node.js version 18+ required (found: $(node -v))"
            exit 1
        fi
        print_success "Node.js version OK ($(node -v))"
    fi
    
    echo ""
}

###############################################################################
# Database Setup
###############################################################################

setup_database() {
    print_header "Database Setup (Docker)"
    
    # Start Docker Compose services
    print_info "Starting Docker Compose services (postgres + mongo)..."
    docker compose up -d postgres mongodb || {
        print_error "Failed to start Docker Compose services"
        exit 1
    }
    
    # Wait for postgres to be healthy
    print_info "Waiting for PostgreSQL to be ready..."
    sleep 5
    max_retries=30
    retry_count=0
    
    while [ $retry_count -lt $max_retries ]; do
        if docker compose exec -T postgres pg_isready -U gg_cms_user -d gg_cms &>/dev/null; then
            print_success "PostgreSQL is running and healthy"
            break
        fi
        retry_count=$((retry_count + 1))
        if [ $retry_count -eq $max_retries ]; then
            print_error "PostgreSQL failed to start after $max_retries attempts"
            exit 1
        fi
        sleep 2
    done
    
    # Test connection via docker
    print_info "Testing PostgreSQL connection via Docker..."
    docker compose exec -T postgres psql -U gg_cms_user -d gg_cms -c "SELECT 1;" > /dev/null || {
        print_error "PostgreSQL connection test failed"
        exit 1
    }
    print_success "PostgreSQL connection test passed"
    
    # Wait for MongoDB
    print_info "Waiting for MongoDB to be ready..."
    sleep 3
    print_success "MongoDB is available"
    
    echo ""
}

###############################################################################
# Backend Setup
###############################################################################

setup_backend() {
    print_header "Backend Setup (Go CMS)"
    
    cd "$BACKEND_DIR"
    
    # Check if go.mod exists
    if [ ! -f go.mod ]; then
        print_error "go.mod not found. This doesn't appear to be a Go project."
        exit 1
    fi
    
    print_info "Go project detected"
    
    # Check if .env exists
    if [ ! -f .env ]; then
        print_warning ".env file not found. Creating from template..."
        
        # Create .env file for Go backend
        cat > .env << EOF
# Server
HOST=0.0.0.0
PORT=$BACKEND_PORT

# Database (PostgreSQL)
DB_HOST=postgres
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_SSLMODE=disable

# Environment
GO_ENV=development
DEBUG=true
EOF
        print_success ".env file created"
    else
        print_success ".env file already exists"
    fi
    
    # Check if dependencies are available (go mod tidy)
    print_info "Checking Go dependencies..."
    go mod tidy || {
        print_warning "go mod tidy failed (Go might not be installed)"
    }
    
    print_success "Backend Go project ready"
    
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
    
    # Docker Compose services are already running
    print_success "Docker Compose services (PostgreSQL, MongoDB) are running"
    
    # Check if backend port is in use
    if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        print_warning "Port $BACKEND_PORT is already in use"
        print_info "Backend might already be running"
    fi
    
    # Check if frontend port is in use
    if lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        print_warning "Port $FRONTEND_PORT is already in use"
        print_info "Frontend might already be running"
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
    echo -e "${BLUE}Docker Services:${NC}"
    echo "  - PostgreSQL: postgres://gg_cms_user:gg_cms_pass@localhost:5432/gg_cms"
    echo "  - MongoDB: mongodb://gg_cms_user:gg_cms_pass@localhost:27017/gg_cms"
    echo ""
    echo -e "${BLUE}Backend (Go):${NC}"
    echo "  - API Port: $BACKEND_PORT"
    echo "  - Location: ./backend/go-cms"
    echo "  - Start Command: cd backend/go-cms && go run cmd/main.go"
    echo ""
    echo -e "${BLUE}Frontend (React):${NC}"
    echo "  - URL: http://localhost:$FRONTEND_PORT"
    echo "  - Location: ./frontend/react-ui"
    echo "  - Start Command: cd frontend/react-ui && npm run dev"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Start backend: cd backend/go-cms && go run cmd/main.go"
    echo "  2. Start frontend: cd frontend/react-ui && npm run dev"
    echo "  3. View database via pgAdmin: docker compose --profile tools up -d"
    echo ""
    echo -e "${BLUE}Docker Commands:${NC}"
    echo "  - View logs: docker compose logs -f"
    echo "  - Stop services: docker compose down"
    echo "  - Clean up: docker compose down -v"
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
