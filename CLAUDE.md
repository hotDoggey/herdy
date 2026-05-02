# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Spec

The full product and technical spec lives in [`herdy-mvp.md`](herdy-mvp.md). Read it before writing any code. The decisions below are extracted from it as hard constraints — but the spec is the authoritative source of truth for feature scope, data models, and UI requirements.

---

## Non-negotiable stack constraints

These decisions are fixed. Do not suggest alternatives.

| Concern | Decision |
|---|---|
| App framework | React Native — **Expo managed workflow** |
| Build & distribution | **EAS** (`eas build`, `eas submit`) — no local Xcode/Android Studio builds |
| Project structure | **No `ios/` or `android/` folders committed** — all native config in `app.json` / `app.config.js` |
| Language | TypeScript throughout — all screens and modules are `.tsx`/`.ts` |
| Map | `@rnmapbox/maps` — heatmap layer, offline tile packs, trail GeoJSON overlay |
| Database | Firebase Firestore — `sightings` collection, real-time `onSnapshot` listener |
| Push | Firebase Cloud Messaging via `@react-native-firebase/messaging` |
| Photo storage | Firebase Storage |
| Auth | **None** — no login screen, no user accounts at MVP. Anonymous pins only. |
| OTA updates | Expo Updates (JS-only deploys, no App Store review) |

If a dependency requires native code changes, use an Expo config plugin — do not eject to bare workflow.

---

## Development commands

```bash
# Daily dev — start Metro bundler, open app on device to connect
npm start

# Rebuild native shell — required after adding any new native module
npx expo run:ios --device

# Build a native binary via EAS (cloud build — requires eas-cli and login)
eas build --platform ios
eas build --platform all

# Submit to app stores after a successful EAS build
eas submit --platform ios
```

There is no test runner or linter configured yet. When adding them, use Jest + `@testing-library/react-native` and ESLint with the Expo config (`eslint-config-expo`).

---

## Local device testing (iOS)

The project uses `npx expo run:ios --device` for local testing on a physical iPhone. This generates a local `ios/` folder via `expo prebuild` — **this folder is gitignored and must not be committed**. It is a build artifact, not part of the project source.

The normal daily loop once the native shell is installed:
1. `npm start` — starts Metro
2. Open the installed app on the iPhone — it connects to Metro automatically
3. JS/TS changes hot-reload instantly; no rebuild needed

Only re-run `npx expo run:ios --device` when a new native module is added. If the build fails with Swift concurrency errors, see `plugins/withSwiftConcurrencyFix.js` — this sets `SWIFT_VERSION=5` and `SWIFT_STRICT_CONCURRENCY=minimal` for all pods to work around an Xcode 16 / Swift 6 incompatibility in some Expo SDK pods.

---

## Deferred tasks (before shipping)

- **Mapbox secret token** — currently hardcoded in `app.json` under `plugins[@rnmapbox/maps].RNMapboxMapsDownloadToken`. This is the build-time secret token (not the public token). Move it to an environment variable (`RNMAPBOX_MAPS_DOWNLOAD_TOKEN`) in `.env` and remove it from `app.json` before the first public commit or EAS cloud build. The `ios/` folder is gitignored so it hasn't leaked yet, but `app.json` is tracked.

---

## Target project structure

The target structure (from the spec) is:

```
/app                        # Expo Router screens
  (tabs)/
    index.tsx               # Map screen — full-screen Mapbox map, heatmap, FAB
    feed.tsx                # Sightings feed — reverse-chron list
  onboarding.tsx
  _layout.tsx
/components
  HeatmapLayer.tsx
  PinDropSheet.tsx          # Bottom sheet for confirming & submitting a pin
  ProximityBanner.tsx       # Persistent "Stay on path" strip (non-blocking)
/hooks
  useSightings.ts           # Firestore onSnapshot + client-side decay filter
  useLocation.ts            # expo-location wrapper
  useProximity.ts           # Distance check → local notification trigger
/lib
  firebase.ts               # Firebase app initialisation
  firestore.ts              # Sightings read/write helpers
  mapbox.ts                 # GeoJSON conversion, heatmap layer style
  geo.ts                    # haversineDistance(), computeWeightedCentroid()
/constants
  fanal.ts                  # Bounding box, trail centre, decay window (240 min)
/assets
  fanal-pr29.geojson        # Bundled PR29 trail — must render offline immediately
```

---

## Architecture notes

### Pin weight is always client-computed

Weight is never stored in Firestore. Compute it on every snapshot read:

```typescript
// lib/decay.ts
function pinWeight(createdAt: Date): number {
  const ageMinutes = (Date.now() - createdAt.getTime()) / 60000;
  return Math.max(0, 1 - ageMinutes / 240); // 0 → 1, decays to 0 at 4 hours
}
```

Filter `weight === 0` before passing pins to the Mapbox source. Also run a 5-minute local interval to re-filter in-memory pins so the heatmap fades even without a new Firestore event.

### Firestore query — active sightings only

```typescript
const cutoff = Timestamp.fromDate(new Date(Date.now() - 4 * 60 * 60 * 1000));
const q = query(collection(db, 'sightings'), where('createdAt', '>', cutoff));
```

Requires a Firestore composite index on `createdAt` ascending. Firebase will prompt you to create it on first run in dev.

### Heatmap drives from GeoJSON FeatureCollection

The `onSnapshot` callback converts sightings → GeoJSON and updates the Mapbox `ShapeSource`. The `weight` property drives `heatmap-weight` in the layer style. See spec for the exact colour ramp (teal → white, fog aesthetic).

### Proximity notifications use a weighted centroid

Compute the centroid of all active pins weighted by `pinWeight`. If the user is within 500m and no notification fired in the last 10 minutes, trigger a local notification. The responsible viewing copy is mandatory — see below.

### Offline trail

Bundle `assets/fanal-pr29.geojson` as a local asset so the PR29 trail renders immediately on first launch. Mapbox offline tile packs (zoom 12–17, Fanal bounding box) should be downloaded on first launch over WiFi.

---

## Responsible design — non-negotiable

Fanal is a UNESCO World Heritage Site under IFCN management since January 2026.

- **No precise pin dots** — render the heatmap blob only (80–120m intentional blur). Never show an exact GPS marker for a sighting.
- **Path-constrained map** — the base map must show PR29 as the only navigable route. Do not present the open plateau as walkable.
- **Proximity notification copy** — must always append: *"Stay on the path · Keep voices low · Give the herd space."* In-app `ProximityBanner` only — not a blocking modal.
- **No user location in database** — GPS coordinates are never written to Firestore. Only anonymised pin drops.
- **Onboarding (3 screens)** — what the app does / Fanal's new rules (overtourism, root damage) / how to drop a pin. Show once on first launch, gated by an `AsyncStorage` flag.

---

## Build order (from spec)

1. Map screen with hardcoded mock pins — validate fog-cloud visual
2. Firebase init + Firestore write (pin drop flow)
3. Live heatmap via `onSnapshot` + client decay
4. Offline trail layer (`fanal-pr29.geojson` bundle + Mapbox tile pack)
5. Push notifications (FCM + proximity check)
6. Onboarding slides + `ProximityBanner`
7. Sightings feed screen
8. Photo attachment (Firebase Storage)

Do not implement V2/V3 features or monetisation hooks during the MVP build.
