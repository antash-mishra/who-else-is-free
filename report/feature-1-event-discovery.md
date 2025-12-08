# Feature 1: Event Discovery

## Overview
The Event Discovery feature allows users to browse and explore all available events in the system, organized by date.

## What It Does
- **Browse all events**: Users can view a comprehensive list of all published events
- **Date-based organization**: Events are grouped into sections - "Today" and "Tomorrow"
- **Pull-to-refresh**: Users can refresh the event list to get the latest events
- **Event details navigation**: Tapping on an event card navigates to the full event details page

## Technical Details

### Location
- **Screen**: `src/screens/HomeScreen.tsx`
- **Route**: "Events" (bottom tab navigation)

### Key Components
- `SectionList` from React Native for organized event display
- `EventCard` component to display individual event information
- `RefreshControl` for pull-to-refresh functionality
- `useEvents()` context hook for event data management

### Data Displayed Per Event
- Event title
- Location
- Time
- Audience type (Single/Group indicator via badge)
- Event image/cover
- Number of interested people

### State Management
- Uses `EventsContext` for event state
- Loads all available events (not user's personal events)
- Handles loading, error, and empty states

### Navigation
- Navigates to `EventDetails` screen when event is tapped
- Passes `origin: "Events"` parameter to track navigation source

## User Workflow
1. User views "Events" tab from bottom navigation
2. Events are displayed grouped by date (Today/Tomorrow)
3. User can scroll to see more events
4. User pulls down to refresh list
5. User taps an event to view full details
