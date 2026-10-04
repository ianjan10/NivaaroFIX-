Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\HP\.gemini\antigravity-ide\brain\da90f9d6-f1a5-48ce-9eff-5ae44cb2edb3\.user_uploaded\media_1790778678697.jpg'
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

# Target directories
$dirs = @(
    'D:\My Project\Dashboard\public\brand',
    'D:\My Project\WebLogin\public\brand'
)

foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}

# 1. Copy the full original JPG to both project brand directories
foreach ($d in $dirs) {
    Copy-Item $srcPath (Join-Path $d 'nivaarofix-brand-original.jpg') -Force
}

# 2. Generate Transparent PNG of the full image
$rect = New-Object System.Drawing.Rectangle(0, 0, $src.Width, $src.Height)
$transparentFull = New-Object System.Drawing.Bitmap($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# Lock bits for fast processing
$srcData = $src.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$dstData = $transparentFull.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

$bytes = [Math]::Abs($srcData.Stride) * $src.Height
$rgbValues = New-Object byte[] $bytes
[System.Runtime.InteropServices.Marshal]::Copy($srcData.Scan0, $rgbValues, 0, $bytes)

# Process pixel by pixel: BG is warm off-white (B~200..235, G~215..245, R~225..255)
# In ARGB 32bpp, layout is [B, G, R, A]
for ($i = 0; $i -lt $bytes; $i += 4) {
    $b = $rgbValues[$i]
    $g = $rgbValues[$i + 1]
    $r = $rgbValues[$i + 2]
    
    # Calculate background deviation:
    # Golden pixels have noticeable gold saturation: R - B is high (40..140) or brightness < 205
    $diffFromBg = [Math]::Max([Math]::Max([Math]::Abs($r - 242), [Math]::Abs($g - 235)), [Math]::Abs($b - 215))
    $goldSaturation = ($r - $b)
    
    # If pixel is part of background
    if ($diffFromBg -lt 15 -and $goldSaturation -lt 25) {
        $rgbValues[$i + 3] = 0 # Fully transparent
    } elseif ($diffFromBg -lt 28 -and $goldSaturation -lt 35) {
        # Smooth anti-aliased edge
        $alpha = [int]([Math]::Min(255, [Math]::Max(0, ($diffFromBg - 15) * 18 + ($goldSaturation - 20) * 10)))
        $rgbValues[$i + 3] = [byte]$alpha
    } else {
        $rgbValues[$i + 3] = 255 # Fully opaque
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($rgbValues, 0, $dstData.Scan0, $bytes)
$src.UnlockBits($srcData)
$transparentFull.UnlockBits($dstData)

# 3. Crop Tight Full Stacked Logo (X=230..794, Y=95..452)
$cropFullRect = New-Object System.Drawing.Rectangle(235, 95, 554, 357)
$croppedFull = New-Object System.Drawing.Bitmap(554, 357, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gFull = [System.Drawing.Graphics]::FromImage($croppedFull)
$gFull.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gFull.DrawImage($transparentFull, (New-Object System.Drawing.Rectangle(0, 0, 554, 357)), $cropFullRect, [System.Drawing.GraphicsUnit]::Pixel)
$gFull.Dispose()

# 4. Crop Tight Emblem Only (X=355..669, Y=95..316)
$cropEmblemRect = New-Object System.Drawing.Rectangle(355, 95, 314, 222)
$croppedEmblem = New-Object System.Drawing.Bitmap(314, 222, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gEmblem = [System.Drawing.Graphics]::FromImage($croppedEmblem)
$gEmblem.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gEmblem.DrawImage($transparentFull, (New-Object System.Drawing.Rectangle(0, 0, 314, 222)), $cropEmblemRect, [System.Drawing.GraphicsUnit]::Pixel)
$gEmblem.Dispose()

# 5. Crop NIVAAROFIX Wordmark (X=235..789, Y=335..412)
$cropWordmarkRect = New-Object System.Drawing.Rectangle(235, 335, 554, 78)
$croppedWordmark = New-Object System.Drawing.Bitmap(554, 78, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gWord = [System.Drawing.Graphics]::FromImage($croppedWordmark)
$gWord.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gWord.DrawImage($transparentFull, (New-Object System.Drawing.Rectangle(0, 0, 554, 78)), $cropWordmarkRect, [System.Drawing.GraphicsUnit]::Pixel)
$gWord.Dispose()

# 6. Create Horizontal Lockup (Emblem on left + Wordmark + Subtitle on right)
# Emblem height 120, width ~170. Total height 120, width ~580
$horizWidth = 620
$horizHeight = 130
$horizBmp = New-Object System.Drawing.Bitmap($horizWidth, $horizHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gHoriz = [System.Drawing.Graphics]::FromImage($horizBmp)
$gHoriz.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Draw emblem at left (x=0, y=0, w=170, h=120)
$gHoriz.DrawImage($croppedEmblem, (New-Object System.Drawing.Rectangle(0, 0, 170, 120)), (New-Object System.Drawing.Rectangle(0, 0, 314, 222)), [System.Drawing.GraphicsUnit]::Pixel)

# Draw full text (wordmark + subtitle) at right (x=175, y=10, w=440, h=105)
$cropTextRect = New-Object System.Drawing.Rectangle(235, 335, 554, 117)
$gHoriz.DrawImage($transparentFull, (New-Object System.Drawing.Rectangle(175, 12, 440, 93)), $cropTextRect, [System.Drawing.GraphicsUnit]::Pixel)
$gHoriz.Dispose()

# Save all assets into both projects
foreach ($d in $dirs) {
    $croppedFull.Save((Join-Path $d 'logo-stacked.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $croppedEmblem.Save((Join-Path $d 'logo-emblem.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $croppedWordmark.Save((Join-Path $d 'logo-wordmark.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $horizBmp.Save((Join-Path $d 'logo-horizontal.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $transparentFull.Save((Join-Path $d 'logo-full-transparent.png'), [System.Drawing.Imaging.ImageFormat]::Png)
}

Write-Host "Brand assets generated successfully in Dashboard and WebLogin!"

$src.Dispose()
$transparentFull.Dispose()
$croppedFull.Dispose()
$croppedEmblem.Dispose()
$croppedWordmark.Dispose()
$horizBmp.Dispose()
