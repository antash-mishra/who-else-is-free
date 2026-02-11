## iOS build & run guide (Expo + EAS)

This guide shows how to **build and run the iOS app** from  
`https://github.com/antash-mishra/who-else-is-free` on a real iPhone using **Expo + EAS**.

This guide is specific to the **who-else-is-free** project.

You only need:
- A computer (macOS / Windows / Linux)
- An iPhone
- Basic command‑line knowledge
- An Expo account (free) and **Apple Developer account** (for installing builds on device)

There is **one path** below, split into clear **stages**.

If you need Apple Sign-In, use this guide for build/install first, then complete:  
`docs/APPLE_SIGN_IN_SETUP.md`

---

### Stage 1 – Install tools (one time)

1. Install **Node.js LTS** (18 or 20) from:  
   https://nodejs.org
2. Install **git** (https://git-scm.com).
3. Install **EAS CLI** globally:
```bash
npm install --global eas-cli
```

Verify:
```bash
node -v
git --version
eas --version
```

---

### Stage 2 – Get the code and install dependencies

In a terminal:
```bash
cd ~
git clone https://github.com/antash-mishra/who-else-is-free
cd who-else-is-free
```

Then install JavaScript dependencies:
```bash
npm install --legacy-peer-deps
```

Wait for this to finish.  
You should now see files like `app.config.js`, `eas.json`, `package.json`, and `src/`.

---

### Stage 3 – Create your own Expo project (avoid permission errors)

The repo is linked to the original author’s Expo/EAS project, so we first re‑link it to **your** Expo account.

1. Create a free Expo account at https://expo.dev if you don’t have one.
2. Log in from the terminal (still in the project folder):
   ```bash
   eas login
   ```
3. Open `app.config.js` in the project root.
4. **Keep the existing name and slug**, for example:
   ```js
   name: "who-else-is-free",
   slug: "who-else-is-free",
   ```
5. Remove the `extra.eas` block that links to the original project, e.g. delete this part:
   ```js
   extra: {
     eas: {
       projectId: "c20e8e63-1fc3-4f22-aca0-f6d4d2fae80e",
     },
   },
   ```
   Also remove the `updates` block that references the same project ID:
   ```js
   updates: {
     url: "https://u.expo.dev/c20e8e63-1fc3-4f22-aca0-f6d4d2fae80e",
   },
   ```
6. Back in the terminal, run:
   ```bash
   eas init
   ```
   - Choose **Create a new project** when asked.
   - This creates a new Expo/EAS project under **your** account and writes a new `projectId`.

From now on, `eas build` will belong to your Expo project and you won’t see the “no permission to build this project” error.

---

### Stage 4 – Add Firebase config for push notifications

Push notifications need a Firebase config file so the app can talk to Firebase Cloud Messaging.

1. Go to https://console.firebase.google.com and open the **weif-1100e** project
   (ask the project owner for access if you don't have it).
2. Click the **gear icon** (top left) → **Project settings**.
3. Scroll down to **Your apps** and find the **iOS** app (`com.whoelseisfree.app`).
   If there's no iOS app yet, click **Add app** → iOS, enter `com.whoelseisfree.app` as the bundle ID, and register it.
4. Click the **GoogleService-Info.plist** download button.
5. Move the downloaded file to the **project root** (same folder as `app.config.js`):
   ```bash
   mv ~/Downloads/GoogleService-Info.plist ~/who-else-is-free/
   ```
6. Verify the file is in the right place:
   ```bash
   ls ~/who-else-is-free/GoogleService-Info.plist
   ```

7. **Upload the plist to EAS as a file secret** so cloud builds can find it.
   The file is gitignored (it contains Firebase API keys), so it won't be uploaded to EAS automatically. You need to store it as an EAS secret:
   ```bash
   eas secret:create --scope project --name GOOGLE_SERVICE_INFO_PLIST --type file --value ./GoogleService-Info.plist
   ```
   During cloud builds, EAS sets the `GOOGLE_SERVICE_INFO_PLIST` env var to the path of the secret file. The `app.config.js` picks it up automatically:
   ```js
   googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST || "./GoogleService-Info.plist",
   ```

> **Note:** This file is gitignored, so each person building the app needs to download their own copy and upload it as an EAS secret. The local copy in the project root is only used for local builds (`npx expo run:ios`).

#### iOS also needs an APNs key linked to Firebase

Firebase uses Apple's push service (APNs) to deliver notifications to iPhones. This is a one-time setup:

1. Go to https://developer.apple.com/account/resources/authkeys/list
2. Click the **+** button to create a new key.
3. Give it a name (e.g. "WEIF Push Key"), check **Apple Push Notifications service (APNs)**, and click **Continue** → **Register**.
4. **Download the `.p8` file** (you can only download it once — save it somewhere safe).
5. Note the **Key ID** shown on the page.
6. Note your **Team ID** — find it at https://developer.apple.com/account under Membership details.
7. Back in **Firebase Console → Project settings → Cloud Messaging** tab:
   - Scroll to the iOS app section.
   - Under **APNs Authentication Key**, click **Upload**.
   - Upload the `.p8` file, enter the Key ID and Team ID.

This only needs to be done once per Firebase project, not per developer.

---

### Stage 5 – Build and install the iOS dev app

> **Important:** If you skipped Stage 4, push notifications will not work. The app will still build and run, but you won't receive any notifications.

Before building, if you plan to test Apple Sign-In:
- Enable **Sign In with Apple** capability for your App ID in Apple Developer.
- For the remaining Apple-specific setup, follow `docs/APPLE_SIGN_IN_SETUP.md`.

Now build a **development client** you can install on your iPhone:

```bash
eas build --platform ios --profile development
```

On the first run, EAS will:
- Ask to **link** the project to your Expo account (confirm).
- Ask for your **Apple ID** for Apple Developer access.
- Offer to **auto‑manage certificates and provisioning profiles** (recommended).
- Ask you to **register your iPhone** if needed.

The build runs in the cloud (a few minutes).  
When it finishes, you’ll see:
- A link to the build page on expo.dev
- A **QR code** and/or **install link** for the iOS build

On your iPhone:
1. Open the Camera app and scan the QR code from the build page  
   **or** open the install link in Safari.
2. Follow the prompts to install the app.

If iOS shows a “Developer not trusted” message:
- Go to **Settings → General → VPN & Device Management**.
- Tap the profile with your Apple ID.
- Tap **Trust** and confirm.

You should now see the app icon on your home screen.

---

### Stage 6 – Start the dev server and connect from the app

The development build expects a Metro bundler/dev server to be running.

In the same project folder (`who-else-is-free`), run:
```bash
npx expo start --dev-client
```

This will:
- Start the dev server.
- Open a browser page with a QR code.

Make sure your iPhone and your computer are on the **same Wi‑Fi network**.

On your iPhone:
1. Open the `who-else-is-free` dev app you installed in Stage 4.
2. When prompted, scan the QR code from the browser or terminal.

The app will load the JS bundle from your computer and run the latest code.

Now you can:
- Navigate through screens
- Create events
- Exercise the app on a real iPhone

If connection is flaky, in the Expo dev tools (browser) try switching the **Connection** mode between **LAN** and **Tunnel**.

---

### Stage 7 – Next time (short version)

After the first setup, you usually only need:

```bash
cd ~/who-else-is-free
git pull                       # get latest code
npm install --legacy-peer-deps # only if deps changed
npx expo start --dev-client    # start dev server
```

If you change native config and need a new dev build:
```bash
eas build --platform ios --profile development
```
