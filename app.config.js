const IS_DEV = process.env.APP_VARIANT === 'development';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: IS_DEV ? 'Herdy (dev)' : 'Herdy',
  slug: 'herdy',
  scheme: 'herdy',
  version: '1.0.2',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  runtimeVersion: {
    policy: 'fingerprint',
  },
  updates: {
    url: 'https://u.expo.dev/6c5723a2-e17e-4d48-a3a1-c2089b34745d',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.biserdev.herdy',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.biserdev.herdy',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FEF3E2',
    },
    edgeToEdgeEnabled: true,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    '@rnmapbox/maps',
    './plugins/withSwiftConcurrencyFix',
    './plugins/withSwiftUILinkFix',
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#FEF3E2',
        enableFullScreenImage_legacy: true,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          "Herdy uses your location to center the map, confirm you're on the trail before dropping a pin, and gently remind you when you're near the herd. Your location is never stored or shared.",
      },
    ],
    [
      'expo-build-properties',
      {
        // expo-dev-launcher references RCTPackagerConnection, which React
        // Native 0.81's prebuilt Release-mode core binaries omit — build
        // React Native from source so that symbol is actually available.
        ios: {
          buildReactNativeFromSource: true,
        },
      },
    ],
  ],
  extra: {
    eas: {
      projectId: '6c5723a2-e17e-4d48-a3a1-c2089b34745d',
    },
  },
};
