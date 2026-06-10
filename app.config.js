const IS_DEV     = process.env.APP_ENV === 'development';
const IS_PREVIEW = process.env.APP_ENV === 'preview';

export default {
  expo: {
    name: IS_DEV ? 'VYWEED (Dev)' : IS_PREVIEW ? 'VYWEED (Beta)' : 'VYWEED',
    slug: 'vyweed',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    scheme: 'vyweed',
    // owner: 'your-expo-username',   ← uncomment + fill in after: eas login

    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV
        ? 'com.vyweed.app.dev'
        : IS_PREVIEW
        ? 'com.vyweed.app.preview'
        : 'com.vyweed.app',
    },

    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      package: IS_DEV
        ? 'com.vyweed.app.dev'
        : IS_PREVIEW
        ? 'com.vyweed.app.preview'
        : 'com.vyweed.app',
      versionCode: 1,
      permissions: [
        'android.permission.CAMERA',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.VIBRATE',
      ],
    },

    web: {
      favicon: './assets/favicon.png',
    },

    plugins: ['expo-notifications'],

    extra: {
      appEnv:                    process.env.APP_ENV                    ?? 'development',
      apiBaseUrl:                process.env.API_BASE_URL               ?? 'http://localhost:8000',
      firebaseApiKey:            process.env.FIREBASE_API_KEY,
      firebaseAuthDomain:        process.env.FIREBASE_AUTH_DOMAIN,
      firebaseProjectId:         process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket:     process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId:             process.env.FIREBASE_APP_ID,
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? '7f57a434-b6f5-42b2-be1b-19cf37ba1117',
      },
    },
  },
};
