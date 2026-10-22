import { describe, expect, it } from 'vitest';
import {
  forecastUrl,
  geocodeUrl,
  parseForecast,
  parseGeocode,
  sanitizeCity,
  sanitizePoint,
} from '../electron/weather-rules';

describe('weather-rules', () => {
  it('accepts a city name and rejects control characters and empties', () => {
    expect(sanitizeCity('  New   York ')).toBe('New York');
    expect(sanitizeCity('A')).toBeNull();
    expect(sanitizeCity('x'.repeat(81))).toBeNull();
    expect(sanitizeCity('Bad\u0000Name')).toBe('Bad Name');
    expect(sanitizeCity(42)).toBeNull();
  });

  it('clamps coordinates to the real world', () => {
    expect(sanitizePoint('51.5074', '-0.1278')).toEqual({ latitude: 51.5074, longitude: -0.1278 });
    expect(sanitizePoint(91, 0)).toBeNull();
    expect(sanitizePoint(0, 181)).toBeNull();
    expect(sanitizePoint('north', 0)).toBeNull();
  });

  it('builds keyless Open-Meteo requests', () => {
    const geo = new URL(geocodeUrl('New York'));
    expect(geo.origin).toBe('https://geocoding-api.open-meteo.com');
    expect(geo.searchParams.get('name')).toBe('New York');
    expect(geo.searchParams.get('count')).toBe('1');

    const forecast = new URL(forecastUrl(51.5, -0.12, 'f'));
    expect(forecast.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(forecast.searchParams.get('wind_speed_unit')).toBe('mph');
    expect(forecast.searchParams.get('current')).toContain('weather_code');
  });

  it('parses a geocode result and treats an empty list as not found', () => {
    expect(
      parseGeocode({
        results: [
          { name: 'London', country: 'United Kingdom', latitude: 51.5, longitude: -0.12, timezone: 'Europe/London' },
        ],
      }),
    ).toEqual({
      name: 'London',
      country: 'United Kingdom',
      latitude: 51.5,
      longitude: -0.12,
      timezone: 'Europe/London',
    });
    expect(parseGeocode({ results: [] })).toBeNull();
    expect(parseGeocode({})).toBeNull();
  });

  it('parses current conditions and falls back for optional fields', () => {
    expect(
      parseForecast({
        current: {
          temperature_2m: 12.4,
          apparent_temperature: 10,
          weather_code: 3,
          wind_speed_10m: 14,
          is_day: 1,
          relative_humidity_2m: 71,
        },
      }),
    ).toEqual({ temperature: 12.4, apparent: 10, code: 3, wind: 14, isDay: true, humidity: 71 });

    expect(parseForecast({ current: { temperature_2m: 3, weather_code: 71 } })).toEqual({
      temperature: 3,
      apparent: 3,
      code: 71,
      wind: 0,
      isDay: true,
      humidity: 0,
    });
    expect(parseForecast({ current: { weather_code: 3 } })).toBeNull();
    expect(parseForecast(null)).toBeNull();
  });
});
