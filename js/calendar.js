// Kalender: liest entweder die JSON-Antwort des Google-Apps-Scripts (empfohlen)
// oder eine iCal-Datei (.ics) direkt bzw. über einen CORS-Proxy.

const DAY = 86400000;

export function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function parseLocalDate(str) {
  // 'YYYY-MM-DD'
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export async function loadCalendar(url, proxy) {
  const target = proxy ? proxy + encodeURIComponent(url) : url;
  const r = await fetch(target, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const text = await r.text();
  const now = new Date();
  const from = startOfWeek(now);
  const to = new Date(now.getTime() + 15 * DAY);
  let events = [];
  const trimmed = text.trim();

  if (trimmed.startsWith('{')) {
    const j = JSON.parse(trimmed);
    if (j.error) throw new Error(j.error);
    (j.events || []).forEach((e) => {
      const allDay = !!e.allDay;
      const start = allDay ? parseLocalDate(e.start) : new Date(e.start);
      const end = allDay ? parseLocalDate(e.end) : new Date(e.end);
      events.push({ title: e.title || '(ohne Titel)', start, end, allDay });
    });
    (j.ics || []).forEach((ics) => { events = events.concat(parseICS(ics, from, to)); });
  } else if (trimmed.includes('BEGIN:VCALENDAR')) {
    events = parseICS(trimmed, from, to);
  } else {
    throw new Error('Unbekanntes Format (weder Apps-Script-JSON noch iCal)');
  }

  return events
    .filter((e) => e.end > from && e.start < to)
    .sort((a, b) => a.start - b.start);
}

// ---------- iCal ----------

function unescapeText(v) {
  return v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

function parseICSDate(value, params) {
  const v = value.trim();
  const isDate = (params.VALUE === 'DATE') || /^\d{8}$/.test(v);
  const y = +v.slice(0, 4); const mo = +v.slice(4, 6) - 1; const d = +v.slice(6, 8);
  if (isDate) return { date: new Date(y, mo, d), allDay: true };
  const h = +v.slice(9, 11); const mi = +v.slice(11, 13); const s = +v.slice(13, 15) || 0;
  if (v.endsWith('Z')) return { date: new Date(Date.UTC(y, mo, d, h, mi, s)), allDay: false };
  // Zeit mit TZID oder ohne Zone: als Ortszeit des Tablets behandeln
  return { date: new Date(y, mo, d, h, mi, s), allDay: false };
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (((+m[2] || 0) * 7 + (+m[3] || 0)) * DAY + (+m[4] || 0) * 3600000 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000);
}

export function parseICS(text, from, to) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const raw = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') { if (cur) raw.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [nameRaw, ...paramParts] = head.split(';');
    const name = nameRaw.toUpperCase();
    const params = {};
    paramParts.forEach((p) => { const [k, val] = p.split('='); if (k) params[k.toUpperCase()] = val; });
    if (name === 'SUMMARY') cur.title = unescapeText(value);
    else if (name === 'DTSTART') { const p = parseICSDate(value, params); cur.start = p.date; cur.allDay = p.allDay; }
    else if (name === 'DTEND') cur.end = parseICSDate(value, params).date;
    else if (name === 'DURATION') cur.duration = parseDuration(value);
    else if (name === 'RRULE') {
      cur.rrule = {};
      value.split(';').forEach((kv) => { const [k, val] = kv.split('='); cur.rrule[k.toUpperCase()] = val; });
    } else if (name === 'EXDATE') value.split(',').forEach((x) => cur.exdates.push(parseICSDate(x, params).date.getTime()));
    else if (name === 'UID') cur.uid = value;
    else if (name === 'RECURRENCE-ID') cur.recurrenceId = parseICSDate(value, params).date.getTime();
    else if (name === 'STATUS') cur.status = value.toUpperCase();
  }

  // Einzeln geänderte Termine einer Serie ersetzen den ursprünglichen Termin
  const masters = new Map(raw.filter((e) => e.rrule && e.uid).map((e) => [e.uid, e]));
  raw.forEach((e) => {
    if (e.recurrenceId && masters.has(e.uid)) masters.get(e.uid).exdates.push(e.recurrenceId);
  });

  const out = [];
  raw.forEach((e) => {
    if (!e.start || e.status === 'CANCELLED') return;
    let dur;
    if (e.end) dur = e.end - e.start;
    else if (e.duration) dur = e.duration;
    else dur = e.allDay ? DAY : 0;
    const base = { title: e.title || '(ohne Titel)', allDay: !!e.allDay };
    if (!e.rrule || e.recurrenceId) {
      const end = new Date(e.start.getTime() + dur);
      if (end > from && e.start < to) out.push({ ...base, start: e.start, end });
      return;
    }
    expand(e, dur, from, to).forEach((s) => out.push({ ...base, start: s, end: new Date(s.getTime() + dur) }));
  });
  return out;
}

function expand(e, dur, from, to) {
  const r = e.rrule;
  const freq = (r.FREQ || '').toUpperCase();
  const interval = Math.max(1, parseInt(r.INTERVAL || '1', 10));
  const count = r.COUNT ? parseInt(r.COUNT, 10) : Infinity;
  const until = r.UNTIL ? parseICSDate(r.UNTIL, {}).date : null;
  const ex = new Set(e.exdates);
  const out = [];
  let n = 0;
  const consider = (occ) => {
    n += 1;
    if (n > count) return false;
    if (until && occ > until) return false;
    if (occ >= to) return false;
    if (!ex.has(occ.getTime()) && occ.getTime() + dur > from.getTime()) out.push(occ);
    return true;
  };
  const withTime = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), e.start.getHours(), e.start.getMinutes(), e.start.getSeconds());

  if (freq === 'WEEKLY' && r.BYDAY) {
    const codes = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
    const days = r.BYDAY.split(',').map((d) => codes.indexOf(d.slice(-2).toUpperCase())).filter((i) => i >= 0).sort((a, b) => a - b);
    const week0 = startOfWeek(e.start);
    for (let w = 0; w < 3000; w += interval) {
      for (const di of days) {
        const day = new Date(week0);
        day.setDate(week0.getDate() + w * 7 + di);
        const occ = withTime(day);
        if (occ < e.start) continue;
        if (!consider(occ)) return out;
      }
    }
    return out;
  }

  let occ = new Date(e.start);
  for (let i = 0; i < 20000; i++) {
    if (!consider(occ)) return out;
    const nx = new Date(occ);
    if (freq === 'DAILY') nx.setDate(nx.getDate() + interval);
    else if (freq === 'WEEKLY') nx.setDate(nx.getDate() + 7 * interval);
    else if (freq === 'MONTHLY') nx.setMonth(nx.getMonth() + interval);
    else if (freq === 'YEARLY') nx.setFullYear(nx.getFullYear() + interval);
    else return out;
    occ = nx;
  }
  return out;
}
