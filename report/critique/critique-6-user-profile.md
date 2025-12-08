# Critique - Feature 6: User Profile Management

## Findings
- Profile data is shown from cached context without checking whether the session token is still valid; after the 24h JWT expiry, the screen continues to display the old user while subsequent API calls fail (`server/auth_tokens.go:16-63`, `src/context/AuthContext.tsx:61-95`, `src/screens/ProfileScreen.tsx:48-73`).
- The “Sign Out” button only clears local storage and leaves the Google session active, so the user can be silently re-authenticated even after signing out (`src/screens/ProfileScreen.tsx:65-71`, `src/context/AuthContext.tsx:153-158`).

## Recommendations
- Validate or refresh the session when the profile screen mounts (or surface an “expired session” state) so the displayed user matches actual authentication.
- On sign-out, also invoke `GoogleSignin.signOut()`/revoke to ensure the provider session is terminated, not just the local cache.
