export type LocationStatus = 'active' | 'coming-soon' | 'inactive';

export interface AppLocation {
  id: string;
  name: string;
  description: string;
  status: LocationStatus;
  animal: string;
  timezone: string;
  center: { lat: number; lng: number };
  // Perimeter polygon — ordered vertices, last connects to first.
  // Used for out-of-bounds pin validation on the client.
  perimeterPolygon: { lat: number; lng: number }[];
  offlineTileBounds: {
    sw: [number, number]; // [lng, lat] — Mapbox convention
    ne: [number, number];
  };
  mapZoom: { min: number; max: number };
  trailName?: string;
  openingHours?: { open: string; close: string; lastEntry: string };
  dailyCap?: number;
  imageAsset: number; // local asset resolved by Metro bundler
}

export const LOCATIONS: AppLocation[] = [
  {
    id: 'fanal',
    name: 'Fanal Forest',
    description:
      'Ancient laurel forest in Madeira, home to a semi-wild herd of cattle roaming the foggy plateau.',
    status: 'active',
    animal: 'cattle',
    timezone: 'Atlantic/Madeira',
    center: { lat: 32.81111, lng: -17.14262 },
    perimeterPolygon: [
      { lat: 32.795, lng: -17.185 },
      { lat: 32.830, lng: -17.185 },
      { lat: 32.830, lng: -17.120 },
      { lat: 32.795, lng: -17.120 },
    ],
    offlineTileBounds: {
      sw: [-17.185, 32.760],
      ne: [-17.120, 32.830],
    },
    mapZoom: { min: 12, max: 17 },
    trailName: 'PR29',
    openingHours: { open: '08:00', close: '17:00', lastEntry: '15:00' },
    dailyCap: 3000,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    imageAsset: require('../assets/select_location_fanal_forest_tree_with_cow_3.png'),
  },
  {
    id: 'richmond-park',
    name: 'Richmond Park',
    description:
      'Royal Park in London, home to over 600 red and fallow deer roaming freely across 2,500 acres.',
    status: 'coming-soon',
    animal: 'deer',
    timezone: 'Europe/London',
    center: { lat: 51.4412, lng: -0.2761 },
    perimeterPolygon: [
      { lat: 51.4180, lng: -0.3061 },
      { lat: 51.4665, lng: -0.3061 },
      { lat: 51.4665, lng: -0.2261 },
      { lat: 51.4180, lng: -0.2261 },
    ],
    offlineTileBounds: {
      sw: [-0.3061, 51.4180],
      ne: [-0.2261, 51.4665],
    },
    mapZoom: { min: 12, max: 17 },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    imageAsset: require('../assets/select_location_richmond_park_deer_looking_into_camera.jpeg'),
  },
  {
    id: 'mystical-location',
    name: 'Mystical New Location',
    description: 'Something wild is coming. Stay tuned.',
    status: 'inactive',
    animal: 'unknown',
    timezone: 'UTC',
    center: { lat: 0, lng: 0 },
    perimeterPolygon: [],
    offlineTileBounds: { sw: [0, 0], ne: [0, 0] },
    mapZoom: { min: 12, max: 17 },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    imageAsset: require('../assets/select_location_grey_placeholder.png'),
  },
];

export const ACTIVE_LOCATION = LOCATIONS.find((l) => l.status === 'active')!;

// Pin weight decays to zero after this many minutes (4-hour window)
export const DECAY_WINDOW_MINUTES = 240;
