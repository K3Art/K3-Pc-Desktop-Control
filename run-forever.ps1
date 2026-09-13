$mutex = New-Object System.Threading.Mutex($false, 'Global\DesktopControlsLauncherWatchdog')
if (-not $mutex.WaitOne(0)) { exit 0 }

$log = Join-Path $PSScriptRoot "launcher-out.log"
$nodeExe = "C:\Program Files\nodejs\node.exe"
$serverJs = Join-Path $PSScriptRoot "server.js"

try {
    while ($true) {
        $listening = Get-NetTCPConnection -LocalPort 3157 -State Listen -ErrorAction SilentlyContinue
        if (-not $listening) {
            $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Add-Content -LiteralPath $log -Encoding UTF8 -Value "[$ts] starting node server.js"
            & $nodeExe $serverJs 2>&1 | Out-File -LiteralPath $log -Encoding UTF8 -Append
            $code = $LASTEXITCODE
            $ts2 = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Add-Content -LiteralPath $log -Encoding UTF8 -Value "[$ts2] exited code=$code, retrying in 5s"
        }
        Start-Sleep -Seconds 5
    }
}
finally {
    $mutex.ReleaseMutex()
}
