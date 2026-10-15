// Wetter über Open-Meteo (kostenlos, ohne API-Schlüssel).

const CODES = {
  0: ['Klar', 'clear'],
  1: ['Überwiegend klar', 'partly'],
  2: ['Teilweise bewölkt', 'partly'],
  3: ['Bedeckt', 'cloud'],
  45: ['Nebel', 'fog'],
  48: ['Reifnebel', 'fog'],
  51: ['Leichter Nieselregen', 'drizzle'],
  53: ['Nieselregen', 'drizzle'],
  55: ['Starker Nieselregen', 'drizzle'],
  56: ['Gefrierender Niesel', 'drizzle'],
  57: ['Gefrierender Niesel', 'drizzle'],
  61: ['Leichter Regen', 'rain'],
  63: ['Regen', 'rain'],
  65: ['Starker Regen', 'rain'],
  66: ['Gefrierender Regen', 'rain'],
  67: ['Gefrierender Regen', 'rain'],
  71: ['Leichter Schneefall', 'snow'],
  73: ['Schneefall', 'snow'],
  75: ['Starker Schneefall', 'snow'],
  77: ['Schneegriesel', 'snow'],
  80: ['Leichte Schauer', 'rain'],
  81: ['Schauer', 'rain'],
  82: ['Starke Schauer', 'rain'],
  85: ['Schneeschauer', 'snow'],
  86: ['Starke Schneeschauer', 'snow'],
  95: ['Gewitter', 'storm'],
  96: ['Gewitter mit Hagel', 'storm'],
  99: ['Gewitter mit Hagel', 'storm'],
};

export function weatherInfo(code, isDay = true) {
  const [label, kind] = CODES[code] || ['–', 'cloud'];
  const icons = {
    clear: isDay ? 'w-sun' : 'w-moon',
    partly: isDay ? 'w-cloud-sun' : 'w-cloud-moon',
    cloud: 'w-cloud', fog: 'w-fog', drizzle: 'w-drizzle', rain: 'w-rain', snow: 'w-snow', storm: 'w-storm',
  };
  return { label, icon: icons[kind] };
}

export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: 'temperature_2m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '5',
  });
  const r = await fetch('https://api.open-meteo.com/v1/forecast?' + params);
  if (!r.ok) throw new Error('weather_http_' + r.status);
  const j = await r.json();
  const daily = j.daily.time.map((t, i) => ({
    date: new Date(t + 'T12:00:00'),
    code: j.daily.weather_code[i],
    max: j.daily.temperature_2m_max[i],
    min: j.daily.temperature_2m_min[i],
  }));
  return {
    temp: j.current.temperature_2m,
    code: j.current.weather_code,
    isDay: j.current.is_day === 1,
    today: daily[0],
    days: daily.slice(1),
    fetchedAt: Date.now(),
  };
}

export async function searchPlaces(q) {
  const params = new URLSearchParams({ name: q, count: '6', language: 'de', format: 'json' });
  const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?' + params);
  if (!r.ok) throw new Error('geo_http_' + r.status);
  const j = await r.json();
  return (j.results || []).map((p) => ({
    name: p.name,
    detail: [p.admin1, p.country].filter(Boolean).join(', '),
    lat: p.latitude,
    lon: p.longitude,
  }));
}

// Ortsname für GPS-Koordinaten (kostenloser Dienst ohne Schlüssel); bei Fehler bleibt es bei „Mein Standort“.
export async function placeName(lat, lon) {
  try {
    const params = new URLSearchParams({ latitude: lat, longitude: lon, localityLanguage: 'de' });
    const r = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?' + params);
    if (!r.ok) return '';
    const j = await r.json();
    return j.city || j.locality || j.principalSubdivision || '';
  } catch {
    return '';
  }
}

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('no_geo')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30 * 60 * 1000 },
    );
  });
}
