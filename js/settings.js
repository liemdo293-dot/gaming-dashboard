// Einstellungen: lokal im Browser gespeichert, per Link/QR-Code auf ein anderes Gerät übertragbar.

const KEY = 'gd.settings.v1';

export const DEFAULTS = {
  layout: 'a',            // 'a' = Kacheln, 'b' = Fokus-Uhr
  accent: '#FFB23E',
  coverStyle: 'cover',    // 'cover' | 'vinyl'
  ambient: false,
  showSeconds: true,
  keepAwake: true,
  clientId: '',
  locMode: 'auto',        // 'auto' | 'manual'
  lat: null,
  lon: null,
  place: '',
  calendarUrl: '',
  calendarProxy: '',
  welcomed: false,
};

// Was beim Sync mit übertragen wird (kurze Schlüssel, damit der QR-Code klein bleibt)
const SYNC = {
  layout: 'l', accent: 'a', coverStyle: 'c', ambient: 'm', showSeconds: 's', keepAwake: 'k',
  clientId: 'i', locMode: 'o', lat: 'y', lon: 'x', place: 'p', calendarUrl: 'u', calendarProxy: 'r',
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* Speicher nicht verfügbar */ }
}

export function clearAll() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('gd.')).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignorieren */ }
}

function toB64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSetup(s) {
  const o = {};
  for (const [k, short] of Object.entries(SYNC)) {
    const v = s[k];
    if (v === null || v === '' || v === DEFAULTS[k]) continue;
    o[short] = typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v;
  }
  return toB64Url(JSON.stringify(o));
}

export function decodeSetup(str) {
  const o = JSON.parse(fromB64Url(str));
  const out = {};
  for (const [k, short] of Object.entries(SYNC)) {
    if (short in o) out[k] = o[short];
  }
  return out;
}
