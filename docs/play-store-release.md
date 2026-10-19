# Google Play Release

How weif's Android app reaches Google Play: EAS builds a signed App Bundle,
and EAS Submit uploads it through the Google Play Developer API. The
`Android Release` GitHub Actions workflow (`.github/workflows/android-release.yml`)
runs both from `main`.

## What Is Automated

- `eas.json` build profile `production`: App Bundle (`.aab`), remote `versionCode`
  incremented by EAS on every build, EAS Update channel `production`.
- `eas.json` submit profiles, one per Play track:

  | Submit profile | Play track       | Release status                       |
  | -------------- | ---------------- | ------------------------------------ |
  | `internal`     | Internal testing | `completed` (testers get it at once) |
  | `closed`       | Closed testing   | `completed` (default `alpha` track)  |
  | `production`   | Production       | `draft` (roll out in Play Console)   |

- The workflow takes one input, `track`: `internal`, `closed`, `production`, or
  `none` (build only, no upload). It runs only on `main`.

Run it from the Actions tab, or:

```sh
gh workflow run android-release.yml -f track=internal
```

The job waits for the build and the upload and fails if either fails. Builds
queue on EAS first, so a run can take 30 to 60 minutes.

`versionName` comes from `version` in `app.config.js`. It is also the EAS Update
runtime version, so bump it whenever native code changes; JavaScript-only
changes can keep it.

## One-Time Setup

### 1. Play Console app

1. In [Play Console](https://play.google.com/console), under the Corroded Labs
   developer account, create the app: name `weif: who else is free`, type App,
   Free, default language English. The listing shows Corroded Labs as the
   developer.
2. Leave Play App Signing on (the default). Google keeps the app signing key;
   the EAS-managed keystore becomes the upload key. Its certificate:
   - SHA-1 `FC:1E:5B:BD:95:72:5F:49:39:7E:BA:8F:13:E4:D1:BC:A1:25:7C:BA`
   - SHA-256 `F3:32:38:5E:E5:0A:42:AA:AE:7A:DF:B2:88:96:CF:74:81:FD:D3:52:0C:8D:BD:25:AF:8D:7C:80:97:D7:E5:25`

   Check them with `eas credentials -p android` if the keystore ever changes.

Personal developer accounts created after 13 November 2023 can't publish to
production until a closed test has run with at least 12 opted-in testers for
14 days in a row. Corroded Labs is a personal account from before that date and
already publishes to production, so the rule does not apply to it; it would
apply to a new account.

### 2. Google Sign-In with the Play signing key

Play re-signs every install with the app signing key, whose certificate differs
from the upload key above. Native Google Sign-In fails with `DEVELOPER_ERROR`
until that certificate is registered. Play's app signing certificate for weif:

- SHA-1 `C9:9C:53:57:36:BA:D9:6A:1D:D7:8F:AE:B9:AD:EF:7D:34:8B:53:81`
- SHA-256 `A1:67:EA:00:52:CD:94:01:6E:6F:19:56:98:5F:9E:51:B5:DB:95:22:0C:39:BD:76:B8:82:54:96:F4:0B:07:C6`

Play Console shows the same values under Test and release → App integrity →
App signing (**App signing key certificate**, not the upload key).

The OAuth clients live in the Google Cloud project `who-else-is-free` (number
`413387391765`), which owns `GOOGLE_WEB_CLIENT_ID` (`src/constants/google.ts`).
It is not the Firebase project `weif-1100e`. Its OAuth clients:

| Client                   | Type    | Package / SHA-1                                                   |
| ------------------------ | ------- | ----------------------------------------------------------------- |
| Web client 1             | Web     | `413387391765-afsj…`, the `webClientId` the app passes            |
| Android Play app signing | Android | `com.whoelseisfree.app`, `C9:9C:…:53:81` (Play installs)          |
| Android client 2         | Android | `com.whoelseisfree.app`, `FC:1E:…:7C:BA` (EAS: preview APKs)      |
| Android client 1         | Android | `com.whoelseisfree.app`, `5E:8F:…:F6:25` (React Native debug key) |
| Android client 3         | Android | `com.whoelseisfree.app`, `D9:FD:…:6A:B8` (unused)                 |

Keep the EAS and Play clients: preview APKs carry the EAS signature and Play
installs carry Play's. The OAuth consent screen is In production for External
users, so no test-user list applies. A new client can take 5 minutes to a few
hours to take effect.

If Play's signing key ever changes (an upgrade in App integrity), add another
Android client for the new SHA-1.

**Symptom when it is missing:** Google's account picker opens, then weif shows
"Unable to sign in with Google" and the server never receives
`POST /api/google-login`. The device log has `SignInChimeraActivity: Failed to
record the consent` and `AutoManageHelper: Unresolved error while connecting
client` from Google Play services. To read the certificate of an installed
build, pull its APK (`adb shell pm path com.whoelseisfree.app`, then
`adb pull`) and run
`apksigner verify --print-certs --min-sdk-version 24 --max-sdk-version 36 base.apk`.
The SDK range skips Play's post-quantum (v3.2) signer, which JDK 17 cannot
parse.

### 3. First upload, by hand

The Google Play API cannot create the first release of a new app, so upload the
first bundle in Play Console:

1. Run the workflow with `track=none` (or `eas build -p android --profile production`).
2. Download the `.aab` from the build page on expo.dev.
3. Play Console → Test and release → Testing → Internal testing → Create new
   release → upload the bundle → roll out.

Until this first release has been rolled out, API uploads can fail with
"Only releases with status draft may be created on draft app".

### 4. Service account for API uploads

1. In Google Cloud, enable the **Google Play Android Developer API**, create a
   service account, and create a JSON key for it.
2. Play Console → Users and permissions → Invite new users: the service account
   email, with access to weif and the permissions to release to testing tracks,
   manage testing tracks, and release to production.
3. Upload the key to EAS, then delete the local file:

   ```sh
   eas credentials -p android
   ```

   Choose `production` → Google Service Account → upload a key for EAS Submit.

The repository is public: never commit the key or reference it from `eas.json`.

### 5. GitHub secret

Create an access token at expo.dev → Account settings → Access tokens (a robot
user keeps it independent of a person) and store it as the `EXPO_TOKEN`
repository secret (Settings → Secrets and variables → Actions).

## Play Console Checklist

App content (Policy → App content):

- Privacy policy: `https://weifapp.com/privacy`.
- App access: sign-in is required and Android only offers Google. Give reviewers
  the dedicated review Google account from the team's private release-info doc,
  with instructions to tap Continue with Google. Keep its 2-Step Verification
  off, and keep its password out of this repository.
- Ads: no ads.
- Content rating: complete the questionnaire; users interact with each other and
  share their location in plans. The rating comes from the answers and cannot be
  picked directly.
- Target audience: 18 and over only. This is where Play records that weif is
  18+, as the app and privacy policy require.
- Data safety: data is encrypted in transit and users can delete their account
  in the app. A starting point to verify against the server before submitting:
  - Personal info: name, email address, user ID; other info (gender, age).
  - Photos: profile picture and custom plan covers.
  - Messages: plan chat messages.
  - Location: country code sent with place searches; precise location stays on
    the device. Plan venues are user content.
  - App activity: in-app interactions (Firebase Analytics, no advertising ID).
  - Device or other IDs: Firebase app instance ID and the push token.
- Account deletion URL: a web page where users can ask for deletion without the
  app (see Gaps below).

Store listing (copy comes from the team's release-info doc, written for the App
Store; Play maps it like this):

- App name `weif: who else is free` (Play allows 30 characters).
- Short description (up to 80 characters): the App Store subtitle, "Find people
  to join your plans".
- Full description (up to 4,000 characters): the App Store description as is.
- Keywords: Play has no keyword field; search reads the description.
- Category: Social (Play has one category, no secondary). Add up to five tags.
- Contact email `contact@weifapp.com`, website `https://weifapp.com`. Play has
  no support URL or copyright field.
- App icon 512 × 512 PNG, feature graphic 1024 × 500, at least two phone
  screenshots (four or more at 1080 px or larger to be eligible for promotion).

Release settings:

- Countries: production in Ireland only (Production → Countries / regions).
  Internal testers install through the opt-in link wherever they are.
- Manual release: turn on Managed publishing (Publishing overview), so an
  approved update waits until someone presses Publish. The `production` submit
  profile also uploads as a draft.
- Version: the store line starts at 1.0.0, as the release-info doc lists.
  Earlier preview builds used 1.0.0 to 1.0.2 without an update channel, and the
  one update published for runtime 1.0.0 sits on the `master` branch, which the
  `production` channel does not serve.

## Gaps Before Production Review

- **Terms of use acceptance.** Play's User Generated Content policy requires
  users to accept terms that define and prohibit objectionable content before
  they can post. weif has report and block, but no terms of use yet.
- **Web account-deletion page.** The privacy policy only describes deleting in
  the app. Play asks for a URL where users can request deletion without
  reinstalling, for example a `weifapp.com` page offering an email request.

## Permissions

The release manifest carries location, notifications, network, storage up to
Android 12 (the photo picker requests it there), biometrics (`expo-secure-store`),
and Firebase messaging. `app.config.js` blocks camera, microphone and
draw-over-apps, which `expo-image-picker` and the native template add although
weif only opens the photo library, along with the advertising permissions.
`src/__tests__/androidPermissions.test.ts` guards the list. Blocking
draw-over-apps also removes the React Native performance monitor overlay from
debug builds.
