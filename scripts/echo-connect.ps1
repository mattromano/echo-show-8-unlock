# Connects this PC to the Echo over Wi-Fi (adb on port 5555, enabled permanently via
# persist.adb.tcp.port=5555). Run once after the PC restarts or the Echo was unplugged from USB.
# If the USB cable is still connected too, adb sees two devices; unplug USB (or `adb disconnect`).
param([string]$EchoIp = '192.168.4.113')
$root = Split-Path -Parent $PSScriptRoot
$adb = Join-Path $root 'tools\platform-tools\adb.exe'
& $adb connect "${EchoIp}:5555"
& $adb devices -l
