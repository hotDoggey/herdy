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
      { lat: 32.81330549877363,  lng: -17.139309950327657 },
      { lat: 32.81795580431037,  lng: -17.144777562750278 },
      { lat: 32.81622113927993,  lng: -17.152149285002196 },
      { lat: 32.811052344728594, lng: -17.15324451230856  },
      { lat: 32.80521055070167,  lng: -17.147599930741336 },
      { lat: 32.79805823903311,  lng: -17.144230000568626 },
      { lat: 32.792746744225155, lng: -17.144440621204097 },
      { lat: 32.78718703985173,  lng: -17.142208042464972 },
      { lat: 32.7850976343543,   lng: -17.137405891968598 },
      { lat: 32.78796612764428,  lng: -17.130708155751222 },
      { lat: 32.79205713325459,  lng: -17.1268748605967   },
      { lat: 32.79565815877072,  lng: -17.12760882551703  },
      { lat: 32.79879726986232,  lng: -17.123998904032845 },
      { lat: 32.801517743161526, lng: -17.127318372064366 },
      { lat: 32.80524953905352,  lng: -17.128314212473867 },
      { lat: 32.80685381436817,  lng: -17.123749943930676 },
      { lat: 32.80866730811796,  lng: -17.122588130119226 },
      { lat: 32.81103874411056,  lng: -17.125202211193937 },
      { lat: 32.81354960736547,  lng: -17.125907598150775 },
      { lat: 32.81463065164009,  lng: -17.13034738664328  },
      { lat: 32.81323575333833,  lng: -17.13495314853614  },
    ],
    offlineTileBounds: {
      sw: [-17.185, 32.760],
      ne: [-17.120, 32.830],
    },
    mapZoom: { min: 12, max: 17 },
    trailName: 'PR13',
    openingHours: { open: '08:00', close: '17:00', lastEntry: '15:00' },
    dailyCap: 3000,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    imageAsset: require('../assets/select_location_fanal_forest_tree_with_cow_3.png'),
  },
  {
    id: 'home-test',
    name: 'Home',
    description: 'Test location for development.',
    status: 'active',
    animal: 'test',
    timezone: 'Europe/London',
    center: { lat: 51.52267672170919, lng: -0.15894695005363246 },
    perimeterPolygon: [
      { lat: 51.53048486688223,  lng: -0.16849288969694953 },
      { lat: 51.52563812991548,  lng: -0.17873089695081035 },
      { lat: 51.51946100944468,  lng: -0.17886878257070293 },
      { lat: 51.51615762204031,  lng: -0.16770004738447142 },
      { lat: 51.51765919147081,  lng: -0.1541183138577651  },
      { lat: 51.51618315973994,  lng: -0.13811388827676296 },
      { lat: 51.52023728132204,  lng: -0.13349472002030893 },
      { lat: 51.52532051111379,  lng: -0.1351148760510057  },
      { lat: 51.52551353397371,  lng: -0.1448358122307809  },
      { lat: 51.53619317373847,  lng: -0.146904307541746   },
      { lat: 51.53795137626233,  lng: -0.153109160421792   },
      { lat: 51.54247521299956,  lng: -0.161485706479624   },
      { lat: 51.53966662403576,  lng: -0.16913835836609792 },
    ],
    offlineTileBounds: {
      sw: [-0.185, 51.513],
      ne: [-0.130, 51.546],
    },
    mapZoom: { min: 12, max: 17 },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    imageAsset: require('../assets/select_location_home4testing.jpeg'),
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
