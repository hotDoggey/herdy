import * as SecureStore from 'expo-secure-store';

const DEVICE_ID_KEY = 'herdy_device_id';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let cached: string | null = null;

/**
 * Returns a stable anonymous device ID, persisted in the iOS Keychain /
 * Android Keystore. Survives app reinstalls; cannot be trivially reset.
 * Never contains any personally identifiable information.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id = generateId();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }

  cached = id;
  return id;
}
