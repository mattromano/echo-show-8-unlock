#!/bin/bash
# Installs the temperature logger. Run on the Pi:  bash ~/temp-logger/install.sh
set -e
cd "$(dirname "$0")"
sudo mkdir -p /etc/kitchen-logger /var/lib/kitchen-logger
sudo chown "$(whoami)" /var/lib/kitchen-logger
[ -f /etc/kitchen-logger/sources.json ] || sudo cp sources.example.json /etc/kitchen-logger/sources.json
sudo touch /etc/kitchen-logger/ha_token
sudo chown "$(whoami)" /etc/kitchen-logger/ha_token
sudo chmod 600 /etc/kitchen-logger/ha_token
sed -e "s/^User=.*/User=$(whoami)/" -e "s#/home/pi/temp-logger#$(pwd)#" kitchen-logger.service \
  | sudo tee /etc/systemd/system/kitchen-logger.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now kitchen-logger.service
sleep 3
systemctl --no-pager --lines=5 status kitchen-logger.service | head -10
