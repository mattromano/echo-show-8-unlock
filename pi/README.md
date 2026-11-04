# Room sensors (Raspberry Pis)

Each Pi runs `kitchen-sensor/sensor_server.py` as the `kitchen-sensor` systemd service.
It serves `http://<pi>:8765/reading` as JSON, and Kitchen Home polls it every minute
(the addresses are under Settings → Room sensors).

| Pi | Address | Sensor | Room name | Notes |
|---|---|---|---|---|
| Pi 4 (`raspberrypi`, Raspberry Pi OS 11) | 192.168.4.34 | Sense HAT | "Sense HAT Pi" (placeholder) | HTS221 humidity chip doesn't respond on I2C (no 0x5f), so temp comes from the LPS25H pressure chip. Pressure is reported too. |
| Pi + AM2302 | not on the network yet | DHT22/AM2302 | n/a | install with `SENSOR=dht22` (needs `adafruit-circuitpython-dht` or `Adafruit_DHT`) |

## Install / update on a Pi

From the repo root on the PC (needs key-based SSH, see below):

```powershell
scp -r pi\kitchen-sensor pi@192.168.4.34:/home/pi/
ssh pi@192.168.4.34 "bash ~/kitchen-sensor/install.sh"
```

Then set the room in `/etc/kitchen-sensor.conf` and run `sudo systemctl restart kitchen-sensor`:

```
ROOM=Office
SENSOR=sensehat
CPU_K=0.35      # Sense HAT self-heating correction: room = raw - CPU_K * (cpu - raw)
OFFSET_C=0      # fine-tune against a real thermometer
```

**Sense HAT calibration:** the HAT sits on top of the Pi, so it reads warm. On 2026-11-04 it read 27.3 °C raw with the CPU at 46 °C, which corrects to 20.7 °C.
Compare with a thermometer in the same room and adjust `OFFSET_C`.

## Gotchas

- Don't pipe text into the Pi from Windows PowerShell for config files: it adds a BOM. The server now tolerates it (`utf-8-sig`).
- Don't run `sed -i "s/\r$//"` inline through `ssh` from PowerShell: the backslash gets eaten and it strips every trailing **r**. The files in this repo are already LF.
- SSH key setup (the user types the password once):
  `type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh pi@<ip> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"`
