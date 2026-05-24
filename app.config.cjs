module.exports = {
  expo: {
    name: "YaHla",
    slug: "chat-app-android",
    version: "1.0.1",
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: "chatappandroid",
    "owner": "yahla",
    userInterfaceStyle: "automatic",
    ios: {
      icon: "./assets/expo.icon",
    },
    android: {
      versionCode: 2,
      adaptiveIcon: {
        backgroundColor: "#F9F5EC",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      package: "com.nawafhq.chatappandroid",
      permissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.POST_NOTIFICATIONS",
      ],
      googleServicesFile: "./google-services.json",
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-build-properties",
        {
          android: {
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            buildToolsVersion: "36.0.0",
            kotlinVersion: "2.1.21",
          },
        },
      ],
      "@react-native-firebase/app",
      "@react-native-firebase/messaging",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#000",
          android: {
            image: "./assets/images/splash-icon.png",
            imageWidth: 76,
          },
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "The app accesses your photos to let you share them with your friends.",
          colors: { cropToolbarColor: "#000000" },
          dark: { colors: { cropToolbarColor: "#000000" } },
        },
      ],
      [
        "expo-sqlite",
        {
          enableFTS: true,
          useSQLCipher: true,
          android: { enableFTS: false, useSQLCipher: false },
          ios: {
            customBuildFlags: [
              "-DSQLITE_ENABLE_DBSTAT_VTAB=1 -DSQLITE_ENABLE_SNAPSHOT=1",
            ],
          },
        },
      ],
      [
        "expo-secure-store",
        {
          configureAndroidBackup: true,
          faceIDPermission:
            "Allow $(PRODUCT_NAME) to access your Face ID biometric data.",
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/expo.icon/Assets/notification-icon.png",
          color: "#ffffff",
          defaultChannel: "messages",
          enableBackgroundRemoteNotifications: true,
        },
      ],
      "./plugins/withConversationShortcut.cjs",
      "./plugins/withFirebaseManifest.cjs",
      [
        "expo-contacts",
        {
          contactsPermission:
            "Allow $(PRODUCT_NAME) to access your contacts.",
        },
      ],
      [
        "expo-audio",
        {
          microphonePermission:
            "Allow $(PRODUCT_NAME) to access your microphone.",
          enableBackgroundPlayback: true,
          enableBackgroundRecording: false,
        },
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Allow $(PRODUCT_NAME) to use your location.",
        },
      ],
      "expo-background-task",
      [
        "expo-maps",
        {
          requestLocationPermission: true,
          locationPermission:
            "Allow $(PRODUCT_NAME) to use your location",
        },
      ],
      [
        "expo-navigation-bar",
        {
          enforceContrast: true,
          barStyle: "light",
          visibility: "visible",
        },
      ],
      [
        "expo-sharing",
        {
          android: {
            enabled: true,
            singleShareMimeTypes: ["image/*"],
            multipleShareMimeTypes: ["image/*"],
          },
        },
      ],
      [
        "expo-video",
        {
          supportsBackgroundPlayback: true,
          supportsPictureInPicture: true,
        },
      ],
      "expo-web-browser",
      [
        "expo-file-system",
        {
          supportsOpeningDocumentsInPlace: true,
          enableFileSharing: true,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      "eas": {
        "projectId": "a878e887-4d12-40ed-b86f-93de72637cdf"
      }
    },
  },
};
