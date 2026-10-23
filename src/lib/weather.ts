export type WeatherKind =
  | 'clear'
  | 'partly'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm';

/** WMO weather codes, as used by Open-Meteo's current conditions. */
export function weatherKind(code: number): WeatherKind {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
}

export function weatherLabel(code: number): string {
  const kind = weatherKind(code);
  switch (kind) {
    case 'clear':
      return 'Clear sky';
    case 'partly':
      return 'Partly cloudy';
    case 'cloud':
      return 'Overcast';
    case 'fog':
      return 'Fog';
    case 'drizzle':
      return 'Drizzle';
    case 'rain':
      return 'Rain';
    case 'snow':
      return 'Snow';
    default:
      return 'Thunderstorm';
  }
}

export function formatTemperature(value: number, unit: 'c' | 'f'): string {
  if (!Number.isFinite(value)) return 'n/a';
  return `${Math.round(value)}°${unit === 'f' ? 'F' : 'C'}`;
}

export function windLabel(value: number, unit: 'c' | 'f'): string {
  if (!Number.isFinite(value)) return 'n/a';
  return `${Math.round(value)} ${unit === 'f' ? 'mph' : 'km/h'}`;
}
