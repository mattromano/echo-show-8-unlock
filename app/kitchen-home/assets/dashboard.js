'use strict';

/* ------------------------------------------------------------------
 * Temperature history dashboard. Data comes from the logger on the
 * Office Pi (pi/temp-logger), which records every room plus Outside
 * every 5 minutes. Opened by tapping the room temperatures.
 * Uses helpers from app.js ($, store, fetchJson, closeSheets).
 * ------------------------------------------------------------------ */

const loggerUrl = () => store.get('logger.url', 'http://192.168.4.34:8766').replace(/\/+$/, '');
const ROOM_COLORS = { Office: '#f2b45a', 'Living room': '#7fd1a8', Bedroom: '#b69cff', Outside: '#7fb6ff' };
const roomColor = (r, i) => ROOM_COLORS[r] || ['#ff8a80', '#ffd54f', '#4dd0e1'][i % 3];
let dashHours = store.get('dash.hours', 24);

function fmtTick(ts, hours) {
  const d = new Date(ts * 1000);
  if (hours <= 24) {
    let h = d.getHours();
    const ap = h >= 12 ? 'p' : 'a';
    h = h % 12 || 12;
    return h + ap;
  }
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

/** Draws a multi-series line chart into an <svg>. series: {name: [[ts, value], ...]} */
function drawChart(svg, series, hours, unit) {
  const W = svg.clientWidth || 900, H = svg.clientHeight || 260;
  const padL = 36, padR = 10, padT = 8, padB = 20;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const names = Object.keys(series).filter((n) => series[n].length);
  if (!names.length) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">No data yet</text>`; return; }
  const now = Date.now() / 1000;
  const t0 = now - hours * 3600, t1 = now;
  let lo = Infinity, hi = -Infinity;
  names.forEach((n) => series[n].forEach((p) => { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }));
  const span = Math.max(2, hi - lo);
  lo = Math.floor(lo - span * 0.1); hi = Math.ceil(hi + span * 0.1);
  const x = (t) => padL + (t - t0) / (t1 - t0) * (W - padL - padR);
  const y = (v) => padT + (hi - v) / (hi - lo) * (H - padT - padB);

  let g = '';
  const ystep = Math.max(1, Math.round((hi - lo) / 4));
  for (let v = Math.ceil(lo); v <= hi; v += ystep) {
    g += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.07)"/>`
      + `<text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}${unit}</text>`;
  }
  const ticks = hours <= 24 ? 6 : hours <= 168 ? 7 : 6;
  for (let i = 0; i <= ticks; i++) {
    const t = t0 + (t1 - t0) * i / ticks;
    g += `<text x="${x(t)}" y="${H - 4}" text-anchor="${i === 0 ? 'start' : i === ticks ? 'end' : 'middle'}">${fmtTick(t, hours)}</text>`;
  }
  // A gap longer than 3 buckets breaks the line (e.g. a Pi was offline).
  names.forEach((n, i) => {
    const pts = series[n];
    let d = '';
    let prev = null;
    pts.forEach((p) => {
      const gap = prev && p[0] - prev[0] > Math.max(900, (t1 - t0) / 100);
      d += `${!prev || gap ? 'M' : 'L'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`;
      prev = p;
    });
    g += `<path d="${d}" fill="none" stroke="${roomColor(n, i)}" stroke-width="${n === 'Outside' ? 1.6 : 2.2}"`
      + `${n === 'Outside' ? ' stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  svg.innerHTML = g;
}

async function loadDashboard() {
  $('#dash-msg').textContent = 'Loading…';
  let data;
  try {
    data = await fetchJson(`${loggerUrl()}/history?hours=${dashHours}`, {}, 8000);
    $('#dash-msg').textContent = '';
  } catch (e) {
    $('#dash-msg').textContent = `Couldn't reach the logger at ${loggerUrl()} (${e.message}).`;
    return;
  }
  const rooms = Object.keys(data.series).sort((a, b) => (a === 'Outside') - (b === 'Outside') || a.localeCompare(b));
  const temps = {}, hums = {};
  rooms.forEach((r) => {
    temps[r] = data.series[r].map((p) => [p[0], p[1]]);
    const h = data.series[r].filter((p) => p[2] !== null).map((p) => [p[0], p[2]]);
    if (h.length) hums[r] = h;
  });
  $('#dash-stats').innerHTML = rooms.map((r, i) => {
    const vals = temps[r].map((p) => p[1]);
    const last = vals[vals.length - 1];
    const hl = hums[r] ? hums[r][hums[r].length - 1][1] : null;
    return `<div class="ds"><div class="n"><span class="dot" style="background:${roomColor(r, i)}"></span>${r}</div>`
      + `<div class="v">${last.toFixed(1)}°${hl !== null ? ` <span class="mm">${Math.round(hl)}%</span>` : ''}</div>`
      + `<div class="mm">low ${Math.min(...vals).toFixed(1)}° · high ${Math.max(...vals).toFixed(1)}°</div></div>`;
  }).join('');
  // Draw after layout so the SVGs have their real size.
  requestAnimationFrame(() => {
    drawChart($('#dash-temp'), temps, dashHours, '°');
    drawChart($('#dash-hum'), hums, dashHours, '%');
  });
}

function openDashboard() {
  closeSheets();
  $('#dash').classList.remove('hidden');
  document.querySelectorAll('#dash-range button').forEach((b) => b.classList.toggle('on', +b.dataset.hours === dashHours));
  loadDashboard();
}

$('#indoor').addEventListener('click', openDashboard);
$('#dash-range').addEventListener('click', (e) => {
  const b = e.target.closest('[data-hours]');
  if (!b) return;
  dashHours = +b.dataset.hours;
  store.set('dash.hours', dashHours);
  document.querySelectorAll('#dash-range button').forEach((x) => x.classList.toggle('on', x === b));
  loadDashboard();
});
$('#dash').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) $('#dash').classList.add('hidden'); });

// Keep it fresh while open; let Back/Home close it like the other sheets.
setInterval(() => { if (!$('#dash').classList.contains('hidden')) loadDashboard(); }, 5 * 60 * 1000);
const prevClose = window.onBackPressed;
window.onBackPressed = () => { $('#dash').classList.add('hidden'); if (prevClose) prevClose(); };
const prevHome = window.onHomePressed;
window.onHomePressed = () => { $('#dash').classList.add('hidden'); if (prevHome) prevHome(); };
