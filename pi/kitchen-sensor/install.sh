#!/bin/bash
# Installs the Kitchen Home sensor service on a Pi. Run from the PC:
#   scp -r pi/kitchen-sensor pi@<pi>:~/   then   ssh pi@<pi> 'bash ~/kitchen-sensor/install.sh ROOM SENSOR'
# e.g. bash ~/kitchen-sensor/install.sh "Office" sensehat
set -e
ROOM="${1:-$(hostname)}"
SENSOR="${2:-sensehat}"
cd "$(dirname "$0")"
sed -i 's/\r$//' sensor_server.py kitchen-sensor.service
if [ ! -f /etc/kitchen-sensor.conf ]; then
  printf 'ROOM=%s\nSENSOR=%s\n# CPU_K=0.35\n# OFFSET_C=0\n# DHT_PIN=4\n' "$ROOM" "$SENSOR" | sudo tee /etc/kitchen-sensor.conf >/dev/null
fi
sudo cp kitchen-sensor.service /etc/systemd/system/kitchen-sensor.service
sudo systemctl daemon-reload
sudo systemctl enable --now kitchen-sensor.service
sleep 3
systemctl --no-pager --lines=5 status kitchen-sensor.service | head -12
