/**
 * Deterministic workspace tools for Vexium.
 *
 * A small local model cannot do arithmetic, unit conversion, great-circle
 * distance or date maths reliably, and asking it to try is how it ends up
 * inventing city pairs. These tools answer those questions from data Kryvex
 * owns, and the answer is handed to the model as ground truth (or shown
 * directly when no model is running).
 *
 * Everything here is pure: a question and a clock go in, one sentence comes
 * out. Nothing matches unless the whole shape of the question is understood,
 * so the model is never given a fact it did not ask for.
 */

export interface ToolAnswer {
  id: 'distance' | 'units' | 'arithmetic' | 'datetime';
  /** One short sentence, safe to show and to give the model as fact. */
  sentence: string;
}

/** Numbers are shown with separators and without float noise. */
export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return 'n/a';
  const rounded = Number(value.toPrecision(12));
  const fixed = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits);
  const [whole = '', fraction] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmed = fraction?.replace(/0+$/, '') ?? '';
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

/* ------------------------------------------------------------------ places */

/** Approximate centres: good for a regional distance, never for navigation. */
const PLACES: Record<string, [number, number]> = {
  afghanistan: [33.94, 67.71], albania: [41.15, 20.17], algeria: [28.03, 1.66],
  angola: [-11.2, 17.87], argentina: [-38.42, -63.62], armenia: [40.07, 45.04],
  australia: [-25.27, 133.78], austria: [47.52, 14.55], azerbaijan: [40.14, 47.58],
  bahrain: [25.93, 50.64], bangladesh: [23.68, 90.36], belarus: [53.71, 27.95],
  belgium: [50.5, 4.47], bolivia: [-16.29, -63.59], 'bosnia and herzegovina': [43.92, 17.68],
  botswana: [-22.33, 24.68], brazil: [-14.24, -51.93], bulgaria: [42.73, 25.49],
  cambodia: [12.57, 104.99], cameroon: [7.37, 12.35], canada: [56.13, -106.35],
  chile: [-35.68, -71.54], china: [35.86, 104.2], colombia: [4.57, -74.3],
  'costa rica': [9.75, -83.75], croatia: [45.1, 15.2], cuba: [21.52, -77.78],
  cyprus: [35.13, 33.43], czechia: [49.82, 15.47], 'czech republic': [49.82, 15.47],
  denmark: [56.26, 9.5], 'dominican republic': [18.74, -70.16], ecuador: [-1.83, -78.18],
  egypt: [26.82, 30.8], 'el salvador': [13.79, -88.9], england: [52.36, -1.17],
  estonia: [58.6, 25.01], ethiopia: [9.15, 40.49], finland: [61.92, 25.75],
  france: [46.23, 2.21], georgia: [42.32, 43.36], germany: [51.17, 10.45],
  ghana: [7.95, -1.02], greece: [39.07, 21.82], guatemala: [15.78, -90.23],
  honduras: [15.2, -86.24], hungary: [47.16, 19.5], iceland: [64.96, -19.02],
  india: [20.59, 78.96], indonesia: [-0.79, 113.92], iran: [32.43, 53.69],
  iraq: [33.22, 43.68], ireland: [53.14, -7.69], israel: [31.05, 34.85],
  italy: [41.87, 12.57], jamaica: [18.11, -77.3], japan: [36.2, 138.25],
  jordan: [30.59, 36.24], kazakhstan: [48.02, 66.92], kenya: [-0.02, 37.91],
  kuwait: [29.31, 47.48], latvia: [56.88, 24.6], lebanon: [33.85, 35.86],
  libya: [26.34, 17.23], lithuania: [55.17, 23.88], luxembourg: [49.82, 6.13],
  madagascar: [-18.77, 46.87], malaysia: [4.21, 101.98], malta: [35.94, 14.38],
  mexico: [23.63, -102.55], moldova: [47.41, 28.37], mongolia: [46.86, 103.85],
  morocco: [31.79, -7.09], mozambique: [-18.67, 35.53], myanmar: [21.91, 95.96],
  namibia: [-22.96, 18.49], nepal: [28.39, 84.12], netherlands: [52.13, 5.29],
  'new zealand': [-40.9, 174.89], nicaragua: [12.87, -85.21], nigeria: [9.08, 8.68],
  'north macedonia': [41.61, 21.75], norway: [60.47, 8.47], oman: [21.51, 55.92],
  pakistan: [30.38, 69.35], panama: [8.54, -80.78], paraguay: [-23.44, -58.44],
  peru: [-9.19, -75.02], philippines: [12.88, 121.77], poland: [51.92, 19.15],
  portugal: [39.4, -8.22], qatar: [25.35, 51.18], romania: [45.94, 24.97],
  russia: [61.52, 105.32], rwanda: [-1.94, 29.87], 'saudi arabia': [23.89, 45.08],
  scotland: [56.49, -4.2], senegal: [14.5, -14.45], serbia: [44.02, 21.01],
  singapore: [1.35, 103.82], slovakia: [48.67, 19.7], slovenia: [46.15, 14.99],
  somalia: [5.15, 46.2], 'south africa': [-30.56, 22.94], 'south korea': [35.91, 127.77],
  spain: [40.46, -3.75], 'sri lanka': [7.87, 80.77], sudan: [12.86, 30.22],
  sweden: [60.13, 18.64], switzerland: [46.82, 8.23], syria: [34.8, 38.99],
  taiwan: [23.7, 120.96], tanzania: [-6.37, 34.89], thailand: [15.87, 100.99],
  tunisia: [33.89, 9.54], turkey: [38.96, 35.24], uganda: [1.37, 32.29],
  ukraine: [48.38, 31.17], 'united arab emirates': [23.42, 53.85],
  'united kingdom': [55.38, -3.44], 'united states': [37.09, -95.71],
  uruguay: [-32.52, -55.77], uzbekistan: [41.38, 64.59], venezuela: [6.42, -66.59],
  vietnam: [14.06, 108.28], wales: [52.13, -3.78], yemen: [15.55, 48.52],
  zambia: [-13.13, 27.85], zimbabwe: [-19.02, 29.15],
  // Countries are often written short, or by their citizen noun.
  usa: [37.09, -95.71], 'u.s.': [37.09, -95.71], 'u.s.a.': [37.09, -95.71],
  america: [37.09, -95.71], uk: [55.38, -3.44], britain: [55.38, -3.44],
  uae: [23.42, 53.85], holland: [52.13, 5.29],
  // Cities, so a question naming a place resolves without its country.
  tampa: [27.95, -82.46], miami: [25.76, -80.19], 'new york': [40.71, -74.01],
  'los angeles': [34.05, -118.24], chicago: [41.88, -87.63], houston: [29.76, -95.37],
  dallas: [32.78, -96.8], seattle: [47.61, -122.33], denver: [39.74, -104.99],
  boston: [42.36, -71.06], atlanta: [33.75, -84.39], 'las vegas': [36.17, -115.14],
  orlando: [28.54, -81.38], phoenix: [33.45, -112.07], detroit: [42.33, -83.05],
  toronto: [43.65, -79.38], vancouver: [49.28, -123.12], montreal: [45.5, -73.57],
  'mexico city': [19.43, -99.13], 'sao paulo': [-23.55, -46.63],
  'rio de janeiro': [-22.91, -43.17], 'buenos aires': [-34.6, -58.38],
  london: [51.51, -0.13], paris: [48.86, 2.35], berlin: [52.52, 13.4],
  madrid: [40.42, -3.7], barcelona: [41.39, 2.17], rome: [41.9, 12.5],
  milan: [45.46, 9.19], amsterdam: [52.37, 4.9], brussels: [50.85, 4.35],
  vienna: [48.21, 16.37], zurich: [47.37, 8.54], geneva: [46.2, 6.14],
  bern: [46.95, 7.45], munich: [48.14, 11.58], hamburg: [53.55, 9.99],
  frankfurt: [50.11, 8.68], lisbon: [38.72, -9.14], dublin: [53.35, -6.26],
  copenhagen: [55.68, 12.57], stockholm: [59.33, 18.07], oslo: [59.91, 10.75],
  helsinki: [60.17, 24.94], warsaw: [52.23, 21.01], prague: [50.08, 14.44],
  budapest: [47.5, 19.04], athens: [37.98, 23.73], istanbul: [41.01, 28.98],
  moscow: [55.76, 37.62], kyiv: [50.45, 30.52], kiev: [50.45, 30.52],
  cairo: [30.04, 31.24], 'cape town': [-33.92, 18.42],
  johannesburg: [-26.2, 28.05], lagos: [6.52, 3.38], nairobi: [-1.29, 36.82],
  dubai: [25.2, 55.27], 'abu dhabi': [24.45, 54.38], doha: [25.29, 51.53],
  riyadh: [24.71, 46.68], tehran: [35.69, 51.39], karachi: [24.86, 67.01],
  delhi: [28.61, 77.21], mumbai: [19.08, 72.88], bangalore: [12.97, 77.59],
  kolkata: [22.57, 88.36], colombo: [6.93, 79.86], dhaka: [23.81, 90.41],
  bangkok: [13.76, 100.5], 'kuala lumpur': [3.14, 101.69], jakarta: [-6.21, 106.85],
  manila: [14.6, 120.98], 'hong kong': [22.32, 114.17], shanghai: [31.23, 121.47],
  beijing: [39.9, 116.41], shenzhen: [22.54, 114.06], taipei: [25.03, 121.57],
  seoul: [37.57, 126.98], tokyo: [35.68, 139.69], osaka: [34.69, 135.5],
  sydney: [-33.87, 151.21], melbourne: [-37.81, 144.96], brisbane: [-27.47, 153.03],
  perth: [-31.95, 115.86], auckland: [-36.85, 174.76], wellington: [-41.29, 174.78],
  honolulu: [21.31, -157.86], anchorage: [61.22, -149.9], reykjavik: [64.15, -21.94],
};

/** A trailing state code, article or preposition is not part of the name. */
function cleanPlaceName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[?!.,;:'"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:the|in|from|to|at|of)\s+/, '')
    .replace(/\s+(?:city|proper)$/, '')
    .trim();
}

/** The longest known name inside the phrase, so "Tampa FL" finds Tampa. */
function findPlace(raw: string): { name: string; at: [number, number] } | null {
  const name = cleanPlaceName(raw);
  if (!name || name.length > 80) return null;
  const exact = PLACES[name];
  if (exact) return { name, at: exact };
  const hit = Object.keys(PLACES)
    .filter(key => key.length >= 3 && new RegExp(`\\b${escapeRegExp(key)}\\b`).test(name))
    .sort((a, b) => b.length - a.length)[0];
  const hitAt = hit ? PLACES[hit] : undefined;
  if (hit && hitAt) return { name: hit, at: hitAt };
  // "Tampa Florida" without a comma still names Tampa; the longest known
  // prefix keeps a state or country suffix out of the lookup.
  const prefix = Object.keys(PLACES)
    .filter(key => key.length >= 4 && name.startsWith(`${key} `))
    .sort((a, b) => b.length - a.length)[0];
  const prefixAt = prefix ? PLACES[prefix] : undefined;
  return prefix && prefixAt ? { name: prefix, at: prefixAt } : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function greatCircleKm(a: [number, number], b: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const [lat1, lon1] = a.map(toRad) as [number, number];
  const [lat2, lon2] = b.map(toRad) as [number, number];
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

const DISTANCE_PATTERNS = [
  /how far (?:is|are)\s+(.+?)\s+from\s+(.+?)$/,
  /what(?:'s| is)? the distance (?:from|between)\s+(.+?)\s+(?:to|and|from)\s+(.+?)$/,
  /distance (?:from|between)\s+(.+?)\s+(?:to|and)\s+(.+?)$/,
  /how many (?:kilometres|kilometers|miles|km|mi) (?:is it )?(?:from|between)\s+(.+?)\s+(?:to|and)\s+(.+?)$/,
];

function distanceTool(question: string): ToolAnswer | null {
  const text = question.replace(/\s+/g, ' ').trim().replace(/[?.!]+$/, '');
  for (const pattern of DISTANCE_PATTERNS) {
    const match = pattern.exec(text.toLowerCase());
    if (!match) continue;
    const [, first, second] = match;
    if (!first || !second) continue;
    const from = findPlace(first);
    const to = findPlace(second);
    if (!from || !to || from.name === to.name) return null;
    const km = greatCircleKm(from.at, to.at);
    return {
      id: 'distance',
      sentence: `${titleCase(from.name)} and ${titleCase(to.name)} are about ${formatNumber(
        km,
        0,
      )} km (${formatNumber(km * 0.621371, 0)} mi) apart as the crow flies, measured between the approximate centres of each place.`,
    };
  }
  return null;
}

/* ------------------------------------------------------------------- units */

type Dimension = 'length' | 'mass' | 'volume' | 'time' | 'data';

const UNITS: Record<string, { dimension: Dimension; factor: number }> = {
  mm: { dimension: 'length', factor: 0.001 },
  millimetre: { dimension: 'length', factor: 0.001 }, millimetres: { dimension: 'length', factor: 0.001 },
  millimeter: { dimension: 'length', factor: 0.001 }, millimeters: { dimension: 'length', factor: 0.001 },
  cm: { dimension: 'length', factor: 0.01 },
  centimetre: { dimension: 'length', factor: 0.01 }, centimetres: { dimension: 'length', factor: 0.01 },
  centimeter: { dimension: 'length', factor: 0.01 }, centimeters: { dimension: 'length', factor: 0.01 },
  m: { dimension: 'length', factor: 1 }, metre: { dimension: 'length', factor: 1 },
  metres: { dimension: 'length', factor: 1 }, meter: { dimension: 'length', factor: 1 },
  meters: { dimension: 'length', factor: 1 },
  km: { dimension: 'length', factor: 1000 }, kilometre: { dimension: 'length', factor: 1000 },
  kilometres: { dimension: 'length', factor: 1000 }, kilometer: { dimension: 'length', factor: 1000 },
  kilometers: { dimension: 'length', factor: 1000 },
  in: { dimension: 'length', factor: 0.0254 }, inch: { dimension: 'length', factor: 0.0254 },
  inches: { dimension: 'length', factor: 0.0254 },
  ft: { dimension: 'length', factor: 0.3048 }, foot: { dimension: 'length', factor: 0.3048 },
  feet: { dimension: 'length', factor: 0.3048 },
  yd: { dimension: 'length', factor: 0.9144 }, yard: { dimension: 'length', factor: 0.9144 },
  yards: { dimension: 'length', factor: 0.9144 },
  mi: { dimension: 'length', factor: 1609.344 }, mile: { dimension: 'length', factor: 1609.344 },
  miles: { dimension: 'length', factor: 1609.344 },
  nmi: { dimension: 'length', factor: 1852 },
  'nautical mile': { dimension: 'length', factor: 1852 },
  'nautical miles': { dimension: 'length', factor: 1852 },
  mg: { dimension: 'mass', factor: 0.000001 }, g: { dimension: 'mass', factor: 0.001 },
  gram: { dimension: 'mass', factor: 0.001 }, grams: { dimension: 'mass', factor: 0.001 },
  kg: { dimension: 'mass', factor: 1 }, kilogram: { dimension: 'mass', factor: 1 },
  kilograms: { dimension: 'mass', factor: 1 },
  t: { dimension: 'mass', factor: 1000 }, tonne: { dimension: 'mass', factor: 1000 },
  tonnes: { dimension: 'mass', factor: 1000 },
  lb: { dimension: 'mass', factor: 0.45359237 }, lbs: { dimension: 'mass', factor: 0.45359237 },
  pound: { dimension: 'mass', factor: 0.45359237 }, pounds: { dimension: 'mass', factor: 0.45359237 },
  oz: { dimension: 'mass', factor: 0.028349523125 },
  ounce: { dimension: 'mass', factor: 0.028349523125 },
  ounces: { dimension: 'mass', factor: 0.028349523125 },
  stone: { dimension: 'mass', factor: 6.35029318 },
  ml: { dimension: 'volume', factor: 0.001 },
  millilitre: { dimension: 'volume', factor: 0.001 }, millilitres: { dimension: 'volume', factor: 0.001 },
  milliliter: { dimension: 'volume', factor: 0.001 }, milliliters: { dimension: 'volume', factor: 0.001 },
  l: { dimension: 'volume', factor: 1 }, litre: { dimension: 'volume', factor: 1 },
  litres: { dimension: 'volume', factor: 1 }, liter: { dimension: 'volume', factor: 1 },
  liters: { dimension: 'volume', factor: 1 },
  gal: { dimension: 'volume', factor: 3.785411784 },
  gallon: { dimension: 'volume', factor: 3.785411784 },
  gallons: { dimension: 'volume', factor: 3.785411784 },
  qt: { dimension: 'volume', factor: 0.946352946 },
  quart: { dimension: 'volume', factor: 0.946352946 },
  quarts: { dimension: 'volume', factor: 0.946352946 },
  pt: { dimension: 'volume', factor: 0.473176473 },
  pint: { dimension: 'volume', factor: 0.473176473 },
  pints: { dimension: 'volume', factor: 0.473176473 },
  cup: { dimension: 'volume', factor: 0.2365882365 },
  cups: { dimension: 'volume', factor: 0.2365882365 },
  s: { dimension: 'time', factor: 1 }, sec: { dimension: 'time', factor: 1 },
  second: { dimension: 'time', factor: 1 }, seconds: { dimension: 'time', factor: 1 },
  min: { dimension: 'time', factor: 60 }, minute: { dimension: 'time', factor: 60 },
  minutes: { dimension: 'time', factor: 60 },
  h: { dimension: 'time', factor: 3600 }, hr: { dimension: 'time', factor: 3600 },
  hour: { dimension: 'time', factor: 3600 }, hours: { dimension: 'time', factor: 3600 },
  day: { dimension: 'time', factor: 86400 }, days: { dimension: 'time', factor: 86400 },
  week: { dimension: 'time', factor: 604800 }, weeks: { dimension: 'time', factor: 604800 },
  byte: { dimension: 'data', factor: 1 }, bytes: { dimension: 'data', factor: 1 },
  kb: { dimension: 'data', factor: 1000 }, mb: { dimension: 'data', factor: 1e6 },
  gb: { dimension: 'data', factor: 1e9 }, tb: { dimension: 'data', factor: 1e12 },
  kib: { dimension: 'data', factor: 1024 }, mib: { dimension: 'data', factor: 1024 ** 2 },
  gib: { dimension: 'data', factor: 1024 ** 3 }, tib: { dimension: 'data', factor: 1024 ** 4 },
};

const CONVERT =
  /^(?:convert\s+|how (?:many|much)\s+is\s+|how (?:many|much)\s+)?(-?\d+(?:[.,]\d+)?)\s*(?:degrees\s+)?([a-z°]+)\s*(?:in|to|into|as|=)\s*(?:degrees\s+)?([a-z°]+)$/i;

function temperatureScale(raw: string): 'c' | 'f' | 'k' | '' {
  if (/^(?:c|celsius|°c|degreesc)$/.test(raw)) return 'c';
  if (/^(?:f|fahrenheit|°f|degreesf)$/.test(raw)) return 'f';
  if (/^(?:k|kelvin)$/.test(raw)) return 'k';
  return '';
}

function unitTool(question: string): ToolAnswer | null {
  const text = question.trim().replace(/[?.!]+$/, '').replace(/\s+/g, ' ');
  const match = CONVERT.exec(text);
  if (!match) return null;
  const [, rawValue, rawFrom, rawTo] = match;
  if (!rawValue || !rawFrom || !rawTo) return null;
  const value = Number(rawValue.replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const from = rawFrom.toLowerCase();
  const to = rawTo.toLowerCase();

  const scaleIn = temperatureScale(from);
  const scaleOut = temperatureScale(to);
  if (scaleIn || scaleOut) {
    if (!scaleIn || !scaleOut) return null;
    const celsius = scaleIn === 'c' ? value : scaleIn === 'f' ? ((value - 32) * 5) / 9 : value - 273.15;
    const out =
      scaleOut === 'c' ? celsius : scaleOut === 'f' ? (celsius * 9) / 5 + 32 : celsius + 273.15;
    return {
      id: 'units',
      sentence: `${formatNumber(value)}°${scaleIn.toUpperCase()} is ${formatNumber(out)}°${scaleOut.toUpperCase()}.`,
    };
  }

  const a = UNITS[from];
  const b = UNITS[to];
  if (!a || !b || a.dimension !== b.dimension) return null;
  const result = (value * a.factor) / b.factor;
  return {
    id: 'units',
    sentence: `${formatNumber(value)} ${from} is ${formatNumber(result)} ${to}.`,
  };
}

/* -------------------------------------------------------------- arithmetic */

/**
 * A small recursive-descent evaluator: no `eval`, no `Function`, no access to
 * anything but numbers. Percent is accepted as "X% of Y", and as a modulo
 * operator between two numbers.
 */
function tokenize(input: string): string[] | null {
  const tokens: string[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input.charAt(index);
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[0-9]/.test(char)) {
      let number = '';
      while (index < input.length && /[0-9]/.test(input.charAt(index))) {
        number += input.charAt(index);
        index += 1;
      }
      if (input.charAt(index) === '.' && /[0-9]/.test(input.charAt(index + 1))) {
        number += input.charAt(index);
        index += 1;
        while (index < input.length && /[0-9]/.test(input.charAt(index))) {
          number += input.charAt(index);
          index += 1;
        }
      }
      tokens.push(number);
      continue;
    }
    if ('+-*/%^()'.includes(char)) {
      tokens.push(char);
      index += 1;
      continue;
    }
    return null;
  }
  return tokens.length ? tokens : null;
}

const FAIL = Symbol('fail');

function evaluate(tokens: string[]): number | null {
  let position = 0;
  const peek = () => tokens[position];
  type Result = number | typeof FAIL;

  function primary(): Result {
    const token = peek();
    if (token === undefined) return FAIL;
    if (token === '(') {
      position += 1;
      const value = expression();
      if (value === FAIL || peek() !== ')') return FAIL;
      position += 1;
      return value;
    }
    if (/^\d/.test(token)) {
      position += 1;
      return Number(token);
    }
    return FAIL;
  }

  function power(): Result {
    const base = primary();
    if (base === FAIL) return FAIL;
    if (peek() === '^') {
      position += 1;
      const exponent = power();
      return exponent === FAIL ? FAIL : base ** exponent;
    }
    return base;
  }

  function unary(): Result {
    const token = peek();
    if (token === '-') {
      position += 1;
      const value = unary();
      return value === FAIL ? FAIL : -value;
    }
    if (token === '+') {
      position += 1;
      return unary();
    }
    return power();
  }

  function term(): Result {
    let value = unary();
    if (value === FAIL) return FAIL;
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const operator = tokens[position++];
      const right = unary();
      if (right === FAIL) return FAIL;
      if (operator === '*') value *= right;
      else if (operator === '/') {
        if (right === 0) return FAIL;
        value /= right;
      } else {
        if (right === 0) return FAIL;
        value %= right;
      }
    }
    return value;
  }

  function expression(): Result {
    let value = term();
    if (value === FAIL) return FAIL;
    while (peek() === '+' || peek() === '-') {
      const operator = tokens[position++];
      const right = term();
      if (right === FAIL) return FAIL;
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  const result = expression();
  if (result === FAIL || position !== tokens.length) return null;
  return Number.isFinite(result) ? result : null;
}

const ARITHMETIC_PREFIX = /^(?:what(?:'s| is)|calculate|compute|evaluate|how much is|how many is|solve)\s+/;

function arithmeticTool(question: string): ToolAnswer | null {
  let text = question.trim().replace(/[?.!]+$/, '').toLowerCase();
  text = text.replace(ARITHMETIC_PREFIX, '').trim();
  const percentOf = /^(\d+(?:\.\d+)?)\s*(?:%|percent)\s+(?:of|off)\s+(\d+(?:\.\d+)?)$/.exec(text);
  const [, percent, base] = percentOf ?? [];
  if (percent && base) {
    const part = (Number(percent) / 100) * Number(base);
    return {
      id: 'arithmetic',
      sentence: `${percent}% of ${base} is ${formatNumber(part)}.`,
    };
  }
  text = text
    .replace(/\bplus\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/\btimes\b|\bmultiplied by\b/g, '*')
    .replace(/\bdivided by\b/g, '/')
    .replace(/\bmod\b|\bmodulo\b/g, '%')
    .replace(/(\d)\s*[x×]\s*(\d)/g, '$1*$2')
    .replace(/\s+/g, '');
  if (!/[+\-*/^%]/.test(text.replace(/^-/, '')) || !/\d/.test(text)) return null;
  const tokens = tokenize(text);
  if (!tokens) return null;
  const value = evaluate(tokens);
  if (value === null) return null;
  return { id: 'arithmetic', sentence: `${text} = ${formatNumber(value, 6)}.` };
}

/* ---------------------------------------------------------------- datetime */

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` or a written month and day, with today's year when omitted. */
function parseDate(text: string, today: Date): Date | null {
  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const written = new RegExp(
    `\\b(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`,
  ).exec(text.toLowerCase());
  if (!written) return null;
  const [, monthName, day, year] = written;
  if (!monthName || !day) return null;
  const date = new Date(
    year ? Number(year) : today.getFullYear(),
    MONTHS.indexOf(monthName),
    Number(day),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayCount(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function datetimeTool(question: string, now: Date): ToolAnswer | null {
  const text = question.trim().toLowerCase().replace(/[?.!]+$/, '').replace(/\s+/g, ' ');

  if (
    /^(?:what(?:'s| is)?(?: the)? (?:time|date)(?: is it| now| today)?|current (?:time|date)|today'?s date|what time is it|what day is it)$/.test(
      text,
    )
  ) {
    const local = now.toLocaleString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return { id: 'datetime', sentence: `It is ${local} local time on this machine.` };
  }

  const span = /\b(?:days|time)\s+between\s+(.+?)\s+and\s+(.+)$/.exec(text);
  const [, spanFrom, spanTo] = span ?? [];
  if (spanFrom && spanTo) {
    const from = parseDate(spanFrom, now);
    const to = parseDate(spanTo, now);
    if (!from || !to) return null;
    const days = dayCount(from, to);
    return {
      id: 'datetime',
      sentence: `${isoDate(from)} to ${isoDate(to)} is ${plural(Math.abs(days), 'day')}${
        days < 0 ? ' (the second date is earlier)' : ''
      }.`,
    };
  }

  const [, untilTarget] = /how many days (?:until|till|to)\s+(.+)$/.exec(text) ?? [];
  if (untilTarget) {
    const target = parseDate(untilTarget, now);
    if (!target) return null;
    const days = dayCount(now, target);
    return {
      id: 'datetime',
      sentence:
        days >= 0
          ? `${plural(days, 'day')} remain between today (${isoDate(now)}) and ${isoDate(target)}.`
          : `${isoDate(target)} was ${plural(Math.abs(days), 'day')} before today (${isoDate(now)}).`,
    };
  }

  const offset = /\b(\d{1,4})\s+(day|week|month|year)s?\s+(from|after|before)\s+(?:today|now)$/.exec(
    text,
  );
  if (offset && /\b(?:what(?:'s| is)?(?: the)? date|what day is it|when is)\b/.test(text)) {
    const amount = Number(offset[1]) * (offset[3] === 'before' ? -1 : 1);
    const result = new Date(now.getTime());
    if (offset[2] === 'day') result.setDate(result.getDate() + amount);
    else if (offset[2] === 'week') result.setDate(result.getDate() + amount * 7);
    else if (offset[2] === 'month') result.setMonth(result.getMonth() + amount);
    else result.setFullYear(result.getFullYear() + amount);
    return { id: 'datetime', sentence: `That date is ${isoDate(result)}.` };
  }

  return null;
}

/**
 * Runs every tool in order and returns the first confident answer. `null`
 * means "no tool recognised this", and the model answers as usual.
 */
export function runWorkspaceTool(question: string, now: Date = new Date()): ToolAnswer | null {
  const text = question.trim();
  if (!text || text.length > 500) return null;
  return (
    distanceTool(text) ??
    unitTool(text) ??
    arithmeticTool(text) ??
    datetimeTool(text, now)
  );
}
