# Builds app/kitchen-home into a signed APK without Gradle:
# aapt2 (manifest + icon + assets) -> javac -> d8 -> zip -> zipalign -> apksigner.
# Usage: scripts\build-kitchen-home.ps1 [-Install]
param([switch]$Install)
$ErrorActionPreference = 'Stop'

$root  = Split-Path -Parent $PSScriptRoot
$app   = Join-Path $root 'app\kitchen-home'
$tools = Join-Path $root 'tools'
$sdk   = Join-Path $tools 'android-sdk'
$bt    = Join-Path $sdk 'build-tools\34.0.0'
$jar   = Join-Path $sdk 'platforms\android-34\android.jar'
$env:JAVA_HOME = (Get-ChildItem (Join-Path $tools 'jdk') -Directory | Select-Object -First 1).FullName
$java  = Join-Path $env:JAVA_HOME 'bin'
$out   = Join-Path $root 'build\kitchen-home'
$ks    = Join-Path $root 'keystore\kitchen-home.jks'

function Run($exe, [string[]]$argv) {
    & $exe @argv
    if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($exe)) failed ($LASTEXITCODE)" }
}

Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$out\res-compiled", "$out\classes", "$out\dex" | Out-Null

# 1. Launcher icon (generated once into res/)
$iconDir = Join-Path $app 'res\mipmap-xxhdpi'
if (-not (Test-Path "$iconDir\ic_launcher.png")) {
    Add-Type -AssemblyName System.Drawing
    New-Item -ItemType Directory -Force $iconDir | Out-Null
    $s = 144; $bmp = New-Object Drawing.Bitmap $s, $s; $g = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.Clear([Drawing.Color]::Transparent)
    $g.FillEllipse((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 22, 29, 39))), 4, 4, $s - 8, $s - 8)
    $warm = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 242, 180, 90))
    $g.FillPolygon($warm, [Drawing.Point[]]@((New-Object Drawing.Point 72, 34), (New-Object Drawing.Point 112, 70), (New-Object Drawing.Point 32, 70)))
    $g.FillRectangle($warm, 44, 68, 56, 40)
    $g.FillRectangle((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 22, 29, 39))), 64, 84, 16, 24)
    $bmp.Save("$iconDir\ic_launcher.png", [Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}

# 2. Resources + manifest
Run "$bt\aapt2.exe" @('compile', '--dir', "$app\res", '-o', "$out\res.zip")
Run "$bt\aapt2.exe" @('link', '-o', "$out\unsigned.apk", '-I', $jar, '--manifest', "$app\AndroidManifest.xml",
    '-A', "$app\assets", '--java', "$out\gen", '--auto-add-overlay', "$out\res.zip")

# 3. Java -> classes -> dex
$srcs = @(Get-ChildItem "$app\src", "$out\gen" -Recurse -Filter *.java | ForEach-Object FullName)
Run "$java\javac.exe" (@('-source', '8', '-target', '8', '-bootclasspath', $jar, '-Xlint:-options', '-encoding', 'UTF-8', '-d', "$out\classes") + $srcs)
$classes = @(Get-ChildItem "$out\classes" -Recurse -Filter *.class | ForEach-Object FullName)
Run "$bt\d8.bat" (@('--release', '--min-api', '25', '--lib', $jar, '--output', "$out\dex") + $classes)

# 4. Add classes.dex to the APK
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open("$out\unsigned.apk", 'Update')
[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$out\dex\classes.dex", 'classes.dex') | Out-Null
$zip.Dispose()

# 5. Align + sign (keystore is created once and kept so updates install over the old version)
Run "$bt\zipalign.exe" @('-f', '-p', '4', "$out\unsigned.apk", "$out\aligned.apk")
if (-not (Test-Path $ks)) {
    New-Item -ItemType Directory -Force (Split-Path $ks) | Out-Null
    Run "$java\keytool.exe" @('-genkeypair', '-keystore', $ks, '-storepass', 'kitchenhome', '-keypass', 'kitchenhome',
        '-alias', 'kitchenhome', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Kitchen Home')
}
Run "$bt\apksigner.bat" @('sign', '--ks', $ks, '--ks-pass', 'pass:kitchenhome', '--out', "$out\kitchen-home.apk", "$out\aligned.apk")
Write-Host "Built $out\kitchen-home.apk ($((Get-Item "$out\kitchen-home.apk").Length) bytes)"

if ($Install) {
    $adb = Join-Path $tools 'platform-tools\adb.exe'
    Run $adb @('install', '-r', "$out\kitchen-home.apk")
    # Sideloaded apps land as "interpret-only" on this Fire OS build and never get compiled; do it now.
    Run $adb @('shell', 'cmd', 'package', 'compile', '-m', 'speed', '-f', 'com.kitchenhome')
}
