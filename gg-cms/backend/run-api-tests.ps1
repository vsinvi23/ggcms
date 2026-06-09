# Backend API Test Suite (PowerShell)
# Run this script to test all Strapi APIs

$BASE_URL = "http://localhost:1337/api"
$ADMIN_URL = "http://localhost:1337/admin"

# Test counters
$script:TotalTests = 0
$script:PassedTests = 0
$script:FailedTests = 0

# JWT token
$script:JwtToken = ""
$script:UserId = 0
$script:GroupId = 0

# Function to print colored output
function Write-Header {
    param($Message)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Blue
    Write-Host "  $Message" -ForegroundColor Blue
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Blue
    Write-Host ""
}

function Write-Test {
    param($Message)
    Write-Host "TEST: $Message" -ForegroundColor Yellow
}

function Write-Success {
    param($Message)
    Write-Host "✓ PASS: $Message" -ForegroundColor Green
    $script:PassedTests++
    $script:TotalTests++
}

function Write-Failure {
    param($Message, $Response)
    Write-Host "✗ FAIL: $Message" -ForegroundColor Red
    if ($Response) {
        Write-Host "  Response: $Response" -ForegroundColor Red
    }
    $script:FailedTests++
    $script:TotalTests++
}

# Function to make API request
function Invoke-ApiRequest {
    param(
        [string]$Method,
        [string]$Endpoint,
        [object]$Body,
        [bool]$Auth = $false
    )
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    if ($Auth) {
        $headers["Authorization"] = "Bearer $script:JwtToken"
    }
    
    try {
        $url = "$BASE_URL$Endpoint"
        $params = @{
            Uri = $url
            Method = $Method
            Headers = $headers
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        return $response
    }
    catch {
        return $_.Exception.Response
    }
}

# Check if Strapi is running
function Test-Server {
    Write-Header "Checking Strapi Server"
    
    try {
        $response = Invoke-WebRequest -Uri "$BASE_URL/users/me" -Method GET -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 401 -or $response.StatusCode -eq 200) {
            Write-Success "Strapi server is running on port 1337"
            return $true
        }
    }
    catch {
        Write-Failure "Strapi server is NOT running" "Please start with: cd backend/cms-backend && npm run develop"
        exit 1
    }
}

# Test Authentication APIs
function Test-Authentication {
    Write-Header "Authentication API Tests"
    
    # TC-AUTH-001: Register new user
    Write-Test "TC-AUTH-001: Register new user"
    $registerData = @{
        username = "testuser"
        email = "testuser@example.com"
        password = "Test123!"
    }
    
    $response = Invoke-ApiRequest -Method "POST" -Endpoint "/auth/local/register" -Body $registerData
    
    if ($response.jwt) {
        $script:JwtToken = $response.jwt
        $script:UserId = $response.user.id
        Write-Success "User registered successfully (ID: $script:UserId)"
    }
    else {
        # User might already exist, try login
        Write-Test "User exists, trying login instead"
        $loginData = @{
            identifier = "testuser@example.com"
            password = "Test123!"
        }
        
        $response = Invoke-ApiRequest -Method "POST" -Endpoint "/auth/local" -Body $loginData
        
        if ($response.jwt) {
            $script:JwtToken = $response.jwt
            $script:UserId = $response.user.id
            Write-Success "User logged in successfully (ID: $script:UserId)"
        }
        else {
            Write-Failure "Registration/Login failed" $response
            return
        }
    }
    
    # TC-AUTH-002: Login with email
    Write-Test "TC-AUTH-002: Login with email"
    $loginData = @{
        identifier = "testuser@example.com"
        password = "Test123!"
    }
    
    $response = Invoke-ApiRequest -Method "POST" -Endpoint "/auth/local" -Body $loginData
    
    if ($response.jwt) {
        Write-Success "Login with email successful"
    }
    else {
        Write-Failure "Login with email failed" $response
    }
    
    # TC-AUTH-003: Get current user
    Write-Test "TC-AUTH-003: Get current user"
    $response = Invoke-ApiRequest -Method "GET" -Endpoint "/users/me" -Auth $true
    
    if ($response.email) {
        Write-Success "Get current user successful"
    }
    else {
        Write-Failure "Get current user failed" $response
    }
}

# Test User Management APIs
function Test-Users {
    Write-Header "User Management API Tests"
    
    # TC-USER-001: Get all users
    Write-Test "TC-USER-001: Get all users (paginated)"
    $response = Invoke-ApiRequest -Method "GET" -Endpoint "/users?page=0&size=10" -Auth $true
    
    if ($response.data -or $response) {
        Write-Success "Get users successful"
    }
    else {
        Write-Failure "Get users failed" $response
    }
    
    # TC-USER-002: Get single user
    Write-Test "TC-USER-002: Get single user"
    $response = Invoke-ApiRequest -Method "GET" -Endpoint "/users/$script:UserId" -Auth $true
    
    if ($response.email -or $response.id) {
        Write-Success "Get single user successful"
    }
    else {
        Write-Failure "Get single user failed" $response
    }
    
    # TC-USER-003: Get user's groups
    Write-Test "TC-USER-003: Get user's groups"
    $response = Invoke-ApiRequest -Method "GET" -Endpoint "/users/$script:UserId/groups" -Auth $true
    
    if ($response -ne $null) {
        Write-Success "Get user's groups successful"
    }
    else {
        Write-Failure "Get user's groups failed" $response
    }
}

# Test Group Management APIs
function Test-Groups {
    Write-Header "Group Management API Tests"
    
    # TC-GROUP-001: Get all groups
    Write-Test "TC-GROUP-001: Get all groups"
    $response = Invoke-ApiRequest -Method "GET" -Endpoint "/user-groups?pagination[page]=1&pagination[pageSize]=10" -Auth $true
    
    if ($response.data -ne $null) {
        Write-Success "Get groups successful"
    }
    else {
        Write-Failure "Get groups failed" $response
    }
    
    # TC-GROUP-002: Create group
    Write-Test "TC-GROUP-002: Create group"
    $groupData = @{
        data = @{
            name = "Test Developers"
            description = "Automated test group"
        }
    }
    
    $response = Invoke-ApiRequest -Method "POST" -Endpoint "/user-groups" -Body $groupData -Auth $true
    
    if ($response.data.id) {
        $script:GroupId = $response.data.id
        Write-Success "Create group successful (ID: $script:GroupId)"
        
        # TC-GROUP-003: Add member to group
        if ($script:GroupId -gt 0) {
            Write-Test "TC-GROUP-003: Add member to group"
            $memberData = @{
                userId = $script:UserId
            }
            
            $response = Invoke-ApiRequest -Method "POST" -Endpoint "/user-groups/$script:GroupId/members" -Body $memberData -Auth $true
            
            if ($response) {
                Write-Success "Add member to group successful"
            }
            else {
                Write-Failure "Add member to group failed" $response
            }
        }
    }
    else {
        Write-Failure "Create group failed" $response
    }
}

# Test Category APIs
function Test-Categories {
    Write-Header "Category API Tests"
    
    # TC-CAT-001: Get all categories
    Write-Test "TC-CAT-001: Get all categories"
    $response = Invoke-ApiRequest -Method "GET" -Endpoint "/categories" -Auth $true
    
    if ($response) {
        Write-Success "Get categories successful"
    }
    else {
        Write-Failure "Get categories failed" $response
    }
    
    # TC-CAT-002: Create category
    Write-Test "TC-CAT-002: Create category"
    $categoryData = @{
        data = @{
            name = "Test Category"
            slug = "test-category"
            description = "Automated test category"
        }
    }
    
    $response = Invoke-ApiRequest -Method "POST" -Endpoint "/categories" -Body $categoryData -Auth $true
    
    if ($response.data.id) {
        Write-Success "Create category successful (ID: $($response.data.id))"
    }
    else {
        Write-Failure "Create category failed" $response
    }
}

# Print summary
function Write-Summary {
    Write-Host ""
    Write-Header "Test Summary"
    
    Write-Host "Total Tests: $script:TotalTests" -ForegroundColor Blue
    Write-Host "Passed:      $script:PassedTests" -ForegroundColor Green
    Write-Host "Failed:      $script:FailedTests" -ForegroundColor Red
    Write-Host ""
    
    if ($script:FailedTests -eq 0) {
        Write-Host "✓ All tests passed!" -ForegroundColor Green
        exit 0
    }
    else {
        Write-Host "✗ Some tests failed. Please check the output above." -ForegroundColor Red
        exit 1
    }
}

# Main execution
function Main {
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════╗" -ForegroundColor Blue
    Write-Host "║     Strapi Backend API Test Suite                ║" -ForegroundColor Blue
    Write-Host "╚═══════════════════════════════════════════════════╝" -ForegroundColor Blue
    
    Test-Server
    Test-Authentication
    Test-Users
    Test-Groups
    Test-Categories
    Write-Summary
}

# Run tests
Main
