# Sign-in: Google/Apple (normal) vs Dev-login (bypass)

Two sign-in modes exist. **Normal login** is what production uses (Google/Apple OAuth). **Dev-login** is a local-only bypass that issues a real session token for a fixed test user without going through OAuth — for emulator testing.

| | Normal login | Dev-login (bypass) |
|---|---|---|
| Use when | Production, staging, real users | Local emulator/device testing only |
| Backend flag | none | `DEV_LOGIN_ENABLED=1` env |
| Frontend flag | always available | `__DEV__` builds only |
| Auth flow | Google/Apple OAuth → `/api/google-login` or `/api/apple-login` | `POST /api/dev-login` with a fixed email |
| Safe in production | ✅ | ❌ Never. The route is unregistered (404) unless the flag is on; the button renders `null` in release builds. Two independent switches, both off in prod. |

---

## Normal login (Google/Apple)

### Backend
No special flag. Start normally:
```bash
cd server && go run .
```
Routes `/api/google-login` and `/api/apple-login` are always registered. Ensure `GOOGLE_OAUTH_CLIENT_ID` (and `APPLE_OAUTH_AUDIENCES` if Apple is enabled) are set in `server/.env` or the environment.

### Frontend
No special flag. Build/run as usual:
```bash
npm start               # Metro
npm run android         # or ios / web
```
The sign-in screen shows "Continue with Google" / "Continue with Apple" buttons. No dev-login button appears in release builds.

---

## Dev-login (bypass) — emulator testing

### Backend
Start with the dev-login flag:
```bash
cd server && DEV_LOGIN_ENABLED=1 go run .
```
- `POST /api/dev-login` becomes registered. The constructor logs `WARNING: DEV_LOGIN_ENABLED is on …` so it's obvious.
- **Never** set `DEV_LOGIN_ENABLED` in `.env`, `Dockerfile`, or EAS build config.
- The route calls the same `getOrCreateUserByEmail` + `respondWithIssuedSession` helpers as `googleLogin`, so the returned token is a real session JWT accepted by every authenticated endpoint and the WebSocket.

### Frontend
The `DevLoginButton` is `__DEV__`-gated and mounted inside `SignInButtons`, so it appears on every unauthenticated surface (Profile, Messages, My Events, Create Event) **only in dev builds**. In release builds it short-circuits to `() => null`.

For emulator builds, Metro must point at the host loopback via the `10.0.2.2` alias:
```bash
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080 \
EXPO_PUBLIC_WS_BASE_URL=ws://10.0.2.2:8080 \
EXPO_PUBLIC_CHAT_ENABLED=true \
npm start
```
(`10.0.2.2` is the emulator's route to the host loopback — it does NOT work on physical devices.)

### Three preset test users
The `DevLoginButton` exposes three fixed identities so cross-user host/member flows can be exercised:

| Button | Email | User id | Typical role |
|---|---|---|---|
| Dev Login (tester) | `tester@who-else-is-free.test` | 5 | member / 1:1 host |
| Dev Login (host) | `host@who-else-is-free.test` | 6 | group event host |
| Dev Login (member2) | `member2@who-else-is-free.test` | 7 | second member for cross-user flows |

All three persist across sessions (the route upserts by email), so test data accumulates reproducibly.

### End-to-end on the emulator
1. Start backend: `cd server && DEV_LOGIN_ENABLED=1 go run .`
2. Start Metro with the `EXPO_PUBLIC_*` env vars above.
3. Ensure only the emulator is connected: `adb devices -l` should show one `emulator-<port>` line. If a physical phone is also plugged in, unplug it (or restart pi with `ANDROID_SERIAL=emulator-5554`).
4. Launch the app: `adb shell am start -n com.whoelseisfree.app/.MainActivity`. If it lands on the Expo Dev Launcher screen, tap the `http://10.0.2.2:8081` row to connect to Metro.
5. Reach the sign-in screen: Profile tab → **Logout** (if already signed in) → **Continue**.
6. Tap the desired **Dev Login** button. The app POSTs to `/api/dev-login` from the device, stores the JWT via SecureStore, and navigates into the app.

### Mint a token host-side (for cURL setup)
If you need a token for REST seeding rather than driving the app:
```bash
curl -s -X POST http://localhost:8080/api/dev-login \
  -H 'Content-Type: application/json' \
  -d '{"email":"tester@who-else-is-free.test","name":"Tester","profile_complete":true}'
# use the "token" field as: Authorization: Bearer <token>
```

---

## Switching back to normal login

1. Stop the backend. Restart **without** `DEV_LOGIN_ENABLED`:
   ```bash
   cd server && go run .
   ```
   `/api/dev-login` is now unregistered (404 if hit).
2. (Optional) Reload the app bundle: `adb shell input keyevent KEYCODE_R`. The dev-login buttons remain visible because you're still in a `__DEV__` build, but tapping one will fail with "Dev login is not enabled on the server." — which is the correct behaviour. The Google/Apple buttons work as usual.
3. For a true production build (no dev-login button at all), build without `__DEV__` (e.g. via EAS production build) — `DevLoginButton` renders `null`.

---

## Reference

- Skill: `.pi/skills/test-on-device/SKILL.md` — full emulator test workflow.
- Code: `src/components/DevLoginButton.tsx`, `src/context/AuthContext.tsx` (`signInWithDevUser`), `server/auth_handler.go` (`devLogin`).
- Test: `server/auth_handler_test.go` — `TestDevLoginDisabledByDefault`, `TestDevLoginIssuesSession`, `TestDevLoginIsIdempotentAcrossCalls`.
