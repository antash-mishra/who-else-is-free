# Feature 3: User Events Management

## Overview
The User Events feature allows users to manage their personal event participation - viewing events they've created, joined, and requested to join.

## What It Does
- **View created events**: Display all events the user has published
- **View joined events**: Show events the user has accepted invitations for
- **View requested events**: Display events where the user has sent join requests
- **Filter events**: Switch between created, joined, and requested views
- **Manage event lifecycle**: See status of all personal event interactions
- **Access event editing**: Edit events from the created list

## Technical Details

### Location
- **Screen**: `src/screens/MyEventsScreen.tsx`
- **Route**: "MyEvents" (bottom tab navigation)

### Key Components
- Filter buttons for switching between event views (Created/Joined/Requested)
- `SectionList` for organized event display grouped by date
- `EventCard` component for individual event display
- Empty state illustrations with context-specific messaging

### Three Event Views

#### Created Events
- Events published by the current user
- User can edit these events
- Empty state: "You haven't created any event yet"
- CTA: "Create an event" button directs to Create screen

#### Joined Events
- Events the user has accepted or is participating in
- Derived from chat conversations where user is a participant
- Detects joined events by checking conversation createdBy field
- Empty state: "You haven't joined any events yet"
- Help text: "Accept an invite or request to join an event"

#### Requested Events
- Events where user has expressed interest (sent join request)
- Separate endpoint for fetching requested events
- Empty state: "No pending requests"
- Help text: "Tap Interested on an event to send the host a join request"

### State Management
- Uses `EventsContext` hook for:
  - `userEvents`: Created events
  - `requestedEvents`: Events with pending join requests
  - `events`: All events for cross-referencing
- Uses `ChatContext` for conversation data (determines joined events)
- Uses `AuthContext` for current user info
- Local state for selected filter and refresh states

### Date Organization
- Events grouped by "Today" and "Tomorrow"
- Section headers with uppercase labels
- Past events automatically hidden by context logic

### Refresh Logic
- **Created/Joined**: Refreshes main events list
- **Requested**: Calls dedicated `refreshRequestedEvents()` endpoint
- Pull-to-refresh control updates appropriate data

### Navigation
- Taps on event card navigate to `EventDetails` screen
- Passes `origin: "MyEvents"` parameter
- "Create an event" CTA navigates to `Create` screen
- Login CTA navigates to `Login` screen when user is not authenticated

## User Workflow

### Viewing Created Events
1. User taps "MyEvents" tab
2. "Created" filter is selected by default
3. User sees list of their published events
4. User can pull to refresh
5. User taps an event to view/edit it

### Viewing Joined Events
1. User taps "Joined" filter
2. System calculates joined events from chat conversations
3. User sees events they're participating in
4. User can pull to refresh
5. User taps event to view details

### Viewing Requested Events
1. User taps "Requested" filter
2. System fetches pending join requests
3. User sees events with pending requests
4. User can pull to refresh
5. Requests have specific metadata displayed

## Authentication
- Unauthenticated users see empty state with "Log in" prompt
- Each filter shows context-appropriate messaging
- All operations require authentication
