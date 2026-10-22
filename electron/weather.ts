import { net } from 'electron';
import {
  forecastUrl,
  geocodeUrl,
  parseForecast,
  parseGeocode,
  sanitizeCity,
  sanitizePoint,
  type WeatherResult,
} from './weather-rules';

const TIMEOUT_MS = 9000;
const CACHE_MS = 10 * 60 * 1000;

/**
 * Current conditions for the Home board.
 *
 * Open-Meteo is keyless, so there is no token to leak and no account. The only
 * data sent is the city the user typed (or the point they picked from it); the
 * request never includes the workspace, services or a device identifier.
 */
class WeatherService {
  private cache = new Map<string, { at: number; value: WeatherResult }>();

  async lookup(city: unknown, unit: unknown): Promise<WeatherResult> {
    const name = sanitizeCity(city);
    const scale = unit === 'f' ? 'f' : 'c';
    if (!name) return { ok: false, error: 'invalid' };
    const key = `city:${name.toLowerCase()}:${scale}`;
    const cached = this.read(key);
    if (cached) return cached;

    let geo: unknown;
    try {
      const response = await net.fetch(geocodeUrl(name), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        return this.write(key, { ok: false, error: response.status === 404 ? 'not-found' : 'unavailable' });
      }
      geo = await response.json();
    } catch {
      return { ok: false, error: 'offline' };
    }

    const place = parseGeocode(geo);
    if (!place) return { ok: false, error: 'not-found' };
    return this.forecast({
      key,
      unit: scale,
      latitude: place.latitude,
      longitude: place.longitude,
      place: place.name,
      country: place.country,
      timezone: place.timezone,
    });
  }

  async at(latitude: unknown, longitude: unknown, unit: unknown): Promise<WeatherResult> {
    const point = sanitizePoint(latitude, longitude);
    const scale = unit === 'f' ? 'f' : 'c';
    if (!point) return { ok: false, error: 'invalid' };
    const key = `point:${point.latitude}:${point.longitude}:${scale}`;
    const cached = this.read(key);
    if (cached) return cached;
    return this.forecast({
      key,
      unit: scale,
      latitude: point.latitude,
      longitude: point.longitude,
      place: '',
      country: '',
      timezone: 'auto',
    });
  }

  private async forecast(input: {
    key: string;
    unit: 'c' | 'f';
    latitude: number;
    longitude: number;
    place: string;
    country: string;
    timezone: string;
  }): Promise<WeatherResult> {
    try {
      const response = await net.fetch(forecastUrl(input.latitude, input.longitude, input.unit), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        return this.write(input.key, { ok: false, error: 'unavailable' });
      }
      const current = parseForecast(await response.json());
      if (!current) return this.write(input.key, { ok: false, error: 'unavailable' });
      return this.write(input.key, {
        ok: true,
        place: input.place,
        country: input.country,
        latitude: input.latitude,
        longitude: input.longitude,
        timezone: input.timezone,
        current,
        fetchedAt: Date.now(),
      });
    } catch {
      return { ok: false, error: 'offline' };
    }
  }

  private read(key: string): WeatherResult | null {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_MS) {
      this.cache.delete(key);
      return null;
    }
    return hit.value;
  }

  private write(key: string, value: WeatherResult): WeatherResult {
    if (value.ok) this.cache.set(key, { at: Date.now(), value });
    return value;
  }
}

export const weather = new WeatherService();
