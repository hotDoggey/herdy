# Herdy — MVP Technical Spec

> Crowdsourced, time-decaying wildlife heatmap app for Fanal Forest, Madeira.  
> Working name: **Herdy** (platform name TBD — candidates: Herdly, Roamr, Drift)

---

## Stack decisions — do not deviate from these

These are fixed decisions. Do not suggest alternatives, do not scaffold anything that contradicts them.

| Concern | Decision |
|---|---|
| App framework | React Native with **Expo managed workflow** |
| Build & submission | **EAS (Expo Application Services)** — `eas build` and `eas submit` |
| Project init | `npx create-expo-app` — **no `ios/` or `android/` folders in the repo** |
| Language | TypeScript throughout |
| Map | `@rnmapbox/maps` (Mapbox SDK for React Native) |
| Backend / database | **Firebase** (Firestore for data, Realtime DB for live pin feed) |
| Push notifications | **Firebase Cloud Messaging (FCM)** via `@react-native-firebase/messaging` |
| Photo storage | **Firebase Storage** |
| Authentication | None at MVP — anonymous pins only |
| OTA updates | Expo Updates (JS-only changes ship without App Store review) |

**Critical note on Expo workflow:** This project uses the **managed workflow**, not bare. There are no native `ios/` or `android/` folders. All native configuration lives in `app.json` / `app.config.js`. EAS handles native builds in the cloud. If a dependency requires native code changes, use an Expo config plugin — do not eject to bare workflow. There is an ios folder but this is only for testing and is not tracked so do not deviate from the workflow outlined.

---

## What this app does

Visitors to Fanal Forest, Madeira drop a one-tap pin when they spot the wild cows that roam the plateau. Those pins aggregate into a weather-pressure-style heatmap "cloud" on the map showing where the herd most likely is *right now*. Pins decay in weight over ~2 hours, so the cloud naturally drifts as the herd moves. Other users nearby get a push notification when a pin is dropped close to them.

The problem it solves: the forest is frequently covered in dense fog, visibility is low, and the cows are hard to find. There is no existing tool that tells a visitor where the herd was spotted in the last hour.

---

## How the app is distributed

This is a **native mobile app** published to the Apple App Store and Google Play Store. It is not a website or PWA.

- Users download it once from their app store — there is no web server serving the frontend
- The only thing that needs to be hosted and "up" is the Firebase backend
- App updates for JS changes go out via **Expo OTA updates** (silent, no App Store review)
- App updates that change native dependencies require a new **EAS build + App Store submission**
- CI/CD equivalent: `eas build --platform all` then `eas submit` — run this when releasing a new native version

---

## Core user flow

1. User arrives at Fanal, opens app
2. Sees the live fog-cloud heatmap of recent sightings overlaid on the designated PR29 trail map
3. Walks toward the densest zone of the cloud (staying on the designated path)
4. Receives proximity notification: *"Cows spotted ~300m ahead on the path"*
5. Spots the herd → taps once to drop a pin → optionally adds photo or herd size estimate → done in ~5 seconds
6. Pin feeds back into the heatmap; nearby users get notified
7. After ~2 hours the pin weight decays to zero and the cloud shifts to reflect newer sightings

---

## MVP feature set

### Must-have (ship these first)

| Feature | Description |
|---|---|
| Drop a sighting pin | One-tap GPS pin with auto-timestamp. No account required. |
| Fog-cloud heatmap | Sighting density rendered as a heatmap blob on the map. Intensity = recency × count. |
| Pin decay engine | Pin weight = `1 - (age_minutes / 240)`. Zero weight = removed from display. Client-computed. |
| Proximity notification | Push alert when user is within ~500m of an active sighting cluster. |
| Offline map layer | PR29 trail GeoJSON cached locally on first launch (WiFi). Signal is unreliable in fog. |
| Optional photo attachment | Quick photo on a pin, shown as thumbnail on map. |
| Location browser | A browsable list of supported locations (launch with Fanal Forest only). Other slots show "Coming soon". Tapping a location opens its heatmap. Gives the impression of a multi-location platform at launch without requiring the backend work for unlaunched locations. Richmond Park (London, deer) is the next planned location after Fanal. |

### Should-have (V2, post-launch)

| Feature | Description |
|---|---|
| Herd size estimate | Tag: 1–5 / 5–10 / 10+ cows. Feeds into cloud intensity weighting. |
| Time-of-day activity chart | Historical view of when sightings peak. Helps visitors plan. |
| Live direction indicator | Compass arrow pointing toward centroid of active sighting cluster. |
| Pin confirmation | Other users can tap "still here" to boost a pin's weight. Unconfirmed pins after 30 min shown with lower opacity + question mark. |

### Nice-to-have (V3 / future)

| Feature | Description |
|---|---|
| Sighting streak gamification | Badge for daily sightings logged; "first sighting today" recognition. |
| IFCN data export | Anonymised aggregate heatmap data shared with Madeira's nature conservation body. |

---

## Technical architecture

### Full stack overview

```
App:        React Native — Expo managed workflow
Build:      EAS (Expo Application Services) — cloud builds, no local Xcode/Android Studio needed
Map:        @rnmapbox/maps — heatmap layer, offline tile regions, trail GeoJSON overlay
Database:   Firebase Firestore — sightings collection, real-time listeners
Push:       Firebase Cloud Messaging (FCM) — proximity alerts
Storage:    Firebase Storage — pin photo uploads
OTA:        Expo Updates — silent JS-only updates between App Store releases
```

---

### Firebase data structure (Firestore)

```
/sightings/{sightingId}
  lat:          number        // GPS latitude
  lng:          number        // GPS longitude
  createdAt:    timestamp     // Firestore server timestamp
  herdSize:     string?       // '1-5' | '5-10' | '10+' | null
  photoUrl:     string?       // Firebase Storage download URL | null
  confirmed:    number        // count of "still here" taps (default 0)
```

No weight field stored in the database — weight is always computed client-side on read (see pin decay below). Only fetch sightings where `createdAt > now - 4 hours` to keep the query light.

```typescript
// Firestore query — active sightings only
const cutoff = Timestamp.fromDate(new Date(Date.now() - 4 * 60 * 60 * 1000));

const q = query(
  collection(db, 'sightings'),
  where('createdAt', '>', cutoff),
  orderBy('createdAt', 'desc')
);
```

---

### Pin decay — client-computed

Weight is calculated in the app each time sightings are rendered. No cloud function or cron job needed at MVP.

```typescript
function pinWeight(createdAt: Date): number {
  const ageMinutes = (Date.now() - createdAt.getTime()) / 60000;
  return Math.max(0, 1 - ageMinutes / 240); // decays to 0 over 4 hours
}

// Convert Firestore sightings to GeoJSON for Mapbox heatmap layer
function sightingsToGeoJSON(sightings: Sighting[]) {
  return {
    type: 'FeatureCollection',
    features: sightings.map(s => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: {
        weight: pinWeight(s.createdAt.toDate()),
        confirmed: s.confirmed,
      }
    })).filter(f => f.properties.weight > 0) // drop fully decayed pins
  };
}
```

---

### Real-time heatmap updates

Use a Firestore `onSnapshot` listener. Every time a new pin is dropped anywhere, all active users' maps update automatically.

```typescript
// In your map screen — live listener
useEffect(() => {
  const cutoff = Timestamp.fromDate(new Date(Date.now() - 4 * 60 * 60 * 1000));
  const q = query(
    collection(db, 'sightings'),
    where('createdAt', '>', cutoff)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const sightings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setGeoJSON(sightingsToGeoJSON(sightings));
  });

  return unsubscribe; // cleanup on unmount
}, []);
```

---

### Heatmap rendering (Mapbox)

```typescript
const heatmapLayer = {
  id: 'cow-heatmap',
  type: 'heatmap',
  paint: {
    'heatmap-weight': ['get', 'weight'],
    'heatmap-intensity': 1.5,
    'heatmap-radius': 60,
    // Colour ramp: transparent → teal → white (fog aesthetic)
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0,   'rgba(0,0,0,0)',
      0.2, 'rgba(100,200,180,0.3)',
      0.5, 'rgba(60,160,140,0.6)',
      0.8, 'rgba(30,130,110,0.8)',
      1,   'rgba(255,255,255,0.9)'
    ],
    'heatmap-opacity': 0.85,
  }
};
```

---

### Push notifications — proximity trigger

```typescript
async function checkProximity(userLat: number, userLng: number) {
  const sightings = await getActiveSightings();
  if (sightings.length === 0) return;

  const centroid = computeWeightedCentroid(sightings);
  const dist = haversineDistance(userLat, userLng, centroid.lat, centroid.lng);

  if (dist < 500 && !notifiedRecently()) {
    await sendLocalNotification({
      title: 'Cows spotted nearby',
      body: `Sighting ${Math.round(dist)}m ahead. Stay on the path · Keep voices low.`,
    });
    setLastNotified(Date.now());
  }
}
```

FCM is used for remote push (when the app is backgrounded). `expo-notifications` handles both local and remote notifications and wraps FCM on Android / APNs on iOS.

---

### Offline map

```typescript
// Cache the Fanal trail region on first launch
await MapboxGL.offlineManager.createPack(
  {
    name: 'fanal-forest',
    styleURL: MapboxGL.StyleURL.Outdoors,
    minZoom: 12,
    maxZoom: 17,
    bounds: [
      [-17.1850, 32.7600],  // SW corner of Fanal plateau
      [-17.1200, 32.7950],  // NE corner
    ],
  },
  (offlineRegion, status) => console.log('Download progress:', status.percentage)
);
```

The PR29 trail GeoJSON should be bundled as a local asset (`assets/fanal-pr29.geojson`) rather than fetched from a URL — so it renders immediately on first launch before any download completes.

---

## Project structure

```
/app                    # Expo Router screens
  (tabs)/
    index.tsx           # Map screen (main)
    feed.tsx            # Sightings feed
  onboarding.tsx
  _layout.tsx
/components
  HeatmapLayer.tsx
  PinDropSheet.tsx      # Bottom sheet for dropping a pin
  ProximityBanner.tsx   # "Stay on path" banner shown with alerts
/hooks
  useSightings.ts       # Firestore onSnapshot listener
  useLocation.ts        # expo-location wrapper
  useProximity.ts       # distance checks + notification trigger
/lib
  firebase.ts           # Firebase app init
  firestore.ts          # Sightings read/write helpers
  mapbox.ts             # GeoJSON conversion, heatmap config
  geo.ts                # haversine distance, centroid calculation
/constants
  fanal.ts              # bounds, trail GeoJSON path, decay config
/assets
  fanal-pr29.geojson    # Bundled trail geometry — available offline immediately
```

---

## Responsible design requirements

Non-negotiable — Fanal is a UNESCO World Heritage Site under active conservation management by IFCN since January 2026:

- **Path-constrained map only** — base map shows the PR29 designated trail. Do not render the open plateau as navigable. Users must never be encouraged to leave the path.
- **Blurred pin precision** — display the heatmap blob with intentional radius (~80–120m blur). Do not render a precise GPS dot for individual sightings.
- **Responsible viewing prompt** — when a proximity notification fires, show a small persistent banner: *"Stay on the path · Keep voices low · Give the herd space."* Not a blocking popup.
- **Onboarding (3 screens)** — what the app does / why Fanal has new rules (overtourism, root damage) / how to drop a pin responsibly.
- **No live location sharing** — user GPS position is never written to the database. Only anonymised pin drops.

---

## Map bounds & trail data

```
Centre point:   32.775°N, 17.155°W
Bounding box:   SW 32.760°N 17.185°W  →  NE 32.795°N 17.120°W
Elevation:      ~1,000–1,100m above sea level
Trail:          PR29 — circular route, ~4km, hours 08:00–17:00 (last entry 15:00)
Daily cap:      3,000 visitors (active since Jan 2026)
Authority:      IFCN — Instituto das Florestas e Conservação da Natureza
```

Source the PR29 GeoJSON from OpenStreetMap export or request from IFCN. Bundle it as `assets/fanal-pr29.geojson`.

---

## MVP screens (minimum)

| Screen | Purpose |
|---|---|
| Map (main) | Full-screen Mapbox map with heatmap layer + PR29 trail overlay + "Drop pin" FAB |
| Pin drop sheet | Bottom sheet: confirm location, select herd size, attach photo (optional), submit to Firestore |
| Sightings feed | Reverse-chron list of recent pins with time, distance, photo thumbnail |
| Location browser | Scrollable list/grid of locations. Active: Fanal Forest. Others: placeholder cards with "Coming soon" badge. Tapping Fanal opens the map. |
| Onboarding (3 slides) | What the app does · Responsible viewing · How to drop a pin |
| Notification permission prompt | Standard OS prompt, triggered at end of onboarding |

No login required for MVP. Anonymous pins only. Add optional accounts in V2 for streaks and history.

---

## Environment variables

```env
EXPO_PUBLIC_MAPBOX_TOKEN=           # Mapbox public access token (safe to bundle in app)

FIREBASE_API_KEY=                   # From Firebase project settings
FIREBASE_AUTH_DOMAIN=               # your-project.firebaseapp.com
FIREBASE_PROJECT_ID=                # your-project-id
FIREBASE_STORAGE_BUCKET=            # your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=

EXPO_PUBLIC_APP_NAME=Herdy
EXPO_PUBLIC_FANAL_BOUNDS_SW=32.760,-17.185
EXPO_PUBLIC_FANAL_BOUNDS_NE=32.795,-17.120
```

Note: variables prefixed `EXPO_PUBLIC_` are bundled into the app and visible to users. Firebase config values are designed to be public-facing — they are not secrets. Restrict database access via Firebase Security Rules, not by hiding the config.

---

## What to build first (suggested order)

1. Map screen with static hardcoded heatmap — validate the fog-cloud visual looks right before any backend work
2. Firebase init + Firestore write — pin drop flow, GPS capture, bottom sheet, write to `sightings` collection
3. Live heatmap — Firestore `onSnapshot` listener feeding Mapbox layer, client-computed decay
4. Offline trail layer — bundle `fanal-pr29.geojson`, verify it renders with airplane mode on
5. Push notifications — FCM setup via `@react-native-firebase/messaging`, proximity check on location update
6. Onboarding slides + responsible viewing banner
7. Sightings feed screen
8. Photo attachment — Firebase Storage upload on pin drop

---

## Monetisation (do not implement at MVP)

Do not wire up any ad SDKs or payment flows. The initial version is 100% free. Hooks to add later:

- Donation link (Ko-fi / Buy Me a Coffee) — a single URL, no SDK
- Sponsorship banner slot in the sightings feed only (never on the map)
- Freemium gate on historical heatmap replay (V2)

---

## Competitors for reference

| App | What to borrow |
|---|---|
| Latest Sightings | Sighting feed UI, notification copy style. Avoid their intrusive ad placement. |
| Waze | Pin decay logic, "still here" confirmation mechanic, proximity alert UX |
| eBird | Time-of-day activity patterns (V2), hotspot map UI |
| iNaturalist | Onboarding tone, conservation messaging, contribution framing |

---