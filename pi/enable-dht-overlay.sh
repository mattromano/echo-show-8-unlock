#!/bin/bash
# Enables the kernel AM2302/DHT22 driver on GPIO4 (Raspberry Pi OS Bookworm) and reboots.
set -e
CFG=/boot/firmware/config.txt
[ -f "$CFG" ] || CFG=/boot/config.txt
sudo cp "$CFG" "$CFG.bak-kitchenhome"
if ! grep -q "dtoverlay=dht11" "$CFG"; then
  printf '\n[all]\n# AM2302 on GPIO4 for Kitchen Home (kernel iio driver)\ndtoverlay=dht11,gpiopin=4\n' | sudo tee -a "$CFG" >/dev/null
fi
tail -3 "$CFG"
echo "rebooting"
sudo systemctl reboot
