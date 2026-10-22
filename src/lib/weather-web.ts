import {
  forecastUrl,
  geocodeUrl,
  parseForecast,
  parseGeocode,
  sanitizeCity,
  sanitizePoint,
  type WeatherResult,
} from '../../electron/weather-rules';

const TIMEOUT_MS = 9000;
const CACHE_MS = 10 * 60 * 1000;

/**
 * The web/PWA build has no Electron `net` module, so the Home board talks to
 * Open-Meteo directly. The rules — validation, URLs and response parsing — are
 * the same pure module the desktop main process uses. Open-Meteo is keyless and
 * serves CORS, and the ten-minute cache keeps a board left open from re-asking.
 */
const cache = new Map<string, { at: number; value: WeatherResult }>();

function read(key: string): WeatherResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function write(key: string, value: WeatherResult): WeatherResult {
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function json(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`weather answered ${response.status}`);
  return response.json();
}

export async function weatherAtWeb(
  latitude: unknown,
  longitude: unknown,
  unit: unknown,
): Promise<WeatherResult> {
  const point = sanitizePoint(latitude, longitude);
  const scale = unit === 'f' ? 'f' : 'c';
  if (!point) return { ok: false, error: 'invalid' };
  const key = `point:${point.latitude}:${point.longitude}:${scale}`;
  const cached = read(key);
  if (cached) return cached;

  try {
    const current = parseForecast(
      await json(forecastUrl(point.latitude, point.longitude, scale)),
    );
    if (!current) return write(key, { ok: false, error: 'unavailable' });
    return write(key, {
      ok: true,
      latitude: point.latitude,
      longitude: point.longitude,
      current,
      fetchedAt: Date.now(),
    });
  } catch {
    return { ok: false, error: 'offline' };
  }
}

export async function weatherLookupWeb(
  city: unknown,
  unit: unknown,
): Promise<WeatherResult> {
  const name = sanitizeCity(city);
  const scale = unit === 'f' ? 'f' : 'c';
  if (!name) return { ok: false, error: 'invalid' };
  const key = `city:${name.toLowerCase()}:${scale}`;
  const cached = read(key);
  if (cached) return cached;

  let place;
  try {
    place = parseGeocode(await json(geocodeUrl(name)));
  } catch {
    return { ok: false, error: 'offline' };
  }
  if (!place) return { ok: false, error: 'not-found' };

  return weatherAtWebAtPlace(place, scale, key);
}

async function weatherAtWebAtPlace(
  place: { name: string; country: string; latitude: number; longitude: number; timezone: string },
  scale: 'c' | 'f',
  key: string,
): Promise<WeatherResult> {
  try {
    const current = parseForecast(
      await json(forecastUrl(place.latitude, place.longitude, scale)),
    );
    if (!current) return write(key, { ok: false, error: 'unavailable' });
    return write(key, {
      ok: true,
      place: place.name,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone,
      current,
      fetchedAt: Date.now(),
    });
  } catch {
    return { ok: false, error: 'offline' };
  }
}
