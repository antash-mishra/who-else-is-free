## iOS build & run guide (Expo + EAS)

This guide shows how to **build and run the iOS app** from  
`https://github.com/antash-mishra/who-else-is-free` on a real iPhone using **Expo + EAS**.

You only need:
- A computer (macOS / Windows / Linux)
- An iPhone
- Basic command‑line knowledge
- An Expo account (free) and **Apple Developer account** (for installing builds on device)

There is **one path** below: EAS development build + dev server.

---

### 1. Install required tools (one time)

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

### 2. Clone the project

In a terminal:
```bash
cd ~
git clone https://github.com/antash-mishra/who-else-is-free
cd who-else-is-free
```

You should see files like `app.json`, `eas.json`, `package.json`, and `src/`.

---

### 3. Install JavaScript dependencies

From inside the project folder:
```bash
npm install --legacy-peer-deps
```

Wait for this to finish.  
This installs all JS/TS dependencies used by the app.

---

### 4. Log in to Expo / EAS

Create a free Expo account at https://expo.dev if you don’t have one.

Then in the terminal:
```bash
eas login
```

Follow the prompts to log in with your Expo account.

---

### 5. Create an iOS development build (EAS)

This builds a **custom development client** you can install on your iPhone.

Run:
```bash
eas build --platform ios --profile development
```

On the first run, EAS will:
- Ask to **link** the project to your Expo account (say **Yes**).
- Ask for your **Apple ID** to connect to the Apple Developer account.
- Offer to **auto‑manage certificates and provisioning profiles** (recommended: say **Yes**).
- Ask you to **register your iPhone** if it’s not already registered.

Then the build will run in the cloud (a few minutes).

When it finishes, you’ll see in the terminal:
- A link to the build page on expo.dev
- A **QR code** and/or **install link** for the iOS build

---

### 6. Install the build on your iPhone

On your iPhone:

1. Open the Camera app and scan the QR code from the EAS build page  
   **or** open the install link in Safari.
2. Follow the prompts to install the app (it’s a dev build of `who-else-is-free`).

If iOS shows a “Developer not trusted” message:
- Go to **Settings → General → VPN & Device Management**.
- Tap the profile with your Apple ID.
- Tap **Trust** and confirm.

Now you should see the app icon on your home screen.

---

### 7. Start the development server

The development build expects a Metro bundler/dev server to be running.

In the same project folder (`who-else-is-free`), run:
```bash
npx expo start --dev-client
```

This will:
- Start the dev server.
- Open a browser page with a QR code.

Make sure your iPhone and your computer are on the **same Wi‑Fi network**.

In the Expo dev tools (browser):
- If connection is flaky, switch **Connection** mode between **LAN** and **Tunnel** and try again.

---

### 8. Open the app and connect to the dev server

On your iPhone:

1. Open the `who-else-is-free` development build you installed in step 6.
2. You should see an option to scan a QR code or automatically connect to the dev server.
3. Scan the QR code from the browser or terminal (from `npx expo start --dev-client`).

The app will load the JS bundle from your computer and run the latest code.

Now you can:
- Navigate through screens
- Create events
- Exercise the app on a real iPhone

---

### 9. Next time (short version)

After the first setup, you usually only need:

```bash
cd ~/who-else-is-free
git pull                       # get latest code
npm install --legacy-peer-deps # only if deps changed
npx expo start --dev-client    # start dev server
```

If you changed native config and need a new dev build, run:
```bash
eas build --platform ios --profile development
```
