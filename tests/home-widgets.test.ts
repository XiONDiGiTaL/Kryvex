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
  calculator: 'main',
  currency: 'side',
  guide: 'side',
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
    expect(moved).toEqual(['weather', 'notes', 'wellness', 'calculator', 'guide', 'currency']);
    expect(moved.filter(id => areas[id] === 'side')).toEqual(['guide', 'currency']);
  });

  it('moves within both columns and stops at either end', () => {
    const swapped: HomeWidgetId[] = [
      'weather',
      'wellness',
      'notes',
      'calculator',
      'currency',
      'guide',
    ];
    expect(moveWidgetWithinArea(HOME_WIDGETS, areas, 'side', 'guide', 1)).toEqual(swapped);
    expect(moveWidgetWithinArea(swapped, areas, 'side', 'guide', -1)).toEqual(HOME_WIDGETS);
    expect(moveWidgetWithinArea(HOME_WIDGETS, areas, 'main', 'weather', -1)).toEqual(HOME_WIDGETS);
    expect(moveWidgetWithinArea(swapped, areas, 'side', 'guide', 1)).toEqual(swapped);
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
        calculator: 'main',
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
  it('leaves sticky notes off for a new workspace', () => {
    const home = sanitizeHome(undefined);
    expect(home.showTasks).toBe(false);
    expect(home.showCalculator).toBe(true);
    expect(home.showCurrency).toBe(true);
    expect(home.currencyFrom).toBe('USD');
    expect(home.currencyTo).toBe('EUR');
    expect(home.widgetOrder).toEqual(HOME_WIDGETS);
    expect(home.widgetAreas.guide).toBe('side');
    expect(home.widgetAreas.currency).toBe('side');
  });

  it('shows the new cards for a saved file written before they existed', () => {
    const home = sanitizeHome({ widgetOrder: ['weather', 'notes', 'wellness', 'guide'] });
    expect(home.showCalculator).toBe(true);
    expect(home.showCurrency).toBe(true);
    expect(visibleWidgets(home, 'main')).toContain('calculator');
    expect(visibleWidgets(home, 'side')).toContain('currency');
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
