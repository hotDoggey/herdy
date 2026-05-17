import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEFAULT_THEME_ID,
  HEATMAP_THEMES,
  HEATMAP_THEME_STORAGE_KEY,
  type HeatmapThemeId,
} from '@/constants/heatmapThemes';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedTheme, setSelectedTheme] = useState<HeatmapThemeId>(DEFAULT_THEME_ID);

  useEffect(() => {
    SecureStore.getItemAsync(HEATMAP_THEME_STORAGE_KEY).then((stored) => {
      if (stored) setSelectedTheme(stored as HeatmapThemeId);
    });
  }, []);

  const selectTheme = async (id: HeatmapThemeId) => {
    setSelectedTheme(id);
    await SecureStore.setItemAsync(HEATMAP_THEME_STORAGE_KEY, id);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Heatmap colour</Text>

        {HEATMAP_THEMES.map((theme) => {
          const selected = selectedTheme === theme.id;
          return (
            <TouchableOpacity
              key={theme.id}
              style={[styles.themeRow, selected && styles.themeRowSelected]}
              onPress={() => selectTheme(theme.id)}
              activeOpacity={0.7}
            >
              <View style={styles.swatchContainer}>
                {theme.swatchColors.map((color, i) => (
                  <View key={i} style={[styles.swatchSegment, { backgroundColor: color }]} />
                ))}
              </View>
              <Text style={[styles.themeLabel, selected && styles.themeLabelSelected]}>
                {theme.label}
              </Text>
              {selected && <Ionicons name="checkmark" size={20} color="#3C8C7C" />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEFEF',
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#FAFAFA',
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 14,
  },
  themeRowSelected: {
    borderColor: '#3C8C7C',
    backgroundColor: '#EAF5F3',
  },
  swatchContainer: {
    flexDirection: 'row',
    width: 60,
    height: 30,
    borderRadius: 8,
    overflow: 'hidden',
  },
  swatchSegment: {
    flex: 1,
  },
  themeLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  themeLabelSelected: {
    color: '#3C8C7C',
    fontWeight: '600',
  },
});
