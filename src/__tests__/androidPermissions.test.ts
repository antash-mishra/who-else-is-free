/**
 * Guards the Android permissions the Play listing and Data safety form declare.
 *
 * weif only opens the photo library, but expo-image-picker merges camera and
 * microphone access into the manifest and the native template adds
 * draw-over-apps. These settings only reach the app through a native build, so
 * a regression here would ship silently.
 */
const appConfig = jest.requireActual('../../app.config.js').default;

describe('android permissions', () => {
  it('strips camera, microphone and draw-over-apps access', () => {
    expect(appConfig.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ]),
    );
  });

  it('keeps the storage permissions the photo picker requests on Android 12 and lower', () => {
    expect(appConfig.expo.android.blockedPermissions).not.toEqual(
      expect.arrayContaining(['android.permission.READ_EXTERNAL_STORAGE']),
    );
    expect(appConfig.expo.android.blockedPermissions).not.toEqual(
      expect.arrayContaining(['android.permission.WRITE_EXTERNAL_STORAGE']),
    );
  });
});
