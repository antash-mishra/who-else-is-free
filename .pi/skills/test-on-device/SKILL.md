---
name: test-on-device
description: Test a newly implemented feature or fix on the running Android emulator by bypassing Google/Apple sign-in with a dev-login dummy user and driving the app with mobile-mcp tools (mobile_init, mobile_open_app, mobile_dump_ui, mobile_tap, mobile_swipe, mobile_type, mobile_key_press, mobile_screenshot). Use after implementing a frontend+backend change when the user says "test this on device", "verify on emulator", or "smoke test the change". Covers starting the dev server, seeding a reusable test user, navigating the relevant flow, capturing screenshots, and recording a pass/fail verdict. Emulator-only — never targets a physical device. Pairs naturally with the fix-issues-on-device skill, which is for iterating on multiple issue fixes in worktrees.
---

# Test a Change on the Android Emulator (with dev-login bypass)

You implemented a feature or fix. Now prove it works on the Android emulator by driving the app with the `mobile_*` tools (from the `.pi/extensions/mobile-mcp` bridge) and inspecting screenshots with vision. Because the app currently only supports Google/Apple sign-in (impractical on an emulator with no Google account), you use a **dev-login** backend route that issues a real session token for a fixed dummy user, then drive the Onboarding screen to enter the dev token.

**Emulator-only.** This skill targets the Android emulator, never a physical device. The `mobile-mcp` bridge drives whatever `adb` reports as connected, so you must verify the connected target is an emulator (`emulator-<port>`) before proceeding. If only a physical device is attached, ask the user to start an emulator and disconnect the phone — do not test on a physical device with this skill.

This is one shared emulator — run **sequentially**, never call `mobile_*` tools in parallel.

## Preconditions (do once at the start of a session)

1. Read `AGENTS.md` / `CLAUDE.md` for project conventions, build/test commands, and the app package name. App package is `com.whoelseisfree.app` (from `android/app/build.gradle`).
2. Confirm the project is trusted (`/trust` or `pi -a`) so `.pi/` extensions/skills load.
3. Confirm the mobile-mcp extension is installed: `bash` `test -d .pi/extensions/mobile-mcp/node_modules || (cd .pi/extensions/mobile-mcp && npm install)`.
4. **Verify an emulator (not a physical device) is connected:**
   ```bash
   bash: adb devices -l
   ```
   - You need a line like `emulator-5554 device ... product:sdk_gphone64 ... transport_id:N`. The `emulator-` prefix and `product:sdk_gphone*` are the tell.
   - A physical device shows as a numeric serial (e.g. `001206477005760`) with `usb:` transport — that is NOT acceptable for this skill.
   - If no emulator is running, start one (see **Starting an emulator** below) before continuing. Do not proceed on a physical device.
5. Know the dev server URL. From the emulator, the host's loopback is reachable at `http://10.0.2.2:8080` (the `10.0.2.2` alias is the emulator's special route to the host — it does NOT exist on physical devices, which is one reason this skill is emulator-only). Confirm where the app points: `bash` `grep -n "EXPO_PUBLIC_API_BASE_URL\|EXPO_PUBLIC_WS_BASE_URL\|EXPO_PUBLIC_CHAT_ENABLED" .env* 2>/dev/null || echo "no .env — using defaults in src/api/config.ts"`. Read `src/api/config.ts` to understand the default. If the configured URL is not `10.0.2.2`-based, set `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080` and `EXPO_PUBLIC_WS_BASE_URL=ws://10.0.2.2:8080` for the emulator build (see **Env for emulator builds** below).
6. Identify the user-facing flow the change touches: which screens, which entry points, what input fields. Read the relevant screen files under `src/screens/` so you know what to tap and what to type.

## Starting an emulator

If `adb devices -l` shows only a physical device (or nothing), start an emulator. Locate the emulator binary and AVDs:

```bash
bash: ls ~/Library/Android/sdk/emulator/emulator 2>/dev/null && ~/Library/Android/sdk/emulator/emulator -list-avds
```

Then launch an AVD in the background:

```bash
bash: nohup ~/Library/Android/sdk/emulator/emulator -avd <AVD_NAME> -no-snapshot-load >/tmp/emulator.log 2>&1 &
```

Wait for boot:

```bash
bash: adb wait-for-device && adb shell 'while [[ "$(getprop sys.boot_completed)" != "1" ]]; do sleep 1; done' && echo "booted"
```

Then re-run `adb devices -l` to confirm an `emulator-<port>` entry appears with `device` state.

### Targeting the emulator when a physical device is also attached

`mobile-mcp` (via the `mobile-use` `ADBClient`) runs **bare `adb shell`/`adb exec-out`** with no `-s <serial>` argument. adb refuses with `more than one device/emulator` whenever two targets are connected. The only way `mobile-mcp` picks the emulator in that situation is the **`ANDROID_SERIAL` env var**, which adb itself honors — BUT it must be set in the environment of the **pi process itself**, because the mobile-mcp bridge extension is spawned at session start with `env: { ...process.env }` (see `.pi/extensions/mobile-mcp/index.ts`). Setting `ANDROID_SERIAL` in a mid-session `bash` command does **not** reach the already-running mobile-mcp subprocess.

So, if a physical device is connected over USB:

1. **Best:** physically unplug the phone (or power off its USB debugging). Then `adb devices -l` shows only `emulator-5554`, and `mobile_init` works.
2. **If unplugging is not possible:** tell the user to restart pi with the env var set so the mobile-mcp subprocess inherits it:
   ```bash
   ANDROID_SERIAL=emulator-5554 pi   # or set/export in the shell that launches pi
   ```
   This is a hard requirement when both are attached — there is no in-session workaround. Verify the inherited var from the bridge by checking that `mobile_init` no longer reports `more than one device/emulator`.

Diagnose the two-device failure by reading the `mobile_init` error: `adb: more than one device/emulator` is the tell-tale. `adb -s emulator-5554 <cmd>` always works for direct verification even when `mobile-mcp` is stuck.

## Env for emulator builds

The app reads `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_WS_BASE_URL` at build time (see `src/api/config.ts`). For an emulator build, the host backend must be reachable via `10.0.2.2`:

```bash
bash: export EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080
bash: export EXPO_PUBLIC_WS_BASE_URL=ws://10.0.2.2:8080
bash: export EXPO_PUBLIC_CHAT_ENABLED=true
```

Set these in the same shell that runs `npm run android` so they're baked into the JS bundle. Do NOT commit these into `.env` or project config — they're per-session for the emulator only.

## Dev-login setup (one-time, backend)

The backend must be running AND have the dev-login route enabled. The route is implemented and gated by an env flag.

### 1. Start the backend in dev mode

Run the Go server with the dev-login flag enabled. From the repo root:

```bash
bash: cd server && DEV_LOGIN_ENABLED=1 go run .
```

`DEV_LOGIN_ENABLED=1` makes `NewAuthHandler` register `POST /api/dev-login`. The route is **unregistered** (returns 404) when the flag is off, so it is safe by default and **must never be enabled in production** (the `Dockerfile` / EAS build must not set it). The constructor logs a loud `WARNING: DEV_LOGIN_ENABLED is on …` when it's on.

- The server listens on `:8080` by default. From the emulator that is `http://10.0.2.2:8080`.
- Keep this server process running in the background across the whole testing session. Use a separate terminal/output you can tail for request logs.

### 2. Dev-login route contract

`POST /api/dev-login` (only registered when `DEV_LOGIN_ENABLED=1`). Request:

```json
{ "email": "tester@who-else-is-free.test", "name": "Tester", "profile_complete": true }
```

Response (same shape as `google-login`):

```json
{
  "user": { "id": <n>, "name": "Tester", "email": "tester@who-else-is-free.test", "profile_complete": true },
  "token": "<session JWT>",
  "is_new_user": false
}
```

It calls the same `getOrCreateUserByEmail` + `respondWithIssuedSession` helpers as `googleLogin`, so the token is a real session JWT accepted by every authenticated endpoint and the WS. The fixed email (`tester@who-else-is-free.test`) makes the seeded user accumulate events/conversations across runs and stay reproducible. `profile_complete: true` makes the client skip the Onboarding screen.

### 3. Frontend dev-login button (already wired)

`src/components/DevLoginButton.tsx` is a `__DEV__`-gated button rendered inside `src/components/SignInButtons.tsx`, so it appears on every unauthenticated surface (Profile, Messages, My Events, Create Event). It calls `useAuth().signInWithDevUser(DEV_LOGIN_EMAIL, DEV_LOGIN_NAME)` which POSTs to `/api/dev-login` from the device, then writes the session through the same SecureStore keys (`TOKEN_KEY` / `USER_KEY` / `AUTH_PROVIDER_KEY`) as `signInWithProvider`. In release builds the component short-circuits to a no-op render, so it can never appear to end users regardless of the backend flag.

The testID is `dev-login-button` — use it in `mobile_dump_ui` to locate the button reliably.

## Test loop

Repeat up to 5 attempts until the change is verified.

### 1. Build and install the app (only if frontend changed)
```bash
bash: npm run android
```
Watch for `BUILD SUCCESSFUL` / `Installed on`. If only server code changed, you can skip the rebuild — restart the `go run .` process from dev-login setup step 1 to pick up the changes.

**Metro must be running** before you launch or interact with the app (separate terminal): `bash: npm start`. The emulator build is an Expo Dev Launcher / development build — without Metro on `:8081`, the app cannot load its JS bundle and you'll be stuck on the Dev Launcher screen with "no development servers" or a red-box bundle error. Confirm Metro is listening: `bash: lsof -iTCP:8081 -sTCP:LISTEN` should show a `node` process.

### 2. Initialize mobile control and launch the app
- Re-confirm the emulator is still the connected target: `bash` `adb devices -l | grep 'emulator-'`. If it's gone (crashed/quit), restart it per **Starting an emulator** before continuing.
- `mobile_init` once per session.
- Launch the app. **Note:** `mobile_open_app` uses `adb shell monkey` which silently no-ops on this Expo Dev Launcher build. Instead, launch the main activity directly via bash, then drive the rest with `mobile_*`:
  ```bash
  bash: adb shell am start -n com.whoelseisfree.app/.MainActivity
  ```
  After this, `mobile_dump_ui` to see what's on screen.

### 3. Handle the Expo Dev Launcher screen (if it appears)

After `am start`, the app may land on the **Expo Dev Launcher** screen (`expo.modules.devlauncher.launcher.DevLauncherActivity`) listing "DEVELOPMENT SERVERS" (e.g. `http://10.0.2.2:8081`). This means the dev build is waiting to connect to Metro.

- `mobile_dump_ui` and locate the dev-server row (the element whose text matches `http://10.0.2.2:8081`, typically near `bounds:[~63,~566][~1017,~703]`).
- Tap its center via `mobile_tap` (compute from the bounds in the dump).
- Wait a few seconds: `bash: sleep 5`.
- Confirm you've left Dev Launcher by checking the foreground activity:
  ```bash
  bash: adb shell dumpsys activity activities | grep topResumedActivity
  ```
  You should see `com.whoelseisfree.app/.MainActivity` (NOT `DevLauncherActivity`).
- `mobile_dump_ui` again to see the app's first real screen (Discover if already authenticated, or Onboarding/sign-in if not).

If instead you see a red-box bundle error, Metro isn't running or isn't on `:8081` — fix that (step 1) before retrying.

### 4. Sign in via dev-login (only if not already authenticated)

If `mobile_dump_ui` shows the Discover screen with event cards, you're already authenticated — skip to step 5. The session persists in the AVD's userdata across cold boots, so re-login is only needed on a fresh install or after `signOut` / `deleteAccount`.

If you see the unauthenticated surface (sign-in buttons):

a. Locate the **Dev Login (tester)** button via `mobile_dump_ui` — it's below the Google/Apple buttons, with testID `dev-login-button`. Tap its center via `mobile_tap`.

b. The button calls `/api/dev-login` from the device itself (no host-side curl needed — the device reaches the backend over `10.0.2.2`). Wait a second, then `mobile_dump_ui`. If you landed on the Discover screen, sign-in succeeded.

c. If sign-in failed, the button shows a red error caption. Read it — the common cause is `Dev login is not enabled on the server. Start the backend with DEV_LOGIN_ENABLED=1.` → fix dev-login setup step 1 and retry. Network errors usually mean the app's `EXPO_PUBLIC_API_BASE_URL` isn't `10.0.2.2`-based (see **Env for emulator builds**). Server logs (the `go run .` terminal) show whether `/api/dev-login` was hit.

> Keep the seeded user consistent across all tests in a session — don't create new dummy users per attempt. The fixed email gives you stable data (events, conversations, membership state) to reproduce flows.

### 5. Reproduce the user flow under test
Navigate to the screen(s) the change touches. Use `mobile_dump_ui` (read hierarchy + coordinates) → `mobile_tap` / `mobile_swipe` / `mobile_type` / `mobile_key_press`. Re-dump after every action to confirm state. If the change needs an event or conversation, create one as the seeded user (or reuse existing seeded data) — don't hand-edit the DB.

### 6. Capture evidence and verdict
- Call `mobile_screenshot` and **look at the returned image carefully**. Use `mobile_dump_ui` too when text/state matters. (Note: vision-capable models inspect the image directly; otherwise lean on `mobile_dump_ui`'s structured text/bounds output.)
- **Pass:** Record the result on `TEST_RUNS.md` (see below) and stop.
- **Fail:** Feed the screenshot/dump observations back into your reasoning, change the implementation (or the test steps), and loop. Do not repeat an identical change.
- **After 5 failed attempts:** Stop, write up the remaining failure precisely, and ask the user how to proceed.

### 7. Seed test data when absent
If a flow needs fresh data and the seeded user has none, create it through the UI as the seeded user (e.g. Create Event), OR use the authenticated session token + `curl` against the existing REST API to set up prerequisites faster. To mint a host-side token for cURL setup, hit the same dev-login route from the host (the host loopback is `localhost`, not `10.0.2.2`):
```bash
bash: curl -s -X POST http://localhost:8080/api/dev-login \
  -H 'Content-Type: application/json' \
  -d '{"email":"tester@who-else-is-free.test","name":"Tester","profile_complete":true}'
```
Then use that `token` as `Authorization: Bearer <token>` for setup cURLs. Never write directly to SQLite — it bypasses validation and pollutes the schema.

## TEST_RUNS.md (live status board)

Keep `TEST_RUNS.md` in the project root as a durable log of device-test verdicts. Append one entry per attempt:

```markdown
## YYYY-MM-DD — <feature/fix title>
- Change: <one-line summary, plus commit hash if committed>
- Flow: <screens navigated, e.g. "SignIn → Discover → Messages → ChatThread">
- Attempt 1: [PASS|FAIL] — <evidence from screenshot/dump>
- Attempt 2: ...
- Final: [PASS|FAIL] — <summary>
```

Commit `TEST_RUNS.md` updates on the integration branch alongside the code change when verification finishes.

## Rules

- One test session at a time; never call two `mobile_*` tools in parallel.
- Always `mobile_dump_ui` before tapping coordinates — don't guess.
- Take a fresh `mobile_screenshot` after every state change you're verifying. Trust the screenshot/dump over the code.
- Never enable `DEV_LOGIN_ENABLED` in production or commit it to `.env` / `Dockerfile` / EAS build config. It is a local-only convenience.
- Dev-login on the client is `__DEV__`-gated (`DevLoginButton` renders `null` in release builds); never ship it. Both switches (server env + client `__DEV__`) must be off in production.
- If a test fails on the device but passes in unit tests, trust the device — emulator findings are authoritative for UI/interaction behavior.

## When to stop

When the change is PASS on the device (or you've exhausted 5 attempts and escalated), print a one-line verdict and stop. Append to `TEST_RUNS.md` either way.
