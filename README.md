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

### iOS builds
For step‑by‑step instructions to build and run the app on a physical iPhone using Expo + EAS, see:
- `IOS-BUILD-GUIDE.md`

