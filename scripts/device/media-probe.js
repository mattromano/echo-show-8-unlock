// Injected at document start (via CDP) to log what a streaming player asks the browser for.
// Results accumulate in window.__probe; read them back with cdp-eval.
(function () {
  if (window.__probe) return;
  const log = (window.__probe = []);
  const push = (k, v) => { try { log.push({ t: Math.round(performance.now()), k, v: JSON.parse(JSON.stringify(v)) }); } catch (e) { log.push({ k, v: String(v) }); } };

  const rmksa = navigator.requestMediaKeySystemAccess && navigator.requestMediaKeySystemAccess.bind(navigator);
  if (rmksa) {
    navigator.requestMediaKeySystemAccess = function (ks, cfg) {
      return rmksa(ks, cfg).then(
        (acc) => { push('rmksa OK', { ks, cfg, got: acc.getConfiguration() }); return acc; },
        (err) => { push('rmksa FAIL', { ks, cfg, err: err.name + ': ' + err.message }); throw err; });
    };
  }
  if (window.MediaSource && MediaSource.isTypeSupported) {
    const its = MediaSource.isTypeSupported.bind(MediaSource);
    MediaSource.isTypeSupported = function (t) { const r = its(t); push('MSE.isTypeSupported', { t, r }); return r; };
  }
  const cpt = HTMLMediaElement.prototype.canPlayType;
  HTMLMediaElement.prototype.canPlayType = function (t) { const r = cpt.call(this, t); push('canPlayType', { t, r }); return r; };
  if (navigator.mediaCapabilities && navigator.mediaCapabilities.decodingInfo) {
    const di = navigator.mediaCapabilities.decodingInfo.bind(navigator.mediaCapabilities);
    navigator.mediaCapabilities.decodingInfo = function (c) {
      return di(c).then((r) => { push('decodingInfo', { c, r: { supported: r.supported, smooth: r.smooth, powerEfficient: r.powerEfficient } }); return r; },
        (e) => { push('decodingInfo ERR', { c, e: String(e) }); throw e; });
    };
  }
  const mk = window.MediaKeys && MediaKeys.prototype;
  if (mk && mk.createSession) {
    const cs = mk.createSession;
    mk.createSession = function (type) { push('createSession', { type }); return cs.apply(this, arguments); };
  }
  if (mk && mk.getStatusForPolicy) {
    const gs = mk.getStatusForPolicy;
    mk.getStatusForPolicy = function (p) { return gs.apply(this, arguments).then((r) => { push('getStatusForPolicy', { p, r }); return r; }, (e) => { push('getStatusForPolicy ERR', { p, e: String(e) }); throw e; }); };
  }
  window.addEventListener('error', (e) => push('window.error', String(e.message)));
  window.addEventListener('unhandledrejection', (e) => push('unhandledrejection', String(e.reason && (e.reason.message || e.reason))));
  const ce = console.error;
  console.error = function () { push('console.error', Array.from(arguments).map(String).join(' ').slice(0, 500)); return ce.apply(console, arguments); };
  const cw = console.warn;
  console.warn = function () { push('console.warn', Array.from(arguments).map(String).join(' ').slice(0, 300)); return cw.apply(console, arguments); };
})();
