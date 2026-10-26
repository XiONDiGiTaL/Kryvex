import { describe, expect, it } from 'vitest';
import {
  HOME_WIDGETS,
  moveWidgetWithinArea,
  nextWidgetArea,
  normalizeWidgetAreas,
  normalizeWidgetOrder,
  visibleWidgets,
} from '../src/lib/home-widgets';
import { sanitizeHome } from '../src/lib/store';
import type { HomeWidgetArea, HomeWidgetId } from '../src/types';

const areas: Record<HomeWidgetId, HomeWidgetArea> = {
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

describe('home widget order', () => {
  it('keeps a saved order, drops junk and appends anything new', () => {
    expect(normalizeWidgetOrder(['notes', 'notes', 'nope', 'weather'])).toEqual([
      'notes',
      'weather',
      'wellness',
      'calculator',
      'guide',
      'currency',
      'capture',
      'countdown',
      'clock',
    ]);
    expect(normalizeWidgetOrder(undefined)).toEqual(HOME_WIDGETS);
    expect(normalizeWidgetOrder('notes')).toEqual(HOME_WIDGETS);
  });

  it('reads columns from a file and falls back for anything missing', () => {
    expect(normalizeWidgetAreas({ notes: 'side', guide: 'nowhere' })).toEqual({
      ...areas,
      notes: 'side',
    });
    expect(normalizeWidgetAreas({ currency: 'main', calculator: 'side' })).toMatchObject({
      currency: 'main',
      calculator: 'side',
    });
    expect(normalizeWidgetAreas(null)).toEqual(areas);
  });

  it('moves a widget past its neighbour without touching the other column', () => {
    const moved = moveWidgetWithinArea(HOME_WIDGETS, areas, 'main', 'notes', -1);
    expect(moved).toEqual([
      'weather',
      'notes',
      'wellness',
      'calculator',
      'guide',
      'currency',
      'capture',
      'countdown',
      'clock',
    ]);
    expect(moved.filter(id => areas[id] === 'side')).toEqual([
      'calculator',
      'guide',
      'currency',
      'countdown',
      'clock',
    ]);
  });

  it('moves within both columns and stops at either end', () => {
    const swapped: HomeWidgetId[] = [
      'weather',
      'wellness',
      'notes',
      'calculator',
      'currency',
      'guide',
      'capture',
      'countdown',
      'clock',
    ];
    expect(moveWidgetWithinArea(HOME_WIDGETS, areas, 'side', 'guide', 1)).toEqual(swapped);
    expect(moveWidgetWithinArea(swapped, areas, 'side', 'guide', -1)).toEqual(HOME_WIDGETS);
    expect(moveWidgetWithinArea(HOME_WIDGETS, areas, 'main', 'weather', -1)).toEqual(HOME_WIDGETS);
    // The clock is the last widget in the side column now, so it cannot move down.
    expect(moveWidgetWithinArea(HOME_WIDGETS, areas, 'side', 'clock', 1)).toEqual(HOME_WIDGETS);
  });

  it('only shows widgets that are enabled, in their own column', () => {
    const home = sanitizeHome({
      showWeather: true,
      showTasks: false,
      showWellness: true,
      showCalculator: false,
      showCurrency: false,
      showGuide: true,
      widgetOrder: ['wellness', 'weather', 'notes', 'calculator', 'guide', 'currency'],
      widgetAreas: {
        weather: 'main',
        wellness: 'main',
        notes: 'main',
        calculator: 'side',
        currency: 'side',
        guide: 'side',
      },
    });
    expect(visibleWidgets(home, 'main')).toEqual(['wellness', 'weather']);
    expect(visibleWidgets(home, 'side')).toEqual(['guide']);
    expect(nextWidgetArea('main')).toBe('side');
    expect(nextWidgetArea('side')).toBe('main');
  });
});

describe('home defaults', () => {
  it('leaves the optional cards off for a new workspace', () => {
    const home = sanitizeHome(undefined);
    expect(home.showTasks).toBe(false);
    expect(home.showCalculator).toBe(false);
    expect(home.showCapture).toBe(false);
    expect(home.showCountdown).toBe(false);
    expect(home.showClock).toBe(false);
    expect(home.showCurrency).toBe(true);
    expect(home.currencyFrom).toBe('USD');
    expect(home.currencyTo).toBe('EUR');
    expect(home.widgetOrder).toEqual(HOME_WIDGETS);
    // The calculator sits in the side column so it is the width of a card, not
    // of the whole board.
    expect(home.widgetAreas.calculator).toBe('side');
    expect(home.widgetAreas.guide).toBe('side');
    expect(home.widgetAreas.currency).toBe('side');
    expect(home.captures).toEqual([]);
    expect(home.countdowns).toEqual([]);
    expect(home.worldClocks).toEqual([]);
  });

  it('closes a calculator the old default had switched on', () => {
    const home = sanitizeHome({ widgetOrder: HOME_WIDGETS });
    expect(home.showCalculator).toBe(false);
    expect(visibleWidgets(home, 'side')).not.toContain('calculator');
  });

  it('keeps a calculator the user switched on themselves', () => {
    expect(sanitizeHome({ showCalculator: true }).showCalculator).toBe(true);
  });

  it('closes notes once for a file written before the Notes button existed', () => {
    expect(sanitizeHome({ showTasks: true }).showTasks).toBe(false);
  });

  it('keeps a notes choice made after the widget order was saved', () => {
    const home = sanitizeHome({ showTasks: true, widgetOrder: HOME_WIDGETS });
    expect(home.showTasks).toBe(true);
  });

  it('repairs a saved order that predates the widget registry', () => {
    const home = sanitizeHome({ showTasks: true, widgetOrder: ['tasks'] });
    expect(home.widgetOrder).toEqual(HOME_WIDGETS);
    expect(visibleWidgets(home, 'main')).toContain('notes');
  });
});
