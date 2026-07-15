# Herdy — Learnings & Transferable Knowledge for the Next App

> Written for use as AI context when bootstrapping the next project.
> The next app is a **Too Good To Go (TGTG) competitor** targeting markets like Bulgaria and Mexico — a map-based marketplace where stores post surplus food bags and users book them before close of business.
> This document covers what was built in Herdy, what was learned the hard way, what code is worth copying, and where the new app diverges enough that you should not follow Herdy's patterns.

---

## 1. Stack & Tooling (What to carry forward verbatim)

These decisions held up throughout the entire Herdy build. Use them for the new app without re-evaluating.

| Concern | Decision | Why it held |
|---|---|---|
| App framework | React Native — **Expo managed workflow** | No native folders in repo, EAS builds in cloud, zero Xcode/Android Studio dependency |
| Language | **TypeScript** throughout — all files `.tsx` / `.ts` | Caught many data shape bugs at write time, not runtime |
| Build & distribution | **EAS** (`eas build`, `eas submit`) | Cloud builds, no local toolchain, easy CI/CD equivalent |
| Map | **`@rnmapbox/maps`** | Best RN Mapbox SDK, full heatmap + GeoJSON + offline tile support |
| Database | **Firebase Firestore** (JS SDK) | Real-time `onSnapshot` is exactly the right primitive for live data |
| OTA updates | **Expo Updates** | JS-only changes ship immediately without App Store review — used constantly |
| Routing | **Expo Router** (file-based) | Clean screen structure, works well with tabs + modals |
| Secure storage | **`expo-secure-store`** | iOS Keychain / Android Keystore. Used for device IDs, pinQueue, user preferences |
| Safe area | **`react-native-safe-area-context`** | Essential for notch/home indicator handling |
| Animations | **`react-native-reanimated`** | Only option for smooth 60fps gesture-driven animations on RN |

### Project init

```bash
npx create-expo-app my-app --template blank-typescript
cd my-app
npx expo install expo-router expo-secure-store expo-location react-native-safe-area-context
```

**NEVER use `npm install` for Expo/RN packages.** Always use `npx expo install`. It resolves peer deps against the exact Expo SDK version and pins to the compatible release. Using `npm install` causes cascading peer dependency failures and wasted rebuilds — this burned multiple sessions in Herdy.

---

## 2. Firebase Strategy — The Most Important Lesson

### The decision

Herdy uses the **Firebase JS SDK** (`firebase` npm package, v10+), NOT `@react-native-firebase` (the native package).

### Why the native SDK failed

`@react-native-firebase` v24 is incompatible with this combination:
- React Native new architecture (`newArchEnabled: true`)
- `use_frameworks! :linkage => :static` (required by native Firebase CocoaPods)
- Xcode 16 / iOS 26 SDK

Three distinct build failures were hit:
1. `use_modular_headers!` globally broke `gRPC-Core.modulemap`
2. `$RNFirebaseAsStaticFramework = true` (deprecated in v24) had no effect
3. `use_frameworks: static` via `expo-build-properties` caused `RCTBridgeModule` header import failure in `RNFBFirestoreCollectionModule.h`

No clean fix without disabling new architecture or downgrading React Native.

### What the JS SDK gives you

Everything except server-push notifications:
- ✅ Firestore `onSnapshot` real-time listeners
- ✅ Firestore reads/writes
- ✅ Firebase Storage (photo uploads)
- ✅ In-app local notifications via `expo-notifications`
- ❌ FCM server-sent push (app backgrounded / phone locked)

### Initialisation pattern

```typescript
// lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const app = initializeApp({
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
});

export const db = getFirestore(app);
export const storage = getStorage(app);
```

All Firebase config values are safe to ship in the app bundle (they are not secrets). Restrict access via **Firestore Security Rules**, not by hiding the config.

### `app.config.js` plugins — what NOT to include

When using the JS SDK, do **not** add:
- `@react-native-firebase/app` to plugins
- `expo-build-properties` with `useFrameworks: static`
- `googleServicesFile` in iOS config
- `google-services.json` in Android config

These are only needed for the native SDK and will break the build.

### Plan when you actually need server-push

When push notifications are required (e.g. "new bag available at store X"):
1. Try `@react-native-firebase/messaging` alone (not the full suite)
2. Do NOT add `use_frameworks: static` — messaging may not need it
3. If modular headers error returns, apply `:modular_headers => true` per-pod in a config plugin, not globally
4. Alternative that avoids native Firebase entirely: use `expo-notifications` with **Expo's own push service** (FCM under the hood but managed by Expo). This is simpler and works for most push use cases.

### Firestore composite indexes

Any Firestore query that filters on two or more different fields needs a **composite index** — Firestore won't execute it otherwise. The query silently returns zero results or throws an error at runtime.

When you hit this, Firebase logs a direct URL in the console that creates the index in one click. But if you don't know to look for it, you'll spend time thinking your query logic is wrong.

Example: querying by `locationId` AND `createdAt` requires a composite index:
```typescript
query(
  collection(db, 'sightings'),
  where('locationId', '==', locationId),  // field 1
  where('createdAt', '>', cutoff)         // field 2 → needs composite index
)
```

For the new app, you will almost certainly need composite indexes for:
- `stores` filtered by `city` + `active`
- `bookings` filtered by `userId` + `status`
- `bookings` filtered by `storeId` + `createdAt`

Create indexes upfront in the Firebase console before you start querying. Do not wait for runtime errors in production.

### Firestore rules — manage via file, never the console

Keep rules in `firestore.rules` at the project root and deploy with:

```bash
firebase deploy --only firestore:rules
```

Never edit rules in the Firebase console UI. It creates a mismatch between what's in the file and what's live, and you lose version history.

### Example Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sightings/{id} {
      allow read: if true;
      allow create: if
        request.resource.data.keys().hasAll(['locationId', 'position', 'createdAt', 'deviceId'])
        && request.resource.data.createdAt is timestamp
        && request.resource.data.createdAt >= request.time - duration.value(4, 'h')
        && request.resource.data.locationId in ['fanal', 'home-test']
        && request.resource.data.deviceId is string
        && request.resource.data.deviceId.size() > 0;
      allow update, delete: if false;
    }
  }
}
```

Key pattern: **validate on create, reject all updates and deletes**. For a marketplace app you will need update rules (e.g. booking count), but keep them as tight as possible.

---

## 3. Map & Geospatial

### Mapbox setup

Two tokens:
- **Public token** (`EXPO_PUBLIC_MAPBOX_TOKEN`) — safe to ship in app bundle, used at runtime
- **Secret download token** — used only at native build time to download the Mapbox SDK binary via CocoaPods. Goes in `app.json` under `plugins[@rnmapbox/maps].RNMapboxMapsDownloadToken`. **Move this to an env var before any public commit or EAS cloud build** — it is a secret.

```javascript
// app.config.js
plugins: [
  ['@rnmapbox/maps', { RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN }],
  './plugins/withSwiftConcurrencyFix',
  'expo-router',
]
```

### GeoJSON as the universal data contract

Everything on the map flows as GeoJSON FeatureCollection → Mapbox ShapeSource → Layer. This pattern is clean and composable:

```typescript
// Convert any data to GeoJSON for Mapbox
function itemsToGeoJSON(items: Item[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: items.map(item => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
      properties: { id: item.id, label: item.name, weight: item.weight },
    })),
  };
}
```

### Offline tile packs

Cache map tiles for areas where connectivity is unreliable:

```typescript
await MapboxGL.offlineManager.createPack({
  name: 'region-name',
  styleURL: MapboxGL.StyleURL.Outdoors,
  minZoom: 12,
  maxZoom: 17,
  bounds: [
    [swLng, swLat],
    [neLng, neLat],
  ],
}, progressCallback);
```

**Note:** For a city-based app (stores across a whole city), offline tile packs per store are impractical. Use them for specific high-value areas only, or skip entirely and rely on Mapbox's built-in tile caching.

### Bundled GeoJSON assets

For geometry that must render immediately (trail overlays, zone boundaries), bundle the GeoJSON as a local asset:

```typescript
const ZONE_GEOJSON = require('../../assets/my-zone.geojson') as GeoJSON.FeatureCollection;
// Used directly in <ShapeSource> — no network fetch, renders on first frame
```

Use [geojson.io](https://geojson.io) to create and edit polygon GeoJSON files visually.

### Perimeter / boundary mask

Herdy uses a world-spanning polygon with a hole punched out at the location boundary. This creates a dark overlay outside the valid zone, making the navigable area visually obvious. The algorithm is in `lib/geo.ts`:

```typescript
// World ring (CCW) + hole ring (CW) = dark fill outside the perimeter
export function buildBoundaryGeoJSON(location: AppLocation): {
  mask: GeoJSON.Feature<GeoJSON.Polygon>;
  border: GeoJSON.Feature<GeoJSON.Polygon>;
}
```

For a store-map app this pattern is less relevant, but the `isPointInPolygon` (ray-casting) function in `lib/geo.ts` is directly reusable for geofencing (e.g. checking if a user is in a delivery zone).

### Haversine distance

```typescript
// lib/geo.ts — returns distance in metres
export function haversineDistance(lat1, lng1, lat2, lng2): number
```

Essential for proximity checks (e.g. "show stores within 2km"). Copy this function verbatim.

---

## 4. Multi-Location Architecture

### The AppLocation type

Herdy generalised from a single location to a multi-location platform mid-build. The pattern that emerged is clean and directly applicable to a multi-city marketplace:

```typescript
// constants/locations.ts
export type LocationStatus = 'active' | 'coming-soon' | 'inactive';

export interface AppLocation {
  id: string;                    // stable slug used in Firestore queries
  name: string;
  description: string;
  status: LocationStatus;
  timezone: string;              // IANA timezone — critical for date/time display
  center: { lat: number; lng: number };
  perimeterPolygon: { lat: number; lng: number }[];  // for boundary validation
  offlineTileBounds: { sw: [number, number]; ne: [number, number] };
  mapZoom: { min: number; max: number };
  imageAsset: number;            // require('../assets/...') — resolved by Metro bundler
  hidden?: boolean;              // exclude from UI (dev-only locations)
}

export const LOCATIONS: AppLocation[] = [ ... ];
```

**Key insight:** Hardcode locations in a constants file for MVP. Do **not** fetch them from Firestore. This removes an async dependency from app startup and makes the location list available offline.

**"Coming soon" UX:** Show placeholder cards for future locations with a "Coming soon" badge. This makes the app feel like a platform at launch, not a single-location tool. Users understand more locations are coming.

### Timezone handling

Every location needs an IANA timezone string. Use it for all date/time display and for generating `dateKey` fields in Firestore:

```typescript
function localDateKey(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}
// Returns 'YYYY-MM-DD' in the location's local time — correct even when the user's
// phone timezone differs from the store's country.
```

For a multi-country app (Bulgaria + Mexico), this is critical. A user in Bulgaria using a store in Mexico will have their device in UTC+2 — you need the store's local date for grouping pickups, showing "today's bags", etc.

---

## 5. Offline-First Patterns

### The problem

In Herdy, users drop pins in a forest with poor signal. In a food-waste app, users confirm bookings in basements, underground car parks, or poor-signal areas. The same pattern applies.

### Offline queue with SecureStore

```typescript
// lib/pinQueue.ts — full implementation, copy verbatim and rename fields
const QUEUE_KEY = 'app.writeQueue';

export interface QueuedWrite {
  docId: string;       // pre-generated BEFORE any async work
  // ... your payload fields
  createdAt: string;   // ISO string — always store as string, not Date
}

export async function enqueueWrite(item: QueuedWrite): Promise<void> {
  const queue = await readQueue();
  if (queue.some(q => q.docId === item.docId)) return; // idempotent
  queue.push(item);
  await writeQueue(queue);
}

export async function drainQueue(): Promise<void> {
  const queue = await readQueue();
  for (const item of queue) {
    try {
      await writeToFirestore(item);
      await dequeueWrite(item.docId);
    } catch {
      // Still offline — leave in queue, retry on next drain
    }
  }
}
```

Call `drainQueue()` on:
- App focus (`AppState.addEventListener('change', ...)`)
- NetInfo reconnect event
- App startup

### Pre-generate document IDs before async work

This is the most subtle but important pattern. Generate the Firestore doc ID **synchronously, before any async operations or user interactions**. This prevents a race condition where the Firestore snapshot arrives before the local state knows the ID:

```typescript
// Generate ID synchronously from the Firestore ref
export function newDocId(): string {
  return doc(collection(db, 'my-collection')).id;
}

// In the UI:
const docId = newDocId();                 // sync, immediate
setLocalPendingState({ docId, ... });     // update UI optimistically
await writeToFirestore({ docId, ... });   // async, may fail → queue it
```

This enables deduplication: when the Firestore snapshot comes back, filter out any document whose ID matches a pending local item.

### Device ID for anonymous tracking

```typescript
// lib/deviceId.ts — copy verbatim
// Stable UUID stored in iOS Keychain / Android Keystore.
// Survives app reinstalls. Used for rate-limiting, abuse prevention, order history.
export async function getDeviceId(): Promise<string>
```

For a marketplace app where users don't have accounts (or before they sign up), this is your anonymous identity for tracking orders, rate-limiting, etc.

---

## 6. Build & Device Workflow

### Daily dev loop (physical device)

```bash
# One-time: install native shell on device
npx expo run:ios --device

# Daily: just start Metro — the app on device connects automatically
npm start

# If on a network with no direct device access:
npm start -- --tunnel
```

After installing the native shell once, JS changes hot-reload with no rebuild. Only re-run `npx expo run:ios --device` when you add a new native module (new entry in the `plugins` array of `app.config.js`).

### Dev vs production variants

```javascript
// app.config.js
const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = {
  name: IS_DEV ? 'MyApp (dev)' : 'MyApp',
  ios: { bundleIdentifier: IS_DEV ? 'com.you.myapp.dev' : 'com.you.myapp' },
  // ...
};
```

This lets you install both the dev and production builds on the same phone.

### EAS cloud build

```bash
# Build for both platforms
eas build --platform all

# Submit to app stores after a successful build
eas submit --platform ios
eas submit --platform android
```

No local Xcode or Android Studio required. EAS handles everything. This is a genuine productivity unlock — you never waste time on toolchain setup.

### The Xcode 16 / Swift 6 build fix (copy this plugin)

If you use `@rnmapbox/maps` or any native module that hasn't updated to Swift 6, you will hit Swift concurrency compilation errors with Xcode 16 and React Native 0.81+. The fix is a config plugin at `plugins/withSwiftConcurrencyFix.js`:

```javascript
// plugins/withSwiftConcurrencyFix.js
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withBuildFixes(config) {
  return withDangerousMod(config, ['ios', async (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
    let podfile = fs.readFileSync(podfilePath, 'utf8');

    if (!podfile.includes('SWIFT_STRICT_CONCURRENCY')) {
      podfile = podfile.replace(
        /(\s+react_native_post_install\([\s\S]*?\)\s*\n)(\s+end\s*\nend)/,
        `$1
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |cfg|
        cfg.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
        cfg.build_settings['SWIFT_VERSION'] = '5'
      end
    end

    fmt_base = File.join(File.dirname(__FILE__), 'Pods/fmt/include/fmt/base.h')
    if File.exist?(fmt_base)
      content = File.read(fmt_base)
      patched = content.gsub(
        '&& __apple_build_version__ < 14000029L',
        '&& __apple_build_version__ < 99999999L'
      )
      File.write(fmt_base, patched) if patched != content
    end
$2`,
      );
      fs.writeFileSync(podfilePath, podfile);
    }
    return config;
  }]);
};
```

Add it to `app.config.js` plugins: `'./plugins/withSwiftConcurrencyFix'`

### `newArchEnabled: true` — the compatibility trap

Herdy runs with `newArchEnabled: true` in `app.config.js`. This enables React Native's new architecture (Fabric renderer + TurboModules) and is the default for new Expo projects.

**The trap:** Any native module written before ~2023 may silently break or fail to compile with new arch. This was the root cause of the entire Firebase native SDK failure — not a version conflict, not a config error, but an architectural incompatibility between `@react-native-firebase` v24, new arch, and static frameworks.

Before adding any native module, check its README for "New Architecture" support. If it doesn't mention it, assume it may break.

If a package breaks with new arch and you cannot find a fix:
```javascript
// app.config.js — last resort, not preferred
newArchEnabled: false,
```

Disabling new arch is a regression but sometimes the only unblock. Re-enable it once the package catches up.

### App Store submission — required `infoPlist` key

Without this, Apple's automated review **rejects the build** with an encryption compliance error. Add it to every iOS project from day one:

```javascript
// app.config.js
ios: {
  bundleIdentifier: 'com.you.myapp',
  infoPlist: {
    ITSAppUsesNonExemptEncryption: false,
  },
},
```

This declares that the app uses only standard HTTPS encryption and does not require US export compliance review. Almost all apps qualify. The failure mode is a silent rejection email from Apple with a reference to the Export Compliance section — easy to miss and confusing to diagnose the first time.

### Permanent install on iOS for testing without a Mac build

For a Release build (no Metro dependency, app works standalone):
> Xcode → Product → Scheme → Edit Scheme → Run → Change Build Configuration from **Debug** to **Release** → Cmd+R

---

## 7. UI/UX Patterns

### Debug flag

```typescript
// constants/debug.ts
export const DEBUG = process.env.EXPO_PUBLIC_DEBUG === 'true';
```

Gate all `console.log`, Firestore ping tests, and dev-only UI behind `if (DEBUG)`. Never ship with debug output on.

### Onboarding — gated by AsyncStorage/SecureStore flag

3-slide walkthrough shown only on first launch:

```typescript
// On app startup
const seen = await SecureStore.getItemAsync('onboarding_complete');
if (!seen) router.replace('/onboarding');

// At the end of onboarding
await SecureStore.setItemAsync('onboarding_complete', 'true');
router.replace('/(tabs)');
```

Herdy's onboarding covers: what the app does / responsible use / how to contribute. For a food-waste app: what the app does / how booking works / what a goodie bag is.

### `_layout.tsx` route guard — preventing the flash

When the app needs to decide between onboarding and the main screen at startup, a naive implementation flashes the main screen for one frame before redirecting. The fix is a null state that holds a blank screen until the async check resolves:

```typescript
// app/_layout.tsx
export default function RootLayout() {
  // null = still checking SecureStore; string = resolved
  const [initialRoute, setInitialRoute] = useState<'onboarding' | '(tabs)' | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync('app.onboardingComplete').then((val) => {
      setInitialRoute(val ? '(tabs)' : 'onboarding');
    });
  }, []);

  // Hold a white screen until we know where to go
  if (!initialRoute) {
    return <View style={{ flex: 1, backgroundColor: '#fff' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'none' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
```

Two details:
- `gestureEnabled: false` on onboarding prevents users swiping back to it after completing it
- `animation: 'none'` on onboarding prevents a slide-in animation on first launch — it should just appear

Also note: **`GestureHandlerRootView` must wrap the entire tree** at the root layout level. If you add `@gorhom/bottom-sheet` or any gesture-driven component and forget this wrapper, gestures will silently not work.

### Animated icon fly-in (pin drop confirmation)

`components/PinFlyAnimation.tsx` — an icon arcs from the bottom of the screen to the drop point using `react-native-reanimated`. Sequence: rise to a peak → fall to target → icon lands → overlay closes. This is the main piece of polish that makes the pin-drop feel satisfying.

For a marketplace app, a similar animation could confirm a booking (e.g. a bag icon flies into a "My orders" counter).

Key technique: use `withSequence` for the Y axis (rise + fall parabola) and `withTiming` for the X axis (straight interpolation):

```typescript
animY.value = withSequence(
  withTiming(peakY, { duration: RISE_MS, easing: Easing.out(Easing.quad) }),
  withTiming(targetY, { duration: FALL_MS, easing: Easing.in(Easing.quad) }),
);
```

### User preferences persisted with SecureStore

Any user setting that should survive app restart goes in SecureStore:

```typescript
await SecureStore.setItemAsync('herdy.heatmapTheme', themeId);
const saved = await SecureStore.getItemAsync('herdy.heatmapTheme');
```

Use a namespaced key pattern (`appname.settingName`) to avoid collisions.

### Bottom sheets

Herdy uses custom bottom sheets built with `Animated` + `PanResponder`. For the new app, consider `@gorhom/bottom-sheet` — it is the de-facto standard, handles keyboard avoidance cleanly, and saves significant implementation time for complex booking flows with form inputs.

### System vars from Firestore (server-controlled config)

Herdy has a `system_vars` Firestore collection for runtime config values (e.g. feature flags, donation links). Read on startup, fall back to defaults:

```typescript
export async function getSystemVar(docId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'system_vars', docId));
  if (!snap.exists()) return null;
  return snap.data().value ?? null;
}
```

For a marketplace app this is useful for: store onboarding messages, maintenance banners, feature flags per country, minimum app version enforcement.

### Free weather API — open-meteo.com

Herdy shows live weather (temperature, condition, rain chance, hourly forecast) on the map screen. The API is **completely free, requires no API key, and has no rate limit for reasonable usage**. Just a plain fetch with lat/lng:

```typescript
const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,is_day,precipitation_probability&hourly=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
const res = await fetch(url);
const data = await res.json();

const temp = data.current.temperature_2m;          // °C
const code = data.current.weather_code;            // WMO code
const rainChance = data.current.precipitation_probability; // 0–100
```

WMO weather codes map to human-readable conditions and emoji (0 = clear, 3 = overcast, 45–48 = fog, 61–67 = rain, etc.).

For a food pickup app this is useful context — "it's raining, stores near you have bags ready for pickup" is a natural combination. Show it lightly in the UI (a small weather chip, not a weather app). The API also returns timezone-aware data automatically via `timezone=auto`.

---

## 8. Reusable Code Inventory

These files can be copied verbatim (or with minimal renaming) into the new project:

| File | What it does | Notes |
|---|---|---|
| `lib/geo.ts` | `haversineDistance`, `isPointInPolygon`, `buildBoundaryGeoJSON`, `expandCluster` | Pure functions, zero dependencies outside the AppLocation type |
| `lib/deviceId.ts` | Stable anonymous device UUID via SecureStore | Copy verbatim, change the key string |
| `lib/pinQueue.ts` | Offline write queue with SecureStore persistence + drain logic | Rename fields to match new data model |
| `plugins/withSwiftConcurrencyFix.js` | Xcode 16 / Swift 6 build fix | Copy verbatim |
| `constants/locations.ts` | `AppLocation` type + multi-location pattern | Adapt fields for stores/cities |
| `lib/firestore.ts` | `newSightingId()` pattern, `subscribeSightings`, `getSystemVar` | Pre-generated ID pattern is the key thing to carry |
| `lib/decay.ts` | `pinWeight()` and `sightingsToGeoJSON()` | Only relevant if you need time-weighted data |
| `components/PinFlyAnimation.tsx` | Arcing icon animation on confirmation | Rename to `BookingConfirmAnimation` or similar |

---

## 9. What's Different for the New App

The new app is a **food waste marketplace** (TGTG competitor for Bulgaria / Mexico). Most of the technical stack carries over, but the product model is fundamentally different. Here is where **not** to follow Herdy's patterns:

### Auth is now required

Herdy has zero auth by design (anonymous pins). The new app needs user accounts for:
- Order history (which bags did I book?)
- Preventing double-booking
- Store partner accounts (to post bags)
- Payment association

**Recommendation:** Use Firebase Authentication with email/password + Google Sign-In. The Firebase JS SDK supports this fully. Start with anonymous auth for browsing (no friction) and upgrade to email/Google on first booking.

### Bookings replace pin drops

The core write operation changes from a fire-and-forget pin (anonymous, no confirmation needed) to a transactional booking (needs atomicity — decrement available count + create booking record simultaneously).

Use **Firestore transactions** for this:

```typescript
await runTransaction(db, async (transaction) => {
  const storeRef = doc(db, 'stores', storeId);
  const storeSnap = await transaction.get(storeRef);
  const available = storeSnap.data().bagsAvailable;

  if (available <= 0) throw new Error('Sold out');

  const bookingRef = doc(collection(db, 'bookings'));
  transaction.update(storeRef, { bagsAvailable: available - 1 });
  transaction.set(bookingRef, {
    userId: auth.currentUser.uid,
    storeId,
    createdAt: serverTimestamp(),
    status: 'confirmed',
    pickupWindow: store.pickupWindow,
  });
});
```

### Store data model vs sightings

Herdy's Firestore has one collection (`sightings`) with a 4-hour TTL. The new app needs:

```
/stores/{storeId}
  name: string
  description: string
  address: string
  city: string
  country: string
  lat: number
  lng: number
  category: string           // 'bakery' | 'restaurant' | 'supermarket' | 'cafe'
  bagsAvailable: number      // decremented on booking
  bagsTotal: number
  pricePerBag: number
  currency: string
  pickupWindowStart: string  // HH:MM
  pickupWindowEnd: string    // HH:MM
  imageUrl: string
  active: boolean

/bookings/{bookingId}
  userId: string
  storeId: string
  createdAt: timestamp
  status: 'confirmed' | 'picked_up' | 'cancelled'
  pickupCode: string         // shown to user, verified by store

/users/{userId}
  email: string
  createdAt: timestamp
  country: string
```

### Map markers replace heatmap

Herdy renders a heatmap blob (intentional 80–120m blur). The new app renders **precise store markers** — users need to know exactly which shop to go to. Use `PointAnnotation` or `SymbolLayer` with custom icons per store category.

For clustering (many stores in one area), use Mapbox's built-in `cluster: true` on the ShapeSource — this is much simpler than Herdy's manual `expandCluster` BFS algorithm.

### Payments

TGTG competes on price (bags are ~⅓ retail value). You need payment processing. Options:
- **Stripe** — `@stripe/stripe-react-native` is the standard; requires a native module (rebuild shell when adding)
- **RevenueCat** — if you want subscriptions (e.g. premium membership for early access)
- Start with **cash on pickup** for MVP to avoid payment complexity entirely — user books, pays at store, simpler to ship first

### Push notifications are now a core feature, not an afterthought

In Herdy, push was deferred because proximity alerts work locally. In a food-waste app, "new bags just posted!" is the core engagement loop — users need to be notified the moment a store posts bags or bags are almost gone.

Follow the plan from Section 2: use `expo-notifications` with Expo's push service first. Add FCM native SDK later if you need more control.

### Real-time inventory matters more

A store posts 5 bags. 20 users see them. You need:
- `onSnapshot` listener on the store document to update `bagsAvailable` in real time
- Sold-out UI state (disabled booking button)
- Optimistic UI (decrement locally before Firestore confirms)

The `onSnapshot` pattern from Herdy's `subscribeSightings` applies directly here.

### Country-specific considerations

- **Bulgaria:** Cyrillic in store names/addresses. Ensure your font stack includes it — Expo's default fonts do.
- **Mexico:** Spanish locale, MXN currency, different VAT rules. Use the device locale for number/currency formatting, not hardcoded strings.
- **Multi-currency:** Store `pricePerBag` as an integer in the smallest currency unit (stotinki / centavos) and format for display. Never do floating-point arithmetic on money.

---

## 10. Two-Sided Marketplace Architecture

This is the biggest structural difference from Herdy and the most important thing to plan before writing any code. The new app has **two fundamentally different user types** with different needs, permissions, and flows.

### Consumer side (the Herdy-like side)
- Browse stores on map + list
- Book a bag (transactional write)
- View booking confirmation + pickup code
- Order history
- Push notifications for new bags / pickup reminders

### Store partner side (entirely new)
- Post bags for today (set quantity, pickup window, price)
- Mark bags as sold out
- Confirm pickups (scan/verify consumer's pickup code)
- View today's revenue and booking count
- Manage store profile (description, photos, opening hours)

### Key architectural decision: one app or two?

**Option A — Two separate apps** (recommended for MVP)
- Consumer app on the App Store (what users download)
- Partner app as a separate Expo project, distributed via TestFlight / internal track
- Clean separation: no auth-gating complexity in the consumer app, partner app can be rougher

**Option B — One app, role-based routing**
- Single app, user's Firestore document has a `role: 'consumer' | 'partner'` field
- After login, route to different tab layouts based on role
- More complex but only one app to maintain

### Firestore permissions must reflect the split

Consumers can:
- `read` stores
- `create` bookings (for their own userId only)
- `read` their own bookings

Partners can:
- `read` and `update` their own store document
- `read` bookings for their store
- `update` booking status (to mark as picked_up)

Example rule sketch:
```
match /stores/{storeId} {
  allow read: if true;
  // Only the partner who owns this store can update it
  allow update: if request.auth.uid == resource.data.ownerId;
}

match /bookings/{bookingId} {
  // Consumer can read their own bookings
  allow read: if request.auth.uid == resource.data.userId
    // Partner can read bookings for their store
    || request.auth.uid == get(/databases/$(database)/documents/stores/$(resource.data.storeId)).data.ownerId;
  allow create: if request.auth.uid == request.resource.data.userId;
  // Only partner can mark as picked_up
  allow update: if request.auth.uid == get(...).data.ownerId
    && request.resource.data.status == 'picked_up';
}
```

### The pickup code flow

This is the core trust mechanism — the store verifies the consumer actually came to pick up:

1. On booking confirmed, generate a short alphanumeric code (6 chars) and store it on the booking document
2. Consumer sees the code on their booking screen
3. Store partner sees the booking in their app, consumer shows the code, partner taps "confirm pickup" → booking status → `picked_up`
4. No QR scanner needed for MVP — verbal/visual code is sufficient

### Partner onboarding

For MVP: onboard store partners **manually**. You email them a link, create their Firebase Auth account yourself, set `role: 'partner'` on their user document, and create their store document. This lets you launch with 5–10 curated partners without building a self-serve onboarding flow.

Self-serve partner signup (with store profile creation, photo upload, bank details) is a V2 feature.

---

## 11. Quick-Start Checklist for the New App

Use this to get from zero to a working Expo app with map and Firestore in one session:

- [ ] `npx create-expo-app myapp --template blank-typescript`
- [ ] `npx expo install expo-router expo-secure-store expo-location react-native-safe-area-context @rnmapbox/maps firebase react-native-gesture-handler`
- [ ] Copy `plugins/withSwiftConcurrencyFix.js` from Herdy
- [ ] Set up `app.config.js` with dev/prod variant, Mapbox plugin, Swift fix plugin, and `ITSAppUsesNonExemptEncryption: false` in `infoPlist`
- [ ] Create `.env` with `EXPO_PUBLIC_MAPBOX_TOKEN`, `EXPO_PUBLIC_FIREBASE_*` vars
- [ ] Create `lib/firebase.ts` (init with env vars) — export `db`, `storage`, `auth`
- [ ] Create `lib/deviceId.ts` (copy from Herdy)
- [ ] Create `lib/geo.ts` (copy from Herdy — haversineDistance used everywhere)
- [ ] Create `constants/cities.ts` with city/country model (adapted from Herdy's `AppLocation`)
- [ ] Wire up `GestureHandlerRootView` at the root of `app/_layout.tsx`
- [ ] Add the onboarding null-check route guard to `app/_layout.tsx`
- [ ] Enable Firebase Auth in the Firebase console (email/password + Google)
- [ ] Create Firestore composite indexes for store+city and booking+userId queries upfront
- [ ] `npx expo run:ios --device` — install native shell once
- [ ] From here: `npm start` is the daily command

---

*Generated from the Herdy codebase and build history, July 2026.*
