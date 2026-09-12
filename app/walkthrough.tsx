import React, { useCallback } from 'react';
import { useRouter } from 'expo-router';

import WalkthroughSlides from '@/components/WalkthroughSlides';
import { logOnboardingEvent } from '@/lib/onboarding';

// Replay of the walkthrough slides, opened from the drawer menu's "Get started"
// item. Deliberately separate from app/onboarding.tsx: this route is always
// present in the navigator (declared alongside (tabs) in app/_layout.tsx) and
// never reads or writes the onboarding-complete flag, so it can be reopened any
// number of times. "Done" just pops back to the map.
export default function WalkthroughScreen() {
  const router = useRouter();

  const dismiss = useCallback(() => {
    logOnboardingEvent('walkthrough replayed from menu');
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  return <WalkthroughSlides onComplete={dismiss} completeLabel="Done" />;
}
