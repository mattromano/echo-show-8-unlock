# Room sensors (Raspberry Pis)

Each Pi runs `kitchen-sensor/sensor_server.py` as the `kitchen-sensor` systemd service.
It serves `http://<pi>:8765/reading` as JSON, and Kitchen Home polls it every minute
(the addresses are under Settings → Room sensors).

| Pi | Address | Sensor | Room name | Notes |
|---|---|---|---|---|
| Pi 4 (`raspberrypi`, Raspberry Pi OS 11) | 192.168.4.34 | Sense HAT on ribbon cable | **Office** | HTS221 humidity chip doesn't respond on I2C (no 0x5f), so temp comes from the LPS25H pressure chip. Pressure is reported too. Config: `CPU_K=0`, `OFFSET_C=-2.1`. |
| Pi 3 B/B+ running **Home Assistant OS 4.11 / Core 0.112.4** | **192.168.4.37** (Wi-Fi, TheBearDen); 192.168.4.36 when on Ethernet | AM2302 module on GPIO4 (+ to pin 1 3.3 V, out to pin 7, − to pin 6) | **Living room** | Read by HA's `dht` platform (`sensor.living_room_temperature`, `sensor.living_room_humidity`). Kitchen Home reads it via the HA REST API (`ha:living_room` entry + long-lived token in Settings). |

| Bedroom Pi | not set up yet | ? | **Bedroom** | Planned: Raspberry Pi Imager with Wi-Fi + this PC's SSH key, then `install.sh` |

### Home Assistant Pi (192.168.4.37)

- **Admin SSH (host):** port 22222, root, **RSA key only**. Dropbear 2019.78 predates ed25519.
  Key: `~/.ssh/id_rsa_haos`, imported from `CONFIG/authorized_keys` on the `hassos-boot` partition. HAOS deletes the CONFIG folder after importing it.
  The login lands in the `ha >` console and needs a real terminal, so use the Terminal panel:
  `ssh -i C:\Users\mattr\.ssh\id_rsa_haos -o PubkeyAcceptedAlgorithms=+ssh-rsa -o HostkeyAlgorithms=+ssh-rsa -p 22222 root@192.168.4.37`, then type `login` for the host shell.
- **Wi-Fi:** `nmcli device wifi connect TheBearDen password '…'` (typed by the user). NetworkManager keeps it across reboots. Reserve .37 in the router.
- **Config:** `/mnt/data/supervisor/homeassistant/configuration.yaml`. The AM2302 entry was appended to the existing `sensor:` list (backup `configuration.yaml.bak`):
  ```yaml
    - platform: dht
      sensor: AM2302
      pin: 4
      name: Living room   # renamed from Kitchen
      monitored_conditions: [temperature, humidity]
  ```
  Check with `docker exec homeassistant python -m homeassistant --script check_config -c /config`, then `docker restart homeassistant`.
- **First readings:** 76.1 °F, 57.3 % (2026-11-04).
- **Calibration:** placed next to the Office Sense HAT and the AcuRite (both ~77 °F), the AM2302 read a steady 75.6 °F, so it's **1.4 °F low**.
  The fix is applied in Kitchen Home (`ha:living_room=+1.4`), not in Home Assistant, because 0.112's `dht` `temperature_offset` is unreliable with °F units.
  Home Assistant's own UI still shows the raw value. Humidity isn't calibrated (no reference).
- The old Home Assistant is "Unsupported/Unhealthy" because of its age, but it runs fine. The web UI takes several minutes after boot on the Pi 3.

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

**Sense HAT calibration:** this HAT is on a **ribbon cable away from the Pi**, so the CPU self-heating correction is off (`CPU_K=0`).
Calibrated 2026-11-04 against the AcuRite indoor display: raw 26.9 °C (80.4 °F) vs AcuRite 76.6 °F, giving `OFFSET_C=-2.1`, and the corrected reading is 76.6 °F.
(The first default, `CPU_K=0.35`, assumed the HAT sat on the Pi and wrongly showed ~69 °F.)
If you ever mount a HAT directly on a Pi, use `CPU_K` around 0.35 and recalibrate.
**Second check, same afternoon:** the HAT reported 79.0 °F (raw 28.2 °C, CPU 53 °C) while the AcuRite read 78.1 °F, up from 76.6.
The room itself warmed. A two-point fit gives only `CPU_K ≈ 0.13`, which is about 0.5 °F of CPU influence.
The ~0.9 °F gap matches the AcuRite sitting on the floor while the HAT is at desk height, so the calibration was **left as-is** on purpose.

## Gotchas

- Don't pipe text into the Pi from Windows PowerShell for config files: it adds a BOM. The server now tolerates it (`utf-8-sig`).
- Don't run `sed -i "s/\r$//"` inline through `ssh` from PowerShell: the backslash gets eaten and it strips every trailing **r**. The files in this repo are already LF.
- SSH key setup (the user types the password once):
  `type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh pi@<ip> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"`

## Temperature logger (Office Pi, port 8766)

`pi/temp-logger/temp_logger.py` runs as `kitchen-logger` on the Office Pi (192.168.4.34). Every 5 minutes it records each source in `/etc/kitchen-logger/sources.json` (Office, Living room via Home Assistant, Bedroom, Outside via Open-Meteo) into SQLite at `/var/lib/kitchen-logger/temps.db`.

- `GET :8766/history?hours=24`: per-room series, averaged into buckets so ranges up to 30+ days stay small. `GET :8766/latest`: the last reading per room.
- The Home Assistant token lives in `/etc/kitchen-logger/ha_token` (mode 600). The user pastes it in with `ssh -t pi@192.168.4.34 nano /etc/kitchen-logger/ha_token`. It is never committed.
- Per-room calibration: `offset_f` in sources.json (Living room +1.4 �F for now).
- Install/update: `scp -r pi/temp-logger pi@192.168.4.34:/home/pi/` then `ssh pi@192.168.4.34 'bash ~/temp-logger/install.sh'`.
- Kitchen Home's dashboard (`assets/dashboard.js`) opens when you tap the room temperatures; it offers 24 h / 7 day / 30 day views.
