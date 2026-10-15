// Spotify Web API mit PKCE-Login (ohne Server, ohne Client-Secret).
// Benötigt eine eigene App im Spotify-Developer-Dashboard und Spotify Premium.

const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
const TOKEN_KEY = 'gd.spotify.token';
const PKCE_KEY = 'gd.spotify.pkce';
const API = 'https://api.spotify.com/v1';

export class SpotifyError extends Error {
  constructor(reason, status = 0) {
    super(reason);
    this.reason = reason;
    this.status = status;
  }
}

export function redirectUri() {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.pathname = u.pathname.replace(/index\.html$/, '');
  return u.toString();
}

function randomString(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  let bin = '';
  new Uint8Array(digest).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeJSON(key, val) {
  try {
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
  } catch { /* ignorieren */ }
}

export class Spotify {
  constructor(getClientId) {
    this.getClientId = getClientId;
    this.token = readJSON(TOKEN_KEY);
    this.backoffUntil = 0;
    this._refreshing = null;
  }

  get linked() {
    return !!(this.token && this.token.refresh_token);
  }

  logout() {
    this.token = null;
    writeJSON(TOKEN_KEY, null);
  }

  async login() {
    const clientId = (this.getClientId() || '').trim();
    if (!clientId) throw new SpotifyError('no_client_id');
    if (!window.isSecureContext || !crypto.subtle) throw new SpotifyError('insecure');
    const verifier = randomString(64);
    const state = randomString(16);
    const redirect = redirectUri();
    writeJSON(PKCE_KEY, { verifier, state, redirect, clientId });
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirect,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: await challengeFor(verifier),
      state,
    });
    location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
  }

  // Wird beim Start aufgerufen: verarbeitet die Rückkehr vom Spotify-Login.
  async handleRedirect() {
    const q = new URLSearchParams(location.search);
    if (!q.has('code') && !q.has('error')) return null;
    const pkce = readJSON(PKCE_KEY);
    history.replaceState(null, '', redirectUri() + location.hash);
    if (q.get('error')) return { error: q.get('error') };
    if (!pkce || pkce.state !== q.get('state')) return { error: 'state_mismatch' };
    const res = await this._requestToken(new URLSearchParams({
      grant_type: 'authorization_code',
      code: q.get('code'),
      redirect_uri: pkce.redirect,
      client_id: pkce.clientId,
      code_verifier: pkce.verifier,
    }));
    writeJSON(PKCE_KEY, null);
    return res.ok ? { ok: true } : { error: res.error || 'token_failed' };
  }

  async _requestToken(body) {
    let r;
    try {
      r = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch {
      return { ok: false, network: true };
    }
    let j = null;
    try { j = await r.json(); } catch { /* leer */ }
    if (!r.ok || !j || !j.access_token) {
      return { ok: false, status: r.status, error: (j && (j.error_description || j.error)) || 'http_' + r.status };
    }
    this.token = {
      access_token: j.access_token,
      refresh_token: j.refresh_token || (this.token && this.token.refresh_token),
      expires_at: Date.now() + (j.expires_in - 60) * 1000,
    };
    writeJSON(TOKEN_KEY, this.token);
    return { ok: true };
  }

  async refresh() {
    if (!this.token) return false;
    if (!this._refreshing) {
      const clientId = (this.getClientId() || '').trim();
      this._refreshing = this._requestToken(new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.token.refresh_token,
        client_id: clientId,
      })).finally(() => { this._refreshing = null; });
    }
    const res = await this._refreshing;
    if (!res.ok && (res.status === 400 || res.status === 401)) {
      // Refresh-Token ungültig (z. B. Zugriff in Spotify entzogen) -> neu verbinden nötig
      this.logout();
    }
    return res.ok;
  }

  async api(method, path, { query, body } = {}) {
    if (!this.linked) throw new SpotifyError('not_linked');
    if (Date.now() < this.backoffUntil) throw new SpotifyError('rate_limited', 429);
    if (!this.token.access_token || Date.now() > this.token.expires_at) {
      const ok = await this.refresh();
      if (!ok) throw new SpotifyError(this.linked ? 'network' : 'not_linked');
    }
    let url = API + path;
    if (query) url += '?' + new URLSearchParams(query).toString();
    const send = () => fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + this.token.access_token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    let r;
    try { r = await send(); } catch { throw new SpotifyError('network'); }
    if (r.status === 401) {
      const ok = await this.refresh();
      if (!ok) throw new SpotifyError('not_linked', 401);
      try { r = await send(); } catch { throw new SpotifyError('network'); }
    }
    if (r.status === 429) {
      const wait = parseInt(r.headers.get('Retry-After') || '', 10);
      this.backoffUntil = Date.now() + (Number.isFinite(wait) ? wait : 10) * 1000;
      throw new SpotifyError('rate_limited', 429);
    }
    if (r.status === 204 || r.status === 202) return null;
    const text = await r.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch { /* kein JSON */ }
    if (!r.ok) {
      const reason = (j && j.error && (j.error.reason || j.error.message)) || 'http_' + r.status;
      throw new SpotifyError(reason, r.status);
    }
    return j;
  }

  // ---- Player ----
  state() { return this.api('GET', '/me/player', { query: { additional_types: 'episode' } }); }
  play() { return this.api('PUT', '/me/player/play'); }
  pause() { return this.api('PUT', '/me/player/pause'); }
  next() { return this.api('POST', '/me/player/next'); }
  previous() { return this.api('POST', '/me/player/previous'); }
  seek(ms) { return this.api('PUT', '/me/player/seek', { query: { position_ms: Math.max(0, Math.round(ms)) } }); }
  volume(pct) { return this.api('PUT', '/me/player/volume', { query: { volume_percent: Math.round(pct) } }); }
  shuffle(on) { return this.api('PUT', '/me/player/shuffle', { query: { state: on ? 'true' : 'false' } }); }
  repeat(mode) { return this.api('PUT', '/me/player/repeat', { query: { state: mode } }); }
  devices() { return this.api('GET', '/me/player/devices'); }
  transfer(id, play = true) { return this.api('PUT', '/me/player', { body: { device_ids: [id], play } }); }
}

export function errorText(err) {
  const r = (err && err.reason) || '';
  if (r === 'NO_ACTIVE_DEVICE' || r === 'Player command failed: No active device found') return 'Kein aktives Gerät. Wähle, wo Spotify spielen soll.';
  if (r === 'PREMIUM_REQUIRED') return 'Spotify meldet: Dafür ist Premium nötig.';
  if (r === 'VOLUME_CONTROL_DISALLOW') return 'Dieses Gerät erlaubt keine Lautstärke-Steuerung.';
  if (r === 'rate_limited') return 'Spotify bremst gerade, kurz warten.';
  if (r === 'network') return 'Keine Verbindung zu Spotify.';
  if (r === 'not_linked') return 'Spotify ist nicht verbunden.';
  if (r === 'no_client_id') return 'Bitte zuerst die Client-ID eintragen.';
  if (r === 'insecure') return 'Spotify-Login geht nur über https.';
  if (err && err.status === 403) return 'Spotify hat den Befehl abgelehnt.';
  return 'Spotify-Fehler: ' + (r || 'unbekannt');
}
