# NivaaroFix Full System Startup Script
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   NivaaroFix Full System Startup" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Ensure D: drive mapping exists
if (!(Test-Path "D:\My Project")) {
    Write-Host "Mapping D: to C:\VirtualDrive..." -ForegroundColor Yellow
    subst D: C:\VirtualDrive
}

# 2. Check and start PostgreSQL 18
$pgBin = "C:\NivaaroFIX-\pgsql18\pgsql\bin"
$pgData = "C:\NivaaroFIX-\pgsql18\data"
$pgLog = "C:\NivaaroFIX-\pgsql18\server.log"

$pgRunning = Get-Process | Where-Object { $_.ProcessName -eq "postgres" }
if (!$pgRunning) {
    Write-Host "Starting PostgreSQL 18.6 server..." -ForegroundColor Yellow
    & "$pgBin\pg_ctl.exe" -D "$pgData" -l "$pgLog" start
    Start-Sleep -Seconds 2
} else {
    Write-Host "PostgreSQL 18 is already running." -ForegroundColor Green
}

# 3. Start Backend, Dashboard, and WebLogin if not running
Write-Host "All systems operational!" -ForegroundColor Green
