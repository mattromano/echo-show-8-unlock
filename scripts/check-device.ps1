# Shows whether the Echo Show is visible to Windows, adb and fastboot.
$root = Split-Path -Parent $PSScriptRoot
$pt = Join-Path $root 'tools\platform-tools'
$adb = Join-Path $pt 'adb.exe'
$fastboot = Join-Path $pt 'fastboot.exe'

if (-not (Test-Path $adb)) { Write-Error "Platform Tools missing: $pt"; exit 1 }

Write-Host '== USB devices (Windows) ==' -ForegroundColor Cyan
Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
    Where-Object { $_.FriendlyName -match 'Android|ADB|Fastboot|Amazon|Kindle|MediaTek|MTK|Echo|Preloader' } |
    Select-Object Status, Class, FriendlyName | Format-Table -AutoSize

Write-Host '== adb devices ==' -ForegroundColor Cyan
& $adb devices -l

Write-Host '== fastboot devices ==' -ForegroundColor Cyan
& $fastboot devices -l
