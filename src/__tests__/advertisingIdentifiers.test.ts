/**
 * Guards issue #207: weif collects no advertising identifiers.
 *
 * The privacy policy and the store privacy labels promise no advertising IDs, but
 * Firebase Analytics collects them by default. These settings only reach the app
 * through a native build, so a regression here would ship silently. Issue #216
 * also turned off the iOS vendor ID (IDFV), so Analytics identifies an install
 * only by its Firebase app instance ID.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = join(__dirname, '..', '..');

const appConfig = jest.requireActual('../../app.config.js').default;
const withAnalyticsWithoutAdId = jest.requireActual('../../plugins/withAnalyticsWithoutAdId');

describe('advertising identifiers', () => {
  it('turns off advertising ID, IDFV and ad consent defaults in firebase.json', () => {
    const firebaseJson = JSON.parse(readFileSync(join(repoRoot, 'firebase.json'), 'utf8'));

    expect(firebaseJson['react-native']).toEqual({
      google_analytics_adid_collection_enabled: false,
      google_analytics_ssaid_collection_enabled: false,
      google_analytics_registration_with_ad_network_enabled: false,
      analytics_idfv_collection_enabled: false,
      analytics_default_allow_ad_storage: false,
      analytics_default_allow_ad_user_data: false,
      analytics_default_allow_ad_personalization_signals: false,
    });
  });

  it('strips the advertising permissions Firebase Analytics merges into the Android manifest', () => {
    expect(appConfig.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'com.google.android.gms.permission.AD_ID',
        'android.permission.ACCESS_ADSERVICES_AD_ID',
        'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
      ]),
    );
  });

  it('links the iOS analytics pod without IDFA support', () => {
    expect(appConfig.expo.plugins).toContain('./plugins/withAnalyticsWithoutAdId');

    const podfile = "require 'json'\n\nplatform :ios, '15.1'\n";
    const withFlag = withAnalyticsWithoutAdId.addAnalyticsWithoutAdIdFlag(podfile);

    expect(withFlag.startsWith(`${withAnalyticsWithoutAdId.FLAG}\n`)).toBe(true);
    expect(withFlag.endsWith(podfile)).toBe(true);
    expect(withAnalyticsWithoutAdId.addAnalyticsWithoutAdIdFlag(withFlag)).toBe(withFlag);
  });
});
