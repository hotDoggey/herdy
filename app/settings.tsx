import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEFAULT_THEME_ID,
  HEATMAP_THEMES,
  HEATMAP_THEME_STORAGE_KEY,
  type HeatmapThemeId,
} from '@/constants/heatmapThemes';
import { APP_VERSION } from '@/constants/variables';
import { getSystemVar } from '@/lib/firestore';
import {
  ONBOARDING_COMPLETE_KEY,
  getOnboardingLog,
  resetOnboardingState,
  type OnboardingLogEntry,
} from '@/lib/onboarding';

// Tap the version row this many times to reveal the onboarding debug section.
const DEBUG_TAP_THRESHOLD = 5;

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedTheme, setSelectedTheme] = useState<HeatmapThemeId>(DEFAULT_THEME_ID);
  const [useFahrenheit, setUseFahrenheit] = useState(false);
  const [versionTapCount, setVersionTapCount] = useState(0);
  const [debugVisible, setDebugVisible] = useState(false);
  const [onboardingFlagValue, setOnboardingFlagValue] = useState<string | null>(null);
  const [onboardingLog, setOnboardingLog] = useState<OnboardingLogEntry[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(HEATMAP_THEME_STORAGE_KEY).then((stored) => {
      if (stored) setSelectedTheme(stored as HeatmapThemeId);
    });
    AsyncStorage.getItem('herdy.tempUnit').then((stored) => {
      if (stored) setUseFahrenheit(stored === 'F');
    });
  }, []);

  const selectTheme = async (id: HeatmapThemeId) => {
    setSelectedTheme(id);
    await AsyncStorage.setItem(HEATMAP_THEME_STORAGE_KEY, id);
  };

  const selectTempUnit = async (fahrenheit: boolean) => {
    setUseFahrenheit(fahrenheit);
    await AsyncStorage.setItem('herdy.tempUnit', fahrenheit ? 'F' : 'C');
  };

  const handleVersionTap = () => {
    if (!__DEV__) return;
    setVersionTapCount((prev) => prev + 1);
  };

  useEffect(() => {
    if (__DEV__ && versionTapCount > 0 && versionTapCount % DEBUG_TAP_THRESHOLD === 0) {
      setDebugVisible(true);
      AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY).then(setOnboardingFlagValue);
      getOnboardingLog().then(setOnboardingLog);
    }
  }, [versionTapCount]);

  const replayOnboarding = () => {
    Alert.alert(
      'Replay onboarding?',
      'This clears the onboarding-complete flag on this device and takes you to the walkthrough now.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replay',
          style: 'destructive',
          onPress: async () => {
            await resetOnboardingState();
            router.replace('/onboarding');
          },
        },
      ],
    );
  };

  const rateApp = async () => {
    const docId = Platform.OS === 'ios' ? 'ios_review_url' : 'android_review_url';
    const url = await getSystemVar(docId);
    if (!url) {
      Alert.alert('Not available yet', 'The App Store listing isn\'t live yet — check back soon.');
      return;
    }
    Linking.openURL(url).catch(() =>
      Alert.alert('Could not open link', 'Please try again later.')
    );
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

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
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

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Temperature</Text>

        {[{ label: '°C — Celsius', fahrenheit: false }, { label: '°F — Fahrenheit', fahrenheit: true }].map(({ label, fahrenheit }) => {
          const selected = useFahrenheit === fahrenheit;
          return (
            <TouchableOpacity
              key={label}
              style={[styles.themeRow, selected && styles.themeRowSelected]}
              onPress={() => selectTempUnit(fahrenheit)}
              activeOpacity={0.7}
            >
              <Text style={[styles.themeLabel, selected && styles.themeLabelSelected]}>{label}</Text>
              {selected && <Ionicons name="checkmark" size={20} color="#3C8C7C" />}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>About</Text>
        <TouchableOpacity style={styles.aboutRow} onPress={handleVersionTap} activeOpacity={0.5}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>{APP_VERSION}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.aboutRow, styles.aboutRowTop]} onPress={rateApp} activeOpacity={0.7}>
          <Text style={styles.aboutLabel}>Rate the app</Text>
          <Ionicons name="star-outline" size={18} color="#999" />
        </TouchableOpacity>
      </View>

      {__DEV__ && debugVisible && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Onboarding debug</Text>

          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Runtime version</Text>
            <Text style={styles.aboutValue}>{Updates.runtimeVersion ?? 'n/a (dev)'}</Text>
          </View>
          <View style={[styles.aboutRow, styles.aboutRowTop]}>
            <Text style={styles.aboutLabel}>Embedded launch</Text>
            <Text style={styles.aboutValue}>{String(Updates.isEmbeddedLaunch)}</Text>
          </View>
          <View style={[styles.aboutRow, styles.aboutRowTop]}>
            <Text style={styles.aboutLabel}>Update ID</Text>
            <Text style={styles.aboutValue} numberOfLines={1}>{Updates.updateId ?? 'none'}</Text>
          </View>
          <View style={[styles.aboutRow, styles.aboutRowTop]}>
            <Text style={styles.aboutLabel}>Stored flag value</Text>
            <Text style={styles.aboutValue}>{onboardingFlagValue === null ? 'null' : onboardingFlagValue}</Text>
          </View>

          {onboardingLog.length > 0 && (
            <View style={styles.debugLog}>
              {onboardingLog.map((entry, i) => (
                <Text key={i} style={styles.debugLogLine}>
                  {entry.at} — {entry.event}
                </Text>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.aboutRow, styles.aboutRowTop, styles.replayRow]}
            onPress={replayOnboarding}
            activeOpacity={0.7}
          >
            <Text style={styles.replayLabel}>Replay onboarding</Text>
            <Ionicons name="refresh" size={18} color="#B00020" />
          </TouchableOpacity>
        </View>
      )}
      </ScrollView>
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
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
  },
  aboutRowTop: {
    marginTop: 8,
  },
  aboutLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  aboutValue: {
    fontSize: 16,
    color: '#999',
  },
  debugLog: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
  },
  debugLogLine: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  replayRow: {
    backgroundColor: '#FDECEC',
  },
  replayLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#B00020',
  },
});
