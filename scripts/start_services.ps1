# NivaaroFix Full System Startup Script
# All services run as PowerShell Jobs (visible output, no silent crashes)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   NivaaroFix Full System Startup" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$root    = (Resolve-Path "$PSScriptRoot\..").Path
$pgBin   = "$root\pgsql18\pgsql\bin"
$pgData  = "$root\pgsql18\data"
$psqlExe = "$pgBin\psql.exe"
$pidFile = "$pgData\postmaster.pid"

# 1. Ensure .env exists
if (!(Test-Path "$root\.env")) {
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item "$root\.env.example" "$root\.env"
}

# 2. Start PostgreSQL
$pgRunning = Get-Process -Name postgres -ErrorAction SilentlyContinue
if ($pgRunning) {
    Write-Host "PostgreSQL already running (PID: $($pgRunning[0].Id))." -ForegroundColor Green
} else {
    if (Test-Path $pidFile) {
        Write-Host "Removing stale postmaster.pid..." -ForegroundColor Yellow
        Remove-Item $pidFile -Force
    }

    Write-Host "Starting PostgreSQL 18.6..." -ForegroundColor Yellow
    Start-Job -Name "PostgreSQL" -ScriptBlock {
        param($bin, $data)
        & "$bin\postgres.exe" -D "$data"
    } -ArgumentList $pgBin, $pgData | Out-Null

    # Poll until PostgreSQL accepts TCP connections (up to 90s)
    Write-Host "Waiting for PostgreSQL" -NoNewline -ForegroundColor Yellow
    $ready = $false
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 2
        $r = & $psqlExe -U postgres -h 127.0.0.1 -p 5432 -c "SELECT 1;" 2>&1
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Write-Host "." -NoNewline -ForegroundColor Yellow
    }
    Write-Host ""
    if (-not $ready) {
        Write-Host "FATAL: PostgreSQL did not start in 90 seconds." -ForegroundColor Red
        Write-Host "Check: $root\pgsql18\server.log" -ForegroundColor Red
        exit 1
    }
    Write-Host "PostgreSQL is ready!" -ForegroundColor Green
}

# 3. Start API Backend on port 5000
Write-Host "Starting API Backend (:5000)..." -ForegroundColor Yellow
Start-Job -Name "API" -ScriptBlock {
    param($dir)
    Set-Location $dir
    node src/server.js
} -ArgumentList "$root\apps\api" | Out-Null

Start-Sleep -Seconds 2

# 4. Start Web Dashboard on port 5173
Write-Host "Starting Web Dashboard (:5173)..." -ForegroundColor Yellow
Start-Job -Name "Web" -ScriptBlock {
    param($dir)
    Set-Location $dir
    node dev.mjs
} -ArgumentList "$root\apps\web" | Out-Null

# 5. Start Auth Portal on port 5500
Write-Host "Starting Auth Portal (:5500)..." -ForegroundColor Yellow
Start-Job -Name "Auth" -ScriptBlock {
    param($dir)
    Set-Location $dir
    node dev.mjs
} -ArgumentList "$root\apps\auth" | Out-Null

Start-Sleep -Seconds 3

# 6. Verify all ports are listening
Write-Host ""
Write-Host "Verifying services..." -ForegroundColor Yellow
$ports = [ordered]@{5432="PostgreSQL"; 5000="API Backend"; 5173="Web Dashboard"; 5500="Auth Portal"}
$allOk = $true
foreach ($port in $ports.Keys) {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $listening = $false
    try {
        $iar = $tcp.BeginConnect("127.0.0.1", $port, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne(1000)) {
            $tcp.EndConnect($iar)
            $listening = $tcp.Connected
        }
        $tcp.Close()
    } catch {}

    if ($listening) {
        Write-Host "  ✅ $($ports[$port]) (:$port) — OK" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($ports[$port]) (:$port) — NOT LISTENING" -ForegroundColor Red
        $allOk = $false
    }
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "   All systems launching!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  API Backend:    http://localhost:5000" -ForegroundColor Cyan
Write-Host "  Web Dashboard:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Auth Portal:    http://localhost:5500" -ForegroundColor Cyan
Write-Host "  Health check:   http://localhost:5000/api/health" -ForegroundColor Gray
Write-Host "==================================================" -ForegroundColor Green

if (-not $allOk) {
    Write-Host ""
    Write-Host "WARNING: Some services may still be starting up." -ForegroundColor Yellow
    Write-Host "Wait a few seconds and check the URLs above." -ForegroundColor Yellow
}
