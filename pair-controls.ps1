$ErrorActionPreference = 'Stop'
try {
    $keyFile = Join-Path $env:LOCALAPPDATA 'K3Controls\pairing-key.txt'
    $encrypted = Get-Content -LiteralPath $keyFile -Raw -Encoding UTF8
    $secure = ConvertTo-SecureString $encrypted.Trim()
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $response = Invoke-RestMethod -Uri 'http://127.0.0.1:3157/api/local/pair-code' -Method Post -ContentType 'application/json' -Headers @{ 'x-controls-local-key' = $key } -Body '{}'
    Write-Host ''
    Write-Host '  K3 Controls pairing code (one use, expires in 5 minutes):' -ForegroundColor Cyan
    Write-Host "  $($response.code)" -ForegroundColor White
    Write-Host ''
    Write-Host '  Enter it on the private K3 Controls page. Do not share it.'
} catch {
    Write-Host '  Could not get a code. Check that the secure K3 Controls dashboard is running.' -ForegroundColor Red
}
Read-Host '  Press Enter to close'
