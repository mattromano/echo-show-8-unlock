#!/usr/bin/env python3
"""
Phone calendar relay for Kitchen Home.

An iOS Shortcut on the user's iPhone POSTs upcoming events (from whatever calendars
the phone has: work Exchange, Google, iCloud...) to this service; Kitchen Home on the
Echo reads them back as a normal iCal feed, so the calendar card needs no changes.

  POST /events          Authorization: Bearer <token>
       body: text, one event per line:   start|end|allday|calendar|location|title
             (ISO 8601 dates with offset, e.g. 2026-11-05T09:00:00-08:00; allday yes/no)
       or JSON: {"events": [{"title","start","end","allDay","calendar","location"}, ...]}
  GET  /calendar.ics[?cal=Work,Family]    events as iCal (optionally only some calendars)
  GET  /status                            last upload time, counts per calendar (no titles)

Only the latest upload is kept (it replaces the previous one). Config:
/etc/phone-calendar.conf with TOKEN=... and optional PORT=8767. Standard library only.
"""
import datetime as dt
import hashlib
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

CONF = {}
try:
    with open('/etc/phone-calendar.conf', encoding='utf-8-sig') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                CONF[k.strip()] = v.strip()
except FileNotFoundError:
    pass
TOKEN = CONF.get('TOKEN', '')
PORT = int(CONF.get('PORT', '8767'))
STORE = os.path.expanduser(CONF.get('STORE', '~/phone-calendar/events.json'))
MAX_BODY = 2 * 1024 * 1024
lock = threading.Lock()


def load():
    try:
        with open(STORE, encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {'received': None, 'events': []}


def save(data):
    tmp = STORE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f)
    os.replace(tmp, STORE)


def parse_when(s):
    """ISO 8601 from Shortcuts ('2026-11-05T09:00:00-08:00', '...Z', '2026-11-05 09:00') -> aware datetime."""
    s = s.strip()
    if 'T' not in s and len(s) > 10:
        s = s.replace(' ', 'T', 1)
    if s.endswith('Z'):
        s = s[:-1] + '+00:00'
    d = dt.datetime.fromisoformat(s)
    if d.tzinfo is None:  # floating: treat as the Pi's local time
        d = d.astimezone()
    return d


def truthy(v):
    return str(v).strip().lower() in ('1', 'yes', 'true', 'y')


def normalize(raw):
    out = []
    for e in raw:
        try:
            start = parse_when(e['start'])
            end = parse_when(e.get('end') or e['start'])
            title = (e.get('title') or '').strip() or '(No title)'
            out.append({
                'title': title[:300],
                'start': start.isoformat(),
                'end': end.isoformat(),
                'allDay': truthy(e.get('allDay', False)),
                'calendar': (e.get('calendar') or '').strip()[:100],
                'location': (e.get('location') or '').strip()[:200],
            })
        except (KeyError, ValueError, TypeError):
            continue
    return out


def parse_text(body):
    events = []
    for line in body.splitlines():
        if not line.strip():
            continue
        parts = line.split('|', 5)
        if len(parts) < 6:
            continue
        start, end, allday, cal, loc, title = parts
        events.append({'start': start, 'end': end, 'allDay': allday, 'calendar': cal, 'location': loc, 'title': title})
    return events


def ics_escape(s):
    return s.replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\n', '\\n')


def to_ics(events, cals=None):
    def utc(iso):
        return dt.datetime.fromisoformat(iso).astimezone(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//kitchen-home//phone-calendar//EN', 'X-WR-CALNAME:iPhone']
    for e in events:
        if cals and e['calendar'].lower() not in cals:
            continue
        uid = hashlib.sha1((e['calendar'] + e['title'] + e['start']).encode()).hexdigest()
        lines += ['BEGIN:VEVENT', 'UID:' + uid + '@phone-calendar']
        if e['allDay']:
            s = dt.datetime.fromisoformat(e['start'])
            en = dt.datetime.fromisoformat(e['end'])
            # Shortcuts reports an all-day event as 00:00-23:59 the same day; iCal wants an exclusive next-day end.
            end_day = en.date() if en.time() == dt.time(0, 0) and en.date() > s.date() else en.date() + dt.timedelta(days=1)
            lines += ['DTSTART;VALUE=DATE:' + s.strftime('%Y%m%d'), 'DTEND;VALUE=DATE:' + end_day.strftime('%Y%m%d')]
        else:
            lines += ['DTSTART:' + utc(e['start']), 'DTEND:' + utc(e['end'])]
        lines.append('SUMMARY:' + ics_escape(e['title']))
        if e['location']:
            lines.append('LOCATION:' + ics_escape(e['location']))
        if e['calendar']:
            lines.append('CATEGORIES:' + ics_escape(e['calendar']))
        lines.append('END:VEVENT')
    lines.append('END:VCALENDAR')
    return '\r\n'.join(lines) + '\r\n'


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype='application/json'):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path)
        with lock:
            data = load()
        if u.path == '/calendar.ics':
            q = parse_qs(u.query).get('cal', [''])[0]
            cals = {c.strip().lower() for c in q.split(',') if c.strip()} or None
            self._send(200, to_ics(data['events'], cals), 'text/calendar; charset=utf-8')
        elif u.path == '/status':
            counts = {}
            for e in data['events']:
                k = e['calendar'] or '(none)'
                counts[k] = counts.get(k, 0) + 1
            self._send(200, json.dumps({'received': data['received'], 'events': len(data['events']), 'calendars': counts}))
        else:
            self._send(404, '{"error":"not found"}')

    def do_POST(self):
        if urlparse(self.path).path != '/events':
            return self._send(404, '{"error":"not found"}')
        if not TOKEN or self.headers.get('Authorization', '').strip() != 'Bearer ' + TOKEN:
            return self._send(401, '{"error":"bad token"}')
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > MAX_BODY:
            return self._send(400, '{"error":"empty or too large"}')
        body = self.rfile.read(n).decode('utf-8', 'replace')
        try:
            raw = json.loads(body)
            raw = raw.get('events', []) if isinstance(raw, dict) else raw
        except ValueError:
            raw = parse_text(body)
        events = normalize(raw)
        with lock:
            save({'received': int(time.time()), 'events': events})
        self._send(200, json.dumps({'ok': True, 'stored': len(events), 'skipped': len(raw) - len(events)}))

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    os.makedirs(os.path.dirname(STORE), exist_ok=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
