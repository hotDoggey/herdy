import Mapbox from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type IconName = ComponentProps<typeof Ionicons>['name'];

const STYLES: { label: string; icon: IconName; url: string }[] = [
  { label: 'Outdoors',          icon: 'trail-sign-outline', url: Mapbox.StyleURL.Outdoors },
  { label: 'Streets',           icon: 'map-outline',        url: Mapbox.StyleURL.Street },
  { label: 'Satellite',         icon: 'globe-outline',      url: Mapbox.StyleURL.Satellite },
  { label: 'Satellite + Roads', icon: 'earth-outline',       url: Mapbox.StyleURL.SatelliteStreet },
  { label: 'Dark',              icon: 'moon-outline',       url: Mapbox.StyleURL.Dark },
];

type Props = {
  visible: boolean;
  current: string;
  onSelect: (url: string) => void;
  onClose: () => void;
};

export default function MapStylePicker({ visible, current, onSelect, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 300,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      {/* Tap-outside backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Map Style</Text>

        {STYLES.map((s) => (
          <TouchableOpacity
            key={s.url}
            style={[styles.row, current === s.url && styles.rowSelected]}
            onPress={() => { onSelect(s.url); onClose(); }}
          >
            <Ionicons
              name={s.icon}
              size={22}
              color={current === s.url ? '#1E8A6E' : '#444'}
            />
            <Text style={[styles.label, current === s.url && styles.labelSelected]}>
              {s.label}
            </Text>
            {current === s.url && (
              <Ionicons name="checkmark" size={18} color="#1E8A6E" style={styles.check} />
            )}
          </TouchableOpacity>
        ))}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 40,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    paddingHorizontal: 8,
    gap: 12,
  },
  rowSelected: {
    backgroundColor: '#F0FAF7',
  },
  label: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  labelSelected: {
    color: '#1E8A6E',
    fontWeight: '600',
  },
  check: {
    marginLeft: 'auto',
  },
});
