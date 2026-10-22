export type WeatherError = 'offline' | 'not-found' | 'invalid' | 'unavailable';

export interface WeatherPlace {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface WeatherNow {
  temperature: number;
  apparent: number;
  code: number;
  wind: number;
  isDay: boolean;
  humidity: number;
}

export interface WeatherResult {
  ok: boolean;
  error?: WeatherError;
  place?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  current?: WeatherNow;
  fetchedAt?: number;
}

/** A city name, not a coordinate or a script. */
export function sanitizeCity(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (value.length < 2 || value.length > 80) return null;
  return value;
}

function coordinate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sanitizePoint(latitude: unknown, longitude: unknown): { latitude: number; longitude: number } | null {
  // Number(null) is 0: without this guard an unset location would ask for the
  // weather at 0,0 and call it local.
  const lat = coordinate(latitude);
  const lon = coordinate(longitude);
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: Math.round(lat * 10000) / 10000, longitude: Math.round(lon * 10000) / 10000 };
}

export function geocodeUrl(city: string): string {
  const params = new URLSearchParams({
    name: city,
    count: '1',
    language: 'en',
    format: 'json',
  });
  return `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
}

export function forecastUrl(latitude: number, longitude: number, unit: 'c' | 'f'): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,relative_humidity_2m',
    timezone: 'auto',
    temperature_unit: unit === 'f' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: unit === 'f' ? 'mph' : 'kmh',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Open-Meteo returns `results: []` for a name it does not know. */
export function parseGeocode(raw: unknown): WeatherPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as { results?: unknown };
  if (!Array.isArray(source.results) || source.results.length === 0) return null;
  const first = source.results[0] as Record<string, unknown>;
  if (!first || typeof first !== 'object') return null;
  const latitude = finite(first.latitude);
  const longitude = finite(first.longitude);
  const name = typeof first.name === 'string' ? first.name.trim().slice(0, 80) : '';
  if (latitude === null || longitude === null || !name) return null;
  return {
    name,
    country: typeof first.country === 'string' ? first.country.trim().slice(0, 80) : '',
    latitude,
    longitude,
    timezone: typeof first.timezone === 'string' ? first.timezone.slice(0, 80) : 'auto',
  };
}

export function parseForecast(raw: unknown): WeatherNow | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as { current?: Record<string, unknown> };
  const current = source.current;
  if (!current || typeof current !== 'object') return null;
  const temperature = finite(current.temperature_2m);
  const code = finite(current.weather_code);
  if (temperature === null || code === null) return null;
  return {
    temperature,
    apparent: finite(current.apparent_temperature) ?? temperature,
    code: Math.round(code),
    wind: finite(current.wind_speed_10m) ?? 0,
    isDay: current.is_day !== 0,
    humidity: Math.round(finite(current.relative_humidity_2m) ?? 0),
  };
}
