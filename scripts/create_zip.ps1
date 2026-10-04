# ==============================================================================
# NivaaroFix — Clean Packaging & Archive Utility
# Creates a compressed, portable ZIP backup of the workspace excluding:
# - node_modules / package manager dependencies
# - dist / build bundles
# - .git metadata
# - .env secrets and credentials
# - temporary user upload attachments
# ==============================================================================

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = "nivaarofix_project_clean.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
$rootDir = (Get-Item -Path .).FullName

$files = Get-ChildItem -Path . -Recurse -File | Where-Object {
    $_.FullName -notmatch '\\node_modules\\' -and
    $_.FullName -notmatch '\\dist\\' -and
    $_.FullName -notmatch '\\\.git\\' -and
    $_.FullName -notmatch '\\\.vscode\\' -and
    $_.FullName -notmatch '\.zip$' -and
    $_.FullName -notmatch '\.log$' -and
    $_.FullName -notmatch '\\\.env' -and
    $_.FullName -notmatch '\\backend\\uploads\\booking_photos\\photo-' -and
    $_.FullName -notmatch '\\uploads\\booking_photos\\photo-'
}

$count = 0
foreach ($f in $files) {
    $relPath = $f.FullName.Substring($rootDir.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $relPath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    $count++
}

$zip.Dispose()
$size = (Get-Item $zipPath).Length / 1MB
Write-Host "Archive created successfully: $zipPath"
Write-Host "Total files packaged: $count"
Write-Host "Total archive size: $([math]::Round($size, 2)) MB"
