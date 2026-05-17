import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DRAWER_WIDTH = 280;

interface Props {
  visible: boolean;
  onClose: () => void;
  onBuyCoffee: () => void;
}

export default function DrawerMenu({ visible, onClose, onBuyCoffee }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const openSettings = () => {
    onClose();
    setTimeout(() => router.push('/settings'), 220);
  };
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: visible ? 0 : -DRAWER_WIDTH,
        duration: visible ? 250 : 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: visible ? 1 : 0,
        duration: visible ? 250 : 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* Dimmed overlay */}
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          { paddingTop: insets.top + 24, transform: [{ translateX: slideAnim }] },
        ]}
      >
        <Text style={styles.drawerAppName}>Herdy</Text>

        <View style={styles.items}>
          <TouchableOpacity style={styles.item}>
            <Ionicons name="person-outline" size={22} color="#333" />
            <Text style={styles.itemText}>Account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.item} onPress={openSettings}>
            <Ionicons name="settings-outline" size={22} color="#333" />
            <Text style={styles.itemText}>Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.item} onPress={onBuyCoffee}>
            <MaterialCommunityIcons name="coffee" size={22} color="#333" />
            <Text style={styles.itemText}>Buy me a coffee</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 20,
  },
  drawerAppName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.5,
    marginBottom: 36,
  },
  items: {
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  itemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
});
