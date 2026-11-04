'use strict';

/* ------------------------------------------------------------------
 * Kitchen Home dashboard: clock, weather (Open-Meteo), app tiles and
 * Philips Hue rooms. Runs in the app's WebView; `Native` is the Java
 * bridge from MainActivity. In a desktop browser a mock is used.
 * ------------------------------------------------------------------ */

const CONFIG = {
  // ZIP 90245 (El Segundo, CA)
  lat: 33.9192, lon: -118.4165, place: 'El Segundo', tz: 'America/Los_Angeles',
  defaultTiles: [
    'com.netflix.mediaclient.echo',
    'web:hulu',
    'web:peacock',
    'org.smarttube.stable',
    'com.spotify.music',
    'com.android.settings',
  ],
  // The Hulu/Peacock Android apps don't run here (Amazon ownership check / retired 32-bit build),
  // so these tiles open the websites in Kitchen Home's browser in desktop mode.
  webTiles: {
    'web:hulu': { label: 'Hulu', url: 'https://www.hulu.com/hub/home', bg: '#1ce783', fg: '#0b0f14', mark: 'hulu' },
    'web:peacock': { label: 'Peacock', url: 'https://www.peacocktv.com/watch/home', bg: '#000000', fg: '#ffffff', mark: 'P' },
    'web:browser': { label: 'Browser', url: 'https://duckduckgo.com/', bg: '#263142', fg: '#eef2f6', mark: 'www' },
  },
  // Old tile ids from v0.1 that should be swapped for web tiles.
  migrate: { 'com.hulu.plus': 'web:hulu', 'com.peacock.peacockfiretv': 'web:peacock' },
  labels: { 'org.smarttube.stable': 'YouTube', 'com.netflix.mediaclient.echo': 'Netflix', 'com.peacock.peacockfiretv': 'Peacock' },
  weatherEveryMs: 15 * 60 * 1000,
  hueEveryMs: 8 * 1000,
};

const N = window.Native || {
  // Desktop-browser mock so the page can be previewed off-device.
  launch: (p) => { toast('launch ' + p); return true; },
  apps: () => JSON.stringify(['Netflix', 'Hulu', 'Peacock', 'SmartTube', 'Spotify', 'Settings', 'Silk', 'Photos']
    .map((l, i) => ({ pkg: CONFIG.defaultTiles[i] || 'mock.' + l.toLowerCase(), label: l }))),
  icon: () => '',
  installed: () => true,
  openSettings: () => toast('settings'),
  openWifiSettings: () => toast('wifi settings'),
  setBrightness: () => {},
};

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

async function fetchJson(url, opts = {}, timeoutMs = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------- clock ---------------------------- */
function tickClock() {
  const now = new Date();
  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  $('#clock').innerHTML = `${h}:${m}<span class="ampm">${ampm}</span>`;
  $('#date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  applyNightDim(now);
}

/* --------------------------- weather --------------------------- */
const ICONS = {
  sun: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="12" fill="#f7c56b"/><g stroke="#f7c56b" stroke-width="4" stroke-linecap="round"><path d="M32 6v8M32 50v8M6 32h8M50 32h8M13.6 13.6l5.7 5.7M44.7 44.7l5.7 5.7M13.6 50.4l5.7-5.7M44.7 19.3l5.7-5.7"/></g></svg>',
  moon: '<svg viewBox="0 0 64 64"><path d="M40 10a22 22 0 1 0 14 34A20 20 0 0 1 40 10z" fill="#c9d3e3"/></svg>',
  partly: '<svg viewBox="0 0 64 64"><circle cx="24" cy="24" r="10" fill="#f7c56b"/><g stroke="#f7c56b" stroke-width="3.5" stroke-linecap="round"><path d="M24 4v6M4 24h6M9.9 9.9l4.2 4.2M38.1 9.9l-4.2 4.2"/></g><path d="M22 52h26a10 10 0 0 0 0-20 14 14 0 0 0-26 4 8 8 0 0 0 0 16z" fill="#c9d3e3"/></svg>',
  cloud: '<svg viewBox="0 0 64 64"><path d="M18 50h30a12 12 0 0 0 0-24 16 16 0 0 0-30 5 9.5 9.5 0 0 0 0 19z" fill="#aab6c8"/></svg>',
  fog: '<svg viewBox="0 0 64 64"><path d="M18 36h30a12 12 0 0 0 0-24 16 16 0 0 0-30 5 9.5 9.5 0 0 0 0 19z" fill="#8b98aa"/><g stroke="#aab6c8" stroke-width="4" stroke-linecap="round"><path d="M12 46h40M18 55h28"/></g></svg>',
  rain: '<svg viewBox="0 0 64 64"><path d="M18 40h30a12 12 0 0 0 0-24 16 16 0 0 0-30 5 9.5 9.5 0 0 0 0 19z" fill="#aab6c8"/><g stroke="#7fb6ff" stroke-width="4" stroke-linecap="round"><path d="M22 48l-3 8M34 48l-3 8M46 48l-3 8"/></g></svg>',
  snow: '<svg viewBox="0 0 64 64"><path d="M18 40h30a12 12 0 0 0 0-24 16 16 0 0 0-30 5 9.5 9.5 0 0 0 0 19z" fill="#aab6c8"/><g fill="#eef2f6"><circle cx="22" cy="52" r="3"/><circle cx="33" cy="56" r="3"/><circle cx="44" cy="52" r="3"/></g></svg>',
  storm: '<svg viewBox="0 0 64 64"><path d="M18 38h30a12 12 0 0 0 0-24 16 16 0 0 0-30 5 9.5 9.5 0 0 0 0 19z" fill="#8b98aa"/><path d="M34 40l-8 12h8l-4 10 12-15h-8l4-7z" fill="#f7c56b"/></svg>',
};

function wmo(code, isDay = 1) {
  if (code === 0) return ['Clear', isDay ? 'sun' : 'moon'];
  if (code === 1) return ['Mostly clear', isDay ? 'sun' : 'moon'];
  if (code === 2) return ['Partly cloudy', 'partly'];
  if (code === 3) return ['Overcast', 'cloud'];
  if (code === 45 || code === 48) return ['Fog', 'fog'];
  if (code >= 51 && code <= 57) return ['Drizzle', 'rain'];
  if (code >= 61 && code <= 67) return ['Rain', 'rain'];
  if (code >= 71 && code <= 77) return ['Snow', 'snow'];
  if (code >= 80 && code <= 82) return ['Showers', 'rain'];
  if (code === 85 || code === 86) return ['Snow showers', 'snow'];
  if (code >= 95) return ['Thunderstorm', 'storm'];
  return ['—', 'cloud'];
}

async function loadWeather() {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${CONFIG.lat}&longitude=${CONFIG.lon}`
    + '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=5'
    + `&timezone=${encodeURIComponent(CONFIG.tz)}`;
  try {
    const w = await fetchJson(url);
    store.set('wx', { at: Date.now(), w });
    renderWeather(w);
  } catch (e) {
    const cached = store.get('wx', null);
    if (cached) renderWeather(cached.w, true);
    else $('#wx-desc').textContent = 'Weather unavailable (offline?)';
  }
}

function renderWeather(w, stale = false) {
  const c = w.current;
  const [desc, icon] = wmo(c.weather_code, c.is_day);
  $('#wx-icon').innerHTML = ICONS[icon];
  $('#wx-temp').textContent = Math.round(c.temperature_2m);
  $('#wx-desc').textContent = desc + (stale ? ' · cached' : '');
  const d = w.daily;
  $('#wx-hilo').textContent = `H ${Math.round(d.temperature_2m_max[0])}°  L ${Math.round(d.temperature_2m_min[0])}°`;
  $('#wx-feels').textContent = `Feels ${Math.round(c.apparent_temperature)}° · ${Math.round(c.wind_speed_10m)} mph`;
  $('#wx-place').textContent = CONFIG.place;
  $('#wx-days').innerHTML = d.time.map((t, i) => {
    const day = i === 0 ? 'Today' : new Date(t + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' });
    const p = d.precipitation_probability_max[i];
    return `<div class="wx-day"><div class="d">${day}</div>${ICONS[wmo(d.weather_code[i])[1]]}`
      + `<div class="t">${Math.round(d.temperature_2m_max[i])}°<span class="lo">${Math.round(d.temperature_2m_min[i])}°</span></div>`
      + `<div class="p">${p >= 20 ? p + '%' : ''}</div></div>`;
  }).join('');
}

/* ---------------------------- apps ----------------------------- */
let allApps = [];
const iconCache = {};
function webBadge(w) {
  const size = w.mark.length > 2 ? 15 : 26;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54"><rect width="54" height="54" rx="12" fill="${w.bg}"/>`
    + `<text x="27" y="${w.mark.length > 2 ? 32 : 36}" text-anchor="middle" font-family="Roboto,Arial,sans-serif" font-weight="700" font-size="${size}" fill="${w.fg}">${w.mark}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function iconFor(pkg) {
  if (!(pkg in iconCache)) {
    const w = CONFIG.webTiles[pkg];
    iconCache[pkg] = w ? webBadge(w) : (N.icon(pkg) || '');
  }
  return iconCache[pkg];
}
function labelFor(pkg) {
  if (CONFIG.webTiles[pkg]) return CONFIG.webTiles[pkg].label;
  if (CONFIG.labels[pkg]) return CONFIG.labels[pkg];
  const a = allApps.find((x) => x.pkg === pkg);
  return a ? a.label : pkg.split('.').pop();
}
function tiles() {
  const t = store.get('tiles', CONFIG.defaultTiles);
  const m = t.map((p) => CONFIG.migrate[p] || p);
  if (m.join() !== t.join()) store.set('tiles', m);
  return m;
}

function tileHtml(pkg) {
  const icon = iconFor(pkg);
  const missing = !CONFIG.webTiles[pkg] && !N.installed(pkg);
  return `<button class="tile${missing ? ' missing' : ''}" data-pkg="${pkg}">`
    + (icon ? `<img src="${icon}" alt="">` : '<div style="width:54px;height:54px;border-radius:12px;background:#263142"></div>')
    + `<span>${labelFor(pkg)}</span></button>`;
}

function renderTiles() {
  $('#apps').innerHTML = tiles().slice(0, 6).map(tileHtml).join('');
}

function renderDrawer() {
  $('#all-apps').innerHTML = allApps.map((a) => tileHtml(a.pkg)).join('');
}

function renderTilePicker() {
  const sel = tiles();
  $('#tile-picker').innerHTML = allApps.map((a) => {
    const i = sel.indexOf(a.pkg);
    const icon = iconFor(a.pkg);
    return `<button class="pick${i >= 0 ? ' sel' : ''}" data-pick="${a.pkg}">`
      + (icon ? `<img src="${icon}" alt="">` : '') + `<span>${labelFor(a.pkg)}</span>`
      + (i >= 0 ? `<b class="n">${i + 1}</b>` : '') + '</button>';
  }).join('');
}

function loadApps() {
  try { allApps = JSON.parse(N.apps()); } catch (e) { allApps = []; }
  // Web shortcuts first, then installed apps.
  const web = Object.keys(CONFIG.webTiles).map((k) => ({ pkg: k, label: CONFIG.webTiles[k].label }));
  allApps = web.concat(allApps.filter((a) => a.pkg !== 'com.kitchenhome'));
}

function openTile(id) {
  const w = CONFIG.webTiles[id];
  if (w) return N.openUrl ? N.openUrl(w.url) : (window.open(w.url), true);
  return N.launch(id);
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-pkg]');
  if (t) {
    if (!openTile(t.dataset.pkg)) toast('That app is not installed');
    closeSheets();
    return;
  }
  const p = e.target.closest('[data-pick]');
  if (p) {
    let sel = tiles().slice();
    const pkg = p.dataset.pick;
    if (sel.includes(pkg)) sel = sel.filter((x) => x !== pkg);
    else if (sel.length < 6) sel.push(pkg);
    else { toast('The home row holds 6 apps. Remove one first.'); return; }
    store.set('tiles', sel);
    renderTilePicker();
    renderTiles();
    return;
  }
  if (e.target.closest('[data-close]')) closeSheets();
});

/* ----------------------------- hue ----------------------------- */
const hue = {
  get ip() { return store.get('hue.ip', ''); },
  get user() { return store.get('hue.user', ''); },
  base() { return `http://${this.ip}/api/${this.user}`; },
  rooms: {},
};

function hueStatus(msg) { $('#hue-status').textContent = msg || ''; }

function updateHueSettingText() {
  $('#hue-setting-text').textContent = hue.user
    ? `Connected to the bridge at ${hue.ip}.`
    : 'Not connected. Tap "Connect", then press the round button on top of your Hue bridge within 30 seconds.';
  $('#hue-ip').value = store.get('hue.ipManual', '');
}

async function discoverBridge() {
  const manual = ($('#hue-ip').value || '').trim();
  if (manual) { store.set('hue.ipManual', manual); return manual; }
  const list = await fetchJson('https://discovery.meethue.com/');
  if (!Array.isArray(list) || !list.length) throw new Error('No Hue bridge found on this network');
  return list[0].internalipaddress;
}

async function pairHue() {
  const btn = $('#hue-pair');
  btn.disabled = true;
  try {
    btn.textContent = 'Finding bridge…';
    const ip = await discoverBridge();
    store.set('hue.ip', ip);
    btn.textContent = 'Press the bridge button…';
    toast('Press the round link button on your Hue bridge now', 5000);
    const deadline = Date.now() + 35000;
    while (Date.now() < deadline) {
      const r = await fetchJson(`http://${ip}/api`, {
        method: 'POST', body: JSON.stringify({ devicetype: 'kitchen_home#echo_show_8' }),
      });
      const ok = r && r[0] && r[0].success;
      if (ok) {
        store.set('hue.user', ok.username);
        toast('Hue bridge connected');
        updateHueSettingText();
        refreshRooms();
        return;
      }
      if (!(r && r[0] && r[0].error && r[0].error.type === 101)) throw new Error((r[0] && r[0].error && r[0].error.description) || 'Unexpected reply');
      await new Promise((res) => setTimeout(res, 2000));
    }
    toast('Timed out waiting for the bridge button. Try again.');
  } catch (e) {
    toast('Hue: ' + e.message, 5000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connect Hue bridge';
  }
}

function forgetHue() {
  store.del('hue.ip'); store.del('hue.user');
  hue.rooms = {};
  updateHueSettingText();
  renderRooms();
}

async function refreshRooms() {
  if (!hue.user) { renderRooms(); return; }
  try {
    const groups = await fetchJson(hue.base() + '/groups', {}, 5000);
    if (Array.isArray(groups) && groups[0] && groups[0].error) throw new Error(groups[0].error.description);
    hue.rooms = {};
    Object.keys(groups).forEach((id) => {
      const g = groups[id];
      if (g.type === 'Room' || g.type === 'Zone') hue.rooms[id] = g;
    });
    hueStatus('');
    renderRooms();
  } catch (e) {
    hueStatus('Hue bridge not reachable');
  }
}

const BULB = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>';

function renderRooms() {
  const el = $('#rooms');
  if (!hue.user) {
    el.innerHTML = `<button class="room cta" id="hue-cta"><div class="bulb">${BULB}</div><div><div class="name">Connect Philips Hue</div><div class="state">Tap to set up</div></div></button>`;
    return;
  }
  const ids = Object.keys(hue.rooms).sort((a, b) => (hue.rooms[a].type === 'Zone') - (hue.rooms[b].type === 'Zone') || hue.rooms[a].name.localeCompare(hue.rooms[b].name));
  if (!ids.length) { el.innerHTML = '<div class="muted">No Hue rooms found yet.</div>'; return; }
  el.innerHTML = ids.map((id) => {
    const g = hue.rooms[id];
    const on = g.state && g.state.any_on;
    const pct = g.action && g.action.bri ? Math.round(g.action.bri / 254 * 100) : 0;
    return `<button class="room${on ? ' on' : ''}" data-room="${id}"><div class="bulb">${BULB}</div>`
      + `<div><div class="name">${g.name}</div><div class="state">${on ? pct + '%' : 'Off'}</div></div></button>`;
  }).join('');
}

async function setRoom(id, body) {
  const g = hue.rooms[id];
  if (g) {
    // Optimistic update so taps feel instant.
    if ('on' in body) { g.state.any_on = body.on; g.state.all_on = body.on; }
    if ('bri' in body) { g.action.bri = body.bri; g.state.any_on = true; }
    renderRooms();
  }
  try {
    await fetchJson(`${hue.base()}/groups/${id}/action`, { method: 'PUT', body: JSON.stringify(body) }, 5000);
  } catch (e) {
    toast('Could not reach the Hue bridge');
  }
  setTimeout(refreshRooms, 600);
}

// Tap toggles a room; long-press opens the dimmer.
let pressTimer = null, longPressed = false;
$('#rooms').addEventListener('pointerdown', (e) => {
  const r = e.target.closest('[data-room]');
  if (!r) return;
  longPressed = false;
  pressTimer = setTimeout(() => { longPressed = true; openDimmer(r.dataset.room); }, 500);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => $('#rooms').addEventListener(ev, () => clearTimeout(pressTimer)));
$('#rooms').addEventListener('click', (e) => {
  if (e.target.closest('#hue-cta')) { openSheet('#settings'); return; }
  const r = e.target.closest('[data-room]');
  if (!r || longPressed) return;
  const g = hue.rooms[r.dataset.room];
  setRoom(r.dataset.room, { on: !(g.state && g.state.any_on) });
});

let dimmerRoom = null;
function openDimmer(id) {
  dimmerRoom = id;
  const g = hue.rooms[id];
  $('#dimmer-title').textContent = g.name;
  $('#dimmer-range').value = (g.action && g.action.bri) || 200;
  $('#dimmer').classList.remove('hidden');
}
$('#dimmer-range').addEventListener('change', (e) => setRoom(dimmerRoom, { on: true, bri: +e.target.value }));
$('#dimmer-off').addEventListener('click', () => { setRoom(dimmerRoom, { on: false }); closeSheets(); });

/* --------------------------- display --------------------------- */
let dimmed = null;
function applyNightDim(now) {
  const enabled = store.get('nightDim', true);
  const h = now.getHours();
  const want = enabled && (h >= 22 || h < 6);
  if (want !== dimmed) {
    dimmed = want;
    N.setBrightness(want ? 12 : -1);
    document.body.style.filter = want ? 'brightness(0.55)' : '';
  }
}

/* ---------------------------- sheets --------------------------- */
function openSheet(sel) {
  closeSheets();
  if (sel === '#drawer') renderDrawer();
  if (sel === '#settings') { updateHueSettingText(); renderTilePicker(); $('#night-dim').checked = store.get('nightDim', true); }
  $(sel).classList.remove('hidden');
}
function closeSheets() { ['#drawer', '#settings', '#dimmer', '#timer-sheet'].forEach((s) => $(s).classList.add('hidden')); }

$('#btn-all').addEventListener('click', () => openSheet('#drawer'));
$('#btn-settings').addEventListener('click', () => openSheet('#settings'));
$('#hue-pair').addEventListener('click', pairHue);
$('#hue-forget').addEventListener('click', forgetHue);
$('#night-dim').addEventListener('change', (e) => { store.set('nightDim', e.target.checked); dimmed = null; tickClock(); });
$('#open-wifi').addEventListener('click', () => N.openWifiSettings());
$('#open-android').addEventListener('click', () => N.openSettings());

window.onBackPressed = closeSheets;
window.onHomePressed = closeSheets;
window.onHomeResume = () => { loadApps(); renderTiles(); refreshRooms(); };

/* ----------------------------- boot ---------------------------- */
loadApps();
renderTiles();
tickClock();
setInterval(tickClock, 10 * 1000);
const cachedWx = store.get('wx', null);
if (cachedWx) renderWeather(cachedWx.w, Date.now() - cachedWx.at > CONFIG.weatherEveryMs * 2);
loadWeather();
setInterval(loadWeather, CONFIG.weatherEveryMs);
renderRooms();
refreshRooms();
setInterval(() => { if (!document.hidden) refreshRooms(); }, CONFIG.hueEveryMs);
