#!/usr/bin/env python3
"""
Kitchen Home room sensor: serves this Pi's temperature (and humidity/pressure when available)
as JSON on the LAN so the Echo's home screen can show it.

  GET http://<pi>:8765/reading  ->  {"room": "...", "temp_c": 21.4, "temp_f": 70.5, ...}

Config comes from /etc/kitchen-sensor.conf (KEY=VALUE lines) or the environment:
  ROOM      display name, e.g. "Office"
  SENSOR    sensehat | dht22
  DHT_PIN   GPIO (BCM) number for the AM2302/DHT22 data pin (default 4)
  CPU_K     Sense HAT self-heating correction: room = t - CPU_K * (cpu - t)   (default 0.35)
  OFFSET_C  extra calibration offset in degrees C (default 0)
  PORT      HTTP port (default 8765)
Only the Python standard library is needed, plus the sensor's own library.
"""
import json
import os
import statistics
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def load_config():
    cfg = {}
    try:
        with open('/etc/kitchen-sensor.conf', encoding='utf-8-sig') as f:  # tolerate a BOM
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    cfg[k.strip()] = v.strip().strip('"')
    except FileNotFoundError:
        pass
    for k in ('ROOM', 'SENSOR', 'DHT_PIN', 'CPU_K', 'OFFSET_C', 'PORT'):
        if k in os.environ:
            cfg[k] = os.environ[k]
    return cfg


CFG = load_config()
ROOM = CFG.get('ROOM', os.uname().nodename)
SENSOR = CFG.get('SENSOR', 'sensehat').lower()
CPU_K = float(CFG.get('CPU_K', '0.35'))
OFFSET_C = float(CFG.get('OFFSET_C', '0'))
PORT = int(CFG.get('PORT', '8765'))
SAMPLE_EVERY = 15  # seconds
WINDOW = 8  # median over the last N samples (2 minutes)


def cpu_temp():
    with open('/sys/class/thermal/thermal_zone0/temp') as f:
        return int(f.read()) / 1000.0


class SenseHatReader:
    def __init__(self):
        from sense_hat import SenseHat
        self.s = SenseHat()
        self.has_humidity = True
        try:
            self.s.get_humidity()
        except OSError:
            self.has_humidity = False  # HTS221 missing/dead; pressure chip still gives temperature

    def read(self):
        raw = self.s.get_temperature_from_pressure()
        if raw == 0:  # first read after init is often 0
            time.sleep(0.5)
            raw = self.s.get_temperature_from_pressure()
        cpu = cpu_temp()
        out = {
            'raw_c': round(raw, 2),
            'cpu_c': round(cpu, 1),
            'temp_c': raw - CPU_K * (cpu - raw) + OFFSET_C,
            'pressure_hpa': round(self.s.get_pressure(), 1),
        }
        if self.has_humidity:
            try:
                out['humidity'] = round(self.s.get_humidity(), 1)
            except OSError:
                pass
        return out


class DhtReader:
    def __init__(self):
        pin = int(CFG.get('DHT_PIN', '4'))
        try:
            import adafruit_dht
            import board
            self.dev = adafruit_dht.DHT22(getattr(board, 'D%d' % pin), use_pulseio=False)
            self.mode = 'circuitpython'
        except ImportError:
            import Adafruit_DHT
            self.dev = Adafruit_DHT
            self.pin = pin
            self.mode = 'legacy'

    def read(self):
        for _ in range(5):  # DHT22 reads fail often; retry
            try:
                if self.mode == 'circuitpython':
                    t, h = self.dev.temperature, self.dev.humidity
                else:
                    h, t = self.dev.read_retry(self.dev.DHT22, self.pin, retries=3)
                if t is not None and h is not None:
                    return {'raw_c': round(t, 2), 'temp_c': t + OFFSET_C, 'humidity': round(h, 1)}
            except RuntimeError:
                pass
            time.sleep(2.5)
        raise RuntimeError('DHT22 read failed')


READER = SenseHatReader() if SENSOR == 'sensehat' else DhtReader()
history = []
latest = {'room': ROOM, 'sensor': SENSOR, 'ok': False, 'error': 'warming up'}
lock = threading.Lock()


def sampler():
    global latest
    while True:
        try:
            r = READER.read()
            history.append(r['temp_c'])
            del history[:-WINDOW]
            t = statistics.median(history)
            snap = dict(r)
            snap.update({
                'room': ROOM, 'sensor': SENSOR, 'ok': True,
                'temp_c': round(t, 1), 'temp_f': round(t * 9 / 5 + 32, 1),
                'updated': int(time.time()),
            })
            with lock:
                latest = snap
        except Exception as e:  # keep serving the last good value
            with lock:
                latest = dict(latest, ok=bool(history), error=str(e))
        time.sleep(SAMPLE_EVERY)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] not in ('/', '/reading'):
            self.send_error(404)
            return
        with lock:
            body = json.dumps(latest).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    threading.Thread(target=sampler, daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
