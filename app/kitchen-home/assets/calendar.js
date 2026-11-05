'use strict';

/* ------------------------------------------------------------------
 * Calendar card: merges private iCal (.ics) feeds from Outlook and
 * Google into one list for today + the next few days.
 *
 * Feeds live in localStorage ('cal.feeds' = [{name, url, color}]), pasted
 * by the user in Settings → Calendars. The WebView runs from file:// with
 * universal access, so cross-origin fetches of the .ics links work on the
 * Echo without a proxy. Expanded occurrences are cached per feed so the
 * card still shows something when offline.
 *
 * Handles: line folding, TZID (IANA + common Windows names from Outlook),
 * UTC and floating times, all-day/multi-day events, DURATION, RRULE
 * (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY incl.
 * ordinals, BYMONTHDAY, BYMONTH, BYSETPOS), EXDATE, RECURRENCE-ID
 * overrides and STATUS:CANCELLED.
 * Depends on app.js helpers: $, store, toast, closeSheets.
 * ------------------------------------------------------------------ */

const CAL = {
  days: 4,                       // today + 3
  refreshMs: 10 * 60 * 1000,
  palette: ['#4ea1ff', '#34c47c', '#f2b45a', '#e5677a', '#b48cff', '#3fc6c6'],
};

/* ------------------------------ time zones ------------------------------ */
const WIN_TZ = {
  'Pacific Standard Time': 'America/Los_Angeles', 'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix', 'Central Standard Time': 'America/Chicago',
  'Eastern Standard Time': 'America/New_York', 'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu', 'Atlantic Standard Time': 'America/Halifax',
  'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest', 'Central European Standard Time': 'Europe/Warsaw',
  'E. Europe Standard Time': 'Europe/Bucharest', 'India Standard Time': 'Asia/Kolkata',
  'China Standard Time': 'Asia/Shanghai', 'Tokyo Standard Time': 'Asia/Tokyo',
  'AUS Eastern Standard Time': 'Australia/Sydney', 'UTC': 'UTC', 'Coordinated Universal Time': 'UTC',
};
const fmtCache = {};
function zoneName(tzid) {
  if (!tzid) return null;
  const t = tzid.replace(/^"|"$/g, '').replace(/^\/[^/]*\//, ''); // strip quotes / "/mozilla.org/..." prefixes
  if (WIN_TZ[t]) return WIN_TZ[t];
  try { new Intl.DateTimeFormat('en-US', { timeZone: t }); return t; } catch (e) { return null; }
}
function tzOffsetMs(utcMs, tz) {
  let f = fmtCache[tz];
  if (!f) {
    f = fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
  }
  const p = {};
  f.formatToParts(new Date(utcMs)).forEach((x) => { p[x.type] = +x.value; });
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - utcMs;
}
/** Wall-clock fields in `tz` (null = device local) → epoch ms. */
function wallToMs(y, mo, d, h, mi, s, tz) {
  if (tz === 'UTC') return Date.UTC(y, mo, d, h, mi, s);
  if (!tz) return new Date(y, mo, d, h, mi, s).getTime();
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let ms = guess - tzOffsetMs(guess, tz);
  const off2 = tzOffsetMs(ms, tz);
  if (guess - off2 !== ms) ms = guess - off2;
  return ms;
}

/* ------------------------------ ICS parsing ----------------------------- */
function parseProp(line) {
  // NAME;PARAM=V;PARAM="V:x":VALUE   (colon inside quotes doesn't end the name part)
  let i = 0, q = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ':' && !q) break;
  }
  const head = line.slice(0, i), value = line.slice(i + 1);
  const parts = head.split(';');
  const params = {};
  parts.slice(1).forEach((p) => {
    const k = p.indexOf('=');
    if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, '');
  });
  return { name: parts[0].toUpperCase(), params, value };
}
const unescapeText = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/** "20261105" / "20261105T093000" / "...Z" → {y,mo,d,h,mi,s,allDay,tz} */
function parseDate(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(value.trim());
  if (!m) return null;
  const allDay = !m[4] || (params && params.VALUE === 'DATE');
  return {
    y: +m[1], mo: +m[2] - 1, d: +m[3],
    h: allDay ? 0 : +m[4], mi: allDay ? 0 : +m[5], s: allDay ? 0 : +(m[6] || 0),
    allDay, tz: m[7] ? 'UTC' : allDay ? null : zoneName(params && params.TZID),
  };
}
const dtMs = (dt) => wallToMs(dt.y, dt.mo, dt.d, dt.h, dt.mi, dt.s, dt.allDay ? null : dt.tz);

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return 0;
  const ms = ((+m[2] || 0) * 7 * 86400 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function parseIcs(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let ev = null, depth = 0;
  for (const raw of lines) {
    if (!raw) continue;
    if (raw === 'BEGIN:VEVENT') { ev = { exdates: [] }; depth = 0; continue; }
    if (!ev) continue;
    if (raw.startsWith('BEGIN:')) { depth++; continue; }       // VALARM etc.
    if (raw.startsWith('END:') && depth) { depth--; continue; }
    if (raw === 'END:VEVENT') { if (ev.start) events.push(ev); ev = null; continue; }
    if (depth) continue;
    const p = parseProp(raw);
    switch (p.name) {
      case 'UID': ev.uid = p.value; break;
      case 'SUMMARY': ev.title = unescapeText(p.value); break;
      case 'LOCATION': ev.location = unescapeText(p.value); break;
      case 'STATUS': ev.status = p.value.toUpperCase(); break;
      case 'DTSTART': ev.start = parseDate(p.value, p.params); break;
      case 'DTEND': ev.end = parseDate(p.value, p.params); break;
      case 'DURATION': ev.duration = parseDuration(p.value); break;
      case 'RRULE': ev.rrule = p.value; break;
      case 'RECURRENCE-ID': ev.recurId = parseDate(p.value, p.params); break;
      case 'EXDATE': p.value.split(',').forEach((v) => { const d = parseDate(v, p.params); if (d) ev.exdates.push(d); }); break;
      case 'TRANSP': ev.transp = p.value; break;
      default: break;
    }
  }
  return events;
}

/* ---------------------------- recurrence ------------------------------- */
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function parseRrule(s) {
  const r = {};
  s.split(';').forEach((kv) => { const [k, v] = kv.split('='); if (k && v) r[k.toUpperCase()] = v; });
  return {
    freq: r.FREQ, interval: Math.max(1, +r.INTERVAL || 1), count: r.COUNT ? +r.COUNT : null,
    until: r.UNTIL ? parseDate(r.UNTIL, {}) : null,
    byday: r.BYDAY ? r.BYDAY.split(',').map((x) => { const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(x); return m ? { n: m[1] ? +m[1] : 0, wd: WD[m[2]] } : null; }).filter(Boolean) : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map((x) => +x - 1) : null,
    bysetpos: r.BYSETPOS ? r.BYSETPOS.split(',').map(Number) : null,
    wkst: WD[r.WKST] !== undefined ? WD[r.WKST] : 1,
  };
}
// Dates are handled as UTC-midnight "day numbers" so DST never shifts them.
const dayNum = (y, mo, d) => Math.floor(Date.UTC(y, mo, d) / 86400000);
const fromDay = (n) => { const x = new Date(n * 86400000); return { y: x.getUTCFullYear(), mo: x.getUTCMonth(), d: x.getUTCDate(), wd: x.getUTCDay() }; };
const daysInMonth = (y, mo) => new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();

/** Candidate day numbers within one month for BYDAY / BYMONTHDAY rules. */
function monthDays(y, mo, rule, defDay) {
  const dim = daysInMonth(y, mo);
  let out = [];
  if (rule.byday) {
    rule.byday.forEach(({ n, wd }) => {
      const all = [];
      for (let d = 1; d <= dim; d++) if (fromDay(dayNum(y, mo, d)).wd === wd) all.push(d);
      if (!n) out.push(...all);
      else { const d = n > 0 ? all[n - 1] : all[all.length + n]; if (d) out.push(d); }
    });
    if (rule.bymonthday) out = out.filter((d) => rule.bymonthday.some((md) => (md > 0 ? md : dim + md + 1) === d));
  } else if (rule.bymonthday) {
    rule.bymonthday.forEach((md) => { const d = md > 0 ? md : dim + md + 1; if (d >= 1 && d <= dim) out.push(d); });
  } else if (defDay <= dim) {
    out.push(defDay);
  }
  out = [...new Set(out)].sort((a, b) => a - b);
  if (rule.bysetpos) out = rule.bysetpos.map((p) => (p > 0 ? out[p - 1] : out[out.length + p])).filter(Boolean);
  return out.map((d) => dayNum(y, mo, d));
}

/** Start day numbers of every occurrence of `ev` up to `endDay` (inclusive). */
function expandDays(ev, rule, fromDayN, endDay) {
  const s = ev.start;
  const startDay = dayNum(s.y, s.mo, s.d);
  const startWd = fromDay(startDay).wd;
  const untilDay = rule.until ? dayNum(rule.until.y, rule.until.mo, rule.until.d) : Infinity;
  const res = [];
  let produced = 0;
  const push = (dn) => {
    if (dn < startDay || dn > untilDay) return true;
    if (rule.count && produced >= rule.count) return false;
    produced++;
    if (dn >= fromDayN && dn <= endDay) res.push(dn);
    return true;
  };
  const LIMIT = 4000;
  if (rule.freq === 'DAILY' || rule.freq === 'WEEKLY') {
    const period = rule.freq === 'DAILY' ? 1 : 7;
    const base = rule.freq === 'WEEKLY' ? startDay - ((startWd - rule.wkst + 7) % 7) : startDay;
    let k = 0;
    if (!rule.count) {                                       // jump close to the window
      const skip = Math.floor((fromDayN - base) / (period * rule.interval)) - 1;
      if (skip > 0) k = skip;
    }
    for (let i = 0; i < LIMIT; i++, k++) {
      const p0 = base + k * period * rule.interval;
      if (p0 > endDay || p0 > untilDay) break;
      let days;
      if (rule.freq === 'DAILY') days = [p0];
      else {
        const wds = rule.byday ? rule.byday.map((b) => b.wd) : [startWd];
        days = wds.map((wd) => p0 + ((wd - rule.wkst + 7) % 7)).sort((a, b) => a - b);
      }
      let go = true;
      for (const dn of days) {
        const f = fromDay(dn);
        if (rule.freq === 'DAILY' && rule.byday && !rule.byday.some((b) => b.wd === f.wd)) continue;
        if (rule.bymonth && !rule.bymonth.includes(f.mo)) continue;
        if (!(go = push(dn))) break;
      }
      if (!go) break;
    }
  } else if (rule.freq === 'MONTHLY' || rule.freq === 'YEARLY') {
    for (let k = 0; k < LIMIT; k++) {
      let go = true;
      if (rule.freq === 'MONTHLY') {
        const t = s.mo + k * rule.interval;
        const y = s.y + Math.floor(t / 12), mo = ((t % 12) + 12) % 12;
        if (dayNum(y, mo, 1) > endDay || dayNum(y, mo, 1) > untilDay) break;
        if (rule.bymonth && !rule.bymonth.includes(mo)) continue;
        for (const dn of monthDays(y, mo, rule, s.d)) if (!(go = push(dn))) break;
      } else {
        const y = s.y + k * rule.interval;
        if (dayNum(y, 0, 1) > endDay || dayNum(y, 0, 1) > untilDay) break;
        for (const mo of (rule.bymonth || [s.mo])) {
          for (const dn of monthDays(y, mo, rule, s.d)) if (!(go = push(dn))) break;
          if (!go) break;
        }
      }
      if (!go) break;
    }
  } else {
    push(startDay);
  }
  return res;
}

/* --------------------- feed → occurrences in window --------------------- */
function occurrences(events, winStart, winEnd, source) {
  const out = [];
  const keyOf = (uid, ms) => uid + '|' + ms;
  const overrides = new Set();
  events.forEach((e) => { if (e.recurId) overrides.add(keyOf(e.uid, dtMs(e.recurId))); });
  const winStartDay = Math.floor((winStart - 86400000 * 31) / 86400000);
  const winEndDay = Math.floor(winEnd / 86400000) + 1;

  events.forEach((e) => {
    if (e.status === 'CANCELLED') return;
    const s0 = dtMs(e.start);
    let dur = e.end ? dtMs(e.end) - s0 : (e.duration || (e.start.allDay ? 86400000 : 0));
    if (dur < 0) dur = 0;
    const emit = (startMs) => {
      const endMs = startMs + dur;
      if (startMs >= winEnd || (endMs <= winStart && startMs < winStart)) return;
      out.push({ title: e.title || '(No title)', location: e.location || '', start: startMs, end: endMs,
        allDay: e.start.allDay, source });
    };
    if (!e.rrule || e.recurId) { emit(s0); return; }
    const rule = parseRrule(e.rrule);
    const ex = new Set(e.exdates.map(dtMs));
    expandDays(e, rule, winStartDay, winEndDay).forEach((dn) => {
      const f = fromDay(dn);
      const ms = wallToMs(f.y, f.mo, f.d, e.start.h, e.start.mi, e.start.s, e.start.allDay ? null : e.start.tz);
      if (ex.has(ms) || overrides.has(keyOf(e.uid, ms))) return;
      emit(ms);
    });
  });
  return out;
}

/* ------------------------------- feeds ---------------------------------- */
const feeds = () => store.get('cal.feeds', []);
const normUrl = (u) => u.trim().replace(/^webcal:\/\//i, 'https://');
let calStatus = {};   // index → {ok, msg, at}

async function fetchText(url, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

function windowRange() {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + CAL.days).getTime();
  return { start, end };
}

let calEvents = [];
async function refreshCalendar() {
  const list = feeds();
  if (!list.length) { calEvents = []; renderCalendar(); return; }
  const { start, end } = windowRange();
  // Cache a little beyond the visible window so an offline day still shows something.
  const cacheEnd = end + 7 * 86400000;
  const cache = store.get('cal.cache', {});
  await Promise.all(list.map(async (f, i) => {
    const key = normUrl(f.url);
    try {
      const evs = occurrences(parseIcs(await fetchText(key)), start, cacheEnd, i);
      cache[key] = { at: Date.now(), events: evs };
      calStatus[i] = { ok: true, msg: `${evs.length} upcoming`, at: Date.now() };
    } catch (e) {
      calStatus[i] = { ok: false, msg: e.name === 'AbortError' ? 'timed out' : e.message };
    }
  }));
  // Keep only feeds still configured.
  const keep = {};
  list.forEach((f) => { const k = normUrl(f.url); if (cache[k]) keep[k] = cache[k]; });
  store.set('cal.cache', keep);
  loadFromCache();
  renderCalendar();
  renderFeedSettings();
}

function loadFromCache() {
  const cache = store.get('cal.cache', {});
  const all = [];
  feeds().forEach((f, i) => {
    const c = cache[normUrl(f.url)];
    if (c) c.events.forEach((e) => all.push(Object.assign({}, e, { source: i })));
  });
  // Free/busy-only feeds (e.g. a work Outlook that only allows "Can view when I'm busy"):
  // "Free" blocks don't block time, so drop them.
  for (let i = all.length - 1; i >= 0; i--) if (/^free$/i.test(all[i].title.trim())) all.splice(i, 1);
  // Same meeting on two calendars (e.g. invited on both): show once.
  const seen = new Map();
  all.sort((a, b) => a.start - b.start || a.source - b.source).forEach((e) => {
    const k = e.title.trim().toLowerCase() + '|' + e.start;
    if (!seen.has(k)) seen.set(k, e);
  });
  calEvents = [...seen.values()];
}

/* ------------------------------ rendering ------------------------------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function fmtTime(ms) {
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'p' : 'a';
  h = h % 12 || 12;
  return h + (m ? ':' + String(m).padStart(2, '0') : '') + ap;
}
function dayLabel(dayStart, todayStart) {
  const diff = Math.round((dayStart - todayStart) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return new Date(dayStart).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function renderCalendar() {
  const el = $('#cal-list');
  const list = feeds();
  if (!list.length) {
    el.innerHTML = '<button class="cal-empty" id="cal-setup">Add your Outlook and Google calendars<br><span class="muted small">Settings → Calendars</span></button>';
    $('#cal-status').textContent = '';
    return;
  }
  const now = Date.now();
  const { start, end } = windowRange();
  const colors = list.map((f, i) => f.color || CAL.palette[i % CAL.palette.length]);
  let html = '';
  let any = false;
  for (let i = 0; i < CAL.days; i++) {
    const d0 = new Date(start); d0.setDate(d0.getDate() + i);
    const ds = d0.getTime();
    const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
    const de = d1.getTime();
    // All-day events show on every day they cover; timed events on their start day until they end.
    const items = calEvents.filter((e) => (e.allDay
      ? e.start < de && e.end > ds
      : e.start >= ds && e.start < de && (e.end > now || e.start >= now)));
    if (!items.length) continue;
    any = true;
    items.sort((a, b) => (b.allDay - a.allDay) || a.start - b.start);
    html += `<div class="cal-day">${dayLabel(ds, start)}</div>`;
    items.forEach((e) => {
      const live = !e.allDay && e.start <= now && e.end > now;
      const when = e.allDay ? 'All day' : fmtTime(e.start) + '–' + fmtTime(e.end);
      // Free/busy-only entries carry no real title: label them with the calendar's name instead.
      const generic = /^(busy|tentative|away|out of office|working elsewhere)$/i.test(e.title.trim());
      const title = generic ? `${(list[e.source] && list[e.source].name) || 'Calendar'} · ${e.title.trim().toLowerCase()}` : e.title;
      const tentative = /^tentative$/i.test(e.title.trim());
      html += `<div class="cal-ev${live ? ' live' : ''}${generic ? ' fb' : ''}${tentative ? ' tent' : ''}" style="--c:${colors[e.source] || '#888'}">`
        + `<span class="cal-bar"></span><span class="cal-when">${when}</span>`
        + `<span class="cal-title">${esc(title)}${e.location ? `<span class="cal-loc"> · ${esc(e.location)}</span>` : ''}</span></div>`;
    });
  }
  if (!any) html = `<div class="cal-none muted">Nothing scheduled for the next ${CAL.days} days</div>`;
  el.innerHTML = html;
  const bad = Object.keys(calStatus).filter((k) => !calStatus[k].ok).length;
  $('#cal-status').textContent = bad ? `${bad} calendar${bad > 1 ? 's' : ''} not updating` : '';
}

/* ------------------------------ settings -------------------------------- */
function renderFeedSettings() {
  const box = $('#cal-feeds');
  if (!box) return;
  box.innerHTML = feeds().map((f, i) => {
    const st = calStatus[i];
    const color = f.color || CAL.palette[i % CAL.palette.length];
    return `<div class="cal-feed" data-i="${i}">`
      + `<button class="cal-swatch" data-color="${i}" style="background:${color}" aria-label="Change colour"></button>`
      + `<input class="cal-name" value="${esc(f.name || '')}" placeholder="Name (e.g. Work)">`
      + `<input class="cal-url" type="password" autocomplete="off" value="${esc(f.url || '')}" placeholder="Paste .ics link">`
      + `<button class="pill cal-del" aria-label="Remove">✕</button>`
      + `<div class="cal-feed-st small ${st && !st.ok ? 'bad' : 'muted'}">${st ? (st.ok ? '✓ ' : '⚠ ') + esc(st.msg) : ''}</div></div>`;
  }).join('') || '<p class="muted small">No calendars yet.</p>';
}
function saveFeeds(list) { store.set('cal.feeds', list); }

document.addEventListener('change', (e) => {
  const row = e.target.closest('.cal-feed');
  if (!row) return;
  const list = feeds();
  const f = list[+row.dataset.i];
  if (!f) return;
  if (e.target.classList.contains('cal-name')) f.name = e.target.value.trim();
  if (e.target.classList.contains('cal-url')) f.url = e.target.value.trim();
  saveFeeds(list);
  if (e.target.classList.contains('cal-url')) refreshCalendar();
  else renderCalendar();
});
document.addEventListener('click', (e) => {
  if (e.target.closest('#cal-setup')) {
    $('#btn-settings').click();
    setTimeout(() => { const c = $('.cal-setting'); if (c) c.scrollIntoView({ block: 'start' }); }, 50);
    return;
  }
  if (e.target.closest('#cal-add')) {
    const list = feeds();
    list.push({ name: list.length ? 'Calendar ' + (list.length + 1) : 'Outlook', url: '', color: CAL.palette[list.length % CAL.palette.length] });
    saveFeeds(list); renderFeedSettings();
    return;
  }
  if (e.target.closest('#cal-refresh')) { toast('Refreshing calendars…'); refreshCalendar(); return; }
  const row = e.target.closest('.cal-feed');
  if (!row) return;
  const i = +row.dataset.i;
  const list = feeds();
  if (e.target.closest('.cal-del')) {
    list.splice(i, 1); calStatus = {};
    saveFeeds(list); renderFeedSettings(); loadFromCache(); renderCalendar();
  } else if (e.target.closest('.cal-swatch')) {
    const cur = list[i].color || CAL.palette[i % CAL.palette.length];
    list[i].color = CAL.palette[(CAL.palette.indexOf(cur) + 1) % CAL.palette.length];
    saveFeeds(list); renderFeedSettings(); renderCalendar();
  }
});
$('#btn-settings').addEventListener('click', renderFeedSettings);

/* -------------------------------- boot ---------------------------------- */
loadFromCache();
renderCalendar();
refreshCalendar();
setInterval(refreshCalendar, CAL.refreshMs);
setInterval(renderCalendar, 60 * 1000);      // roll finished events off, move "now" marker
