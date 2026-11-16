# Email Code Sign-in and Lasting Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every signed-in person signed in by default (rotating refresh keys) and add "Continue with email" sign-in with a 6-digit code.

**Architecture:** The Go server issues an opaque, rotating refresh key next to the existing 24h
HMAC access token, stored hashed in SQLite, and exchanges it at `/api/session/refresh`. Email
sign-in adds `/api/email-login/start` and `/verify`, a hashed one-time-code table, in-memory rate
limits, and an `emailSender` interface backed by Cloudflare Email Sending's REST API. The Expo
client moves session persistence into one helper module, refreshes through the key (Google
silent sign-in stays as a fallback), and grows an inline email/code step inside `SignInButtons`,
which always renders inside a `BottomSheetModal`.

**Tech Stack:** Go 1.x + Gin + `modernc.org/sqlite`; React Native/Expo, `expo-secure-store`,
`expo-apple-authentication`, Jest + `@testing-library/react-native` + `jest-fetch-mock`.

**Spec:** `docs/superpowers/specs/2026-11-12-email-code-sign-in-design.md`

## Global Constraints

- Access token TTL stays `defaultSessionTTL = 24 * time.Hour`; refresh keys expire 90 days after their last use (`refreshTokenTTL = 90 * 24 * time.Hour`).
- No user-facing "stay signed in" option anywhere; lasting sessions are always on.
- Raw refresh keys and raw codes are never stored or logged; store SHA-256 (refresh) / HMAC-SHA256 (codes) only. Never log emails, codes or keys (existing rule in `recordIdentityHashes`).
- Existing sign-in response fields (`user`, `token`, `expires_at`, `is_new_user`) are unchanged; new fields are additive (`refresh_token`, `refresh_expires_at`) so old app versions keep working.
- Codes: 6 digits from `crypto/rand`, expire after 10 minutes, single use, dead after 5 wrong attempts; a new start invalidates earlier codes for the address.
- `/api/email-login/start` returns the same 200 body whether or not the address has an account.
- Email matching is case-insensitive for every sign-in path; new emails are stored lowercased.
- Apex DNS records for Google Workspace on `weifapp.com` must not change.
- Client: use `logger` not `console.*`; `typography.inputLetterSpacing` on inputs; theme tokens only (no hex outside `src/theme`); import order and aliases per `CLAUDE.md`.
- No new native modules: changes must stay OTA-compatible with the current runtime.

## Review Focus

1. **Network drop during refresh** (airplane mode, server unreachable): the person must stay signed in and the request simply fails; only an explicit 401 from `/api/session/refresh` (with no working Google fallback) signs them out. Test in Task 3.
2. **Lost refresh response** (server rotated, phone kept the old key): presenting the old key again must still work until its successor is used. Test in Task 1.
3. **Mixed-case or padded email** (`" Asha@Gmail.com "`) must reach the account created by Google as `asha@gmail.com`. Test in Task 5.
4. **Double submit of a correct code** (auto-submit plus a tap): exactly one session; the second gets the expired-code error, not a server error. Test in Task 7.
5. **Chat socket flapping while the token is still valid** must not rotate keys. Test in Task 3.

---

## File map

| File                                                 | Responsibility                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `server/refresh_tokens.go` (new)                     | Table DDL, mint/rotate/revoke/purge on `EventRepository`          |
| `server/session_handler.go` (new)                    | `POST /api/session/refresh`, `POST /api/session/logout`           |
| `server/auth_cleanup_job.go` (new)                   | Daily purge of expired refresh keys and codes                     |
| `server/email_sender.go` (new)                       | `emailSender` interface, Cloudflare REST sender, dev log sender   |
| `server/email_login.go` (new)                        | Code table + repo methods, start/verify handler, rate limits      |
| `server/auth_handler.go`                             | Refresh key in `respondWithIssuedSession`; lowercase new emails   |
| `server/repository_schema.go`, `repository_admin.go` | Case-insensitive email lookup; init new tables                    |
| `server/router.go`, `server/main.go`                 | Wire handlers and the cleanup job                                 |
| `src/context/authSession.ts` (new)                   | Session payload parsing + SecureStore persistence                 |
| `src/context/AuthContext.tsx`                        | Refresh-key flow, logout, Apple revocation, email sign-in methods |
| `src/context/ChatContext.tsx`                        | Refresh only when the token is expired                            |
| `src/api/emailLogin.ts` (new)                        | `requestEmailCode`, `verifyEmailCode` HTTP calls                  |
| `src/components/auth/EmailSignInForm.tsx` (new)      | Email + code steps                                                |
| `src/components/SignInButtons.tsx`                   | "Continue with email" button, switches to the form                |
| `src/screens/CreateEventScreen.tsx`                  | Sign-in sheet avoids the keyboard                                 |

The legacy `Login` route (`src/screens/GoogleSignIn.tsx`) has no navigators pointing at it; leave it unchanged.

---

## Part 1: lasting sessions

### Task 1: Refresh key storage and rotation (server)

**Files:**

- Create: `server/refresh_tokens.go`, `server/refresh_tokens_test.go`
- Modify: `server/repository_schema.go` (`Init`: create table + indexes)

**Interfaces:**

- Produces:
  - `const refreshTokenTTL = 90 * 24 * time.Hour`
  - `var ErrRefreshTokenInvalid`, `ErrRefreshTokenReused` (in `refresh_tokens.go`)
  - `func (r *EventRepository) IssueRefreshToken(ctx context.Context, userID int64, now time.Time) (raw string, expiresAt time.Time, err error)` — new family
  - `func (r *EventRepository) RotateRefreshToken(ctx context.Context, raw string, now time.Time) (userID int64, newRaw string, expiresAt time.Time, err error)`
  - `func (r *EventRepository) RevokeRefreshTokenFamily(ctx context.Context, raw string, now time.Time) error` (unknown key → nil)
  - `func (r *EventRepository) PurgeExpiredRefreshTokens(ctx context.Context, now time.Time) (int64, error)`

Table `refresh_tokens(id INTEGER PK AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, family_id TEXT NOT NULL, parent_id INTEGER, token_hash TEXT NOT NULL UNIQUE, created_at DATETIME NOT NULL, first_used_at DATETIME, expires_at DATETIME NOT NULL, revoked_at DATETIME)`, indexes on `family_id`, `parent_id`, `user_id`.

Raw key: 32 bytes from `crypto/rand`, `base64.RawURLEncoding`. Hash: hex SHA-256.

`RotateRefreshToken` algorithm (one transaction):

```
row := lookup by hash; missing, revoked_at set, or expires_at <= now  -> ErrRefreshTokenInvalid
if any child (parent_id = row.id) has first_used_at set:            -> revoke all rows in family, ErrRefreshTokenReused
if row.first_used_at is null:
    set row.first_used_at = now
    revoke row's unused siblings (same parent_id, id != row.id, first_used_at null)   // phone moved to this key
insert child {family_id, parent_id: row.id, expires_at: now+refreshTokenTTL}
return row.user_id, child raw key
```

- [ ] **Step 1: Write failing tests** in `refresh_tokens_test.go` (reuse the temp-DB setup pattern from `setupAuthTestEnv`; create a user with `CreateUserWithPassword`):
  - `TestRotateRefreshTokenReturnsNewKeyForSameUser`: issue → rotate → `userID` matches, `newRaw != raw`, `expiresAt == now+90d`.
  - `TestRotateRefreshTokenAllowsReplayUntilSuccessorUsed`: issue K → rotate K (S1) → rotate K again succeeds (S2) → rotate S2 succeeds.
  - `TestRotateRefreshTokenDetectsReuseAfterSuccessorUsed`: K → S1 → rotate S1 (T1) → rotate K returns `ErrRefreshTokenReused`; then rotate T1 returns `ErrRefreshTokenInvalid` (family revoked).
  - `TestUsingOneSiblingRetiresTheOther`: K → S1, K → S2; rotate S2 ok; rotate S1 → `ErrRefreshTokenInvalid`.
  - `TestRotateRefreshTokenRejectsExpired`: rotate at `now + refreshTokenTTL + time.Second` → `ErrRefreshTokenInvalid`.
  - `TestRefreshTokensDeletedWithUser`: `DeleteUserAccount` → rotate → `ErrRefreshTokenInvalid`.
  - `TestRevokeRefreshTokenFamily`: revoke via K after K→S1; rotate S1 → invalid.
  - `TestPurgeExpiredRefreshTokens`: an expired row and a row revoked > 7 days ago are deleted; a live row stays.
- [ ] **Step 2:** `cd server && go test -run 'RefreshToken' ./...` → FAIL (undefined).
- [ ] **Step 3:** Implement the interfaces above; add the DDL to `Init` after `admin_users`.
- [ ] **Step 4:** `cd server && go test -run 'RefreshToken' ./...` → PASS.
- [ ] **Step 5:** Commit `feat(server): rotating refresh keys`.

### Task 2: Issue, refresh and log out (server)

**Files:**

- Create: `server/session_handler.go`, `server/session_handler_test.go`, `server/auth_cleanup_job.go`
- Modify: `server/auth_handler.go` (`respondWithIssuedSession`), `server/router.go`, `server/main.go`

**Interfaces:**

- Consumes: Task 1 methods.
- Produces:
  - Sign-in responses (google, apple, dev, email) gain `refresh_token` (string) and `refresh_expires_at` (RFC 3339).
  - `func (h *AuthHandler) issueSession(c *gin.Context, user *User, logPrefix string, isNewUser bool, refreshRaw string, refreshExpiresAt time.Time)` — shared writer; `respondWithIssuedSession` mints a new family then calls it.
  - `POST /api/session/refresh` `{refresh_token}` → 200 same body as sign-in (`is_new_user: false`); 401 `{"error":"session expired, please sign in again"}` on invalid/reused/deleted user; 400 on missing body.
  - `POST /api/session/logout` `{refresh_token}` → 204 always (unknown key included).
  - Both registered in `AuthHandler.RegisterRoutes` (public group).
  - `func startAuthCleanupJob(ctx context.Context, repo *EventRepository, interval time.Duration)` — mirrors `startReportRetentionJob`; calls `PurgeExpiredRefreshTokens` (and `PurgeExpiredEmailLoginCodes` after Task 7). Started in `main.go` with `24*time.Hour`.

- [ ] **Step 1: Failing tests** in `session_handler_test.go` using `setupAuthTestEnv` + `/api/dev-login` (set `DEV_LOGIN_ENABLED=1` before `NewAuthHandler`):
  - `TestSignInReturnsRefreshToken`: dev-login body has non-empty `refresh_token` and `refresh_expires_at`.
  - `TestSessionRefreshIssuesNewTokens`: refresh with it → 200, new `token` verifies with the signer for the same `user.id`, new `refresh_token` differs.
  - `TestSessionRefreshRejectsUnknownKey`: → 401 with the exact error string above.
  - `TestSessionLogoutRevokesKey`: logout → 204; refresh with the same key → 401.
- [ ] **Step 2:** `go test -run 'Session|SignInReturnsRefresh' ./...` → FAIL.
- [ ] **Step 3:** Implement; refresh handler loads the user with `GetUserByID` and responds through `issueSession`. A user-row-missing case → 401.
- [ ] **Step 4:** `cd server && go test ./...` → PASS (whole suite: existing auth tests must still pass).
- [ ] **Step 5:** Commit `feat(server): refresh and logout endpoints`.

### Task 3: Client lasting sessions

**Files:**

- Create: `src/context/authSession.ts`, `src/context/__tests__/authSession.test.ts`
- Modify: `src/context/AuthContext.tsx`, `src/context/ChatContext.tsx`, `src/context/__tests__/AuthContext.rendering.test.tsx`, `src/__tests__/mocks/mockData.ts` (add `refresh_token`/`refresh_expires_at`/`expires_at` to login fixtures)

**Interfaces:**

- Produces (`authSession.ts`):
  - `export type AuthProviderName = 'google' | 'apple' | 'email'` (moved from AuthContext and re-exported there)
  - `export type SessionPayload` (server body shape) and `export type StoredSession = { token: string; user: AuthUser; provider: AuthProviderName; tokenExpiresAt: string | null; refreshToken: string | null }`
  - `export const toAuthUser(payload.user): AuthUser`
  - `export const persistSession(session: StoredSession): Promise<void>`, `readStoredSession(): Promise<StoredSession | null>`, `clearPersistedSession(): Promise<void>`
  - SecureStore keys: existing three plus `REFRESH_TOKEN_KEY = 'whoelseisfree.refreshToken'`, `TOKEN_EXPIRES_AT_KEY = 'whoelseisfree.authTokenExpiresAt'`. `readStoredSession` keeps the legacy rule: an unknown/missing provider becomes `google`, but `email` is accepted.
  - `export const isTokenExpired(expiresAt: string | null, now = Date.now(), skewMs = 60_000): boolean` (null → true).
- Produces (`AuthContext`):
  - `refreshSessionSilently(options?: { onlyIfExpired?: boolean }): Promise<string | null>` — with `onlyIfExpired` and a non-expired token, returns the current token without a request.
  - Internal `refreshSession(): Promise<{ status: 'refreshed'; token: string } | { status: 'rejected' } | { status: 'unavailable' }>`: refresh key first (`POST /api/session/refresh`); on 401 clear the stored key and, for Google, try `GoogleSignin.signInSilently` (existing behaviour); a thrown fetch/network error → `unavailable`. One in-flight promise shared by all callers (`refreshInFlightRef`).
  - `authFetch`: on 401, `refreshed` → retry once; `rejected` → `handleSessionExpired()`; `unavailable` → return the 401 response without signing out.
  - `signOut`: fire-and-forget `POST /api/session/logout` with the stored refresh key, then clear (works offline).
  - All sign-in paths (google, apple, dev) persist through `persistSession`, including `refresh_token` and `expires_at`.
- `ChatContext`: both `refreshSessionSilentlyRef.current?.()` calls pass `{ onlyIfExpired: true }`.

- [ ] **Step 1: Failing tests.**
  - `authSession.test.ts`: `persistSession`→`readStoredSession` round-trips all fields; stored provider `'email'` survives; missing provider reads as `'google'`; `isTokenExpired` with `null`, past, and `now+30s` (inside skew → true), `now+5min` → false.
  - `AuthContext.rendering.test.tsx` (extend `TestConsumer` with a "refresh" button calling `refreshSessionSilently({ onlyIfExpired: true })` and an "auth-fetch" path):
    - `it('refreshes with the stored refresh key on 401 and retries')`: stored token+refresh key; fetch mocks 401 → refresh 200 (new token `t2`, new key `k2`) → 200; status `200`, SecureStore refresh key is `k2`.
    - `it('keeps the session when refresh fails with a network error')`: 401 → refresh throws `TypeError('Network request failed')`; token still shown, SecureStore token still present.
    - `it('signs out when the refresh key is rejected and there is no Google fallback')`: provider `apple`; 401 → refresh 401; token cleared.
    - `it('skips refresh when the token is not expired and onlyIfExpired is set')`: expiresAt in 1h; no fetch calls made.
    - `it('revokes the refresh key on sign out')`: sign out → fetch called with `/api/session/logout` body `{refresh_token}`; local token cleared even if that fetch rejects.
- [ ] **Step 2:** `npx jest src/context/__tests__/authSession.test.ts src/context/__tests__/AuthContext --runInBand --silent` → FAIL.
- [ ] **Step 3:** Implement. Keep `AuthContext`'s public value shape except the widened `refreshSessionSilently` signature.
- [ ] **Step 4:** Same Jest command → PASS; `npx jest src/context --runInBand --silent` (ChatContext tests still pass); `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(app): stay signed in with rotating refresh keys`.

### Task 4: Apple credential revocation (client)

**Files:**

- Modify: `src/context/authSession.ts` (`APPLE_USER_KEY = 'whoelseisfree.appleUserId'` in persist/read/clear, `StoredSession.appleUserId?: string | null`), `src/context/AuthContext.tsx`, `src/components/SignInButtons.tsx`, `src/__tests__/mocks/mockModules.ts` (Apple mock gains `getCredentialStateAsync` and `AppleAuthenticationCredentialState`)
- Test: `src/context/__tests__/AuthContext.rendering.test.tsx`

**Interfaces:**

- `signInWithApple(idToken: string, appleUserId?: string): Promise<AuthUser>`; `SignInButtons` passes `credential.user`.
- On restore, and before a refresh-key exchange, when `Platform.OS === 'ios'`, provider `apple` and an `appleUserId` is stored: `getCredentialStateAsync(appleUserId)`; `REVOKED` or `NOT_FOUND` → `signOut()` + `onSessionExpired`. Errors from the check are logged and ignored (never sign out on a failed check).

- [ ] **Step 1: Failing tests:** `it('signs out a restored Apple session whose credential was revoked')` (Platform iOS, state REVOKED → token cleared); `it('keeps an Apple session when the credential check throws')`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(app): sign out revoked Apple credentials`.

---

## Part 2: email code sign-in

### Task 5: Case-insensitive account matching (server)

**Files:**

- Modify: `server/repository_schema.go` (`selectUserByEmail`: `WHERE email = ? COLLATE NOCASE ORDER BY id LIMIT 1`), `server/auth_handler.go` (`getOrCreateUserByEmail` lowercases and trims before lookup/insert), `server/repository_admin.go` (`isBootstrapAdminEmail` uses `strings.EqualFold`; `BootstrapAdmins` lookup goes through the same case-insensitive query)
- Test: `server/auth_handler_test.go`

- [ ] **Step 1: Failing tests:** `TestGoogleLoginMatchesExistingEmailCaseInsensitively` (existing user `asha@gmail.com`; Google claims `Asha@Gmail.com` → same `user.id`, `is_new_user` false); `TestNewUsersAreStoredLowercase` (Google claims `New@Example.COM` → stored/returned `new@example.com`); `TestBootstrapAdminEmailIgnoresCase`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `cd server && go test ./...` → PASS.
- [ ] **Step 5:** Commit `fix(server): match account emails case-insensitively`.

### Task 6: Email sender (server)

**Files:**

- Create: `server/email_sender.go`, `server/email_sender_test.go`

**Interfaces:**

- `type emailSender interface { SendLoginCode(ctx context.Context, to, code string) error }`
- `type cloudflareEmailSender struct { accountID, apiToken, fromAddress, fromName, baseURL string; client *http.Client }` — `baseURL` defaults to `https://api.cloudflare.com/client/v4` (overridable in tests).
- `func newEmailSenderFromEnv() emailSender` — Cloudflare when `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, `EMAIL_LOGIN_FROM` are all set (`EMAIL_LOGIN_FROM_NAME` defaults to `weif`); else `devLogEmailSender` when `EMAIL_LOGIN_DEV_LOG_CODES=1` (logs `email-login dev code: <code>` and nothing identifying the address); else `nil` (feature unavailable).
- Request: `POST {baseURL}/accounts/{accountID}/email/sending/send`, `Authorization: Bearer <token>`, JSON `{"to": to, "from": {"address": fromAddress, "name": fromName}, "subject": "Your weif code: 123456", "text": ..., "html": ...}`. Text body (exact copy):

```
Your weif sign-in code is 123456.

It expires in 10 minutes. If you didn't ask for this, you can ignore this email.
```

- Success = HTTP 2xx, `success: true`, and `to` not in `result.permanent_bounces` or `result.suppressed_recipients`. Anything else → error (message without the address).

- [ ] **Step 1: Failing tests** with `httptest.Server`: `TestCloudflareSenderPostsExpectedRequest` (path, bearer header, JSON fields, subject contains code); `TestCloudflareSenderFailsOnPermanentBounce`; `TestCloudflareSenderFailsOnHTTPError` (500 body); `TestNewEmailSenderFromEnvReturnsNilWhenUnconfigured`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (10s client timeout). **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(server): Cloudflare email sender for login codes`.

### Task 7: Email code endpoints (server)

**Files:**

- Create: `server/email_login.go`, `server/email_login_test.go`
- Modify: `server/repository_schema.go` (`Init` creates `email_login_codes`), `server/auth_handler.go` (`NewAuthHandler` sets `emailSender` and `emailLogin` limiter state; `RegisterRoutes` adds the two routes), `server/auth_cleanup_job.go`

**Interfaces:**

- Table `email_login_codes(id INTEGER PK AUTOINCREMENT, email TEXT NOT NULL, code_hash TEXT NOT NULL, created_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at DATETIME)`, index on `email`.
- Code hash: hex HMAC-SHA256 keyed by the session signer secret, message `"email-login:" + email + ":" + code`.
- Repo: `CreateEmailLoginCode(ctx, email, codeHash string, now time.Time) (int64, error)` (consumes earlier open codes for the email in the same tx), `DeleteEmailLoginCode(ctx, id int64) error`, `ConsumeEmailLoginCode(ctx, email, codeHash string, now time.Time) error` returning `ErrEmailCodeInvalid` (wrong, attempts now < 5) or `ErrEmailCodeExpired` (none/expired/consumed/attempts ≥ 5); consumption is a conditional `UPDATE ... WHERE consumed_at IS NULL` and must affect exactly one row. `PurgeExpiredEmailLoginCodes(ctx, now) (int64, error)` deletes rows whose `expires_at` < now − 24h.
- Constants: `emailCodeTTL = 10 * time.Minute`, `emailCodeMaxAttempts = 5`.
- Limits (`newAnonymousHelpRateLimiter` instances): per email 1 per 60s and 5 per hour; per `c.ClientIP()` 20 per hour; global key `"all"` `EMAIL_LOGIN_DAILY_CAP` per 24h (default 500).
- `POST /api/email-login/start` `{email}`: trim+lowercase; invalid format (`net/mail.ParseAddress` must return the same bare address) → 400 `{"error":"Enter a valid email address."}`; sender nil → 503 `{"error":"Email sign-in isn't available right now."}`; rate limited → 429 `{"error":"Too many codes requested. Wait a minute and try again."}`; create row, send; send error → delete row, 502 `{"error":"We couldn't send the code. Please try again."}`; success → 200 `{"status":"sent"}`.
- `POST /api/email-login/verify` `{email, code}`: code must be 6 digits else 400; `ErrEmailCodeInvalid` → 401 `{"error":"That code isn't right. Check it and try again.","code":"code_invalid"}`; `ErrEmailCodeExpired` → 401 `{"error":"This code has expired. Request a new one.","code":"code_expired"}`; success → `getOrCreateUserByEmail(email, "")`, `recordIdentityHashes(..., identityProviderEmail, email)`, `respondWithIssuedSession(c, user, "email-login", isNew)`.

- [ ] **Step 1: Failing tests** (inject a recording fake sender into the handler):
  - `TestEmailLoginStartSendsCode`: 200 `{"status":"sent"}`; fake received the normalised address and a 6-digit code.
  - `TestEmailLoginStartSameResponseForKnownAndUnknownEmail`: byte-identical bodies.
  - `TestEmailLoginVerifyCreatesUserAndSession`: new address → 200, `is_new_user` true, `refresh_token` set, `profile_complete` false.
  - `TestEmailLoginVerifyMatchesExistingGoogleAccount`: user `asha@gmail.com` exists; start/verify with `" Asha@Gmail.com "` → same `user.id`.
  - `TestEmailLoginVerifyWrongCodeThenExpiresAfterFiveAttempts`: four wrong → `code_invalid`; fifth wrong → `code_expired`; then correct code → `code_expired`.
  - `TestEmailLoginCodeIsSingleUse`: correct verify twice → 200 then 401 `code_expired` (Review Focus 4).
  - `TestEmailLoginCodeExpiresAfterTenMinutes` (handler clock injectable: `now func() time.Time` field on `AuthHandler`).
  - `TestEmailLoginNewCodeInvalidatesOld`.
  - `TestEmailLoginStartRateLimitsPerAddress`: second start within 60s → 429.
  - `TestEmailLoginStartReturns503WithoutSender`, `TestEmailLoginStartDeletesCodeWhenSendFails` (fake returns error → 502, then verify with that code → `code_expired`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; add `PurgeExpiredEmailLoginCodes` to the cleanup job. **Step 4:** `cd server && go test ./...` → PASS.
- [ ] **Step 5:** Commit `feat(server): email code sign-in endpoints`.

### Task 8: Client email sign-in API (AuthContext)

**Files:**

- Create: `src/api/emailLogin.ts`, `src/api/__tests__/emailLogin.test.ts`
- Modify: `src/context/AuthContext.tsx`, `src/context/__tests__/AuthContext.rendering.test.tsx`

**Interfaces:**

- `requestEmailCode(email: string): Promise<void>` via `requestJson` (`POST /api/email-login/start`), throws `ApiError` with the server message.
- `postEmailCode(email: string, code: string): Promise<SessionPayload>` (`POST /api/email-login/verify`); on 401 throws `EmailCodeError` with `reason: 'code_invalid' | 'code_expired'` and the server message.
- AuthContext adds `startEmailSignIn(email: string): Promise<void>` and `verifyEmailCode(email: string, code: string): Promise<AuthUser>` (persists provider `email`, tracks `login_succeeded`/`signup_succeeded` with `provider: 'email'`, `login_failed` with `failure_stage: 'server'` on non-code errors).

- [ ] **Step 1: Failing tests:** API module maps 200/401/429 correctly (`jest-fetch-mock`); AuthContext `verifyEmailCode` stores token, refresh key and provider `email`, and a restored `email` session stays `email`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(app): email code sign-in API`.

### Task 9: Email sign-in UI

**Files:**

- Create: `src/components/auth/EmailSignInForm.tsx`, `src/components/auth/__tests__/EmailSignInForm.test.tsx`
- Modify: `src/components/SignInButtons.tsx`, `src/components/__tests__/SignInButtons.test.tsx`, `src/screens/CreateEventScreen.tsx` (`avoidKeyboard` also when `renderedSheet === 'signIn'`)

**Interfaces:**

- `EmailSignInForm({ onBack: () => void; onSignedIn: (user: AuthUser) => void })`.
- `SignInButtons` shows a third `AppButton` "Continue with email" (`testID="email-sign-in-button"`, mail icon from the existing icon set) on both platforms; pressing it swaps the provider buttons for `EmailSignInForm` in place; `onSignedIn` → existing `handlePostSignInNavigation(user.profileComplete)`.
- Email step: `TextField` (`testID="email-sign-in-input"`, `keyboardType="email-address"`, `autoCapitalize="none"`, `autoCorrect={false}`, `autoComplete="email"`, `textContentType="emailAddress"`, autofocus), primary `AppButton` "Send code" (`email-sign-in-send`), text button "Back" (`email-sign-in-back`).
- Code step: copy `Enter the 6-digit code we sent to {email}`; `TextField` (`email-sign-in-code`, `keyboardType="number-pad"`, `maxLength={6}`, `textContentType="oneTimeCode"`, `autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}`); submits automatically at 6 digits; "Resend code" disabled for 30 s with `Resend in {n}s`; "Use a different email" returns to the email step keeping the typed address. Errors render through `TextField.errorText`; a `code_expired` error also clears the field.
- Styling from `src/theme` tokens and shared primitives only.

- [ ] **Step 1: Failing tests:** `SignInButtons` shows `email-sign-in-button` and swapping to the form hides `google-sign-in-button`; `EmailSignInForm`: invalid address shows `Enter a valid email address.` without calling the API; send → code step shows the address; typing 6 digits calls `verifyEmailCode` once; `code_invalid` error is shown and the field kept; resend is disabled until 30 s pass (fake timers); Back calls `onBack`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `npx jest src/components --runInBand --silent` → PASS; `npm run typecheck`; `npm run lint` adds no warnings; Prettier on touched files.
- [ ] **Step 5:** Commit `feat(app): continue with email sign-in`.

### Task 10: Docs

**Files:** `AGENTS.md`, `CLAUDE.md` (auth bullets: refresh keys, `authSession.ts`, email sign-in, sender env vars), `docs/dev-login.md` (email sign-in locally with `EMAIL_LOGIN_DEV_LOG_CODES=1`), `docs/google-build-and-places-secrets.md` (new Fly secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, `EMAIL_LOGIN_FROM`, optional `EMAIL_LOGIN_FROM_NAME`, `EMAIL_LOGIN_DAILY_CAP`).

- [ ] **Step 1:** Write the updates. **Step 2:** `npx prettier --check` on the touched docs. **Step 3:** Commit `docs: email sign-in and lasting sessions`.

### Task 11: Cloudflare and Apple setup (needs the owner's go-ahead for each outward step)

- [ ] **Step 1:** Onboard a sending subdomain (proposal: `mail.weifapp.com`, from `login@mail.weifapp.com`) for zone `f2de3b0328dc57ac5644ac50a74a45cc`; record the DNS records it adds; confirm apex `MX`/`TXT` for weifapp.com are unchanged with `dig +short MX weifapp.com` and `dig +short TXT weifapp.com`.
- [ ] **Step 2:** Create a Cloudflare API token limited to email sending on account `d6afe79a67acd0a269d8b7ce537967c4`; set the Fly secrets from Task 10 (owner runs or approves `fly secrets set`).
- [ ] **Step 3:** Owner registers the from address/domain in the Apple Developer portal under Sign in with Apple for Email Communication.
- [ ] **Step 4:** One real round trip: start → code arrives at an address the owner controls → verify succeeds against production.

### Task 12: Device verification

- [ ] **Step 1:** On the WEIF emulator (see `test-on-device` skill and `CLAUDE.md` setup), with the local server run as `DEV_LOGIN_ENABLED=1 EMAIL_LOGIN_DEV_LOG_CODES=1 go run .`: Profile → Sign in → Continue with email → code from the server log → lands in Onboarding for a new address, Main for an existing one. Check the Create Event and Event Details sign-in sheets lift above the keyboard.
- [ ] **Step 2:** Lasting session: temporarily run the server with a 1-minute access token TTL (local edit, not committed), wait past it, use the app; it stays signed in and the server log shows `/api/session/refresh`.
- [ ] **Step 3:** Record verdicts in `TEST_RUNS.md`.
