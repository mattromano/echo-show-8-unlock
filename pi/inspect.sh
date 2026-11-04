#!/bin/bash
# Read-only survey of a Pi: model, OS, I2C devices, sensor libraries.
echo "user=$(whoami) host=$(hostname)"
tr -d '\0' < /proc/device-tree/model; echo
. /etc/os-release && echo "os=$PRETTY_NAME kernel=$(uname -r)"
python3 --version
echo "--- i2c ---"
ls /dev/i2c* 2>&1
if command -v i2cdetect >/dev/null; then sudo -n i2cdetect -y 1 2>&1 | head -12; else echo "i2cdetect not installed"; fi
echo "--- boot config ---"
grep -E "^(dtparam=i2c|dtoverlay=(rpi-sense|dht|w1))" /boot/config.txt 2>&1
echo "--- python libs ---"
for m in sense_hat adafruit_dht Adafruit_DHT board; do
  python3 -c "import $m" 2>/dev/null && echo "$m: yes" || echo "$m: no"
done
echo "--- kernel dht (iio) ---"
ls /sys/bus/iio/devices/ 2>&1
echo "--- home dir ---"
ls -la ~ | head -30
echo "--- running services of interest ---"
systemctl list-units --type=service --state=running --no-pager 2>/dev/null | grep -Ei "sense|dht|temp|sensor|flask|node|python" || echo "(none)"
echo "--- passwordless sudo ---"
sudo -n true 2>/dev/null && echo yes || echo no
