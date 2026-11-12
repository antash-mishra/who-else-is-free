# Email code sign-in and lasting sessions

Date: 2026-11-12
Status: design, awaiting approval

## Why

weif signs people in only with Google (both platforms) and Apple (iOS). Anyone whose email is
Yahoo, Outlook, a work domain or anything else, and who will not use a Google or Apple identity,
cannot get in. On Android there is no Apple button at all, so it is Google or nothing. We want a
third way in: sign in with any email address.

While looking at this we found a second problem that the email work would inherit. The server's
session token (`tokenSigner` in `server/auth_tokens.go`) lasts 24 hours. When it expires,
`authFetch` in `src/context/AuthContext.tsx` calls `refreshSessionSilently`, which only works for
Google (it asks Google for a fresh ID token). For Apple it returns `null`, `handleSessionExpired`
runs, and the person is signed out. Apple users are therefore signed out roughly a day after every
sign-in. An email user would be in the same position and would need a fresh code every day.

The product owner's requirement: a person enters an email code once per phone, not every time they
open the app.

## Goals

1. **Lasting sessions for every sign-in method.** After signing in once on a device, Google,
   Apple and email users stay signed in until they sign out, delete their account, or stop using
   the app for a long time. No inbox trip, no Google round-trip, no repeated Apple prompt.
2. **Email code sign-in.** "Continue with email" → enter address → receive a 6-digit code →
   enter it → signed in. One flow for new and returning people; there is no separate sign-up page.
3. **Same account when the email matches.** Someone who joined with Google as `asha@gmail.com` and
   later uses email sign-in with `asha@gmail.com` lands in the same weif account, and the reverse.

## Non-goals

- Passwords, password reset, or a sign-up page. The team chose codes over passwords.
- Magic links (tap a link in the email). Codes only; links add deep-link and cross-device problems.
- Manually linking accounts whose emails differ (for example an Apple "Hide My Email" relay
  address and the person's real address). See Known limitations.
- Changing the email on an account.
- Marketing or any other email. This is login codes only.
- Web sign-in.

## Anti-goals (failure even if it "works")

- Anyone can sign in as someone else by guessing codes, replaying a code, or reusing a stolen or
  old refresh key.
- weif can be used to flood a stranger's inbox with codes.
- The request-code screen reveals whether an address already has a weif account.
- Setting up email sending breaks `contact@weifapp.com` (Google Workspace mail on the same domain).
- Existing signed-in users are thrown out by the release in a way that a normal sign-in would not
  have done anyway.
- Codes, refresh keys or email addresses appear in logs or analytics. (Follows the existing rule
  in `recordIdentityHashes`: "Subjects, emails and hashes are never logged.")

## Current state (what the builder starts from)

- **Accounts are keyed by email.** `users.email` is `NOT NULL UNIQUE`. Google sign-in and first-time
  Apple sign-in both resolve the account through `getOrCreateUserByEmail`
  (`server/auth_handler.go`). Apple additionally links `apple_sub` → user in `apple_accounts`, so
  later Apple sign-ins find the user by subject even when Apple omits the email.
- **Email lookups are exact-match.** `GetUserByEmail` uses `WHERE email = ?` with no case folding.
- **Session tokens** are stateless HMAC tokens (`payload.signature`), 24h TTL, carrying `user_id`
  and `email`. `sessionMiddleware` also checks the user row still exists. WebSocket chat uses the
  same token.
- **Sign-in responses** come from `respondWithIssuedSession`: `{ user, token, expires_at,
is_new_user }`.
- **Client storage**: token, user and provider live in `expo-secure-store`
  (`TOKEN_KEY`, `USER_KEY`, `AUTH_PROVIDER_KEY`). `restoreSession` treats any provider other than
  `google`/`apple` as `google` for backward compatibility.
- **Refresh callers**: `authFetch` (on 401) and `ChatContext` (socket `onerror`/`onclose`) both call
  `refreshSessionSilently`.
- **Sign-out** is client-only (`clearStoredSession`); there is no server sign-out endpoint.
  Account deletion is `DELETE /api/profile`.
- **Sign-in UI** is `src/components/SignInButtons.tsx`, rendered inline on Profile, My Events,
  Messages, the Create Event sheet and the Event Details overlay routes when signed out. It shows
  Google, Apple (iOS only), and the dev-login button in opted-in dev builds.
- **New users** get `profile_complete = false` and are routed into the existing Onboarding flow.
- **Database**: SQLite (`modernc.org/sqlite`) on Fly; schema and idempotent migrations in
  `server/repository_schema.go`.
- **A rate limiter pattern exists**: `anonymousHelpRateLimiter` in `server/help_rate_limiter.go`
  (in-memory, per-key windows).
- **OTA**: `runtimeVersion` policy is `appVersion`. Nothing here needs a new native module
  (`expo-secure-store` is already linked), so the client changes should be OTA-deliverable. The
  builder must confirm that during implementation.

## Part 1: lasting sessions (refresh keys)

Ship this first. It does not depend on email sign-in and fixes Apple immediately.

### Behaviour

- Every successful sign-in (Google, Apple, email, and dev-login) returns, in addition to the
  existing 24h access token, a **refresh key**: a long random opaque string.
- The app stores it in SecureStore beside the access token.
- When the access token is rejected (401) or the socket drops, the app first trades the refresh key
  at `POST /api/session/refresh` for a new access token **and a new refresh key** (rotation). Only
  if that fails does it fall back to the existing Google silent sign-in, and only after both fail
  does it sign the person out.
- A refresh key expires after **90 days without use**. Each successful refresh starts a new 90-day
  window, so an active person never sees a sign-in screen again on that device.
- Sign-out revokes the device's refresh key on the server (new `POST /api/session/logout`,
  best-effort; local sign-out must still complete offline).
- Deleting an account revokes all of that user's refresh keys (cascade from the user row is
  enough).

### Server design

- New table, e.g. `refresh_tokens`: `id`, `user_id` (FK → users, `ON DELETE CASCADE`),
  `token_hash` (SHA-256 of the key; the raw key is never stored), `family_id` (one per device
  sign-in), `created_at`, `first_used_at`, `last_used_at`, `expires_at`, `revoked_at`,
  `replaced_by`.
- `respondWithIssuedSession` mints a refresh key with a fresh `family_id` and adds `refresh_token`
  and `refresh_expires_at` to the response. Existing fields are unchanged, so old app versions
  keep working.
- `POST /api/session/refresh` `{ refresh_token }` (unauthenticated route):
  - hash and look up; reject if missing, revoked, expired, or the user no longer exists;
  - in one transaction, mark the old key replaced, insert a new key in the same family, and issue a
    new access token;
  - respond with the same shape as sign-in (user, token, expires_at, refresh_token,
    refresh_expires_at), so the client can refresh its cached profile too.
- **Lost responses must not sign people out (design call, 2026-11-12).** The product goal ("never
  sees a sign-in screen again") wins over strict one-shot rotation. A phone can lose the refresh
  response (network drop, iOS suspending the app mid-request) and come back with the old key. So:
  - A replaced key stays usable **until its successor has been used once** (track
    `first_used_at` on each key). Presenting it again mints a fresh sibling key in the same family
    (never re-sends a stored successor, so raw keys are still never stored) and retires the
    unused successor.
  - **Reuse detection** applies only once the successor has been used: if a replaced key is
    presented after its successor was used, revoke the whole family and return 401. That is how a
    stolen key stops working; the legitimate phone has already moved on to the newer key.
  - This also covers two requests from the same app racing (an API call and the chat socket
    both hitting 401), so no separate time-based grace window is needed. The client still
    de-duplicates in-flight refreshes (it already does for Google via `refreshInFlightRef`).
- **Refresh only when needed.** `ChatContext` calls `refreshSessionSilently` on every socket
  `onerror`/`onclose`. Gate the refresh-key exchange on the access token actually being expired
  (or a 401), so network flaps do not rotate keys. A network error during refresh (as opposed to
  a 401 from the refresh endpoint) must never sign the person out; keep the session and retry
  later.
- Periodic cleanup of expired and revoked rows (a startup or daily job, like
  `report_retention_job.go`).
- The access token stays stateless and keeps its 24h lifetime. Nothing in `sessionMiddleware`
  changes.

### Client design

- `AuthContext` stores `refresh_token` under a new SecureStore key and clears it in
  `clearStoredSession`.
- `refreshSessionSilently` becomes: refresh-key exchange first (any provider), then Google silent
  sign-in as a fallback for Google users who have no refresh key yet, otherwise `null`.
- `signOut` calls the logout endpoint (fire-and-forget) before clearing local state.
- `restoreSession` must accept `email` as a stored provider (today anything other than
  `google`/`apple` is coerced to `google`).

### Apple credential revocation (design call, 2026-11-12)

Today the 24h token ends an Apple session within a day, so revoking weif under Sign in with Apple
in iOS Settings (or deleting the Apple ID) effectively signs the person out. With lasting sessions
that would no longer happen on its own. So, for sessions whose provider is `apple` on iOS, the app
checks `AppleAuthentication.getCredentialStateAsync(user)` on launch and before a refresh-key
exchange; `REVOKED` or `NOT_FOUND` signs the person out locally and calls the logout endpoint.
This needs the Apple `user` identifier on the client; store it in SecureStore at Apple sign-in
(`expo-apple-authentication` is already installed). Apple's server-to-server revocation
notifications are out of scope for now.

### Rollout for people already signed in

- Google users: their next silent refresh goes through Google, which returns a sign-in response
  that now includes a refresh key. They are upgraded without noticing.
- Apple users: they hold no refresh key, so their current session ends as it does today (within
  24h), they sign in once more, and from then on they stay in. Acceptable: there are no real users
  yet (2026-10-12), and this is no worse than current behaviour.

## Part 2: email code sign-in

### Flow (what the person sees)

1. A **Continue with email** button appears with Google and Apple everywhere `SignInButtons`
   renders, on both platforms.
2. It opens an email entry step: one email field and a Continue button.
3. On Continue the server sends a 6-digit code and the app moves to a code step. That step says
   which address the code went to and offers "Use a different email" and "Resend code" (resend
   disabled for a short cooldown, e.g. 30–60 seconds, with a visible countdown).
4. The person types or pastes the code. The field should accept the OS one-time-code autofill
   (`textContentType="oneTimeCode"` on iOS, `autoComplete="sms-otp"`/`one-time-code` on Android where
   supported). Entering six digits submits automatically.
5. Correct code → signed in. A new account goes into Onboarding exactly like a new Google user; an
   existing account lands where a Google sign-in would.
6. Wrong code → inline error, field kept. Expired, used-up or too many attempts → a message that
   says to request a new code.

The visual design of these steps is left to the builder but must use the shared primitives
(`BottomSheetModal`/`CreateEventBottomSheet`-style sheet chrome or the existing screen patterns,
`typography.inputLetterSpacing`, `ScalePressable`, theme tokens) and follow
`report/shared-components-refactor-guide.md`. A bottom sheet over the current screen is the
suggested container (builder's call), because `SignInButtons` is embedded inline in several
screens rather than living on one sign-in screen.

### Server design

- `POST /api/email-login/start` `{ email }`
  - Normalise: trim, lowercase. Validate format.
  - Rate-limit (see below). When limited, return 429 with a generic message.
  - Generate a 6-digit code from a cryptographically secure source. Store only a hash of it
    (HMAC or SHA-256 with a server secret), with `email`, `created_at`, `expires_at` (10 minutes),
    `attempts` (0), and `consumed_at`. A new start for the same address invalidates any earlier
    unexpired code.
  - Send the email (see Sending). **Always respond 200 with the same body whether or not the
    address has an account**, so the endpoint cannot be used to discover accounts.
- `POST /api/email-login/verify` `{ email, code }`
  - Look up the latest active code for the normalised email. Compare in constant time.
  - Wrong code: increment `attempts`; after 5 wrong attempts the code is dead.
  - Correct: mark consumed (single use), then
    `getOrCreateUserByEmail(normalisedEmail, fallbackName)` and `respondWithIssuedSession` (which,
    after Part 1, includes the refresh key). Record identity hashes with provider `email` (the
    `identityProviderEmail` constant exists already).
  - Generic 401 messages; do not reveal whether the address exists.
- **Case-insensitive account matching.** Email sign-in must find an existing account whose stored
  email differs only in case. Make email lookups case-insensitive for all sign-in paths (for
  example `LOWER(email) = LOWER(?)` or `COLLATE NOCASE`), and store new emails lowercased. If two
  existing rows differ only by case, the builder should surface it rather than silently merge; we
  expect none (no real users yet).
- **Rate limits** (numbers are the builder's call; these are starting points): per address, at most
  1 code per 60 seconds and about 5 per hour; per client IP, about 20 per hour. In-memory, following
  `anonymousHelpRateLimiter`, is acceptable for the single Fly machine; note it in the doc if that
  changes.
- **New name**: `getOrCreateUserByEmail` falls back to `fallbackNameFromEmail`. Onboarding asks for
  the real name, so this only fills the row until then.
- Expired and consumed code rows are cleaned up by the same periodic job as refresh keys.

### Sending

- **Provider: Cloudflare Email Service (Email Sending)**, via its REST API from the Go server on Fly:
  `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send` with a
  Bearer API token that can only send email.
- Verified 2026-11-12: the Cloudflare account that hosts the `weifapp.com` zone
  (account `d6afe79a67acd0a269d8b7ce537967c4`, zone `f2de3b0328dc57ac5644ac50a74a45cc`) is on
  Workers Paid; its sending limits report `recipient_mode: "arbitrary"`, so it can send to any
  address. Email Sending is not yet enabled for the zone (no sending subdomains). Pricing: 3,000
  emails/month included, then $0.35 per 1,000. New accounts start with an unpublished conservative
  daily quota. The product is in **beta**.
- Cloudflare sends from a **subdomain** of the zone with its own SPF/DKIM records. The apex records
  for Google Workspace (`MX smtp.google.com`, `v=spf1 include:_spf.google.com ~all`, Google DKIM)
  must stay untouched. After onboarding, confirm `contact@weifapp.com` still receives and that
  apex SPF is unchanged.
- From address: something like `weif <login@…>` on the onboarded sending domain (builder's call on
  the exact subdomain/local part). Plain-text and HTML bodies. Subject carries the code (e.g.
  "Your weif code: 123456") so it is visible in notifications. Body: the code, that it expires in
  10 minutes, and "If you didn't ask for this, ignore this email."
- **Apple private relay (design call, 2026-11-12).** Android has no Apple button, so an iOS user
  who signed up with "Hide My Email" can only reach their account on Android by email sign-in to
  their `@privaterelay.appleid.com` address. Apple's relay only forwards mail from senders
  registered in the Apple Developer portal (Certificates, Identifiers & Profiles → Services →
  Sign in with Apple for Email Communication) with SPF/DKIM on that sending domain. Register the
  sending subdomain and from address there as part of the Cloudflare setup step. This needs the
  project owner's Apple Developer account. It is cheap to do, though few people know their relay
  address.
- Secrets: `CLOUDFLARE_EMAIL_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (names are the builder's call)
  as Fly secrets, documented in the secrets runbook. Hide the sender behind a small Go interface so
  tests and local development use a fake that logs "code sent" (never the code itself in
  production; printing the code is acceptable only when a dev flag is set, like dev-login).
- Send failures: return a retryable error to the client ("Couldn't send the code, try again").
  Do not create a code row that the person can never receive, or mark it unusable on failure.

### Client design

- `AuthProviderName` gains `email`; `AuthContext` gains `startEmailSignIn(email)` and
  `verifyEmailCode(email, code)`, the latter going through the same storage path as Google/Apple
  (`signInWithProvider`-style), storing provider `email` and the refresh key.
- API calls use the shared helpers (`requestJson`/`ApiError`, `src/api/errors.ts`).
- Analytics: sign-in method `email` alongside the existing methods; never the address or code.
- Tests: Jest coverage for the new AuthContext paths and the sign-in sheet; Go tests for code
  issue/verify/expiry/attempts/rate limits, refresh rotation, reuse detection and grace window,
  logout, cascade on account deletion, and case-insensitive matching.

## Known limitations

- **Apple "Hide My Email".** If someone signed up with Apple and chose to hide their email, weif
  only knows their `@privaterelay.appleid.com` address. If they later use email sign-in with their
  real address, they get a separate new account. Fixing this needs manual account linking, which is
  out of scope.
- **Cloudflare Email Sending is in beta**, and the account starts with an unpublished daily quota.
  If either becomes a problem, the sender interface lets us swap in Resend or Postmark without
  touching the flow.
- **In-memory rate limits** reset on deploy and assume one server instance.

## Order of work

1. Part 1 (refresh keys), server and client, shipped on its own. Verify that an Apple session
   survives past 24h (shorten the access-token TTL in a dev build to test) and that Google users
   pick up a refresh key without noticing.
2. Cloudflare setup: onboard the sending subdomain, create the send-only token, set Fly secrets,
   confirm Google mail is unaffected, and register the sender with Apple's private email relay.
3. Part 2 server endpoints with the fake sender, then the real Cloudflare sender.
4. Part 2 client UI and AuthContext.
5. On-device verification on the emulator (dev-login stays for automated runs), plus one real
   email round trip to an address we control. Update `docs/dev-login.md`, `AGENTS.md` and
   `CLAUDE.md` with the new sign-in method and conventions.

## Left to the builder

- Exact visual design of the email and code steps, within the shared component system.
- Rate-limit numbers (plus a global daily send cap that stays under Cloudflare's quota), resend
  cooldown length.
- Lowercasing in the admin-bootstrap email match and any migration of existing rows to
  lowercase.
- Table and column names, route names (suggested above), secret names.
- Sending subdomain and from address.
- Whether the refresh-key exchange and Google fallback share one in-flight promise.
