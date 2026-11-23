# ==============================================================================
# NivaaroFix — Clean Source Code Packaging Utility
# Creates a clean, portable ZIP archive of the workspace excluding:
# - node_modules & package manager dependencies
# - dist & build output bundles
# - .git & IDE metadata (.vscode, .idea)
# - .env secrets (preserves .env.example)
# - pgsql18 embedded database binaries
# - tests/screenshots & temporary uploads
# ==============================================================================

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = "NivaaroFix-Source.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
$rootDir = (Get-Item -Path .).FullName

$files = Get-ChildItem -Path . -Recurse -File | Where-Object {
    $_.FullName -notmatch '\\node_modules\\' -and
    $_.FullName -notmatch '\\dist\\' -and
    $_.FullName -notmatch '\\pgsql18\\' -and
    $_.FullName -notmatch '\\\.git\\' -and
    $_.FullName -notmatch '\\\.gemini\\' -and
    $_.FullName -notmatch '\\\.vscode\\' -and
    $_.FullName -notmatch '\\\.idea\\' -and
    $_.FullName -notmatch '\.zip$' -and
    $_.FullName -notmatch '\.log$' -and
    $_.Name -ne '.env' -and
    $_.Name -notmatch '^\.env\.(local|production|development|test)$' -and
    $_.FullName -notmatch '\\backend\\uploads\\booking_photos\\photo-' -and
    $_.FullName -notmatch '\\uploads\\booking_photos\\photo-' -and
    $_.FullName -notmatch '\\storage\\secure_documents\\[0-9a-f\-]+\.enc$' -and
    $_.FullName -notmatch '\\tests\\screenshots\\'
}

$count = 0
foreach ($f in $files) {
    $relPath = $f.FullName.Substring($rootDir.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $relPath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    $count++
}

$zip.Dispose()
$size = (Get-Item $zipPath).Length / 1MB
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Archive created: $zipPath" -ForegroundColor Green
Write-Host "Files packaged:  $count" -ForegroundColor White
Write-Host "Archive size:    $([math]::Round($size, 2)) MB" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Cyan
