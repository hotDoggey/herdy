import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LOCATIONS, type AppLocation } from '@/constants/locations';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (location: AppLocation) => void;
}

export default function LocationPickerSheet({ visible, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['60%', '80%'], []);

  // Holds a location selected by card press so it fires after the close animation
  const pendingSelection = useRef<AppLocation | null>(null);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  // Fires whenever the sheet settles at a new index (-1 = fully closed)
  const handleChange = useCallback((index: number) => {
    if (index === -1) {
      onClose();
      if (pendingSelection.current) {
        onSelect(pendingSelection.current);
        pendingSelection.current = null;
      }
    }
  }, [onClose, onSelect]);

  const handleCardPress = useCallback((location: AppLocation) => {
    if (location.status !== 'active') return;
    pendingSelection.current = location;
    sheetRef.current?.close();
  }, []);

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
        <Text style={styles.title}>Select Location</Text>

        {LOCATIONS.map((location) => {
          const isSelectable = location.status === 'active';
          return (
            <TouchableOpacity
              key={location.id}
              style={[styles.card, !isSelectable && styles.cardDimmed]}
              activeOpacity={0.75}
              onPress={() => handleCardPress(location)}
            >
              <Image source={location.imageAsset} style={styles.cardImage} />

              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{location.name}</Text>
                {location.status === 'coming-soon' && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Coming Soon</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
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
    paddingHorizontal: 16,
    paddingTop: 4,
  },

  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
    marginLeft: 2,
  },

  card: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardDimmed: {
    opacity: 0.72,
  },

  cardImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
    resizeMode: 'cover',
  },

  cardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.38)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flexShrink: 1,
  },

  badge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
