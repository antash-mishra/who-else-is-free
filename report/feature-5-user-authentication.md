# Feature 5: User Authentication

## Overview
The User Authentication feature provides secure sign-in capabilities using Google OAuth, with support for both Android and iOS platforms.

## What It Does
- **Google Sign-In**: Authenticate users via their Google account
- **Multi-platform support**: Works on Android and iOS (with native builds)
- **Secure token handling**: Manages and validates Google OAuth ID tokens
- **Session persistence**: Maintains user session state
- **Sign-out functionality**: Allow users to end their session
- **Guest user mode**: Allows exploring app without authentication

## Technical Details

### Location
- **Sign-In Screen**: `src/screens/GoogleSignIn.tsx`
- **Profile Screen**: `src/screens/ProfileScreen.tsx`
- **Auth Context**: `src/context/AuthContext.tsx` (manages global auth state)

### Google OAuth Configuration

#### Android Credentials
- **Web Client ID**: `413387391765-afsjurjtalucke0mctj7na1bqibh0mpc.apps.googleusercontent.com`
- **Package Name**: `com.whoelseisfree.app`

#### iOS Credentials
- **Client ID**: `413387391765-hlhfet7m38q2m38dnj10gpkhpmtj9g3v.apps.googleusercontent.com`
- **Bundle Identifier**: `com.whoelseisfree.app`
- **URL Scheme**: `com.googleusercontent.apps.413387391765-hlhfet7m38q2m38dnj10gpkhpmtj9g3v`

### Integration Library
- **Package**: `@react-native-google-signin/google-signin`
- Requires native module (Expo dev build or prebuilt binary)
- WebView/Expo Go apps cannot access native Google Sign-In module

### Sign-In Flow

#### Configuration Phase
1. On app load, `GoogleSignin.configure()` is called
2. Sets `webClientId` and `iosClientId` based on platform
3. Enables offline access
4. Sets `isNativeAvailable` state based on success/failure

#### Sign-In Phase
1. User taps "Sign in with Google" button
2. Checks native availability
3. (Android only) Checks for Google Play Services
4. System launches Google Sign-In dialog
5. User authenticates with Google account
6. Google returns `idToken` in result
7. App sends token to backend for validation
8. Backend returns user session/token
9. User is redirected to main app (Main route)

### Sign-In States

#### Available States
- `null`: Checking availability (loading)
- `true`: Native module is available, ready to sign in
- `false`: Native module unavailable, feature disabled

#### Error Handling
- Console warnings for initialization failures
- User-friendly alerts for sign-in failures
- Alert if no ID token returned from Google
- Alerts on cancelled operations

### Platform-Specific Behavior

#### Android
- Checks for Google Play Services availability
- Shows update dialog if services outdated
- Uses Android native Google Sign-In module

#### iOS
- Requires Expo dev build with native modules
- No Play Services check needed
- Uses iOS native Google Sign-In framework

#### Unsupported (Expo Go/Web)
- Alert message: "Requires running from custom Expo dev build or standalone build"
- Helper text explains native module requirement
- Feature is gracefully disabled

### Profile Screen
- Displays signed-in user information
- Shows user avatar with initial
- Shows user name and email
- Provides "Sign Out" button
- Shows empty state for unauthenticated users

### Backend Integration
1. Frontend obtains ID token from Google
2. Token sent to backend in `signInWithGoogle()` call
3. Backend validates token with Google's servers
4. Backend returns authenticated user session
5. User session stored in app context

### State Management
- Uses `AuthContext` provider at app root
- Provides `user` object with user details
- Provides `signInWithGoogle()` function
- Provides `signOut()` function
- Global state accessible throughout app

### Token Management
- ID token obtained from Google Sign-In
- Token passed immediately to backend
- No local token storage in frontend
- Session maintained via backend authentication

## User Workflows

### First-Time Sign-In
1. User opens app and sees login screen
2. User taps "Sign in with Google"
3. Google Sign-In dialog appears
4. User selects or logs into Google account
5. User grants app permission to access profile
6. User is authenticated and redirected to main app

### Viewing Profile
1. User taps Profile tab
2. User sees their information (name, email)
3. User can tap "Sign Out" to end session

### Signing Out
1. User navigates to Profile screen
2. User taps "Sign Out" button
3. Session is cleared
4. User is returned to login screen

### Guest Exploration
1. User can browse events without signing in
2. When attempting to create event, user is prompted to sign in
3. Event draft is queued and created after authentication

## Security Features
- Google OAuth 2.0 for secure authentication
- ID token validation on backend
- No credentials stored locally
- Session-based authentication
- Proper error handling for failed authentication
- Native module requirement prevents unauthorized token access

## Limitations
- Requires Expo dev build or prebuilt binary (not Expo Go)
- Native modules must be properly configured
- iOS requires proper provisioning profiles and Apple Developer account setup
