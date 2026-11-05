#!/bin/bash
# Installs the phone-calendar relay as a systemd service (port 8767).
# Creates /etc/phone-calendar.conf with a random upload token if there isn't one.
set -e
cd "$(dirname "$0")"
if [ ! -f /etc/phone-calendar.conf ]; then
  TOKEN=$(python3 -c "import secrets; print(secrets.token_urlsafe(9))")
  printf 'TOKEN=%s\nPORT=8767\n' "$TOKEN" | sudo tee /etc/phone-calendar.conf >/dev/null
  sudo chgrp "$(id -gn)" /etc/phone-calendar.conf
  sudo chmod 640 /etc/phone-calendar.conf
fi
sudo tee /etc/systemd/system/phone-calendar.service >/dev/null <<EOF
[Unit]
Description=Kitchen Home phone calendar relay (iPhone Shortcut -> iCal on :8767)
After=network-online.target
Wants=network-online.target

[Service]
User=$(whoami)
ExecStart=/usr/bin/python3 $(pwd)/phone_calendar.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now phone-calendar.service
sleep 2
systemctl --no-pager is-active phone-calendar.service
