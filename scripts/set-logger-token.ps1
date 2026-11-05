# Saves the Home Assistant long-lived token for the temperature logger on the Office Pi,
# re-adds Living room to the logger's sources, and restarts it.
# The token is typed/pasted by you at the prompt (input is hidden) and only written on the Pi.
param([string]$PiHost = 'pi@192.168.4.34')

$sec = Read-Host -AsSecureString 'Paste the Home Assistant token, then press Enter'
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)).Trim()
if (-not $plain) { Write-Host 'No token entered; nothing changed.'; exit 1 }

$plain | ssh $PiHost "umask 077; cat > /etc/kitchen-logger/ha_token && echo token-saved"
$plain = $null

$sources = @'
[
  { "room": "Office",      "type": "pi",         "url": "http://127.0.0.1:8765/reading" },
  { "room": "Living room", "type": "ha",         "url": "http://192.168.4.37:8123", "entity": "living_room", "offset_f": 1.4 },
  { "room": "Bedroom",     "type": "pi",         "url": "http://192.168.4.98:8765/reading" },
  { "room": "Outside",     "type": "open-meteo", "lat": 33.9192, "lon": -118.4165 }
]
'@
$sources | ssh $PiHost "sudo tee /etc/kitchen-logger/sources.json >/dev/null && sudo systemctl restart kitchen-logger && echo logger-restarted"
Write-Host 'Done. The logger will record Living room from its next 5-minute check.'
