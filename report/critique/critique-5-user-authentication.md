# Critique - Feature 5: User Authentication

## Findings
- Sign-out only clears SecureStore; it never signs the user out of the Google provider, so OS-level sessions remain and users can be re-authenticated silently even after tapping “Sign Out” (`src/context/AuthContext.tsx:153-158`, consumed by `src/screens/ProfileScreen.tsx:65-71`).
- Session expiry isn’t handled for most flows: server tokens expire after 24h (`server/auth_tokens.go:16-63`), but event APIs (`addUserEvent`/`updateUserEvent`) don’t attempt silent refresh on 401s, leading to generic “Unable to publish/update” errors instead of prompting re-login (`src/context/EventsContext.tsx:219-360`).
- `GoogleSignin.configure` in the auth provider sets only the web client ID (`src/context/AuthContext.tsx:42-58`), so silent refresh on iOS may fail because the iOS client ID is omitted outside the sign-in screen.

## Recommendations
- Call `GoogleSignin.signOut()`/revoke on sign-out to ensure the Google session is closed, not just the local token cache.
- Centralize token refresh/re-login handling for all authenticated API calls (not just chat) so expired tokens trigger a silent refresh or a clear login prompt.
- Include the iOS client ID in the global Google Sign-In configuration to keep silent auth consistent across platforms.
