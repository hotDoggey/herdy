const IS_DEV = process.env.APP_VARIANT === 'development';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: IS_DEV ? 'Herdy (dev)' : 'Herdy',
  slug: 'herdy',
  scheme: 'herdy',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#FEF3E2',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.hotdoggey.herdy',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.hotdoggey.herdy',
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
    [
      '@rnmapbox/maps',
      {
        RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN ?? '',
      },
    ],
    './plugins/withSwiftConcurrencyFix',
    'expo-router',
  ],
  extra: {
    eas: {
      projectId: '6c5723a2-e17e-4d48-a3a1-c2089b34745d',
    },
  },
};
