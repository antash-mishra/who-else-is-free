## who-else-is-free

Mobile app to see who’s free, create events, and chat with friends in real time.

### Tech stack
- **Frontend:** React Native (Expo, TypeScript) in `src/`
- **Backend:** Go HTTP server with SQLite in `server/`
- **Features:** Google Sign-In auth, event scheduling, join requests, in-app chat (WebSocket)

### Getting started
```bash
git clone https://github.com/antash-mishra/who-else-is-free
cd who-else-is-free
npm install --legacy-peer-deps
```

Start the backend:
```bash
cd server
go run .
```

Start the mobile app (in another terminal, from the project root):
```bash
npm start          # Expo dev server
```

You can also use:
- `npm run android` – run on Android device/emulator
- `npm run ios`     – run on iOS simulator / device (via Xcode)
- `npm run web`     – run in the browser

### Tests
```bash
npm test
```

### Sign-in modes
- **Normal login (Google/Apple)** — the production flow. No special flags; just run the backend and Metro normally.
- **Dev-login (bypass)** — for local emulator testing only. Backend: `cd server && DEV_LOGIN_ENABLED=1 go run .`. Frontend: the `__DEV__`-gated "Dev Login" button appears on the sign-in screen in dev builds.

See [`docs/dev-login.md`](docs/dev-login.md) for the full setup, the three preset test users, switching between modes, and the end-to-end emulator recipe.

### iOS builds
For step‑by‑step instructions to build and run the app on a physical iPhone using Expo + EAS, see:
- `IOS-BUILD-GUIDE.md`

