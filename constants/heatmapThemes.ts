export type HeatmapThemeId = 'teal' | 'ember' | 'aurora' | 'coral';

export interface HeatmapTheme {
  id: HeatmapThemeId;
  label: string;
  swatchColors: [string, string, string];
  colorRamp: unknown[];
}

const ramp = (stops: [number, string][]): unknown[] => [
  'interpolate', ['linear'], ['heatmap-density'],
  ...stops.flatMap(([stop, color]) => [stop, color]),
];

export const HEATMAP_THEMES: HeatmapTheme[] = [
  {
    id: 'teal',
    label: 'Teal',
    swatchColors: ['rgba(100,200,180,0.8)', 'rgba(40,150,120,1)', 'rgba(255,255,255,1)'],
    colorRamp: ramp([
      [0,   'rgba(0,0,0,0)'],
      [0.2, 'rgba(100,200,180,0.3)'],
      [0.5, 'rgba(60,160,140,0.6)'],
      [0.8, 'rgba(30,130,110,0.8)'],
      [1,   'rgba(255,255,255,0.9)'],
    ]),
  },
  {
    id: 'ember',
    label: 'Ember',
    swatchColors: ['rgba(255,210,80,0.9)', 'rgba(220,80,20,1)', 'rgba(255,255,255,1)'],
    colorRamp: ramp([
      [0,   'rgba(0,0,0,0)'],
      [0.2, 'rgba(255,210,80,0.3)'],
      [0.5, 'rgba(230,100,20,0.6)'],
      [0.8, 'rgba(200,30,20,0.85)'],
      [1,   'rgba(255,255,255,0.9)'],
    ]),
  },
  {
    id: 'aurora',
    label: 'Aurora',
    swatchColors: ['rgba(120,100,220,0.8)', 'rgba(200,40,160,1)', 'rgba(255,190,230,1)'],
    colorRamp: ramp([
      [0,   'rgba(0,0,0,0)'],
      [0.2, 'rgba(120,100,220,0.3)'],
      [0.5, 'rgba(180,50,190,0.6)'],
      [0.8, 'rgba(220,30,140,0.85)'],
      [1,   'rgba(255,190,230,0.9)'],
    ]),
  },
  {
    id: 'coral',
    label: 'Coral',
    swatchColors: ['rgba(60,200,200,0.8)', 'rgba(255,130,60,1)', 'rgba(255,80,110,1)'],
    colorRamp: ramp([
      [0,   'rgba(0,0,0,0)'],
      [0.2, 'rgba(60,200,200,0.3)'],
      [0.5, 'rgba(255,150,60,0.6)'],
      [0.8, 'rgba(250,60,90,0.85)'],
      [1,   'rgba(255,180,200,0.9)'],
    ]),
  },
];

export const DEFAULT_THEME_ID: HeatmapThemeId = 'teal';
export const HEATMAP_THEME_STORAGE_KEY = 'herdy.heatmapTheme';
