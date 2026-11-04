# Removes (or restores) the Amazon packages listed in config/debloat.txt for user 0.
# Removal is reversible: the APKs stay in /system; restore uses `cmd package install-existing`.
# Usage: scripts\debloat.ps1            # remove
#        scripts\debloat.ps1 -Restore   # put them all back
#        scripts\debloat.ps1 -Restore -Only amazon.speech.sim
param([switch]$Restore, [string[]]$Only)
$root = Split-Path -Parent $PSScriptRoot
$adb = Join-Path $root 'tools\platform-tools\adb.exe'
$pkgs = Get-Content (Join-Path $root 'config\debloat.txt') |
    ForEach-Object { ($_ -replace '#.*$', '').Trim() } | Where-Object { $_ }
if ($Only) {
    # Accept "-Only a,b" as one string too (that's how it arrives through powershell -File).
    $Only = $Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    $pkgs = $pkgs | Where-Object { $Only -contains $_ }
}

foreach ($p in $pkgs) {
    if ($Restore) {
        $r = & $adb shell cmd package install-existing $p 2>&1
    } else {
        $r = & $adb shell pm uninstall -k --user 0 $p 2>&1
    }
    "{0,-55} {1}" -f $p, (($r | Out-String).Trim())
}
