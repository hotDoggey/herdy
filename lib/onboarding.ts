import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_COMPLETE_KEY = 'herdy.onboardingComplete';
const ONBOARDING_LOG_KEY = 'herdy.onboardingDebugLog';
const MAX_LOG_ENTRIES = 20;

// Shared with useSyncExternalStore so the root layout's Stack.Protected guard
// reacts immediately when onboarding.tsx marks onboarding complete (or when
// the settings debug menu resets it) — reading AsyncStorage again on the
// next mount isn't enough since the guard needs to flip in the same session.
let onboardingCompleteValue = false;
const listeners = new Set<() => void>();

export function setOnboardingCompleteState(value: boolean): void {
  onboardingCompleteValue = value;
  listeners.forEach((listener) => listener());
}

export function subscribeOnboardingComplete(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOnboardingCompleteSnapshot(): boolean {
  return onboardingCompleteValue;
}

export type OnboardingLogEntry = {
  event: string;
  at: string;
};

export async function logOnboardingEvent(event: string): Promise<void> {
  const entry: OnboardingLogEntry = { event, at: new Date().toISOString() };
  const raw = await AsyncStorage.getItem(ONBOARDING_LOG_KEY);
  const log: OnboardingLogEntry[] = raw ? JSON.parse(raw) : [];
  log.push(entry);
  await AsyncStorage.setItem(ONBOARDING_LOG_KEY, JSON.stringify(log.slice(-MAX_LOG_ENTRIES)));
}

export async function getOnboardingLog(): Promise<OnboardingLogEntry[]> {
  const raw = await AsyncStorage.getItem(ONBOARDING_LOG_KEY);
  return raw ? JSON.parse(raw) : [];
}

// Clears the completion flag and log so onboarding can be replayed on this device.
export async function resetOnboardingState(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
  await AsyncStorage.removeItem(ONBOARDING_LOG_KEY);
  setOnboardingCompleteState(false);
}
