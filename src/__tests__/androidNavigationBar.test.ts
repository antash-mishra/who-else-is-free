import path from 'node:path';

import { getConfig } from '@expo/config';
import {
  AndroidConfig,
  compileModsAsync,
  withAndroidStyles,
  withGradleProperties,
} from '@expo/config-plugins';
import { withEdgeToEdge } from '@expo/prebuild-config/build/plugins/unversioned/edge-to-edge/withEdgeToEdge';

describe('Android navigation bar native configuration', () => {
  it('preserves the default three-button contrast outside onboarding', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const appConfig = getConfig(projectRoot).exp;
    // Supply an existing theme as native prebuild would, including an old value
    // so a rebuild must replace it rather than leave conflicting duplicates.
    const seededConfig = withAndroidStyles(
      withGradleProperties(withEdgeToEdge(appConfig, { projectRoot }), (config) => {
        // Seed the existing native property so introspection is independent of
        // an ignored android/ directory and must replace the old value.
        config.modResults = [{ type: 'property', key: 'edgeToEdgeEnabled', value: 'false' }];
        return config;
      }),
      (config) => {
        config.modResults.resources.style = [
          {
            $: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' },
            item: [
              { $: { name: 'android:enforceNavigationBarContrast' }, _: 'false' },
              { $: { name: 'android:editTextBackground' }, _: '@drawable/rn_edit_text_material' },
            ],
          },
        ];
        return config;
      },
    );
    const result = await compileModsAsync(seededConfig, {
      projectRoot,
      platforms: ['android'],
      introspect: true,
    });
    const styles: AndroidConfig.Resources.ResourceXML = result._internal?.modResults.android.styles;
    const appTheme = styles.resources.style?.find((style) => style.$.name === 'AppTheme');

    expect(
      appTheme?.item?.filter((item) => item.$.name === 'android:enforceNavigationBarContrast'),
    ).toEqual([
      {
        $: { name: 'android:enforceNavigationBarContrast', 'tools:targetApi': '29' },
        _: 'true',
      },
    ]);
    expect(appTheme?.item).toContainEqual({
      $: { name: 'android:editTextBackground' },
      _: '@drawable/rn_edit_text_material',
    });
    expect(result._internal?.modResults.android.gradleProperties).toContainEqual({
      type: 'property',
      key: 'edgeToEdgeEnabled',
      value: 'true',
    });
  });
});
