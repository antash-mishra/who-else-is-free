// In development, expose the Apple button on non-iOS platforms for UI testing.
// Set EXPO_PUBLIC_APPLE_SIGNIN_DEV_ALL_PLATFORMS=false to hide it.
export const APPLE_SIGNIN_DEV_ALL_PLATFORMS =
  __DEV__ &&
  (typeof process !== 'undefined'
    ? process.env?.EXPO_PUBLIC_APPLE_SIGNIN_DEV_ALL_PLATFORMS !== 'false'
    : true);

// Dev Login preset buttons on sign-in surfaces (issue #186). Hidden unless a dev build
// is started with EXPO_PUBLIC_DEV_LOGIN_ENABLED=true; release builds never show them.
// The buttons also need the backend's DEV_LOGIN_ENABLED=1 route (docs/dev-login.md).
export const DEV_LOGIN_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_DEV_LOGIN_ENABLED === 'true';
