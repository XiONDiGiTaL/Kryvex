import type { HomeSettings, HomeWidgetArea, HomeWidgetId } from '../types';

/**
 * The Home board is a small widget registry, not a fixed page. Every widget has
 * a stable id, an on/off flag, a column and a position in that column. The
 * helpers here are pure so the rules can be tested without a renderer.
 *
 * The old per-widget booleans (`showWeather`, `showTasks`, ...) remain the
 * source of truth for visibility; `showTasks` is the sticky notes flag and is
 * kept under its historical name so an existing state file keeps working.
 */
export const HOME_WIDGETS: HomeWidgetId[] = [
  'weather',
  'wellness',
  'notes',
  'calculator',
  'guide',
  'currency',
  'capture',
  'countdown',
  'clock',
];

export const HOME_WIDGET_LABELS: Record<HomeWidgetId, string> = {
  weather: 'Weather',
  wellness: 'Wellness',
  notes: 'Sticky notes',
  calculator: 'Calculator',
  currency: 'Currency converter',
  guide: 'Board guide',
  capture: 'Screen capture',
  countdown: 'Countdowns',
  clock: 'World clock',
};

/** Which persisted boolean turns each widget on. */
export type HomeWidgetFlag =
  | 'showWeather'
  | 'showWellness'
  | 'showTasks'
  | 'showCalculator'
  | 'showCurrency'
  | 'showGuide'
  | 'showCapture'
  | 'showCountdown'
  | 'showClock';

export const HOME_WIDGET_FLAGS: Record<HomeWidgetId, HomeWidgetFlag> = {
  weather: 'showWeather',
  wellness: 'showWellness',
  notes: 'showTasks',
  calculator: 'showCalculator',
  currency: 'showCurrency',
  guide: 'showGuide',
  capture: 'showCapture',
  countdown: 'showCountdown',
  clock: 'showClock',
};

/**
 * The narrow column holds the card-sized widgets: the guide, the converter, the
 * calculator, the countdown list and the clock. The main column is for the ones
 * that need width or a list.
 */
export const HOME_WIDGET_DEFAULT_AREAS: Record<HomeWidgetId, HomeWidgetArea> = {
  weather: 'main',
  wellness: 'main',
  notes: 'main',
  calculator: 'side',
  currency: 'side',
  guide: 'side',
  capture: 'main',
  countdown: 'side',
  clock: 'side',
};

export const HOME_WIDGET_DEFAULT_ORDER: HomeWidgetId[] = [...HOME_WIDGETS];

export function isHomeWidgetId(value: unknown): value is HomeWidgetId {
  return typeof value === 'string' && (HOME_WIDGETS as string[]).includes(value);
}

/**
 * A saved order may predate a widget, repeat one, or contain junk. Known ids
 * keep their order once, and anything missing is appended in registry order, so
 * a new widget can never be invisible just because an old file lacks it.
 */
export function normalizeWidgetOrder(raw: unknown): HomeWidgetId[] {
  const order: HomeWidgetId[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (isHomeWidgetId(item) && !order.includes(item)) order.push(item);
    }
  }
  for (const id of HOME_WIDGETS) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

export function normalizeWidgetAreas(raw: unknown): Record<HomeWidgetId, HomeWidgetArea> {
  const areas: Record<HomeWidgetId, HomeWidgetArea> = { ...HOME_WIDGET_DEFAULT_AREAS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return areas;
  const source = raw as Record<string, unknown>;
  for (const id of HOME_WIDGETS) {
    if (source[id] === 'main' || source[id] === 'side') areas[id] = source[id];
  }
  return areas;
}

export function widgetsInArea(
  order: HomeWidgetId[],
  areas: Record<HomeWidgetId, HomeWidgetArea>,
  area: HomeWidgetArea,
): HomeWidgetId[] {
  return normalizeWidgetOrder(order).filter(id => areas[id] === area);
}

/**
 * Moves one widget past its nearest neighbour in the same column. Widgets in
 * the other column keep their exact positions, so reordering the side never
 * shuffles the main stack (or the reverse).
 */
export function moveWidgetWithinArea(
  order: HomeWidgetId[],
  areas: Record<HomeWidgetId, HomeWidgetArea>,
  area: HomeWidgetArea,
  id: HomeWidgetId,
  delta: -1 | 1,
): HomeWidgetId[] {
  const normalized = normalizeWidgetOrder(order);
  const list = normalized.filter(item => areas[item] === area);
  const from = list.indexOf(id);
  if (from < 0) return normalized;
  const to = from + delta;
  if (to < 0 || to >= list.length) return normalized;
  const moved = list.slice();
  const held = moved[from];
  const displaced = moved[to];
  if (held === undefined || displaced === undefined) return normalized;
  moved[from] = displaced;
  moved[to] = held;
  let cursor = 0;
  return normalized.map(item => (areas[item] === area ? moved[cursor++] ?? item : item));
}

export function widgetEnabled(
  home: Pick<HomeSettings, HomeWidgetFlag>,
  id: HomeWidgetId,
): boolean {
  return home[HOME_WIDGET_FLAGS[id]] === true;
}

export function visibleWidgets(
  home: Pick<HomeSettings, HomeWidgetFlag | 'widgetOrder' | 'widgetAreas'>,
  area: HomeWidgetArea,
): HomeWidgetId[] {
  return widgetsInArea(home.widgetOrder, home.widgetAreas, area).filter(id =>
    widgetEnabled(home, id),
  );
}

export function nextWidgetArea(area: HomeWidgetArea): HomeWidgetArea {
  return area === 'main' ? 'side' : 'main';
}
