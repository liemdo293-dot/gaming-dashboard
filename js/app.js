import { loadSettings, saveSettings, clearAll, encodeSetup, decodeSetup } from './settings.js';
import { Spotify, redirectUri, errorText } from './spotify.js';
import { fetchWeather, weatherInfo, searchPlaces, placeName, currentPosition } from './weather.js';
import { loadCalendar, startOfWeek } from './calendar.js';
import { qrSvg } from './qr.js';

const VERSION = '1.0.0';
const S = loadSettings();
const sp = new Spotify(() => S.clientId);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const root = document.documentElement;
const board = $('#board');
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function save() { saveSettings(S); }

function bind(key, value) {
  const v = value == null ? '' : String(value);
  $$(`[data-bind="${key}"]`).forEach((el) => { if (el.textContent !== v) el.textContent = v; });
}

let toastTimer;
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Kopiert'); } catch { toast('Kopieren nicht möglich, bitte markieren und kopieren.'); }
}

// ---------------------------------------------------------------- Skalierung
function fit() {
  const s = Math.min(window.innerWidth / 1280, window.innerHeight / 800);
  board.style.setProperty('--scale', s);
}
window.addEventListener('resize', fit);
fit();

// ---------------------------------------------------------------- Aussehen
function setAccent(hex) {
  root.style.setProperty('--accent', hex);
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  let dark = true;
  if (m) {
    const n = parseInt(m[1], 16);
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    dark = L > 0.18;
  }
  root.style.setProperty('--on-accent', dark ? '#0B0D12' : '#FFFFFF');
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#0B0D12');
}

function applySettings() {
  const b = document.body.classList;
  b.toggle('layout-a', S.layout !== 'b');
  b.toggle('layout-b', S.layout === 'b');
  b.toggle('cover-vinyl', S.coverStyle === 'vinyl');
  b.toggle('ambient', !!S.ambient);
  b.toggle('hide-seconds', !S.showSeconds);
  b.toggle('loc-manual', S.locMode === 'manual');
  setAccent(S.accent);
  updateWakeLock();
  syncSettingsUI();
}

function switchLayout() {
  S.layout = S.layout === 'b' ? 'a' : 'b';
  save();
  applySettings();
}

// ---------------------------------------------------------------- Bildschirm an lassen
let wakeLock = null;
async function updateWakeLock() {
  if (!('wakeLock' in navigator)) return;
  if (S.keepAwake && document.visibilityState === 'visible') {
    if (!wakeLock) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } catch { /* z. B. Energiesparmodus */ }
    }
  } else if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// ---------------------------------------------------------------- Uhr & Datum
const fmtDate = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonth = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const fmtWd = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const shortDay = (d) => fmtWd.format(d).replace('.', '');

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

let lastDay = '';
function tickClock() {
  const d = new Date();
  bind('hm', pad(d.getHours()) + ':' + pad(d.getMinutes()));
  bind('ss', pad(d.getSeconds()));
  const key = d.toDateString();
  if (key !== lastDay) {
    lastDay = key;
    bind('date', fmtDate.format(d));
    bind('month', fmtMonth.format(d));
    bind('week', isoWeek(d));
    renderWeek();
    renderForecast();
  }
  if (d.getSeconds() === 0) renderEvents();
}
function clockLoop() {
  tickClock();
  setTimeout(clockLoop, 1000 - (Date.now() % 1000) + 10);
}

// ---------------------------------------------------------------- Wetter
let weather = null;
let weatherErr = '';

async function refreshWeather() {
  try {
    let { lat, lon } = S;
    if (S.locMode === 'auto') {
      try {
        const p = await currentPosition();
        const moved = lat == null || Math.abs(p.lat - lat) > 0.02 || Math.abs(p.lon - lon) > 0.02;
        lat = p.lat; lon = p.lon;
        if (moved || !S.place) {
          S.lat = lat; S.lon = lon;
          S.place = (await placeName(lat, lon)) || 'Mein Standort';
          save();
          syncSettingsUI();
        }
      } catch {
        if (lat == null) {
          weatherErr = 'Kein Standort. Zahnrad → Wetter.';
          renderWeather();
          return;
        }
      }
    }
    if (lat == null) {
      weatherErr = 'Ort fehlt. Zahnrad → Wetter.';
      renderWeather();
      return;
    }
    weather = await fetchWeather(lat, lon);
    weatherErr = '';
  } catch {
    if (!weather) weatherErr = 'Wetter gerade nicht erreichbar.';
  }
  renderWeather();
}

function renderWeather() {
  bind('place', S.place || '');
  bind('placeFull', S.place ? S.place + (S.locMode === 'auto' ? ' (per GPS)' : '') : 'Noch kein Ort');
  if (!weather) {
    bind('temp', '–°');
    bind('cond', weatherErr || 'Wetter wird geladen …');
    bind('condShort', weatherErr ? 'Kein Wetter' : '…');
  } else {
    const info = weatherInfo(weather.code, weather.isDay);
    bind('temp', Math.round(weather.temp) + '°');
    bind('cond', `${info.label} · ${Math.round(weather.today.max)}° / ${Math.round(weather.today.min)}°`);
    bind('condShort', info.label);
    $$('[data-weather-icon] use').forEach((u) => u.setAttribute('href', '#' + info.icon));
  }
  renderForecast();
}

function renderForecast() {
  const box = $('[data-list="forecast"]');
  if (!box) return;
  let html = '';
  for (let i = 0; i < 4; i++) {
    const day = weather && weather.days[i];
    const d = day ? day.date : new Date(Date.now() + (i + 1) * 86400000);
    if (day) {
      const info = weatherInfo(day.code, true);
      html += `<div class="fc" title="${esc(info.label)}"><span class="fc-day">${shortDay(d)}</span><svg class="fc-icon"><use href="#${info.icon}"/></svg><span class="fc-temp">${Math.round(day.max)}° <small>${Math.round(day.min)}°</small></span></div>`;
    } else {
      html += `<div class="fc"><span class="fc-day">${shortDay(d)}</span><svg class="fc-icon"><use href="#w-cloud"/></svg><span class="fc-temp">–°</span></div>`;
    }
  }
  box.innerHTML = html;
}

// ---------------------------------------------------------------- Kalender
let events = [];
let calErr = '';

async function refreshCalendar() {
  if (!S.calendarUrl) { events = []; calErr = ''; renderEvents(); renderWeek(); return { ok: false, empty: true }; }
  try {
    events = await loadCalendar(S.calendarUrl, S.calendarProxy);
    calErr = '';
    return { ok: true, count: events.length };
  } catch (e) {
    calErr = e.message || 'Fehler';
    return { ok: false, error: calErr };
  } finally {
    renderEvents();
    renderWeek();
  }
}

function sameDay(a, b) { return a.toDateString() === b.toDateString(); }

function eventTime(e) {
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const started = e.start <= now;
  if (e.allDay) {
    if (started || sameDay(e.start, now)) return 'Heute';
    if (sameDay(e.start, tomorrow)) return 'Morgen';
    return shortDay(e.start);
  }
  if (started) return 'Jetzt';
  const t = pad(e.start.getHours()) + ':' + pad(e.start.getMinutes());
  if (sameDay(e.start, now)) return t;
  return shortDay(e.start) + ' ' + t;
}

function upcoming() {
  const now = Date.now();
  return events.filter((e) => e.end.getTime() > now);
}

function renderEvents() {
  const box = $('[data-list="events"]');
  const next = upcoming();
  if (box) {
    if (!S.calendarUrl) box.innerHTML = '<div class="ev-empty">Noch kein Kalender verbunden. Zahnrad unten rechts, dann „Kalender“.</div>';
    else if (calErr && !events.length) box.innerHTML = `<div class="ev-empty">Kalender konnte nicht geladen werden (${esc(calErr)}).</div>`;
    else if (!next.length) box.innerHTML = '<div class="ev-empty">Keine Termine in den nächsten zwei Wochen.</div>';
    else box.innerHTML = next.slice(0, 3).map((e) => `<div class="ev"><span class="ev-time">${esc(eventTime(e))}</span><span class="ev-title">${esc(e.title)}</span></div>`).join('');
  }
  if (next.length) { bind('nextTime', eventTime(next[0])); bind('nextTitle', next[0].title); }
  else { bind('nextTime', ''); bind('nextTitle', S.calendarUrl ? 'Keine Termine' : 'Kein Kalender verbunden'); }
}

function renderWeek() {
  const box = $('[data-list="week"]');
  if (!box) return;
  const now = new Date();
  const mon = startOfWeek(now);
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    const end = new Date(d); end.setDate(d.getDate() + 1);
    const has = events.some((e) => e.start < end && e.end > d);
    html += `<div class="wd${sameDay(d, now) ? ' is-today' : ''}"><span class="wd-short">${shortDay(d)}</span><span class="wd-num">${d.getDate()}</span>${has ? '<span class="wd-dot"></span>' : ''}</div>`;
  }
  box.innerHTML = html;
}

// ---------------------------------------------------------------- Akku (Tablet)
let battery = null;
if (navigator.getBattery) {
  navigator.getBattery().then((b) => {
    battery = b;
    b.addEventListener('levelchange', renderStatus);
    b.addEventListener('chargingchange', renderStatus);
    renderStatus();
  }).catch(() => {});
}

function renderStatus() {
  let title;
  if (!sp.linked) title = 'Spotify nicht verbunden';
  else if (player && player.device) title = 'Spotify · ' + player.device.name;
  else title = 'Spotify verbunden · kein Gerät aktiv';
  bind('statusTitle', title);
  bind('statusSub', battery ? `Tablet ${Math.round(battery.level * 100)} %${battery.charging ? ' · lädt' : ''}` : 'Tablet');
}

// ---------------------------------------------------------------- Spotify-Player
let player = null;
let fetchedAt = 0;
let pollTimer = null;
let lastEndPoll = 0;
const dragging = { progress: false, volume: false };

function deviceIcon(type) {
  const t = (type || '').toLowerCase();
  if (t === 'computer') return 'i-monitor';
  if (t === 'smartphone') return 'i-phone';
  if (t === 'tablet') return 'i-tablet';
  return 'i-speaker';
}

const fmtMs = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + pad(s % 60); };

function currentPos() {
  if (!player || !player.item) return 0;
  let p = player.progress_ms || 0;
  if (player.is_playing) p += Date.now() - fetchedAt;
  return Math.min(p, player.item.duration_ms || 0);
}

function fillRange(r) {
  const min = +r.min || 0; const max = +r.max || 100;
  r.style.setProperty('--fill', ((r.value - min) / (max - min)) * 100 + '%');
}

function setRanges(name, value) {
  $$(`[data-range="${name}"]`).forEach((r) => { r.value = value; fillRange(r); });
}

async function poll() {
  clearTimeout(pollTimer);
  if (!sp.linked) { player = null; renderPlayer(); return; }
  if (document.hidden) return;
  try {
    player = await sp.state();
    fetchedAt = Date.now();
  } catch (e) {
    if (e.reason === 'not_linked') player = null;
  }
  renderPlayer();
  schedulePoll();
}

function schedulePoll(ms) {
  clearTimeout(pollTimer);
  if (!sp.linked || document.hidden) return;
  const delay = ms != null ? ms : (player && player.is_playing ? 3000 : 7000);
  pollTimer = setTimeout(poll, delay);
}

let coverUrl; // bewusst undefined, damit der erste Aufruf mit null den Platzhalter setzt
const tintCache = new Map();
const DEFAULT_TINT = [40, 46, 60];

function extractTint(url) {
  if (tintCache.has(url)) return Promise.resolve(tintCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 24; c.height = 24;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, 24, 24);
        const d = g.getImageData(0, 0, 24, 24).data;
        let r = 0; let gr = 0; let b = 0; let w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i]; const G = d[i + 1]; const B = d[i + 2];
          const mx = Math.max(R, G, B); const mn = Math.min(R, G, B);
          const sat = (mx - mn) / 255; const lum = (R + G + B) / 765;
          const wt = 0.15 + sat * (1 - Math.abs(lum - 0.5));
          r += R * wt; gr += G * wt; b += B * wt; w += wt;
        }
        let rgb = [r / w, gr / w, b / w];
        const m = Math.max(...rgb) || 1;
        const k = Math.min(1.8, 150 / m);
        rgb = rgb.map((v) => Math.round(Math.min(255, v * k)));
        tintCache.set(url, rgb);
        resolve(rgb);
      } catch { resolve(DEFAULT_TINT); }
    };
    img.onerror = () => resolve(DEFAULT_TINT);
    img.src = url;
  });
}

function setCover(url) {
  if (url === coverUrl) return;
  coverUrl = url;
  document.body.classList.toggle('no-cover', !url);
  root.style.setProperty('--cover-url', url ? `url("${url.replace(/"/g, '%22')}")` : 'none');
  if (!url) { root.style.setProperty('--cover-tint', DEFAULT_TINT.join(', ')); return; }
  extractTint(url).then((rgb) => { if (coverUrl === url) root.style.setProperty('--cover-tint', rgb.join(', ')); });
}

function renderPlayer() {
  const b = document.body.classList;
  const linked = sp.linked;
  const item = player && player.item;
  b.toggle('sp-off', !linked);
  b.toggle('no-player', !item);
  b.toggle('is-playing', !!(item && player.is_playing));

  if (!linked) {
    bind('source', 'Spotify · nicht verbunden');
    bind('track', 'Spotify verbinden');
    bind('artist', S.clientId ? 'Zahnrad → Spotify → Verbinden' : 'Einrichtung: Zahnrad → Spotify');
    bind('artistShort', 'Zahnrad → Spotify');
    setCover(null);
  } else if (!item) {
    bind('source', 'Spotify');
    bind('track', 'Gerade läuft nichts');
    bind('artist', 'Starte Spotify am PC oder tippe auf das Gerät');
    bind('artistShort', 'Gerät wählen');
    setCover(null);
  } else {
    const isEp = item.type === 'episode';
    const artist = isEp ? ((item.show && item.show.name) || 'Podcast') : (item.artists || []).map((a) => a.name).join(', ');
    const album = isEp ? '' : (item.album && item.album.name) || '';
    bind('track', item.name);
    bind('artist', album ? `${artist} · ${album}` : artist);
    bind('artistShort', artist);
    bind('source', player.device ? 'Spotify · läuft auf ' + player.device.name : 'Spotify');
    const imgs = (item.album && item.album.images) || item.images || [];
    setCover(imgs.length ? imgs[0].url : null);
  }

  const dev = player && player.device;
  bind('device', dev ? dev.name : 'Gerät wählen');
  $$('[data-device-icon] use').forEach((u) => u.setAttribute('href', '#' + (dev ? deviceIcon(dev.type) : 'i-monitor')));

  $$('[data-action="shuffle"]').forEach((el) => el.classList.toggle('is-on', !!(player && player.shuffle_state)));
  $$('[data-action="repeat"]').forEach((el) => {
    const st = player ? player.repeat_state : 'off';
    el.classList.toggle('is-on', st && st !== 'off');
    el.classList.toggle('repeat-track', st === 'track');
  });

  if (!dragging.volume && dev && typeof dev.volume_percent === 'number') setRanges('volume', dev.volume_percent);
  $$('[data-range="volume"]').forEach((r) => { r.disabled = !!(dev && dev.supports_volume === false); });

  updateProgress();
  renderStatus();
}

function updateProgress() {
  const item = player && player.item;
  const dur = item ? item.duration_ms : 0;
  const pos = currentPos();
  if (!dragging.progress) {
    bind('pos', item ? fmtMs(pos) : '–:––');
    setRanges('progress', dur ? Math.round((pos / dur) * 1000) : 0);
  }
  bind('dur', item ? fmtMs(dur) : '–:––');
  if (item && player.is_playing && pos >= dur && Date.now() - lastEndPoll > 2500) {
    lastEndPoll = Date.now();
    schedulePoll(400);
  }
}

async function cmd(fn) {
  if (!sp.linked) { openSettings('spotify'); return; }
  try {
    await fn();
  } catch (e) {
    if (e.reason === 'NO_ACTIVE_DEVICE' || e.status === 404) { toast(errorText({ reason: 'NO_ACTIVE_DEVICE' })); openDevices(); }
    else toast(errorText(e));
  }
  schedulePoll(700);
}

function playPause() {
  if (!sp.linked) { openSettings('spotify'); return; }
  if (!player || !player.item) { cmd(() => sp.play()); return; }
  const wasPlaying = player.is_playing;
  player.progress_ms = currentPos();
  fetchedAt = Date.now();
  player.is_playing = !wasPlaying;
  renderPlayer();
  cmd(() => (wasPlaying ? sp.pause() : sp.play()));
}

let volTimer = null;
let volValue = null;
function queueVolume(v, now = false) {
  volValue = v;
  if (player && player.device) player.device.volume_percent = v;
  if (volTimer && !now) return;
  clearTimeout(volTimer);
  volTimer = setTimeout(() => {
    volTimer = null;
    const val = volValue;
    cmd(() => sp.volume(val));
  }, now ? 0 : 250);
}

async function openDevices() {
  if (!sp.linked) { openSettings('spotify'); return; }
  const o = $('#devices');
  const list = $('#device-list');
  o.hidden = false;
  list.innerHTML = '<p class="hint">Suche Geräte …</p>';
  try {
    const r = await sp.devices();
    const devs = ((r && r.devices) || []).filter((d) => d.id && !d.is_restricted);
    list.innerHTML = '';
    if (!devs.length) { list.innerHTML = '<p class="hint">Keine Geräte gefunden.</p>'; return; }
    devs.forEach((d) => {
      const btn = document.createElement('button');
      btn.className = 'device' + (d.is_active ? ' is-active' : '');
      btn.innerHTML = `<svg><use href="#${deviceIcon(d.type)}"/></svg><span></span><small>${d.is_active ? 'aktiv' : ''}</small>`;
      btn.querySelector('span').textContent = d.name;
      btn.addEventListener('click', async () => {
        o.hidden = true;
        await cmd(() => sp.transfer(d.id, true));
        toast('Spielt jetzt auf ' + d.name);
      });
      list.appendChild(btn);
    });
  } catch (e) {
    list.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = errorText(e);
    list.appendChild(p);
  }
}

// ---------------------------------------------------------------- Bedienung Dashboard
const actions = {
  toggle: () => playPause(),
  cover: () => (sp.linked ? playPause() : openSettings('spotify')),
  prev: () => cmd(() => sp.previous()),
  next: () => cmd(() => sp.next()),
  shuffle: () => {
    if (!player) return;
    const on = !player.shuffle_state;
    player.shuffle_state = on;
    renderPlayer();
    toast(on ? 'Zufallswiedergabe an' : 'Zufallswiedergabe aus', 1500);
    cmd(() => sp.shuffle(on));
  },
  repeat: () => {
    if (!player) return;
    const order = ['off', 'context', 'track'];
    const nx = order[(order.indexOf(player.repeat_state) + 1) % 3];
    player.repeat_state = nx;
    renderPlayer();
    toast({ off: 'Wiederholen aus', context: 'Wiederholen: Album/Playlist', track: 'Wiederholen: dieser Song' }[nx], 1500);
    cmd(() => sp.repeat(nx));
  },
  devices: () => openDevices(),
  settings: () => openSettings(),
  layout: () => switchLayout(),
};

board.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});

board.addEventListener('input', (e) => {
  const r = e.target.closest('.range');
  if (!r) return;
  fillRange(r);
  if (r.dataset.range === 'progress') {
    dragging.progress = true;
    const dur = (player && player.item && player.item.duration_ms) || 0;
    bind('pos', fmtMs((r.value / 1000) * dur));
    setRanges('progress', r.value);
  } else if (r.dataset.range === 'volume') {
    dragging.volume = true;
    setRanges('volume', r.value);
    queueVolume(+r.value);
  }
});

board.addEventListener('change', (e) => {
  const r = e.target.closest('.range');
  if (!r) return;
  if (r.dataset.range === 'progress') {
    const dur = (player && player.item && player.item.duration_ms) || 0;
    const ms = (r.value / 1000) * dur;
    if (player) { player.progress_ms = ms; fetchedAt = Date.now(); }
    dragging.progress = false;
    cmd(() => sp.seek(ms));
  } else if (r.dataset.range === 'volume') {
    dragging.volume = false;
    queueVolume(+r.value, true);
  }
});

// Wischen wechselt das Layout
let swipe = null;
board.addEventListener('pointerdown', (e) => {
  updateWakeLock();
  if (e.target.closest('input, button, .overlay, details')) { swipe = null; return; }
  swipe = { x: e.clientX, y: e.clientY, t: Date.now() };
});
board.addEventListener('pointerup', (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  if (Math.abs(dx) > window.innerWidth * 0.12 && Math.abs(dy) < Math.abs(dx) * 0.6 && Date.now() - swipe.t < 900) switchLayout();
  swipe = null;
});
board.addEventListener('pointercancel', () => { swipe = null; });

// ---------------------------------------------------------------- Einstellungen
function openSettings(tab) {
  const o = $('#settings');
  o.hidden = false;
  selectTab(tab || 'look');
  syncSettingsUI();
  if (!S.welcomed) { $('#welcome').hidden = false; S.welcomed = true; save(); }
}

function selectTab(t) {
  $$('.tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === t));
  $$('.pane').forEach((p) => { p.hidden = p.dataset.pane !== t; });
  if (t === 'sync') renderSync();
}

function syncSettingsUI() {
  $$('[data-set-layout]').forEach((b) => b.classList.toggle('is-active', b.dataset.setLayout === (S.layout === 'b' ? 'b' : 'a')));
  $$('[data-accent]').forEach((b) => b.classList.toggle('is-active', b.dataset.accent.toLowerCase() === (S.accent || '').toLowerCase()));
  const custom = $('#accent-custom');
  if (custom && /^#[0-9a-f]{6}$/i.test(S.accent)) custom.value = S.accent;
  $$('[data-cover]').forEach((b) => b.classList.toggle('is-active', b.dataset.cover === S.coverStyle));
  $$('[data-locmode]').forEach((b) => b.classList.toggle('is-active', b.dataset.locmode === S.locMode));
  $$('[data-toggle]').forEach((i) => { i.checked = !!S[i.dataset.toggle]; });

  const cid = $('#sp-client');
  if (document.activeElement !== cid) cid.value = S.clientId || '';
  $('#sp-redirect').textContent = redirectUri();
  let status; let cls = '';
  if (!window.isSecureContext) { status = 'Achtung: Die Seite läuft nicht über https. Der Spotify-Login klappt erst auf der fertigen Web-Adresse.'; cls = 'err'; }
  else if (sp.linked) { status = 'Verbunden. Du kannst Spotify jetzt vom Dashboard aus steuern.'; cls = 'ok'; }
  else if (S.clientId) status = 'Client-ID ist eingetragen. Jetzt auf „Mit Spotify verbinden“ tippen.';
  else status = 'Noch nicht eingerichtet. Folge Schritt 3 der Anleitung, dann hier die Client-ID eintragen.';
  bind('spStatus', status);
  $$('[data-bind="spStatus"]').forEach((el) => { el.classList.toggle('ok', cls === 'ok'); el.classList.toggle('err', cls === 'err'); });
  $('#sp-login').disabled = !S.clientId;
  $('#sp-login').textContent = sp.linked ? 'Neu verbinden' : 'Mit Spotify verbinden';
  $('#sp-logout').disabled = !sp.linked;

  const cu = $('#cal-url'); if (document.activeElement !== cu) cu.value = S.calendarUrl || '';
  const cp = $('#cal-proxy'); if (document.activeElement !== cp) cp.value = S.calendarProxy || '';
  bind('version', VERSION);
  renderWeather();
}

function setupLink() {
  return redirectUri() + '#setup=' + encodeSetup(S);
}

function renderSync() {
  const link = setupLink();
  try { $('#qr').innerHTML = qrSvg(link); } catch { $('#qr').textContent = 'Zu viele Daten für einen QR-Code.'; }
  const parts = [];
  if (S.clientId) parts.push('Spotify-Client-ID');
  if (S.calendarUrl) parts.push('Kalender-Link');
  if (S.lat != null) parts.push('Ort');
  parts.push('Aussehen');
  let info = 'Enthält: ' + parts.join(', ') + '.';
  if (S.calendarUrl) info += ' Nicht öffentlich teilen, der Kalender-Link ist privat.';
  $('#sync-info').textContent = info;
}

$$('.tab').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
$$('.overlay').forEach((o) => o.addEventListener('click', (e) => { if (e.target === o) o.hidden = true; }));
$$('[data-close]').forEach((b) => b.addEventListener('click', () => {
  const o = b.closest('.overlay');
  o.hidden = true;
  if (o.id === 'import') history.replaceState(null, '', redirectUri());
}));

$$('[data-set-layout]').forEach((b) => b.addEventListener('click', () => { S.layout = b.dataset.setLayout; save(); applySettings(); }));
$$('[data-accent]').forEach((b) => b.addEventListener('click', () => { S.accent = b.dataset.accent; save(); applySettings(); }));
$('#accent-custom').addEventListener('input', (e) => { S.accent = e.target.value; save(); applySettings(); });
$$('[data-cover]').forEach((b) => b.addEventListener('click', () => { S.coverStyle = b.dataset.cover; save(); applySettings(); }));
$$('[data-toggle]').forEach((i) => i.addEventListener('change', () => { S[i.dataset.toggle] = i.checked; save(); applySettings(); }));
$$('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText($('#' + b.dataset.copy).textContent)));

$('#sp-client').addEventListener('input', (e) => {
  S.clientId = e.target.value.replace(/\s+/g, '');
  save();
  syncSettingsUI();
});
$('#sp-login').addEventListener('click', () => { save(); sp.login().catch((e) => toast(errorText(e), 5000)); });
$('#sp-logout').addEventListener('click', () => {
  sp.logout();
  player = null;
  renderPlayer();
  syncSettingsUI();
  toast('Spotify getrennt');
});

$$('[data-locmode]').forEach((b) => b.addEventListener('click', () => {
  S.locMode = b.dataset.locmode;
  save();
  applySettings();
  if (S.locMode === 'auto') { S.place = ''; refreshWeather(); }
  else setTimeout(() => $('#loc-q').focus(), 50);
}));

async function doPlaceSearch() {
  const q = $('#loc-q').value.trim();
  const box = $('#loc-results');
  if (!q) return;
  box.innerHTML = '<p class="hint">Suche …</p>';
  try {
    const res = await searchPlaces(q);
    box.innerHTML = '';
    if (!res.length) { box.innerHTML = '<p class="hint">Nichts gefunden.</p>'; return; }
    res.forEach((p) => {
      const btn = document.createElement('button');
      btn.className = 'result';
      btn.innerHTML = `${esc(p.name)}<small>${esc(p.detail)}</small>`;
      btn.addEventListener('click', () => {
        Object.assign(S, { lat: p.lat, lon: p.lon, place: p.name, locMode: 'manual' });
        save();
        applySettings();
        box.innerHTML = '';
        $('#loc-q').value = '';
        weather = null;
        refreshWeather();
        toast('Ort gesetzt: ' + p.name);
      });
      box.appendChild(btn);
    });
  } catch {
    box.innerHTML = '<p class="hint">Suche gerade nicht möglich.</p>';
  }
}
$('#loc-search').addEventListener('click', doPlaceSearch);
$('#loc-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') doPlaceSearch(); });

$('#cal-test').addEventListener('click', async () => {
  S.calendarUrl = $('#cal-url').value.trim();
  S.calendarProxy = $('#cal-proxy').value.trim();
  save();
  const st = $('#cal-status');
  st.className = 'status-line';
  st.textContent = 'Lade Kalender …';
  const r = await refreshCalendar();
  if (r.empty) { st.textContent = 'Kein Link eingetragen, Kalender ist aus.'; return; }
  if (r.ok) { st.classList.add('ok'); st.textContent = `Klappt. ${r.count} Termin${r.count === 1 ? '' : 'e'} (diese Woche bis in zwei Wochen) gefunden.`; }
  else {
    st.classList.add('err');
    st.textContent = /Failed to fetch|NetworkError|Load failed/i.test(r.error)
      ? 'Der Link lässt sich vom Browser aus nicht abrufen. Nimm den Apps-Script-Link aus der Anleitung (Schritt 5).'
      : 'Fehler: ' + r.error;
  }
});

$('#sync-copy').addEventListener('click', () => copyText(setupLink()));
$('#reset').addEventListener('click', () => {
  // eslint-disable-next-line no-alert
  if (window.confirm('Wirklich alle Einstellungen und den Spotify-Login auf diesem Gerät löschen?')) {
    clearAll();
    location.replace(redirectUri());
  }
});

// ---------------------------------------------------------------- Import vom PC (#setup=…)
function checkImport() {
  const m = /^#setup=(.+)$/.exec(location.hash);
  if (!m) return false;
  let data;
  try { data = decodeSetup(m[1]); } catch { toast('Der Sync-Link ist beschädigt.'); history.replaceState(null, '', redirectUri()); return false; }
  const names = { clientId: 'Spotify-Client-ID', calendarUrl: 'Kalender', place: 'Ort: ' + (data.place || ''), layout: 'Layout', accent: 'Farbe', coverStyle: 'Cover-Stil' };
  const list = Object.keys(data).filter((k) => names[k]).map((k) => names[k]);
  $('#import-summary').textContent = 'Vom anderen Gerät: ' + (list.join(', ') || 'Aussehen') + '. Deine bisherigen Einstellungen auf diesem Gerät werden damit überschrieben.';
  $('#import').hidden = false;
  $('#import-yes').onclick = () => {
    Object.assign(S, data, { welcomed: true });
    save();
    history.replaceState(null, '', redirectUri());
    $('#import').hidden = true;
    applySettings();
    weather = null;
    refreshWeather();
    refreshCalendar();
    renderPlayer();
    toast(sp.linked ? 'Einstellungen übernommen.' : 'Übernommen. Jetzt noch Spotify verbinden: Zahnrad → Spotify.', 5000);
  };
  return true;
}

// ---------------------------------------------------------------- Start
document.addEventListener('visibilitychange', () => {
  updateWakeLock();
  if (!document.hidden) { tickClock(); poll(); renderEvents(); }
  else clearTimeout(pollTimer);
});

async function start() {
  applySettings();
  clockLoop();
  renderWeek();
  renderEvents();
  renderPlayer();
  setInterval(updateProgress, 500);
  setInterval(refreshWeather, 15 * 60 * 1000);
  setInterval(refreshCalendar, 10 * 60 * 1000);

  const importing = checkImport();
  const res = await sp.handleRedirect().catch(() => ({ error: 'network' }));
  if (res && res.ok) toast('Spotify verbunden!');
  else if (res && res.error) { toast('Spotify-Login hat nicht geklappt: ' + res.error, 6000); openSettings('spotify'); }
  else if (!importing && !S.welcomed) openSettings('look');

  poll();
  refreshWeather();
  refreshCalendar();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
