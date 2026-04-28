export default {
  expo: {
    name: "who-else-is-free",
    slug: "who-else-is-free",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-screen-high-res.png",
      resizeMode: "cover",
      backgroundColor: "#050F29",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.whoelseisfree.app",
      googleServicesFile:
        process.env.GOOGLE_SERVICE_INFO_PLIST || "./GoogleService-Info.plist",
      usesAppleSignIn: true,
      entitlements: {
        "aps-environment": "development",
      },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ["remote-notification"],
      },
    },
    android: {
      package: "com.whoelseisfree.app",
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: "pan",
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "./plugins/withModularHeaders",
      "expo-splash-screen",
      "expo-font",
      [
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme:
            "com.googleusercontent.apps.413387391765-hlhfet7m38q2m38dnj10gpkhpmtj9g3v",
          iosClientId:
            "413387391765-hlhfet7m38q2m38dnj10gpkhpmtj9g3v.apps.googleusercontent.com",
        },
      ],
      "expo-apple-authentication",
      "expo-secure-store",
      "@react-native-firebase/app",
      "@react-native-firebase/messaging",
      "./plugins/withNotificationIcon",
    ],
    extra: {
      eas: {
        projectId: "c20e8e63-1fc3-4f22-aca0-f6d4d2fae80e",
      },
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: "https://u.expo.dev/c20e8e63-1fc3-4f22-aca0-f6d4d2fae80e",
    },
  },
};
