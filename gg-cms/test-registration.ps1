# Test Strapi Registration Endpoint
Write-Host "Testing Strapi Registration Endpoint..." -ForegroundColor Cyan
Write-Host ""

$url = "http://localhost:1337/api/auth/local/register"
$body = @{
    username = "testuser123"
    email = "testuser123@test.com"
    password = "TestPass123!"
} | ConvertTo-Json

Write-Host "URL: $url" -ForegroundColor Yellow
Write-Host "Body: $body" -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json"
    Write-Host "SUCCESS! Registration worked!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 5
} catch {
    Write-Host "ERROR!" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error Message:" -ForegroundColor Red
    $_.Exception.Message
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Details:" -ForegroundColor Red
        $_.ErrorDetails.Message
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
