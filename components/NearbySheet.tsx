import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Sighting } from '@/lib/firestore';

interface Props {
  sightings: Sighting[];
  visible: boolean;
  onClose: () => void;
  onCenterMap: (lat: number, lng: number) => void;
}

function timeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
}

export default function NearbySheet({ sightings, visible, onClose, onCenterMap }: Props) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['38%', '72%'], []);
  const router = useRouter();

  useEffect(() => {
    if (visible && sightings.length > 0) {
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [visible, sightings.length]);

  const handleChange = useCallback(
    (index: number) => { if (index === -1) onClose(); },
    [onClose],
  );

  const openDetail = (sighting: Sighting) => {
    onClose();
    router.push({ pathname: '/sighting/[id]', params: { id: sighting.id, herdSize: sighting.herdSize } });
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      topInset={insets.top}
      enablePanDownToClose
      onChange={handleChange}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
      containerStyle={styles.sheetContainer}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>
          {sightings.length === 1 ? '1 sighting nearby' : `${sightings.length} sightings nearby`}
        </Text>

        {sightings.map((sighting, i) => (
          <TouchableOpacity
            key={sighting.id}
            style={[styles.card, i === sightings.length - 1 && styles.cardLast]}
            onPress={() => openDetail(sighting)}
            activeOpacity={0.7}
          >
            {/* Avatar */}
            <View style={styles.avatar}>
              <Ionicons name="person" size={22} color="#666" />
            </View>

            {/* Info */}
            <View style={styles.cardBody}>
              <View style={styles.cardTopRow}>
                <Text style={styles.herdSize}>{sighting.herdSize} animals</Text>
                <Text style={styles.timeAgo}>{timeAgo(sighting.createdAt)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => onCenterMap(sighting.lat, sighting.lng)}
                hitSlop={{ top: 8, bottom: 8, left: 0, right: 12 }}
                style={{ alignSelf: 'flex-start' }}
              >
                <Text style={styles.coords}>
                  {sighting.lat.toFixed(4)}°, {sighting.lng.toFixed(4)}°
                </Text>
              </TouchableOpacity>
            </View>

            <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
        ))}
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
  heading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 14,
    marginTop: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEFEF',
    gap: 14,
  },
  cardLast: {
    borderBottomWidth: 0,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  herdSize: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  timeAgo: {
    fontSize: 13,
    color: '#AAA',
    fontWeight: '500',
  },
  coords: {
    fontSize: 13,
    color: '#2979FF',
    fontWeight: '500',
  },
});
