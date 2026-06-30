import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export default function RootLayout() {
  // null = checking, 'onboarding' | '(tabs)' = resolved
  const [initialRoute, setInitialRoute] = useState<'onboarding' | '(tabs)' | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync('herdy.onboardingComplete').then((val) => {
      setInitialRoute(val ? '(tabs)' : 'onboarding');
    });
  }, []);

  // Hold a white screen until we know which route to start on — avoids any
  // flash of the map for first-time users.
  if (!initialRoute) {
    return <View style={{ flex: 1, backgroundColor: '#fff' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen
          name="onboarding"
          options={{ gestureEnabled: false, animation: 'none' }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
