# Opens the Echo's screen in a window on this PC (scrcpy over USB): click with the mouse, type with the keyboard.
# Handy shortcuts in the window: Alt+H = Home, Alt+B = Back, Alt+O = screen off (mirror keeps working),
# Ctrl+V pastes the PC clipboard into the Echo.
$root = Split-Path -Parent $PSScriptRoot
$scrcpy = Get-ChildItem (Join-Path $root 'tools') -Directory -Filter 'scrcpy-win64-*' | Sort-Object Name | Select-Object -Last 1
if (-not $scrcpy) { throw 'scrcpy not found in tools/ (see docs/runbook.md)' }
# Use the project's adb so scrcpy's bundled adb doesn't fight it over the adb server.
$env:ADB = Join-Path $root 'tools\platform-tools\adb.exe'
Start-Process -FilePath (Join-Path $scrcpy.FullName 'scrcpy.exe') -ArgumentList @(
    '--window-title="Echo Show 8"', '--stay-awake', '--no-audio', '--max-size=1280', '--keyboard=sdk'
) -WorkingDirectory $scrcpy.FullName
