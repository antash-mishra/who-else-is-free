// In development, expose the Apple button on non-iOS platforms for UI testing.
// Set EXPO_PUBLIC_APPLE_SIGNIN_DEV_ALL_PLATFORMS=false to hide it.
export const APPLE_SIGNIN_DEV_ALL_PLATFORMS =
  __DEV__ &&
  (typeof process !== "undefined"
    ? process.env?.EXPO_PUBLIC_APPLE_SIGNIN_DEV_ALL_PLATFORMS !== "false"
    : true);
