## Apple Sign-In Guide (Project Specific)

This guide is for the **who-else-is-free** project.

Use this together with `IOS-BUILD-GUIDE.md`.
- Do build/install from `IOS-BUILD-GUIDE.md`
- Do Apple-specific setup from this file

---

## Before you start

Complete these stages first from `IOS-BUILD-GUIDE.md`:
1. Stage 1 (tools)
2. Stage 2 (code + install dependencies)
3. Stage 3 (Expo project setup)

---

## Step 1: Turn on Apple Sign-In in Apple Developer

1. Go to: https://developer.apple.com/account/
2. Open **Certificates, IDs & Profiles**.
3. Open **Identifiers**.
4. Find and click your app ID.
5. Confirm bundle ID is correct.
   Default for this repo: `com.whoelseisfree.app`
6. Enable **Sign In with Apple**.
7. Save.

Important:
- If you changed bundle ID in `app.json`, enable Apple Sign-In for that new bundle ID.

---

## Step 2: Build a fresh iOS app

After enabling Apple capability, rebuild the iOS app (Stage 4 command):

```bash
eas build --platform ios --profile development
```

Install this new build on iPhone.

---

## Step 3: Start app and test Apple Sign-In

1. Start app with Stage 5 command:

```bash
npx expo start --dev-client
```

2. Open the installed dev build on iPhone.
3. On login screen, tap **Sign in with Apple**.
4. Complete Apple prompt.
5. App should move to main app or onboarding.

Optional dev flag:
- Default is iOS-only button visibility.
- To show Apple button on non-iOS in development for UI testing, set:

```bash
EXPO_PUBLIC_APPLE_SIGNIN_DEV_ALL_PLATFORMS=true
```

---

## Quick troubleshooting

### Apple button is missing

Check:
1. You are using a dev build (not Expo Go).
2. You rebuilt app after enabling Apple capability.

### Apple sign-in fails

Check:
1. Bundle ID in Apple Developer matches app bundle ID.
2. You rebuilt the iOS app after capability change.

If it still fails, contact the backend owner to verify server deployment/config.

---

## Final checklist

1. Apple capability enabled in Apple Developer.
2. Fresh iOS dev build installed.
3. App started with `npx expo start --dev-client`.
4. Apple login works on iPhone.
