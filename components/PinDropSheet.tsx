import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AppLocation } from '@/constants/locations';
import { type Sighting } from '@/lib/firestore';
import { haversineDistance, isPointInPolygon } from '@/lib/geo';

const HERD_SIZES = ['1–5', '5–10', '10+'] as const;
type HerdSize = typeof HERD_SIZES[number];

const DUPLICATE_RADIUS_M = 15;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (lat: number, lng: number, herdSize: string) => void;
  location: AppLocation;
  displayPins: Sighting[];
  myDeviceId: string | null;
}

function hasDuplicateNearby(
  lat: number,
  lng: number,
  deviceId: string,
  pins: Sighting[],
): boolean {
  if (__DEV__) return false; // disabled for testing — remove this line to restore the cooldown
  const now = Date.now();
  return pins.some(
    (p) =>
      p.deviceId === deviceId &&
      now - p.createdAt.getTime() < DUPLICATE_WINDOW_MS &&
      haversineDistance(lat, lng, p.lat, p.lng) < DUPLICATE_RADIUS_M,
  );
}

export default function PinDropSheet({ visible, onClose, onSubmit, location, displayPins, myDeviceId }: Props) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['45%'], []);

  const [herdSize, setHerdSize] = useState<HerdSize>('1–5');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  useEffect(() => {
    if (visible) {
      setHerdSize('1–5');
      setGpsCoords(null);
      setGpsError(null);
      setLocationDenied(false);
      setGpsLoading(true);
      sheetRef.current?.snapToIndex(0);

      Location.requestForegroundPermissionsAsync()
        .then(({ status }) => {
          if (status !== 'granted') {
            setLocationDenied(true);
            return null;
          }
          return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        })
        .then((loc) => {
          if (loc) setGpsCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        })
        .catch(() => setGpsError('Could not get your location. Please try again.'))
        .finally(() => setGpsLoading(false));
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  const handleChange = useCallback(
    (index: number) => { if (index === -1) onClose(); },
    [onClose],
  );

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  const handleSubmit = () => {
    if (!gpsCoords) return;
    onSubmit(gpsCoords.lat, gpsCoords.lng, herdSize);
    sheetRef.current?.close();
  };

  const renderContent = () => {
    if (gpsLoading) {
      return (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#3C8C7C" />
          <Text style={styles.centeredStateText}>Getting your location…</Text>
        </View>
      );
    }

    if (locationDenied) {
      return (
        <View style={styles.centeredState}>
          <Ionicons name="location-outline" size={36} color="#AAA" />
          <Text style={styles.blockTitle}>Location access needed</Text>
          <Text style={styles.blockBody}>
            To add a sighting, Herdy needs access to your location. Please enable it in Settings.
          </Text>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => Linking.openURL('app-settings:')}
            activeOpacity={0.8}
          >
            <Text style={styles.settingsBtnText}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={() => sheetRef.current?.close()}>
            <Text style={styles.closeBtnText}>Not now</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (gpsError) {
      return (
        <View style={styles.centeredState}>
          <Ionicons name="location-outline" size={36} color="#AAA" />
          <Text style={styles.centeredStateText}>{gpsError}</Text>
        </View>
      );
    }

    if (!gpsCoords) return null;

    const { lat, lng } = gpsCoords;
    const inBounds = isPointInPolygon(lat, lng, location.perimeterPolygon);

    if (!inBounds) {
      return (
        <View style={styles.centeredState}>
          <Ionicons name="warning-outline" size={36} color="#E07B00" />
          <Text style={styles.blockTitle}>Outside the boundary</Text>
          <Text style={styles.blockBody}>
            You appear to be outside the {location.name} boundary. Please stay on the designated
            trail to report a sighting.
          </Text>
          <TouchableOpacity style={styles.closeBtn} onPress={() => sheetRef.current?.close()}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (myDeviceId && hasDuplicateNearby(lat, lng, myDeviceId, displayPins)) {
      return (
        <View style={styles.centeredState}>
          <Ionicons name="checkmark-circle-outline" size={36} color="#3C8C7C" />
          <Text style={styles.blockTitle}>Already reported nearby</Text>
          <Text style={styles.blockBody}>
            Looks like you already submitted a sighting near here recently. Wait a bit before
            submitting again, or move to a different spot.
          </Text>
          <TouchableOpacity style={styles.closeBtn} onPress={() => sheetRef.current?.close()}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        <Text style={styles.title}>Report a Sighting</Text>

        <Text style={styles.label}>How many animals?</Text>
        <View style={styles.herdRow}>
          {HERD_SIZES.map((size) => (
            <TouchableOpacity
              key={size}
              style={[styles.herdBtn, herdSize === size && styles.herdBtnActive]}
              onPress={() => setHerdSize(size)}
              activeOpacity={0.7}
            >
              <Text style={[styles.herdBtnText, herdSize === size && styles.herdBtnTextActive]}>
                {size}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.8}>
          <Ionicons name="location" size={18} color="#fff" />
          <Text style={styles.submitBtnText}>Drop Pin</Text>
        </TouchableOpacity>
      </>
    );
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      topInset={insets.top}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onChange={handleChange}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
      containerStyle={styles.sheetContainer}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    zIndex: 100,
    elevation: 100,
  },
  sheetBackground: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  handleIndicator: {
    width: 40,
    height: 4,
    backgroundColor: '#DDD',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  centeredState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  centeredStateText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  blockBody: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  settingsBtn: {
    marginTop: 8,
    paddingVertical: 13,
    paddingHorizontal: 32,
    borderRadius: 10,
    backgroundColor: '#3C8C7C',
  },
  settingsBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  closeBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },

  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 20,
    marginLeft: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  herdRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  herdBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DDD',
    alignItems: 'center',
  },
  herdBtnActive: {
    borderColor: '#3C8C7C',
    backgroundColor: '#EAF5F3',
  },
  herdBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#AAA',
  },
  herdBtnTextActive: {
    color: '#3C8C7C',
  },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3C8C7C',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
