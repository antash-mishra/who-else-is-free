# Feature 6: User Profile Management

## Overview
The User Profile feature displays user information and provides account management options like signing out.

## What It Does
- **View profile**: Display signed-in user's name and email
- **User avatar**: Visual representation with user initial
- **Sign out**: End user session and clear authentication
- **Empty state**: Shows login prompt for unauthenticated users

## Technical Details

### Location
- **Screen**: `src/screens/ProfileScreen.tsx`
- **Route**: "Profile" (bottom tab navigation)

### Components Used
- `useAuth()` hook for user and signOut functionality
- Avatar circle with first letter of user's name
- User information display (name and email)
- Sign Out button with primary styling

### Profile Information Displayed
- **Avatar**: Circular badge with user's name initial (uppercase)
- **User Name**: Full name provided from Google account
- **User Email**: Email address associated with Google account

### UI Elements
- **Avatar**: 96x96 px circle with primary color background
- **Name**: Large header-sized text
- **Email**: Body-sized subtitle text
- **Sign Out Button**: 24px border-radius button with primary background

### Styling
- Centered layout with flex positioning
- Large vertical spacing between elements
- Primary color theme for avatar and button
- Responsive safe area handling

## User Workflow

### Viewing Profile
1. User taps "Profile" tab
2. User's avatar and information displays
3. User can see their name and email

### Signing Out
1. User taps "Sign Out" button
2. `signOut()` function is called
3. User session is cleared
4. User is returned to login screen

### Unauthenticated State
1. User views Profile tab without signing in
2. Empty state message displays
3. "Login" button with CTA directs to Login screen

## State Management
- Uses `AuthContext` for user state
- Calls `signOut()` from auth context
- Uses `useNavigation()` hook for navigation

## Authentication Integration
- Displays only when user is authenticated
- Uses global auth context for user data
- Integrates with Google Sign-In feature
