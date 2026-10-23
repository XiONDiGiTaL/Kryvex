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
  guide: 'side',
};

describe('home widget order', () => {
  it('keeps a saved order, drops junk and appends anything new', () => {
    expect(normalizeWidgetOrder(['notes', 'notes', 'nope', 'weather'])).toEqual([
      'notes',
      'weather',
      'wellness',
      'guide',
    ]);
    expect(normalizeWidgetOrder(undefined)).toEqual(HOME_WIDGETS);
    expect(normalizeWidgetOrder('notes')).toEqual(HOME_WIDGETS);
  });

  it('reads columns from a file and falls back for anything missing', () => {
    expect(normalizeWidgetAreas({ notes: 'side', guide: 'nowhere' })).toEqual({
      ...areas,
      notes: 'side',
    });
    expect(normalizeWidgetAreas(null)).toEqual(areas);
  });

  it('moves a widget past its neighbour without touching the other column', () => {
    const moved = moveWidgetWithinArea(HOME_WIDGETS, areas, 'main', 'notes', -1);
    expect(moved).toEqual(['weather', 'notes', 'wellness', 'guide']);
    expect(moved.filter(id => areas[id] === 'side')).toEqual(['guide']);
  });

  it('stops at the ends of a column instead of wrapping', () => {
    expect(moveWidgetWithinArea(HOME_WIDGETS, areas, 'side', 'guide', 1)).toEqual(HOME_WIDGETS);
    expect(moveWidgetWithinArea(HOME_WIDGETS, areas, 'main', 'weather', -1)).toEqual(HOME_WIDGETS);
  });

  it('only shows widgets that are enabled, in their own column', () => {
    const home = sanitizeHome({
      showWeather: true,
      showTasks: false,
      showWellness: true,
      showGuide: true,
      widgetOrder: ['wellness', 'weather', 'notes', 'guide'],
      widgetAreas: { weather: 'main', wellness: 'main', notes: 'main', guide: 'side' },
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
    expect(home.widgetOrder).toEqual(HOME_WIDGETS);
    expect(home.widgetAreas.guide).toBe('side');
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
