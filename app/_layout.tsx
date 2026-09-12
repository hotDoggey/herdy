import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useState, useSyncExternalStore } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ONBOARDING_COMPLETE_KEY,
  logOnboardingEvent,
  setOnboardingCompleteState,
  subscribeOnboardingComplete,
  getOnboardingCompleteSnapshot,
} from '@/lib/onboarding';

// Keep the native splash screen up (instead of a manual white placeholder)
// until we know which route to start on — avoids any flash of the map for
// first-time users. Must run before this module's component ever renders.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [hasResolved, setHasResolved] = useState(false);
  // Subscribed (not local state) so onboarding.tsx completing onboarding, or
  // the settings debug menu resetting it, flips this guard immediately.
  const onboardingComplete = useSyncExternalStore(subscribeOnboardingComplete, getOnboardingCompleteSnapshot);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY).then((val) => {
      logOnboardingEvent(`root layout read flag: ${val === null ? 'null' : val}`);
      setOnboardingCompleteState(!!val);
      setHasResolved(true);
    });
  }, []);

  useEffect(() => {
    if (hasResolved) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [hasResolved]);

  if (!hasResolved) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        {/*
          Stack.Protected removes the guarded screens from the navigator
          entirely rather than just hinting a starting screen (unlike
          initialRouteName), so a dev-client deep link or restored linking
          state can't land on (tabs)/settings while onboarding is pending.
        */}
        <Stack.Protected guard={!onboardingComplete}>
          <Stack.Screen
            name="onboarding"
            options={{ gestureEnabled: false, animation: 'none' }}
          />
        </Stack.Protected>
        <Stack.Protected guard={onboardingComplete}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
          {/*
            Walkthrough replay (drawer menu → "Get started"). Lives here, not
            in the first-run group above, so it's reachable any time after
            onboarding without clearing the completion flag. Still inside the
            guard so it can't be deep-linked to during first run.
          */}
          <Stack.Screen name="walkthrough" options={{ gestureEnabled: true }} />
        </Stack.Protected>
      </Stack>
    </GestureHandlerRootView>
  );
}
