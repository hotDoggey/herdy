import React, { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import WalkthroughSlides from '@/components/WalkthroughSlides';
import { ONBOARDING_COMPLETE_KEY, logOnboardingEvent, setOnboardingCompleteState } from '@/lib/onboarding';

// First-run onboarding. This route only exists in the navigator while the
// onboarding-complete flag is unset (see the Stack.Protected guard in
// app/_layout.tsx). Completing it writes the flag, which flips that guard and
// hands control to (tabs) — no manual router.replace needed.
//
// The "Get started" item in the drawer menu opens app/walkthrough.tsx
// instead, which shows the same slides without touching the flag.
export default function OnboardingScreen() {
  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    await logOnboardingEvent('onboarding completed, flag written');
    setOnboardingCompleteState(true);
  }, []);

  return <WalkthroughSlides onComplete={completeOnboarding} completeLabel="Get started" />;
}
