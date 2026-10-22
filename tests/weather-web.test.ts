import { afterEach, describe, expect, it, vi } from 'vitest';
import { weatherAtWeb, weatherLookupWeb } from '../src/lib/weather-web';

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('weatherLookupWeb', () => {
  it('geocodes a city and returns its current conditions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          results: [
            {
              name: 'Testville',
              country: 'Testland',
              latitude: 12.34,
              longitude: -56.78,
              timezone: 'Etc/UTC',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          current: {
            temperature_2m: 21.4,
            apparent_temperature: 20.1,
            weather_code: 3,
            wind_speed_10m: 8.2,
            is_day: 1,
            relative_humidity_2m: 54,
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await weatherLookupWeb('  Testville  ', 'c');

    expect(result.ok).toBe(true);
    expect(result.place).toBe('Testville');
    expect(result.country).toBe('Testland');
    expect(result.current).toMatchObject({
      temperature: 21.4,
      apparent: 20.1,
      code: 3,
      wind: 8.2,
      humidity: 54,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('geocoding-api.open-meteo.com');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('api.open-meteo.com');
  });

  it('rejects an empty city without a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await weatherLookupWeb('  ', 'c');

    expect(result).toEqual({ ok: false, error: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an unknown place instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ results: [] })));

    const result = await weatherLookupWeb('Nowhere At All', 'f');

    expect(result).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('weatherAtWeb', () => {
  it('returns offline when the forecast request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network')));

    const result = await weatherAtWeb(48.8566, 2.3522, 'c');

    expect(result).toEqual({ ok: false, error: 'offline' });
  });

  it('rejects an out-of-range point before fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await weatherAtWeb(200, 0, 'c');

    expect(result).toEqual({ ok: false, error: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
