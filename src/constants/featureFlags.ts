// In development, this can expose the Apple button on non-iOS platforms for UI testing.
// Default is false. Set EXPO_PUBLIC_APPLE_SIGNIN_DEV_ALL_PLATFORMS=true to enable.
export const APPLE_SIGNIN_DEV_ALL_PLATFORMS =
  __DEV__ &&
  (typeof process !== "undefined"
    ? process.env?.EXPO_PUBLIC_APPLE_SIGNIN_DEV_ALL_PLATFORMS === "true"
    : false);
