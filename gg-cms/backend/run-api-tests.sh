#!/bin/bash

# Backend API Test Suite
# Run this script to test all Strapi APIs

BASE_URL="http://localhost:1337/api"
ADMIN_URL="http://localhost:1337/admin"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# JWT token (will be set after login)
JWT_TOKEN=""
USER_ID=""

# Function to print test header
print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""
}

# Function to print test case
print_test() {
    echo -e "${YELLOW}TEST: $1${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
    ((PASSED_TESTS++))
    ((TOTAL_TESTS++))
}

# Function to print failure
print_failure() {
    echo -e "${RED}✗ FAIL:${NC} $1"
    echo -e "${RED}  Response: $2${NC}"
    ((FAILED_TESTS++))
    ((TOTAL_TESTS++))
}

# Function to make API request
api_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local auth=$4
    
    if [ "$auth" = "true" ]; then
        if [ -z "$data" ]; then
            curl -s -X $method "${BASE_URL}${endpoint}" \
                -H "Authorization: Bearer $JWT_TOKEN"
        else
            curl -s -X $method "${BASE_URL}${endpoint}" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $JWT_TOKEN" \
                -d "$data"
        fi
    else
        if [ -z "$data" ]; then
            curl -s -X $method "${BASE_URL}${endpoint}"
        else
            curl -s -X $method "${BASE_URL}${endpoint}" \
                -H "Content-Type: application/json" \
                -d "$data"
        fi
    fi
}

# Check if Strapi is running
check_server() {
    print_header "Checking Strapi Server"
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/users/me" 2>/dev/null)
    
    if [ "$response" = "401" ] || [ "$response" = "200" ]; then
        print_success "Strapi server is running on port 1337"
        return 0
    else
        print_failure "Strapi server is NOT running" "HTTP $response"
        echo ""
        echo -e "${RED}Please start Strapi first:${NC}"
        echo "  cd backend/cms-backend"
        echo "  npm run develop"
        echo ""
        exit 1
    fi
}

# Test Authentication APIs
test_auth() {
    print_header "Authentication API Tests"
    
    # TC-AUTH-001: Register new user
    print_test "TC-AUTH-001: Register new user"
    response=$(api_request POST "/auth/local/register" '{
        "username": "testuser",
        "email": "testuser@example.com",
        "password": "Test123!"
    }' false)
    
    if echo "$response" | grep -q "jwt"; then
        JWT_TOKEN=$(echo "$response" | grep -o '"jwt":"[^"]*' | sed 's/"jwt":"//')
        USER_ID=$(echo "$response" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
        print_success "User registered successfully (ID: $USER_ID)"
    else
        # User might already exist, try login
        print_test "User exists, trying login instead"
        response=$(api_request POST "/auth/local" '{
            "identifier": "testuser@example.com",
            "password": "Test123!"
        }' false)
        
        if echo "$response" | grep -q "jwt"; then
            JWT_TOKEN=$(echo "$response" | grep -o '"jwt":"[^"]*' | sed 's/"jwt":"//')
            USER_ID=$(echo "$response" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
            print_success "User logged in successfully (ID: $USER_ID)"
        else
            print_failure "Registration/Login failed" "$response"
            return 1
        fi
    fi
    
    # TC-AUTH-002: Login with email
    print_test "TC-AUTH-002: Login with email"
    response=$(api_request POST "/auth/local" '{
        "identifier": "testuser@example.com",
        "password": "Test123!"
    }' false)
    
    if echo "$response" | grep -q "jwt"; then
        print_success "Login with email successful"
    else
        print_failure "Login with email failed" "$response"
    fi
    
    # TC-AUTH-003: Get current user
    print_test "TC-AUTH-003: Get current user"
    response=$(api_request GET "/users/me" "" true)
    
    if echo "$response" | grep -q "email"; then
        print_success "Get current user successful"
    else
        print_failure "Get current user failed" "$response"
    fi
}

# Test User Management APIs
test_users() {
    print_header "User Management API Tests"
    
    # TC-USER-001: Get all users
    print_test "TC-USER-001: Get all users (paginated)"
    response=$(api_request GET "/users?page=0&size=10" "" true)
    
    if echo "$response" | grep -q "data"; then
        print_success "Get users successful"
    else
        print_failure "Get users failed" "$response"
    fi
    
    # TC-USER-002: Get single user
    print_test "TC-USER-002: Get single user"
    response=$(api_request GET "/users/$USER_ID" "" true)
    
    if echo "$response" | grep -q "email"; then
        print_success "Get single user successful"
    else
        print_failure "Get single user failed" "$response"
    fi
    
    # TC-USER-003: Get user's groups
    print_test "TC-USER-003: Get user's groups"
    response=$(api_request GET "/users/$USER_ID/groups" "" true)
    
    if echo "$response" | grep -q "data" || echo "$response" | grep -q "\[\]"; then
        print_success "Get user's groups successful"
    else
        print_failure "Get user's groups failed" "$response"
    fi
}

# Test Group Management APIs
test_groups() {
    print_header "Group Management API Tests"
    
    # TC-GROUP-001: Get all groups
    print_test "TC-GROUP-001: Get all groups"
    response=$(api_request GET "/user-groups?pagination[page]=1&pagination[pageSize]=10" "" true)
    
    if echo "$response" | grep -q "data"; then
        print_success "Get groups successful"
    else
        print_failure "Get groups failed" "$response"
    fi
    
    # TC-GROUP-002: Create group
    print_test "TC-GROUP-002: Create group"
    response=$(api_request POST "/user-groups" '{
        "data": {
            "name": "Test Developers",
            "description": "Automated test group"
        }
    }' true)
    
    if echo "$response" | grep -q "Test Developers"; then
        GROUP_ID=$(echo "$response" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
        print_success "Create group successful (ID: $GROUP_ID)"
        
        # TC-GROUP-003: Add member to group
        if [ ! -z "$GROUP_ID" ]; then
            print_test "TC-GROUP-003: Add member to group"
            response=$(api_request POST "/user-groups/$GROUP_ID/members" "{
                \"userId\": $USER_ID
            }" true)
            
            if echo "$response" | grep -q "success" || echo "$response" | grep -q "added"; then
                print_success "Add member to group successful"
            else
                print_failure "Add member to group failed" "$response"
            fi
        fi
    else
        print_failure "Create group failed" "$response"
    fi
}

# Test Category APIs
test_categories() {
    print_header "Category API Tests"
    
    # TC-CAT-001: Get all categories
    print_test "TC-CAT-001: Get all categories"
    response=$(api_request GET "/categories" "" true)
    
    if echo "$response" | grep -q "data" || echo "$response" | grep -q "\[\]"; then
        print_success "Get categories successful"
    else
        print_failure "Get categories failed" "$response"
    fi
    
    # TC-CAT-002: Create category
    print_test "TC-CAT-002: Create category"
    response=$(api_request POST "/categories" '{
        "data": {
            "name": "Test Category",
            "slug": "test-category",
            "description": "Automated test category"
        }
    }' true)
    
    if echo "$response" | grep -q "Test Category"; then
        CAT_ID=$(echo "$response" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
        print_success "Create category successful (ID: $CAT_ID)"
    else
        print_failure "Create category failed" "$response"
    fi
}

# Print summary
print_summary() {
    echo ""
    print_header "Test Summary"
    
    echo -e "${BLUE}Total Tests:${NC} $TOTAL_TESTS"
    echo -e "${GREEN}Passed:${NC} $PASSED_TESTS"
    echo -e "${RED}Failed:${NC} $FAILED_TESTS"
    echo ""
    
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some tests failed. Please check the output above.${NC}"
        exit 1
    fi
}

# Main execution
main() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     Strapi Backend API Test Suite                ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
    
    check_server
    test_auth
    test_users
    test_groups
    test_categories
    print_summary
}

# Run tests
main
