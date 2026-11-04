'use strict';

/* ------------------------------------------------------------------
 * Kitchen Home extras: photo background, kitchen timers, now playing,
 * idle screensaver. Loaded after app.js and uses its helpers
 * ($, N, store, toast, fetchJson, closeSheets).
 * ------------------------------------------------------------------ */

/* ------------------------- photo sources ------------------------ */
const Photos = {
  list: [],
  i: -1,
  async load() {
    let local = [];
    try { local = JSON.parse(N.localPhotos ? N.localPhotos() : '[]'); } catch (e) { local = []; }
    let bing = [];
    if (store.get('bg.bing', true)) {
      const cached = store.get('bing', null);
      if (cached && Date.now() - cached.at < 6 * 3600e3) {
        bing = cached.list;
      } else {
        try {
          // Bing's archive serves up to 8 images per call; idx=7 reaches back about two weeks.
          const pages = await Promise.all([0, 7].map((idx) =>
            fetchJson(`https://www.bing.com/HPImageArchive.aspx?format=js&idx=${idx}&n=8&mkt=en-US`).catch(() => ({ images: [] }))));
          const seen = new Set();
          pages.forEach((p) => (p.images || []).forEach((im) => {
            if (seen.has(im.urlbase)) return;
            seen.add(im.urlbase);
            bing.push({ url: 'https://www.bing.com' + im.urlbase + '_1366x768.jpg', credit: im.copyright || '' });
          }));
          if (bing.length) store.set('bing', { at: Date.now(), list: bing });
        } catch (e) {
          if (cached) bing = cached.list;
        }
      }
    }
    const items = local.map((u) => ({ url: u, credit: '' })).concat(bing);
    for (let k = items.length - 1; k > 0; k--) {
      const r = Math.floor(Math.random() * (k + 1));
      [items[k], items[r]] = [items[r], items[k]];
    }
    this.list = items;
    this.i = -1;
  },
  next() {
    if (!this.list.length) return null;
    this.i = (this.i + 1) % this.list.length;
    return this.list[this.i];
  },
};

/** Cross-fading slideshow on the two .bg-layer children of `container`. */
function makeSlideshow(container, intervalMs, onShow) {
  const layers = container.querySelectorAll('.bg-layer');
  let cur = 0;
  let timer = null;
  function step() {
    const it = Photos.next();
    if (!it) return;
    const img = new Image();
    img.onload = () => {
      const nxt = layers[1 - cur];
      nxt.style.backgroundImage = `url("${it.url}")`;
      nxt.classList.remove('kb');
      void nxt.offsetWidth; // restart the slow zoom
      nxt.classList.add('kb', 'show');
      layers[cur].classList.remove('show');
      cur = 1 - cur;
      if (onShow) onShow(it);
    };
    img.onerror = () => setTimeout(step, 1000);
    img.src = it.url;
  }
  return {
    start() { if (!timer) { step(); timer = setInterval(step, intervalMs); } },
    stop() { clearInterval(timer); timer = null; },
    now: step,
  };
}

const homeShow = makeSlideshow($('#bg'), 60 * 1000);
const saverShow = makeSlideshow($('#saver'), 30 * 1000, (it) => { $('#saver-credit').textContent = it.credit; });

Photos.load().then(() => homeShow.start());
setInterval(() => Photos.load(), 6 * 3600e3);

/* ---------------------------- timers ---------------------------- */
const fmtLeft = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};
const fmtMins = (m) => (m >= 60 && m % 60 === 0 ? (m / 60) + ' hr' : m + ' min');

const Timers = {
  list: store.get('timers', []), // [{ id, end, label }]
  ringing: null,
  save() { store.set('timers', this.list); },
  add(mins, label) {
    const id = Math.floor(Math.random() * 1e9);
    const end = Date.now() + mins * 60000;
    label = label || fmtMins(mins) + ' timer';
    this.list.push({ id, end, label });
    this.list.sort((a, b) => a.end - b.end);
    this.save();
    if (N.scheduleTimer) N.scheduleTimer(id, end, label);
    renderTimers();
    toast(`${label} started`);
  },
  remove(id) {
    this.list = this.list.filter((t) => t.id !== id);
    this.save();
    if (N.cancelTimer) N.cancelTimer(id);
    renderTimers();
  },
};

function chipsHtml() {
  const now = Date.now();
  return Timers.list.map((t) => {
    const left = t.end - now;
    return `<div class="chip${left <= 0 ? ' done' : ''}" data-timer="${t.id}">`
      + `<span>${left <= 0 ? 'Done' : fmtLeft(left)}</span><span class="muted small">${t.label.replace(' timer', '')}</span>`
      + `<span class="x" data-cancel="${t.id}">✕</span></div>`;
  }).join('');
}

function renderTimers() {
  const html = chipsHtml();
  $('#timer-chips').innerHTML = html;
  $('#saver-timers').innerHTML = html;
  if (!$('#timer-sheet').classList.contains('hidden')) {
    const now = Date.now();
    $('#timer-list').innerHTML = Timers.list.map((t) =>
      `<div class="tl"><span>${t.label}</span><span>${fmtLeft(t.end - now)}</span><button class="pill" data-cancel="${t.id}">Cancel</button></div>`).join('');
  }
}

setInterval(() => {
  renderTimers();
  const due = Timers.list.find((t) => t.end <= Date.now());
  if (due && !Timers.ringing) ring(due.id, due.label);
}, 1000);

let customMins = store.get('timer.custom', 12);
$('#custom-mins').textContent = customMins;

$('#btn-timer').addEventListener('click', () => {
  closeSheets();
  $('#timer-sheet').classList.remove('hidden');
  renderTimers();
});
$('#timer-sheet').addEventListener('click', (e) => {
  const p = e.target.closest('[data-mins]');
  if (p) { Timers.add(+p.dataset.mins); closeSheets(); return; }
  const adj = e.target.closest('[data-adj]');
  if (adj) {
    customMins = Math.max(1, Math.min(600, customMins + +adj.dataset.adj));
    $('#custom-mins').textContent = customMins;
    store.set('timer.custom', customMins);
  }
});
$('#custom-start').addEventListener('click', () => { Timers.add(customMins); closeSheets(); });
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-cancel]');
  if (c) { e.stopPropagation(); Timers.remove(+c.dataset.cancel); }
}, true);

/* Alarm sound: repeating triple beep via WebAudio until stopped. */
let audioCtx = null;
let beepTimer = null;
function startAlarm() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const burst = () => {
      const t0 = audioCtx.currentTime;
      [0, 0.25, 0.5].forEach((dt) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(0.8, t0 + dt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0 + dt);
        o.stop(t0 + dt + 0.2);
      });
    };
    burst();
    beepTimer = setInterval(burst, 1400);
  } catch (e) { /* no audio, the flashing screen still shows */ }
}
function stopAlarm() { clearInterval(beepTimer); beepTimer = null; }

function ring(id, label) {
  if (Timers.ringing === id) return;
  Timers.ringing = id;
  hideSaver();
  closeSheets();
  $('#ring-label').textContent = label || 'Timer';
  $('#ring').classList.remove('hidden');
  stopAlarm();
  startAlarm();
}
function stopRing(snooze) {
  const id = Timers.ringing;
  const t = Timers.list.find((x) => x.id === id);
  Timers.ringing = null;
  stopAlarm();
  $('#ring').classList.add('hidden');
  if (id !== null) Timers.remove(id);
  if (snooze) Timers.add(1, t ? t.label : 'Snooze');
  touch();
}
$('#ring-stop').addEventListener('click', () => stopRing(false));
$('#ring-snooze').addEventListener('click', () => stopRing(true));

// Native (AlarmManager) brings us to the front when a timer ends while another app is open.
window.onTimerDone = (id, label) => {
  const t = Timers.list.find((x) => x.id === id);
  ring(id, (t && t.label) || label);
};

/* ------------------------- now playing -------------------------- */
let npKey = '';
const PLAY = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
function refreshNowPlaying() {
  if (!N.nowPlaying || document.hidden) return;
  let s = null;
  try { s = JSON.parse(N.nowPlaying(false)); } catch (e) { s = null; }
  const card = $('#np');
  if (!s || !s.title) { card.classList.add('hidden'); npKey = ''; return; }
  const key = s.pkg + '|' + s.title + '|' + s.artist;
  if (key !== npKey) {
    npKey = key;
    try {
      const full = JSON.parse(N.nowPlaying(true));
      $('#np-art').src = (full && full.art) || '';
    } catch (e) { $('#np-art').removeAttribute('src'); }
  }
  $('#np-title').textContent = s.title;
  $('#np-artist').textContent = [s.artist, s.app].filter(Boolean).join(' · ');
  $('#np-toggle').innerHTML = s.playing ? PAUSE : PLAY;
  $('#np-toggle').dataset.playing = s.playing ? '1' : '';
  card.classList.remove('hidden');
}
$('#np').addEventListener('click', (e) => {
  const b = e.target.closest('[data-media]');
  if (!b) return;
  let a = b.dataset.media;
  if (a === 'toggle') a = b.dataset.playing ? 'pause' : 'play';
  N.media(a);
  setTimeout(refreshNowPlaying, 600);
});
setInterval(refreshNowPlaying, 3000);
refreshNowPlaying();

/* -------------------------- screensaver ------------------------- */
let lastTouch = Date.now();
function touch() { lastTouch = Date.now(); }
['pointerdown', 'keydown', 'wheel'].forEach((ev) => document.addEventListener(ev, touch, true));

const saverOn = () => store.get('saver.on', true);
const saverMins = () => store.get('saver.mins', 5);

function showSaver() {
  if (!$('#saver').classList.contains('hidden')) return;
  $('#saver').classList.remove('hidden');
  homeShow.stop();
  saverShow.start();
  updateSaver();
}
function hideSaver() {
  if ($('#saver').classList.contains('hidden')) return;
  $('#saver').classList.add('hidden');
  saverShow.stop();
  homeShow.start();
  touch();
}
function updateSaver() {
  if ($('#saver').classList.contains('hidden')) return;
  const now = new Date();
  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  $('#saver-clock').innerHTML = `${h}:${m}<span class="ampm">${ampm}</span>`;
  const temp = $('#wx-temp').textContent;
  const desc = $('#wx-desc').textContent.replace(' · cached', '');
  $('#saver-sub').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    + (temp && temp !== '--' ? `  ·  ${temp}° ${desc}` : '');
}
$('#saver').addEventListener('pointerdown', (e) => { e.stopPropagation(); hideSaver(); });

setInterval(() => {
  updateSaver();
  const sheetOpen = ['#drawer', '#settings', '#timer-sheet', '#dimmer'].some((s) => !$(s).classList.contains('hidden'));
  if (saverOn() && !document.hidden && !Timers.ringing && !sheetOpen && Date.now() - lastTouch > saverMins() * 60000) showSaver();
}, 5000);

/* ---------------------- room temperature sensors ----------------- */
// Each Pi runs pi/kitchen-sensor/sensor_server.py and serves /reading as JSON.
const sensorAddrs = () => store.get('sensors', ['192.168.4.34']);
const sensorUrl = (a) => (a.startsWith('http') ? a : `http://${a}${a.includes(':') ? '' : ':8765'}/reading`);

async function refreshIndoor() {
  const addrs = sensorAddrs();
  const el = $('#indoor');
  if (!addrs.length) { el.classList.add('hidden'); return; }
  const results = await Promise.all(addrs.map((a) => fetchJson(sensorUrl(a), {}, 5000).then((r) => r, () => null)));
  const cache = store.get('sensorCache', {});
  const now = Date.now() / 1000;
  const html = addrs.map((a, i) => {
    let r = results[i];
    if (r && r.ok) cache[a] = r; else r = cache[a];
    if (!r || r.temp_f === undefined) return '';
    const stale = now - (r.updated || 0) > 15 * 60;
    return `<div class="it${stale ? ' stale' : ''}"><span>${r.room}</span><b>${Math.round(r.temp_f)}°</b>`
      + (r.humidity !== undefined ? `<span class="h">${Math.round(r.humidity)}%</span>` : '') + '</div>';
  }).join('');
  store.set('sensorCache', cache);
  el.innerHTML = html;
  el.classList.toggle('hidden', !html);
}
setInterval(refreshIndoor, 60 * 1000);
refreshIndoor();

/* ------------------------ settings wiring ----------------------- */
$('#btn-settings').addEventListener('click', () => {
  $('#saver-on').checked = saverOn();
  $('#saver-mins').value = String(saverMins());
  $('#bg-bing').checked = store.get('bg.bing', true);
  $('#sensor-list').value = sensorAddrs().join('\n');
});
$('#sensor-list').addEventListener('change', (e) => {
  store.set('sensors', e.target.value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean));
  refreshIndoor();
});
$('#saver-on').addEventListener('change', (e) => store.set('saver.on', e.target.checked));
$('#saver-mins').addEventListener('change', (e) => store.set('saver.mins', +e.target.value));
$('#bg-bing').addEventListener('change', (e) => {
  store.set('bg.bing', e.target.checked);
  Photos.load().then(() => homeShow.now());
});

/* Coming back to the home screen: reset idle, pick up new local photos, refresh. */
const prevResume = window.onHomeResume;
window.onHomeResume = () => {
  if (prevResume) prevResume();
  touch();
  hideSaver();
  refreshNowPlaying();
};
renderTimers();
