# App display name

The installed app and both store listings should use **Weif** (issue #176).

## Native builds

`expo.name` in `app.config.js` owns the installed display name. Expo prebuild maps it to
Android's `app_name` string and iOS's `CFBundleDisplayName`.
The native `android/` and `ios/` directories are generated and gitignored.

Keep `expo.slug` (`who-else-is-free`), the EAS project ID, both package/bundle identifiers
(`com.whoelseisfree.app`), and persisted storage keys unchanged. Existing installations must
continue receiving updates and retaining their sessions and preferences.

For an existing local native checkout, regenerate configuration before rebuilding:

```sh
npx expo prebuild --no-install
```

Then rebuild and install with `npm run android` or `npm run ios`. EAS builds from a checkout
without native directories run prebuild automatically. A JavaScript OTA update cannot change
the name beneath the home-screen icon; distribute new native builds.

## Store listings

Changing Expo configuration does not edit published store metadata. These release steps
remain to be performed in the existing app records:

1. **Google Play Console:** select the existing app, open **Main store listing**, and set
   **App name** to `Weif`. Update each existing localized name and any custom store listing
   that overrides the name, then save and submit the listing changes for publication.
2. **App Store Connect:** select the existing app, open **App Information**, and set
   **Name** to `Weif` for each existing localization. If the current version does not allow
   editing the name, create a new version and submit the name change with that release.

See [Google's store-listing guide](https://support.google.com/googleplay/android-developer/answer/9859152)
and [Apple's app-information reference](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information).

## Release verification

- Install an updated Android build and confirm the launcher label is `Weif`.
- Install an updated iOS build and confirm the home-screen label is `Weif`.
- Confirm the published Play Store and App Store titles are `Weif` after the metadata changes
  have been approved and published.
- Confirm updating an existing installation preserves sign-in and push registration.
