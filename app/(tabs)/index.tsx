import Mapbox, {
  Camera,
  HeatmapLayer,
  MapView,
  ShapeSource,
  UserLocation,
} from '@rnmapbox/maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DrawerMenu from '@/components/DrawerMenu';
import LocationPickerSheet from '@/components/LocationPickerSheet';
import { ACTIVE_LOCATION, type AppLocation } from '@/constants/locations';
import { EMPTY_GEOJSON, sightingsToGeoJSON } from '@/lib/decay';
import { addSighting, subscribeSightings, type Sighting } from '@/lib/firestore';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

const INITIAL_ZOOM = 14;


const HEATMAP_STYLE = {
  heatmapWeight: ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 1, 1] as unknown as number,
  heatmapIntensity: 1.5,
  heatmapRadius: 60,
  heatmapColor: [
    'interpolate', ['linear'], ['heatmap-density'],
    0,   'rgba(0,0,0,0)',
    0.2, 'rgba(100,200,180,0.3)',
    0.5, 'rgba(60,160,140,0.6)',
    0.8, 'rgba(30,130,110,0.8)',
    1,   'rgba(255,255,255,0.9)',
  ] as unknown as string,
  heatmapOpacity: 0.85,
};

const HERD_SIZES = ['1-5', '5-10', '10+'] as const;
type HerdSize = typeof HERD_SIZES[number];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCoffeeModal, setShowCoffeeModal] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState<AppLocation>(ACTIVE_LOCATION);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Live heatmap data
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [geoJSON, setGeoJSON] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
  const sightingsRef = useRef<Sighting[]>([]);

  // Dev tool — triple-tap "Herdy" to activate, then tap map to place a pin
  const devTapCount = useRef(0);
  const devTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [devModeActive, setDevModeActive] = useState(false);
  const [devCoords, setDevCoords] = useState<[number, number] | null>(null);
  const [devHerdSize, setDevHerdSize] = useState<HerdSize>('1-5');
  const [devOutOfBounds, setDevOutOfBounds] = useState(false);
  const [devSubmitting, setDevSubmitting] = useState(false);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      setLocationGranted(status === 'granted');
    });
  }, []);

  // Subscribe to live Firestore sightings for the selected location
  useEffect(() => {
    return subscribeSightings(selectedLocation.id, setSightings);
  }, [selectedLocation.id]);

  // Recompute GeoJSON whenever Firestore delivers a new snapshot
  useEffect(() => {
    sightingsRef.current = sightings;
    setGeoJSON(sightingsToGeoJSON(sightings));
  }, [sightings]);

  // Re-decay in-memory pins every 5 minutes so the heatmap fades without needing a new Firestore event
  useEffect(() => {
    const timer = setInterval(() => {
      setGeoJSON(sightingsToGeoJSON(sightingsRef.current));
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

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
    cameraRef.current?.setCamera({
      centerCoordinate: [location.center.lng, location.center.lat],
      zoomLevel: INITIAL_ZOOM,
      animationDuration: 800,
    });
  };

  const recenterUser = async () => {
    if (!locationGranted) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
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
    if (!__DEV__ || !devModeActive) return;
    const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
    setDevHerdSize('1-5');
    setDevOutOfBounds(false);
    setDevCoords(coords);
  };

  const submitDevPin = async () => {
    if (!devCoords) return;
    setDevSubmitting(true);
    try {
      await addSighting({
        locationId: ACTIVE_LOCATION.id,
        timezone: ACTIVE_LOCATION.timezone,
        lat: devCoords[1],
        lng: devCoords[0],
        herdSize: devHerdSize,
        isOutOfBounds: devOutOfBounds,
      });
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

        <TouchableOpacity style={styles.headerIconBtn}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={22} color="#666" />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          styleURL={Mapbox.StyleURL.Outdoors}
          attributionEnabled={false}
          onPress={handleMapPress}
          onRegionIsChanging={(feature) => {
            const z = feature.properties?.zoomLevel;
            if (typeof z === 'number') setZoom(Math.round(z));
          }}
        >
          <Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: [ACTIVE_LOCATION.center.lng, ACTIVE_LOCATION.center.lat],
              zoomLevel: INITIAL_ZOOM,
            }}
          />

          <UserLocation visible={locationGranted} showsUserHeadingIndicator />

          <ShapeSource id="sightings-source" shape={geoJSON}>
            <HeatmapLayer id="cow-heatmap" sourceID="sightings-source" style={HEATMAP_STYLE} />
          </ShapeSource>
        </MapView>

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

        {/* Bottom-left: zoom + locate */}
        <View style={[styles.leftControls, { bottom: insets.bottom + 28 }]}>
          <View style={styles.zoomPair}>
            <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn}>
              <Ionicons name="add" size={24} color="#333" />
            </TouchableOpacity>
            <View style={styles.zoomDivider} />
            <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut}>
              <Ionicons name="remove" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.controlBtn} onPress={recenterUser}>
            <Ionicons name="locate-outline" size={22} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Drop-pin FAB */}
        <TouchableOpacity
          style={[styles.pinFab, { bottom: insets.bottom + 28 }]}
          onPress={() => setShowConfirmModal(true)}
        >
          <MaterialCommunityIcons name="map-marker-plus" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Drawer ── */}
      <DrawerMenu
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onBuyCoffee={openCoffeeModal}
      />

      {/* ── Confirm sighting modal ── */}
      <Modal visible={showConfirmModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm sighting?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.modalBtnConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Buy me a coffee modal ── */}
      <Modal visible={showCoffeeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <MaterialCommunityIcons name="coffee" size={36} color="#3C8C7C" style={styles.coffeeIcon} />
            <Text style={styles.modalTitle}>Support Herdy</Text>
            <Text style={styles.coffeeBody}>
              Hi, I'm a solo developer and Herdy started as a random idea — a small way to help people find the herd at Fanal without disturbing it.
            </Text>
            <Text style={styles.coffeeBody}>
              I'm glad it's out in the world now, and I hope it makes your visit a little more special. If you've found it helpful and want to keep the project going, feel free to fuel my work with a coffee ;)
            </Text>
            <Text style={styles.coffeeHeart}>❤️  Much appreciated!</Text>
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
                  Linking.openURL('https://buymeacoffee.com/herdy');
                }}
              >
                <Text style={styles.modalBtnConfirmText}>☕  Buy a coffee</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

              <View style={styles.devToggleRow}>
                <Text style={styles.devFieldLabel}>Out of bounds</Text>
                <Switch
                  value={devOutOfBounds}
                  onValueChange={setDevOutOfBounds}
                  trackColor={{ true: '#3C8C7C' }}
                />
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
  coffeeHeart: {
    fontSize: 14,
    color: '#444',
    fontWeight: '600',
    marginBottom: 24,
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
});
