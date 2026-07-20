import Mapbox, {
  Camera,
  FillLayer,
  HeatmapLayer,
  LineLayer,
  MapView,
  ShapeSource,
  SymbolLayer,
  UserLocation,
} from '@rnmapbox/maps';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from 'expo-router';

const TRAIL_GEOJSON = require('../../assets/fanal-pr13.json') as GeoJSON.FeatureCollection;
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Image,
  Linking,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DrawerMenu from '@/components/DrawerMenu';
import NearbySheet from '@/components/NearbySheet';
import LocationPickerSheet from '@/components/LocationPickerSheet';
import PinDropSheet from '@/components/PinDropSheet';
import PinFlyAnimation from '@/components/PinFlyAnimation';
import PinLingerMarker from '@/components/PinLingerMarker';
import { ACTIVE_LOCATION, LOCATIONS, type AppLocation } from '@/constants/locations';
import { CLUSTER_EXPANSION_RADIUS_M, NEARBY_RADIUS_M } from '@/constants/variables';
import {
  DEFAULT_THEME_ID,
  HEATMAP_THEMES,
  HEATMAP_THEME_STORAGE_KEY,
  type HeatmapThemeId,
} from '@/constants/heatmapThemes';
import { EMPTY_GEOJSON, sightingsToGeoJSON } from '@/lib/decay';
import { buildBoundaryGeoJSON, expandCluster } from '@/lib/geo';
import { getDeviceId } from '@/lib/deviceId';
import { addSighting, getDonationCount, newSightingId, pingFirestore, subscribeSightings, type Sighting, type PendingPin } from '@/lib/firestore';
import { dequeuePin, drainQueue, enqueuePin } from '@/lib/pinQueue';
import { DEBUG } from '@/constants/debug';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

const INITIAL_ZOOM = 14;


const BASE_HEATMAP_STYLE = {
  heatmapWeight: ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 1, 1] as unknown as number,
  heatmapIntensity: 1.5,
  heatmapRadius: 60,
  heatmapOpacity: 0.85,
};

// Dark casing makes the trail readable on both light and satellite map styles
const TRAIL_CASING_STYLE = {
  lineColor: 'rgba(0,0,0,0.35)',
  lineWidth: 5,
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
};

const TRAIL_LINE_STYLE = {
  lineColor: '#FFFFFF',
  lineWidth: 3,
  lineOpacity: 0.9,
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
};

const TRAIL_LABEL_STYLE = {
  symbolPlacement: 'line' as const,
  textField: 'PR13',
  textSize: 11,
  textColor: '#FFFFFF',
  textHaloColor: 'rgba(0,0,0,0.4)',
  textHaloWidth: 1.5,
  textLetterSpacing: 0.15,
  symbolSpacing: 200,
};

const HERD_SIZES = ['1-5', '5-10', '10+'] as const;
type HerdSize = typeof HERD_SIZES[number];

const FILTER_TIME_STEPS = [
  { label: '1h', hours: 1 as const },
  { label: '2h', hours: 2 as const },
  { label: '4h', hours: 4 as const },
  { label: '8h', hours: 8 as const },
];

const FILTER_HERD_OPTIONS = [
  { label: 'Any', value: 'any' as const },
  { label: '5+', value: '5+' as const },
  { label: '10+', value: '10+' as const },
];

const MAP_STYLES = [
  { label: 'Street', styleURL: Mapbox.StyleURL.Street, mapboxId: 'mapbox/streets-v12' },
  { label: 'Outdoors', styleURL: Mapbox.StyleURL.Outdoors, mapboxId: 'mapbox/outdoors-v12' },
  { label: 'Satellite', styleURL: Mapbox.StyleURL.SatelliteStreet, mapboxId: 'mapbox/satellite-streets-v12' },
];

// WMO weather code → emoji, night-aware
function weatherEmoji(code: number, isDay = true): string {
  if (code === 0) return isDay ? '☀️' : '🌙';
  if (code <= 1) return isDay ? '🌤️' : '🌙';
  if (code <= 2) return isDay ? '⛅' : '🌛';
  if (code <= 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '❄️';
  return '⛈️';
}

// WMO weather code → human-readable description
function weatherDescription(code: number): string {
  if (code === 0) return 'Clear Sky';
  if (code === 1) return 'Mainly Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 65) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain Showers';
  if (code <= 86) return 'Snow Showers';
  return 'Thunderstorm';
}

interface WeatherData {
  temp: number;       // current, °C
  code: number;       // current WMO code
  isDay: boolean;     // false after sunset — drives night icon variants
  high: number;       // today's high, °C
  low: number;        // today's low, °C
  rainChance: number; // current-hour precipitation probability, %
  hourly: Array<{ label: string; code: number; temp: number; isDay: boolean }>;
}

// True when device locale uses Fahrenheit (US, Liberia, Myanmar)
function deviceUsesFahrenheit(): boolean {
  try {
    const locale = Intl.NumberFormat().resolvedOptions().locale; // e.g. "en-US"
    const region = locale.split('-').pop() ?? '';
    return ['US', 'LR', 'MM'].includes(region);
  } catch {
    return false;
  }
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);
  const mapViewRef = useRef<MapView>(null);
  const mapContainerLayout = useRef({ width: 0, height: 0 });
  const [mapContainerReady, setMapContainerReady] = useState(false);
  const [pinFlyAnim, setPinFlyAnim] = useState<{ icon: number; targetX: number; targetY: number; lat: number; lng: number } | null>(null);
  const [pinLingerMarker, setPinLingerMarker] = useState<{ icon: number; lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [heading, setHeading] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showPinDrop, setShowPinDrop] = useState(false);
  const [showCoffeeModal, setShowCoffeeModal] = useState(false);
  const [donorCount, setDonorCount] = useState<number | null>(null);
  const [lastPinLocationId, setLastPinLocationId] = useState<string | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [showLocationDeniedModal, setShowLocationDeniedModal] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState<AppLocation>(ACTIVE_LOCATION);
  const initialLocationApplied = useRef(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const { width: screenWidth } = useWindowDimensions();
  // Popup is 88% wide, padding 24px each side, 2 gaps of 10px between 3 items
  const thumbSize = Math.min(Math.floor(((screenWidth * 0.88 - 48 - 20) / 3) * 0.82), 80);

  const [useFahrenheit, setUseFahrenheit] = useState(deviceUsesFahrenheit);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [showWeatherPopup, setShowWeatherPopup] = useState(false);

  // Live heatmap data
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [geoJSON, setGeoJSON] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
  const [pendingPins, setPendingPins] = useState<PendingPin[]>([]);
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);
  const displayPinsRef = useRef<Sighting[]>([]);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const [nearbySightings, setNearbySightings] = useState<Sighting[]>([]);
  const [showNearbySheet, setShowNearbySheet] = useState(false);

  const [mapStyle, setMapStyle] = useState<string>(Mapbox.StyleURL.Outdoors);
  const [styleLoaded, setStyleLoaded] = useState(true);
  const [showMapStylePicker, setShowMapStylePicker] = useState(false);

  const [heatmapThemeId, setHeatmapThemeId] = useState<HeatmapThemeId>(DEFAULT_THEME_ID);

  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [filterWindowHours, setFilterWindowHours] = useState<1 | 2 | 4 | 8>(4);
  const [filterMinHerd, setFilterMinHerd] = useState<'any' | '5+' | '10+'>('any');
  const [filterMyOnly, setFilterMyOnly] = useState(false);
  const [filterConfirmedOnly, setFilterConfirmedOnly] = useState(false);
  const [showTrail, setShowTrail] = useState(true);
  const filterWindowMinutesRef = useRef<number>(240);
  const filterMinHerdRef = useRef<'any' | '5+' | '10+'>('any');
  const filterMyOnlyRef = useRef(false);
  const filterConfirmedOnlyRef = useRef(false);
  const myDeviceIdRef = useRef<string | null>(null);

  const filtersActive = filterWindowHours !== 4 || filterMinHerd !== 'any' || filterMyOnly || filterConfirmedOnly || !showTrail;
  const selectedTimeIndex = FILTER_TIME_STEPS.findIndex((s) => s.hours === filterWindowHours);

  const boundary = useMemo(
    () => buildBoundaryGeoJSON(selectedLocation),
    [selectedLocation],
  );

  const recomputeGeoJSON = useCallback((pins: Sighting[]) => {
    const windowMinutes = filterWindowMinutesRef.current;
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    const minHerd = filterMinHerdRef.current;
    const myOnly = filterMyOnlyRef.current;
    const confirmedOnly = filterConfirmedOnlyRef.current;
    const filtered = pins.filter((s) => {
      if (s.createdAt.getTime() < cutoff) return false;
      if (minHerd === '5+' && s.herdSize === '1-5') return false;
      if (minHerd === '10+' && s.herdSize !== '10+') return false;
      if (myOnly && s.deviceId !== myDeviceIdRef.current) return false;
      if (confirmedOnly && s.confirmed < 1) return false;
      return true;
    });
    setGeoJSON(sightingsToGeoJSON(filtered, windowMinutes));
  }, []);

  // Optimistically add a pin locally and write to Firestore in background
  const handlePinSubmit = useCallback(async (lat: number, lng: number, herdSize: string) => {
    if (!myDeviceId) return;
    // Pre-generate the Firestore doc ID synchronously so the pending pin can be
    // matched against snapshots immediately — eliminates the docId:null window
    // that caused duplicates when the snapshot arrived before addSighting resolved.
    const docId = newSightingId();
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const droppedAt = new Date();
    await enqueuePin({ docId, locationId: selectedLocation.id, timezone: selectedLocation.timezone, lat, lng, herdSize, createdAt: droppedAt.toISOString() });
    setPendingPins((prev) => [
      ...prev,
      { localId, docId, locationId: selectedLocation.id, lat, lng, createdAt: droppedAt, herdSize, deviceId: myDeviceId },
    ]);
    if (selectedLocation.pinIcon && mapViewRef.current) {
      try {
        const pt = await mapViewRef.current.getPointInView([lng, lat]);
        setPinFlyAnim({ icon: selectedLocation.pinIcon, targetX: pt[0], targetY: pt[1], lat, lng });
      } catch { /* non-critical */ }
    }
    try {
      const writeTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 15_000),
      );
      await Promise.race([
        addSighting({ locationId: selectedLocation.id, timezone: selectedLocation.timezone, lat, lng, herdSize }, docId, droppedAt),
        writeTimeout,
      ]);
      await dequeuePin(docId);
      // Show support prompt on every other pin drop (even counts: 0, 2, 4, …)
      // Check before incrementing so count=0 fires on the very first pin.
      const raw = await SecureStore.getItemAsync('herdy.pinCount');
      const count = parseInt(raw ?? '0', 10) || 0;
      await SecureStore.setItemAsync('herdy.pinCount', String(count + 1));
      await SecureStore.setItemAsync('herdy.lastPinLocationId', selectedLocation.id);
      setLastPinLocationId(selectedLocation.id);
      if (count % 2 === 0) {
        setTimeout(() => setShowCoffeeModal(true), 1500);
      }
    } catch (err) {
      console.error('[handlePinSubmit]', err);
      setPendingPins((prev) => prev.filter((p) => p.localId !== localId));
      // Queue entry intentionally kept — drainQueue() will retry on next launch
    }
  }, [myDeviceId, selectedLocation]);

  // Dev tool — triple-tap "Herdy" to activate, then tap map to place a pin
  const devTapCount = useRef(0);
  const devTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [devModeActive, setDevModeActive] = useState(false);
  const [devCoords, setDevCoords] = useState<[number, number] | null>(null);
  const [devHerdSize, setDevHerdSize] = useState<HerdSize>('1-5');
  const [devSubmitting, setDevSubmitting] = useState(false);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      setLocationGranted(status === 'granted');
    });
  }, []);

  useEffect(() => { getDeviceId().then((id) => { setMyDeviceId(id); myDeviceIdRef.current = id; }); }, []);
  useEffect(() => { pingFirestore(); }, []);
  useEffect(() => { getDonationCount().then(setDonorCount); }, []);
  useEffect(() => {
    drainQueue();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') drainQueue();
    });
    return () => sub.remove();
  }, []);

  // Subscribe to live Firestore sightings for the selected location
  useEffect(() => {
    return subscribeSightings(selectedLocation.id, setSightings);
  }, [selectedLocation.id]);

  // Merge snapshot pins + pending pins into a single display array
  const displayPins = useMemo<Sighting[]>(() => {
    const pending: Sighting[] = pendingPins
      .filter((p) => p.locationId === selectedLocation.id)
      .map((p) => ({
        id: p.localId,
        locationId: p.locationId,
        lat: p.lat,
        lng: p.lng,
        createdAt: p.createdAt,
        dateKey: '',
        herdSize: p.herdSize,
        confirmed: 0,
        isOutOfBounds: false,
        deviceId: p.deviceId,
      }));
    return [...sightings, ...pending];
  }, [sightings, pendingPins, selectedLocation.id]);

  // Keep ref in sync and recompute GeoJSON (respects active filters)
  useEffect(() => {
    displayPinsRef.current = displayPins;
    recomputeGeoJSON(displayPins);
  }, [displayPins, recomputeGeoJSON]);

  // Recompute when filter window changes, and persist the selection
  useEffect(() => {
    filterWindowMinutesRef.current = filterWindowHours * 60;
    recomputeGeoJSON(displayPinsRef.current);
    SecureStore.setItemAsync('herdy.filterWindowHours', String(filterWindowHours));
  }, [filterWindowHours, recomputeGeoJSON]);

  // Recompute when herd size filter changes
  useEffect(() => {
    filterMinHerdRef.current = filterMinHerd;
    recomputeGeoJSON(displayPinsRef.current);
  }, [filterMinHerd, recomputeGeoJSON]);

  useEffect(() => {
    filterMyOnlyRef.current = filterMyOnly;
    recomputeGeoJSON(displayPinsRef.current);
  }, [filterMyOnly, recomputeGeoJSON]);

  useEffect(() => {
    filterConfirmedOnlyRef.current = filterConfirmedOnly;
    recomputeGeoJSON(displayPinsRef.current);
  }, [filterConfirmedOnly, recomputeGeoJSON]);

  // When a new snapshot arrives, drop any pending pins whose docId is now confirmed
  useEffect(() => {
    setPendingPins((prev) => {
      if (prev.length === 0) return prev;
      const snapshotIds = new Set(sightings.map((s) => s.id));
      const next = prev.filter((p) => !snapshotIds.has(p.docId));
      return next.length === prev.length ? prev : next;
    });
  }, [sightings]);

  // Download offline tile pack for Fanal on first launch (silently, no UI feedback)
  useEffect(() => {
    const loc = selectedLocation;
    if (!loc.offlineTileBounds) return;

    const packName = `herdy-${loc.id}`;
    Mapbox.offlineManager
      .getPack(packName)
      .then((existing) => {
        if (existing) return;
        const { sw, ne } = loc.offlineTileBounds;
        return Mapbox.offlineManager.createPack(
          {
            name: packName,
            styleURL: Mapbox.StyleURL.Outdoors,
            minZoom: loc.mapZoom.min,
            maxZoom: loc.mapZoom.max,
            bounds: [[ne[0], ne[1]], [sw[0], sw[1]]],
          },
          () => {},
        );
      })
      .catch(() => {});
  }, [selectedLocation]);

  // Fetch current weather for the selected location from Open-Meteo (no API key needed)
  useEffect(() => {
    const { lat, lng } = selectedLocation.center;
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,weather_code,is_day` +
      `&daily=temperature_2m_max,temperature_2m_min` +
      `&hourly=temperature_2m,weather_code,precipitation_probability,is_day` +
      `&timezone=auto&forecast_days=2`
    )
      .then((r) => r.json())
      .then((data) => {
        const temp: number = data.current?.temperature_2m;
        const code: number = data.current?.weather_code;
        const high: number = data.daily?.temperature_2m_max?.[0];
        const low: number = data.daily?.temperature_2m_min?.[0];
        if (typeof temp !== 'number' || typeof code !== 'number') return;

        // Find the current hour's index in the hourly array
        const currentHourPrefix = (data.current?.time as string ?? '').slice(0, 13);
        const hourlyTimes: string[] = data.hourly?.time ?? [];
        const startIdx = Math.max(0, hourlyTimes.findIndex((t) => t.slice(0, 13) === currentHourPrefix));

        const rainChance: number = data.hourly?.precipitation_probability?.[startIdx] ?? 0;

        const isDay: boolean = data.current?.is_day === 1;
        const hourlyTemps: number[] = data.hourly?.temperature_2m ?? [];
        const hourlyCodes: number[] = data.hourly?.weather_code ?? [];
        const hourlyIsDay: number[] = data.hourly?.is_day ?? [];
        const hourly = hourlyTimes.slice(startIdx, startIdx + 5).map((t, i) => ({
          label: i === 0 ? 'Now' : t.slice(11, 16).replace(':00', '').replace(':30', ''),
          code: hourlyCodes[startIdx + i] ?? code,
          temp: hourlyTemps[startIdx + i] ?? temp,
          isDay: (hourlyIsDay[startIdx + i] ?? 1) === 1,
        }));

        setWeather({ temp, code, isDay, high: high ?? temp, low: low ?? temp, rainChance, hourly });
      })
      .catch(() => {});
  }, [selectedLocation]);

  // Re-decay every 5 minutes so the heatmap fades without a new Firestore event
  useEffect(() => {
    const timer = setInterval(() => {
      recomputeGeoJSON(displayPinsRef.current);
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [recomputeGeoJSON]);

  // Re-read persisted settings whenever this screen gains focus (covers returning from Settings)
  useFocusEffect(
    useCallback(() => {
      SecureStore.getItemAsync(HEATMAP_THEME_STORAGE_KEY).then((stored) => {
        if (stored) setHeatmapThemeId(stored as HeatmapThemeId);
      });
      SecureStore.getItemAsync('herdy.tempUnit').then((stored) => {
        if (stored) setUseFahrenheit(stored === 'F');
      });
      SecureStore.getItemAsync('herdy.lastPinLocationId').then((stored) => {
        if (stored) setLastPinLocationId(stored);
      });
      SecureStore.getItemAsync('herdy.filterWindowHours').then((stored) => {
        const parsed = parseInt(stored ?? '', 10);
        if (parsed === 1 || parsed === 2 || parsed === 4 || parsed === 8) {
          setFilterWindowHours(parsed);
        }
      });
      SecureStore.getItemAsync('herdy.selectedLocationId').then((stored) => {
        if (stored) {
          const loc = LOCATIONS.find((l) => l.id === stored);
          if (loc) {
            setSelectedLocation(loc);
            if (!initialLocationApplied.current) {
              initialLocationApplied.current = true;
              setTimeout(() => {
                cameraRef.current?.setCamera({
                  centerCoordinate: [loc.center.lng, loc.center.lat],
                  zoomLevel: INITIAL_ZOOM,
                  animationDuration: 600,
                });
              }, 500);
            }
          }
        }
      });
    }, []),
  );

  const heatmapStyle = useMemo(() => ({
    ...BASE_HEATMAP_STYLE,
    heatmapColor: (HEATMAP_THEMES.find((t) => t.id === heatmapThemeId) ?? HEATMAP_THEMES[0]).colorRamp as unknown as string,
  }), [heatmapThemeId]);

  const resetNorth = () => {
    cameraRef.current?.setCamera({ heading: 0, animationDuration: 300 });
  };

  const zoomIn = () => {
    const next = Math.min(zoom + 1, 20);
    setZoom(next);
    cameraRef.current?.setCamera({ zoomLevel: next, animationDuration: 200 });
  };

  const zoomOut = () => {
    const next = Math.max(zoom - 1, 1);
    setZoom(next);
    cameraRef.current?.setCamera({ zoomLevel: next, animationDuration: 200 });
  };

  const openCoffeeModal = () => {
    setDrawerOpen(false);
    setTimeout(() => setShowCoffeeModal(true), 220);
  };

  const recenterLocation = () => {
    cameraRef.current?.setCamera({
      centerCoordinate: [selectedLocation.center.lng, selectedLocation.center.lat],
      zoomLevel: INITIAL_ZOOM,
      animationDuration: 600,
    });
  };

  const handleLocationSelect = (location: AppLocation) => {
    setSelectedLocation(location);
    SecureStore.setItemAsync('herdy.selectedLocationId', location.id);
    setShowTrail(true);
    cameraRef.current?.setCamera({
      centerCoordinate: [location.center.lng, location.center.lat],
      zoomLevel: INITIAL_ZOOM,
      animationDuration: 800,
    });
  };

  const recenterUser = async () => {
    if (!locationGranted) {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'undetermined') {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== 'granted') {
        setShowLocationDeniedModal(true);
        return;
      }
      setLocationGranted(true);
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    cameraRef.current?.setCamera({
      centerCoordinate: [loc.coords.longitude, loc.coords.latitude],
      zoomLevel: 15,
      animationDuration: 600,
    });
  };

  // ── Dev tool handlers ─────────────────────────────────────────────────────

  const handleTitlePress = () => {
    if (!__DEV__) return;
    devTapCount.current += 1;
    if (devTapTimer.current) clearTimeout(devTapTimer.current);
    devTapTimer.current = setTimeout(() => { devTapCount.current = 0; }, 600);
    if (devTapCount.current >= 3) {
      devTapCount.current = 0;
      setDevModeActive(prev => !prev);
    }
  };

  const handleMapPress = (feature: GeoJSON.Feature) => {
    const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
    const [lng, lat] = coords;

    if (DEBUG) console.log(`[MapPress] tap at lat=${lat.toFixed(5)} lng=${lng.toFixed(5)}`);
    if (DEBUG) console.log(`[MapPress] devModeActive=${devModeActive} | pins in ref=${displayPinsRef.current.length}`);

    if (__DEV__ && devModeActive) {
      setDevHerdSize('1-5');
      setDevCoords(coords);
      return;
    }

    const nearby = expandCluster(lat, lng, displayPinsRef.current, NEARBY_RADIUS_M, CLUSTER_EXPANSION_RADIUS_M)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (DEBUG) console.log(`[MapPress] found ${nearby.length} in cluster`);

    if (nearby.length === 0) return;
    setNearbySightings(nearby);
    setShowNearbySheet(true);
  };

  const submitDevPin = async () => {
    if (!devCoords) return;
    setDevSubmitting(true);
    try {
      await addSighting({
        locationId: selectedLocation.id,
        timezone: selectedLocation.timezone,
        lat: devCoords[1],
        lng: devCoords[0],
        herdSize: devHerdSize,
      }, newSightingId());
      setDevCoords(null);
      setDevModeActive(false);
    } catch (e) {
      console.error('[DEV] addSighting failed:', e);
    } finally {
      setDevSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => setDrawerOpen(prev => !prev)}>
          <Ionicons name="menu" size={28} color="#111" />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleTitlePress} activeOpacity={1} style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, __DEV__ && devModeActive && styles.headerTitleDev]}>
            Herdy
          </Text>
        </TouchableOpacity>

        {weather && (
          <TouchableOpacity style={styles.headerWeatherBtn} onPress={() => setShowWeatherPopup(true)} activeOpacity={0.7}>
            <Text style={styles.wxWidgetEmoji}>{weatherEmoji(weather.code, weather.isDay)}</Text>
            <Text style={styles.weatherTemp}>
              {useFahrenheit
                ? `${Math.round(weather.temp * 9 / 5 + 32)}°F`
                : `${Math.round(weather.temp)}°C`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Map ── */}
      <View
        style={styles.mapContainer}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          mapContainerLayout.current = { width, height };
          if (width > 0 && height > 0) setMapContainerReady(true);
        }}
      >
        {mapContainerReady && <MapView
          ref={mapViewRef}
          style={styles.map}
          styleURL={mapStyle}
          attributionEnabled={false}
          scaleBarEnabled={false}
          onDidFinishLoadingStyle={() => setStyleLoaded(true)}
          onPress={handleMapPress}
          onCameraChanged={(state) => {
            const z = state.properties.zoom;
            if (typeof z === 'number') setZoom(Math.round(z));
            const h = state.properties.heading;
            if (typeof h === 'number') setHeading(h);
          }}
        >
          <Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: [ACTIVE_LOCATION.center.lng, ACTIVE_LOCATION.center.lat],
              zoomLevel: INITIAL_ZOOM,
            }}
          />

          {styleLoaded && <UserLocation
            visible={locationGranted}
            showsUserHeadingIndicator
            onUpdate={(loc) => {
              userLocationRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };
            }}
            onPress={() => {
              const loc = userLocationRef.current;
              if (!loc) return;
              if (DEBUG) console.log(`[LocationDot] tap at lat=${loc.lat.toFixed(5)} lng=${loc.lng.toFixed(5)}`);
              const nearby = expandCluster(loc.lat, loc.lng, displayPinsRef.current, NEARBY_RADIUS_M, CLUSTER_EXPANSION_RADIUS_M)
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
              if (DEBUG) console.log(`[LocationDot] found ${nearby.length} in cluster`);
              if (nearby.length === 0) return;
              setNearbySightings(nearby);
              setShowNearbySheet(true);
            }}
          />}

          {/* Outside-boundary darkening mask */}
          <ShapeSource id="boundary-mask-source" shape={boundary.mask}>
            <FillLayer
              id="boundary-mask"
              sourceID="boundary-mask-source"
              style={{ fillColor: 'rgba(0,0,0,0.32)', fillOpacity: 1 }}
            />
          </ShapeSource>

          {/* Perimeter dotted border */}
          <ShapeSource id="boundary-border-source" shape={boundary.border}>
            <LineLayer
              id="boundary-border"
              sourceID="boundary-border-source"
              style={{
                lineColor: '#888888',
                lineWidth: 3,
                lineDasharray: [4, 2],
              }}
            />
          </ShapeSource>

          {/* PR13 trail — renders from bundled asset, works offline */}
          {showTrail && selectedLocation.id === 'fanal' && (
            <ShapeSource id="trail-source" shape={TRAIL_GEOJSON}>
              <LineLayer
                id="trail-line-casing"
                sourceID="trail-source"
                style={TRAIL_CASING_STYLE}
              />
              <LineLayer
                id="trail-line"
                sourceID="trail-source"
                style={TRAIL_LINE_STYLE}
              />
              <SymbolLayer
                id="trail-label"
                sourceID="trail-source"
                style={TRAIL_LABEL_STYLE}
              />
            </ShapeSource>
          )}

          <ShapeSource id="sightings-source" shape={geoJSON}>
            <HeatmapLayer id="cow-heatmap" sourceID="sightings-source" style={heatmapStyle} />
          </ShapeSource>

          {pinLingerMarker && (
            <PinLingerMarker
              icon={pinLingerMarker.icon}
              lat={pinLingerMarker.lat}
              lng={pinLingerMarker.lng}
              onComplete={() => setPinLingerMarker(null)}
            />
          )}
        </MapView>}

        {/* Dev mode indicator — only shown in __DEV__ builds */}
        {__DEV__ && devModeActive && (
          <View style={styles.devBanner}>
            <Text style={styles.devBannerText}>⚙ DEV MODE — tap the map to drop a pin</Text>
          </View>
        )}

        {/* Location pill */}
        <View style={styles.locationPill}>
          <TouchableOpacity onPress={recenterLocation}>
            <Text style={styles.pillLocationName}>{selectedLocation.name}</Text>
          </TouchableOpacity>
          <View style={styles.pillDivider} />
          <TouchableOpacity style={styles.pillChangeBtn} onPress={() => setShowLocationPicker(true)}>
            <Ionicons name="location" size={14} color="#3C8C7C" />
            <Text style={styles.pillChangeText}>CHANGE</Text>
          </TouchableOpacity>
        </View>

        {/* Filter button — top right, width matches FAB for horizontal alignment */}
        <TouchableOpacity
          style={[styles.filterBtn, filtersActive && styles.filterBtnActive]}
          onPress={() => setShowFiltersSheet(true)}
        >
          <Ionicons name="funnel-outline" size={19} color={filtersActive ? '#3C8C7C' : '#555'} />
          {filtersActive && <View style={styles.filterActiveDot} />}
        </TouchableOpacity>

        {/* Bottom-left: zoom + locate */}
        <View style={[styles.leftControls, { bottom: insets.bottom + 52 }]}>
          {Math.abs(heading) > 1 && (
            <TouchableOpacity style={styles.controlBtn} onPress={resetNorth}>
              <Ionicons
                name="compass"
                size={24}
                color="#333"
                style={{ transform: [{ rotate: `${-heading}deg` }] }}
              />
            </TouchableOpacity>
          )}
          <View style={styles.zoomPair}>
            <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn}>
              <Ionicons name="add" size={24} color="#333" />
            </TouchableOpacity>
            <View style={styles.zoomDivider} />
            <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut}>
              <Ionicons name="remove" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.controlBtn} onPress={() => setShowMapStylePicker(true)}>
            <Ionicons name="layers-outline" size={22} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={recenterUser}>
            <Ionicons name="locate-outline" size={22} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Drop-pin FAB */}
        <TouchableOpacity
          style={[styles.pinFab, { bottom: insets.bottom + 52 }]}
          onPress={() => {
            const loc = userLocationRef.current;
            if (loc) {
              cameraRef.current?.setCamera({
                centerCoordinate: [loc.lng, loc.lat],
                zoomLevel: INITIAL_ZOOM,
                animationDuration: 400,
              });
            }
            setShowPinDrop(true);
          }}
        >
          <MaterialCommunityIcons name="map-marker-plus" size={28} color="#fff" />
        </TouchableOpacity>

        {/* Pin fly-in animation */}
        {pinFlyAnim && (
          <PinFlyAnimation
            icon={pinFlyAnim.icon}
            targetX={pinFlyAnim.targetX}
            targetY={pinFlyAnim.targetY}
            containerWidth={mapContainerLayout.current.width}
            containerHeight={mapContainerLayout.current.height}
            onLanded={() => setPinLingerMarker({ icon: pinFlyAnim.icon, lat: pinFlyAnim.lat, lng: pinFlyAnim.lng })}
            onComplete={() => setTimeout(() => setPinFlyAnim(null), 400)}
          />
        )}
      </View>

      {/* ── Drawer ── */}
      <DrawerMenu
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onBuyCoffee={openCoffeeModal}
      />

      {/* ── Buy me a coffee modal ── */}
      <Modal visible={showCoffeeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <MaterialCommunityIcons name="coffee" size={36} color="#3C8C7C" style={styles.coffeeIcon} />
            <Text style={styles.modalTitle}>Enjoying Herdy?</Text>
            <Text style={styles.coffeeBody}>
              Herdy is free, with no ads and no data sold. 
            </Text>
            <Text style={styles.coffeeBody}>
              I created this app after being moved by the magical feeling of walking through the thick fog of Fanal searching for the herd of cows. On that particular visit, I never found them, and the idea for Herdy was born: helping others discover and share those special moments together.
            </Text>
            <Text style={styles.coffeeBody}>
              Every cow spotted on the map comes from someone exploring the forest just like you.
            </Text>
            <Text style={styles.coffeeBody}>
              If Herdy made your visit a little more magical, you can help support the project and keep it running here. Thank you ❤️
            </Text>
            <Text style={styles.coffeeSupporters}>
              {donorCount !== null && donorCount > 0
                ? `${donorCount} ${donorCount === 1 ? 'person has' : 'people have'} already supported Herdy — join them.`
                : 'Be the first to support Herdy. No literally, you would be the first :).'}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowCoffeeModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Maybe later</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={() => {
                  setShowCoffeeModal(false);
                  Linking.openURL('https://ko-fi.com/biserasparuhov');
                }}
              >
                <Text style={styles.modalBtnConfirmText}>Support Herdy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Location permission denied modal ── */}
      <Modal visible={showLocationDeniedModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="location-outline" size={36} color="#3C8C7C" style={styles.coffeeIcon} />
            <Text style={styles.modalTitle}>Location Access Needed</Text>
            <Text style={styles.coffeeBody}>
              It looks like you haven't allowed location sharing for Herdy. Please go to Settings and enable it to use this feature.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowLocationDeniedModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={() => {
                  setShowLocationDeniedModal(false);
                  Linking.openSettings();
                }}
              >
                <Text style={styles.modalBtnConfirmText}>Go to Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Pin drop backdrop ── */}
      {showPinDrop && (
        <TouchableOpacity
          style={styles.locationPickerBackdrop}
          activeOpacity={1}
          onPress={() => setShowPinDrop(false)}
        />
      )}

      {/* ── Pin drop sheet ── */}
      <PinDropSheet
        visible={showPinDrop}
        onClose={() => setShowPinDrop(false)}
        onSubmit={handlePinSubmit}
        location={selectedLocation}
        displayPins={displayPins}
        myDeviceId={myDeviceId}
      />

      {/* ── Nearby sightings sheet ── */}
      <NearbySheet
        sightings={nearbySightings}
        visible={showNearbySheet}
        onClose={() => setShowNearbySheet(false)}
        onCenterMap={(lat, lng) => {
          setShowNearbySheet(false);
          cameraRef.current?.setCamera({
            centerCoordinate: [lng, lat],
            zoomLevel: 16,
            animationDuration: 600,
          });
        }}
      />

      {/* ── Location picker backdrop — sits above header so it blocks touches ── */}
      {showLocationPicker && (
        <TouchableOpacity
          style={styles.locationPickerBackdrop}
          activeOpacity={1}
          onPress={() => setShowLocationPicker(false)}
        />
      )}

      {/* ── Location picker sheet ── */}
      <LocationPickerSheet
        visible={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onSelect={handleLocationSelect}
      />

      {/* ── Weather popup ── */}
      {weather && (
        <Modal visible={showWeatherPopup} transparent animationType="fade">
          <View style={styles.filterPopupOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setShowWeatherPopup(false)}
            />
            <View style={styles.filterPopupCard}>

              {/* ── Summary row ── */}
              <View style={styles.wxSummaryRow}>
                {/* Col 1 – large condition icon */}
                <Text style={styles.wxBigEmoji}>{weatherEmoji(weather.code, weather.isDay)}</Text>

                {/* Col 2 – location + description + rain */}
                <View style={styles.wxMid}>
                  <Text style={styles.wxLocationName} numberOfLines={1}>{selectedLocation.name}</Text>
                  <Text style={styles.wxDescription}>{weatherDescription(weather.code)}</Text>
                  <Text style={styles.wxRain}>Rain: {weather.rainChance}%</Text>
                </View>

                {/* Col 3 – current temp + H/L */}
                <View style={styles.wxRight}>
                  <Text style={styles.wxCurrentTemp}>
                    {useFahrenheit ? Math.round(weather.temp * 9 / 5 + 32) : Math.round(weather.temp)}°
                  </Text>
                  <Text style={styles.wxHighLow}>
                    H:{useFahrenheit ? Math.round(weather.high * 9 / 5 + 32) : Math.round(weather.high)}°
                    {'  '}
                    L:{useFahrenheit ? Math.round(weather.low * 9 / 5 + 32) : Math.round(weather.low)}°
                  </Text>
                </View>
              </View>

              {/* ── Hourly strip ── */}
              <View style={styles.wxHourlyRow}>
                {weather.hourly.map((h) => (
                  <View key={h.label} style={styles.wxHourlyItem}>
                    <Text style={styles.wxHourLabel}>{h.label}</Text>
                    <Text style={styles.wxHourEmoji}>{weatherEmoji(h.code, h.isDay)}</Text>
                    <Text style={styles.wxHourTemp}>
                      {useFahrenheit ? Math.round(h.temp * 9 / 5 + 32) : Math.round(h.temp)}°
                    </Text>
                  </View>
                ))}
              </View>

            </View>
          </View>
        </Modal>
      )}

      {/* ── Map style picker ── */}
      <Modal visible={showMapStylePicker} transparent animationType="fade">
        <View style={styles.filterPopupOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowMapStylePicker(false)}
          />
          <View style={styles.filterPopupCard}>
            <Text style={styles.filterSheetTitle}>Map Style</Text>
            <View style={styles.mapStyleGrid}>
              {MAP_STYLES.map((style) => {
                const selected = mapStyle === style.styleURL;
                const thumbUri = `https://api.mapbox.com/styles/v1/${style.mapboxId}/static/${selectedLocation.center.lng},${selectedLocation.center.lat},13/80x80@2x?access_token=${process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? ''}`;
                return (
                  <TouchableOpacity
                    key={style.mapboxId}
                    style={styles.mapStyleItem}
                    onPress={() => { setMapStyle(style.styleURL); setStyleLoaded(false); }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.mapStyleThumb, selected && styles.mapStyleThumbSelected, { width: thumbSize, height: thumbSize }]}>
                      <Image style={styles.mapStyleImage} source={{ uri: thumbUri }} resizeMode="cover" />
                    </View>
                    <Text style={[styles.mapStyleLabel, selected && styles.mapStyleLabelSelected]}>
                      {style.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.filterPopupFooter}>
              <View />
              <TouchableOpacity style={styles.filterDoneBtn} onPress={() => setShowMapStylePicker(false)}>
                <Text style={styles.filterDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Filter popup ── */}
      <Modal visible={showFiltersSheet} transparent animationType="fade">
        <View style={styles.filterPopupOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowFiltersSheet(false)}
          />
          <View style={styles.filterPopupCard}>
            <Text style={styles.filterSheetTitle}>Filters</Text>

            {/* ── Sighting window ── */}
            <Text style={styles.filterSectionLabel}>Sighting window</Text>
            <View style={styles.sliderContainer}>
              {FILTER_TIME_STEPS.map((step, i) => {
                const selected = filterWindowHours === step.hours;
                const isActive = i <= selectedTimeIndex;
                const isLast = i === FILTER_TIME_STEPS.length - 1;
                return (
                  <React.Fragment key={step.label}>
                    <View style={styles.sliderStopCol}>
                      <TouchableOpacity
                        onPress={() => setFilterWindowHours(step.hours)}
                        hitSlop={{ top: 12, bottom: 4, left: 12, right: 12 }}
                      >
                        <View style={[
                          styles.sliderDot,
                          isActive && styles.sliderDotActive,
                          selected && styles.sliderDotSelected,
                        ]} />
                      </TouchableOpacity>
                      <Text style={[styles.sliderStepLabel, selected && styles.sliderStepLabelActive]}>
                        {step.label}
                      </Text>
                    </View>
                    {!isLast && (
                      <View style={[styles.sliderLine, i < selectedTimeIndex && styles.sliderLineActive]} />
                    )}
                  </React.Fragment>
                );
              })}
            </View>

            {/* ── Minimum herd size ── */}
            <Text style={[styles.filterSectionLabel, { marginTop: 28 }]}>Minimum herd size</Text>
            <View style={styles.segmentedRow}>
              {FILTER_HERD_OPTIONS.map((opt) => {
                const selected = filterMinHerd === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.segmentBtn, selected && styles.segmentBtnSelected]}
                    onPress={() => setFilterMinHerd(opt.value)}
                  >
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Toggles ── */}
            <View style={styles.filterToggleRow}>
              <Text style={styles.filterToggleLabel}>My sightings only</Text>
              <Switch
                value={filterMyOnly}
                onValueChange={setFilterMyOnly}
                trackColor={{ false: '#E0E0E0', true: '#A8D5CE' }}
                thumbColor={filterMyOnly ? '#3C8C7C' : '#fff'}
              />
            </View>
            {/* Confirmed-sightings toggle — hidden for now, verification flow isn't built yet
            <View style={styles.filterToggleRow}>
              <View style={styles.filterToggleLabelRow}>
                <Text style={styles.filterToggleLabel}>Confirmed sightings</Text>
                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => Alert.alert(
                    'Confirmed sightings',
                    'Shows only sightings that at least one other user has verified with a "Still here" tap — a sign the herd is likely still in the area.',
                    [{ text: 'Got it' }],
                  )}
                >
                  <Ionicons name="information-circle-outline" size={16} color="#BBB" />
                </TouchableOpacity>
              </View>
              <Switch
                value={filterConfirmedOnly}
                onValueChange={setFilterConfirmedOnly}
                trackColor={{ false: '#E0E0E0', true: '#A8D5CE' }}
                thumbColor={filterConfirmedOnly ? '#3C8C7C' : '#fff'}
              />
            </View>
            */}

            {selectedLocation.id === 'fanal' && (
              <View style={styles.filterToggleRow}>
                <View style={styles.filterToggleLabelRow}>
                  <Text style={styles.filterToggleLabel}>Show PR13 trail</Text>
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => Alert.alert(
                      'PR13 – Levada do Fanal',
                      'A winding trail through one of the world\'s last surviving laurel forests — a UNESCO World Heritage Site whose trees are over 15 million years old.\n\nThe fog-draped plateau is also home to a semi-wild herd of Madeiran cattle that have roamed here for centuries.',
                      [{ text: 'Got it' }],
                    )}
                  >
                    <Ionicons name="information-circle-outline" size={16} color="#BBB" />
                  </TouchableOpacity>
                </View>
                <Switch
                  value={showTrail}
                  onValueChange={setShowTrail}
                  trackColor={{ false: '#E0E0E0', true: '#A8D5CE' }}
                  thumbColor={showTrail ? '#3C8C7C' : '#fff'}
                />
              </View>
            )}

            {/* ── Footer ── */}
            <View style={styles.filterPopupFooter}>
              {filtersActive ? (
                <TouchableOpacity
                  onPress={() => { setFilterWindowHours(4); setFilterMinHerd('any'); setFilterMyOnly(false); setFilterConfirmedOnly(false); setShowTrail(true); }}
                >
                  <Text style={styles.filterResetText}>Reset</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}
              <TouchableOpacity
                style={styles.filterDoneBtn}
                onPress={() => setShowFiltersSheet(false)}
              >
                <Text style={styles.filterDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Dev pin dialog — __DEV__ only, never ships to production ── */}
      {__DEV__ && (
        <Modal visible={devCoords !== null} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.devDialogTitle}>⚙ Dev Pin Drop</Text>
              <Text style={styles.devDialogCoords}>
                {devCoords ? `${devCoords[1].toFixed(5)}, ${devCoords[0].toFixed(5)}` : ''}
              </Text>

              <Text style={styles.devFieldLabel}>Herd size</Text>
              <View style={styles.devHerdRow}>
                {HERD_SIZES.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.devHerdBtn, devHerdSize === opt && styles.devHerdBtnActive]}
                    onPress={() => setDevHerdSize(opt)}
                  >
                    <Text style={[styles.devHerdBtnText, devHerdSize === opt && styles.devHerdBtnTextActive]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>


              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                  onPress={() => setDevCoords(null)}
                >
                  <Text style={styles.modalBtnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnConfirm, devSubmitting && { opacity: 0.6 }]}
                  onPress={submitDevPin}
                  disabled={devSubmitting}
                >
                  <Text style={styles.modalBtnConfirmText}>
                    {devSubmitting ? 'Dropping…' : 'Drop Pin'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  headerIconBtn: {
    padding: 6,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 38,
    fontWeight: '800',
    color: '#111',
    marginLeft: 16,
    letterSpacing: -1,
  },
  headerTitleDev: {
    color: '#E07B00',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerWeatherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },

  // ── Map ──
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },

  // ── Dev banner ──
  devBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#E07B00',
    paddingVertical: 6,
    alignItems: 'center',
    zIndex: 20,
  },
  devBannerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Location pill ──
  locationPill: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 100,
    paddingVertical: 10,
    paddingLeft: 18,
    paddingRight: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  pillLocationName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  pillDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 12,
  },
  pillChangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillChangeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3C8C7C',
    letterSpacing: 0.5,
  },

  // ── Left controls ──
  leftControls: {
    position: 'absolute',
    left: 16,
    alignItems: 'center',
    gap: 8,
  },
  zoomPair: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 8,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },

  // ── Pin FAB ──
  pinFab: {
    position: 'absolute',
    right: 16,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#3C8C7C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },

  // ── Shared modal styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    width: '78%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: '#F2F2F2',
  },
  modalBtnConfirm: {
    backgroundColor: '#3C8C7C',
  },
  modalBtnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  modalBtnConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  coffeeIcon: {
    alignSelf: 'center',
    marginBottom: 12,
  },
  coffeeBody: {
    fontSize: 14,
    color: '#444',
    lineHeight: 21,
    marginBottom: 12,
  },
  coffeeSupporters: {
    fontSize: 13,
    color: '#3C8C7C',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 26,
  },
  coffeeHeart: {
    fontSize: 14,
    color: '#444',
    fontWeight: '600',
    marginBottom: 24,
  },

  // ── Crosshair ──
  crosshairContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 24,
    height: 24,
    marginLeft: -12,
    marginTop: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairH: {
    position: 'absolute',
    width: 24,
    height: 2,
    backgroundColor: '#3C8C7C',
    borderRadius: 1,
  },
  crosshairV: {
    position: 'absolute',
    width: 2,
    height: 24,
    backgroundColor: '#3C8C7C',
    borderRadius: 1,
  },

  // ── Location picker backdrop ──
  locationPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 99,
  },

  // ── Dev dialog ──
  devDialogTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E07B00',
    textAlign: 'center',
    marginBottom: 4,
  },
  devDialogCoords: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    fontFamily: 'monospace',
    marginBottom: 20,
  },
  devFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  devHerdRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  devHerdBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#DDD',
    alignItems: 'center',
  },
  devHerdBtnActive: {
    borderColor: '#3C8C7C',
    backgroundColor: '#EAF5F3',
  },
  devHerdBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#AAA',
  },
  devHerdBtnTextActive: {
    color: '#3C8C7C',
  },
  devToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },

  // ── Filter button ──
  filterBtn: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 58,
    height: 40,
    borderRadius: 100,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  filterBtnActive: {
    borderWidth: 1.5,
    borderColor: '#3C8C7C',
  },
  filterActiveDot: {
    position: 'absolute',
    top: 6,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#3C8C7C',
  },

  // ── Filter popup ──
  filterPopupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPopupCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 16,
  },
  filterSheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 24,
  },
  filterPopupFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  filterDoneBtn: {
    backgroundColor: '#3C8C7C',
    paddingVertical: 11,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  filterDoneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 20,
  },

  // ── Step slider ──
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sliderStopCol: {
    alignItems: 'center',
    width: 44,
  },
  sliderDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E0E0E0',
  },
  sliderDotActive: {
    backgroundColor: '#A8D5CE',
  },
  sliderDotSelected: {
    backgroundColor: '#3C8C7C',
  },
  sliderStepLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '500',
    color: '#AAA',
  },
  sliderStepLabelActive: {
    color: '#3C8C7C',
    fontWeight: '700',
  },
  sliderLine: {
    flex: 1,
    height: 3,
    marginTop: 9.5,
    backgroundColor: '#E0E0E0',
    borderRadius: 1.5,
  },
  sliderLineActive: {
    backgroundColor: '#3C8C7C',
  },

  // ── Herd size segmented control ──
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  segmentBtnSelected: {
    borderColor: '#3C8C7C',
    backgroundColor: '#EAF5F3',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  segmentTextSelected: {
    color: '#3C8C7C',
  },

  // ── Reset button ──
  filterResetBtn: {
    marginTop: 24,
    paddingVertical: 10,
    alignItems: 'center',
  },
  filterResetText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E07B00',
  },
  filterToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0F0F0',
    marginTop: 8,
  },
  filterToggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterToggleLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#222',
  },

  // ── Map style grid ──
  mapStyleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
  },
  mapStyleItem: {
    flex: 1,
    minWidth: 68,   // wraps only on screens narrower than ~310px
    maxWidth: 110,  // keeps lone bottom item from stretching full-width if it wraps
    alignItems: 'center',
    gap: 6,
  },
  mapStyleThumb: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F0F0F0',
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  mapStyleThumbSelected: {
    borderColor: '#3C8C7C',
  },
  mapStyleImage: {
    width: '100%',
    height: '100%',
    borderRadius: 11.5,
  },
  mapStyleLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#888',
    textAlign: 'center',
  },
  mapStyleLabelSelected: {
    color: '#3C8C7C',
    fontWeight: '700',
  },

  // ── Weather popup ──
  wxSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  wxBigIcon: {
    width: 52,
    textAlign: 'center',
  },
  wxMid: {
    flex: 1,
    gap: 3,
  },
  wxLocationName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
  },
  wxDescription: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  wxRain: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  wxRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  wxCurrentTemp: {
    fontSize: 34,
    fontWeight: '200',
    color: '#111',
    lineHeight: 38,
  },
  wxHighLow: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  wxHourlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EBEBEB',
  },
  wxHourlyItem: {
    alignItems: 'center',
    gap: 6,
  },
  wxHourLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  wxHourTemp: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111',
  },

  wxWidgetEmoji: {
    fontSize: 18,
  },
  wxBigEmoji: {
    fontSize: 48,
    lineHeight: 56,
  },
  wxHourEmoji: {
    fontSize: 18,
  },

  weatherTemp: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
  },
});
