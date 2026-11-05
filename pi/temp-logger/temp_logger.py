#!/usr/bin/env python3
"""
Kitchen Home temperature logger. Runs on the always-on Office Pi.

Every 5 minutes it reads each room sensor (the Pis' sensor_server.py, Home Assistant entities)
plus the outdoor temperature from Open-Meteo, and stores them in SQLite.
It serves the history for the Echo's dashboard:

  GET http://<pi>:8766/history?hours=24     -> {"series": {"Office": [[ts, temp_f, humidity|null], ...], ...}}
  GET http://<pi>:8766/latest               -> last reading per room

Config: /etc/kitchen-logger/sources.json (see sources.example.json). Home Assistant token: /etc/kitchen-logger/ha_token
Only the Python standard library is used.
"""
import json
import os
import sqlite3
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

CONF_DIR = '/etc/kitchen-logger'
DB_PATH = os.environ.get('KL_DB', '/var/lib/kitchen-logger/temps.db')
PORT = int(os.environ.get('KL_PORT', '8766'))
EVERY = int(os.environ.get('KL_EVERY', '300'))


def load_sources():
    with open(os.path.join(CONF_DIR, 'sources.json'), encoding='utf-8-sig') as f:
        return json.load(f)


def ha_token():
    try:
        with open(os.path.join(CONF_DIR, 'ha_token'), encoding='utf-8-sig') as f:
            return f.read().strip()
    except FileNotFoundError:
        return ''


def get_json(url, headers=None, timeout=10):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def read_source(src):
    """Returns (temp_f, humidity or None)."""
    kind = src['type']
    if kind == 'pi':
        r = get_json(src['url'])
        if not r.get('ok'):
            raise RuntimeError(r.get('error', 'sensor not ok'))
        return r['temp_f'], r.get('humidity')
    if kind == 'ha':
        hdr = {'Authorization': 'Bearer ' + ha_token()}
        t = get_json('%s/api/states/sensor.%s_temperature' % (src['url'], src['entity']), hdr)
        tf = float(t['state'])
        if (t['attributes'].get('unit_of_measurement') or '').endswith('C'):
            tf = tf * 9 / 5 + 32
        h = None
        try:
            hs = get_json('%s/api/states/sensor.%s_humidity' % (src['url'], src['entity']), hdr)
            h = float(hs['state'])
        except Exception:
            pass
        return tf, h
    if kind == 'open-meteo':
        r = get_json('https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s'
                     '&current=temperature_2m,relative_humidity_2m&temperature_unit=fahrenheit'
                     % (src['lat'], src['lon']))
        return r['current']['temperature_2m'], r['current'].get('relative_humidity_2m')
    raise ValueError('unknown source type ' + kind)


def db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.execute('CREATE TABLE IF NOT EXISTS readings (ts INTEGER, room TEXT, temp_f REAL, humidity REAL)')
    con.execute('CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings (ts)')
    return con


def log_once():
    now = int(time.time())
    rows = []
    for src in load_sources():
        try:
            tf, h = read_source(src)
            tf += float(src.get('offset_f', 0))
            rows.append((now, src['room'], round(tf, 2), None if h is None else round(float(h), 1)))
        except Exception as e:
            print('read failed for %s: %s' % (src.get('room'), e), flush=True)
    if rows:
        con = db()
        con.executemany('INSERT INTO readings VALUES (?, ?, ?, ?)', rows)
        con.commit()
        con.close()


def logger_loop():
    while True:
        start = time.time()
        try:
            log_once()
        except Exception as e:
            print('log cycle failed:', e, flush=True)
        time.sleep(max(5, EVERY - (time.time() - start)))


def history(hours):
    """Readings for the last `hours`, averaged into buckets so long ranges stay small (<= ~300 points/room)."""
    since = int(time.time()) - int(hours * 3600)
    bucket = max(EVERY, int(hours * 3600 / 300) // EVERY * EVERY)
    con = db()
    cur = con.execute(
        'SELECT room, (ts / ?) * ? AS b, AVG(temp_f), AVG(humidity) FROM readings '
        'WHERE ts >= ? GROUP BY room, b ORDER BY b', (bucket, bucket, since))
    series = {}
    for room, b, t, h in cur:
        series.setdefault(room, []).append([b, round(t, 2), None if h is None else round(h, 1)])
    con.close()
    return {'hours': hours, 'bucket_s': bucket, 'series': series}


def latest():
    con = db()
    cur = con.execute('SELECT room, ts, temp_f, humidity FROM readings r WHERE ts = '
                      '(SELECT MAX(ts) FROM readings WHERE room = r.room)')
    out = {room: {'ts': ts, 'temp_f': t, 'humidity': h} for room, ts, t, h in cur}
    con.close()
    return out


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urlparse(self.path)
        try:
            if u.path == '/history':
                hours = float(parse_qs(u.query).get('hours', ['24'])[0])
                body = history(min(max(hours, 1), 24 * 400))
            elif u.path == '/latest':
                body = latest()
            else:
                self.send_error(404)
                return
            data = json.dumps(body).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(500, str(e))

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    threading.Thread(target=logger_loop, daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
