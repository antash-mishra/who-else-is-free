# Feature 2: Event Creation

## Overview
The Event Creation feature allows authenticated users to create and publish new events with detailed specifications and customization options.

## What It Does
- **Create new events**: Users can publish events with title, description, and settings
- **Edit existing events**: Users can modify events they've created
- **Customizable event details**: Set group type, gender preference, age range, time, location, and cover image
- **Guest event queue**: Unauthenticated users can queue events for creation after signing up
- **Form validation**: Ensures event has at least a name or description before publishing

## Technical Details

### Location
- **Screen**: `src/screens/CreateEventScreen.tsx`
- **Route**: "Create" (bottom tab navigation)
- **Associated Edit Route**: Accessed via `navigation.navigate("Create", { editEventId: eventId })`

### Key Features

#### Event Properties
- **Event Name**: Text input for event title (optional but needs name or description)
- **Description**: Multi-line text input for event details
- **Group Type**: Single or Group (toggle switch)
- **Gender Preference**: Any, Female, Male (cycle through options)
- **Age Range**: Selectable ranges (Any, 18-24, 25-34, 35-44, 45-60)
- **Date**: Today or Tomorrow
- **Time**: Dropdown with time slots (7:00pm - 10:00pm in 30-min intervals)
- **Location**: Text input with search capability
- **Cover Image**: Selectable from predefined cover options (modal picker)

#### Form Logic
- **Time validation**: Disables past times for today's events
- **Age range validation**: Min/max age must be between 18-60
- **Location default**: Uses "To be decided" if location left empty
- **Form state management**: Can switch between create/edit modes

### State Management
- Uses `EventsContext` for event operations
- Uses `AuthContext` for user authentication check
- Tracks form state with individual useState hooks for each field
- Modal pickers for time, age, and cover selection
- Error handling with user-friendly error messages

### User Flows

#### New Event Creation
1. User taps Create tab
2. Form displays with empty fields
3. User fills in event details
4. User taps "Publish Event"
5. Event is created and saved to backend
6. User is navigated to MyEvents view

#### Event Editing
1. User taps edit button on existing event
2. Form pre-populates with existing event data
3. User modifies desired fields
4. User taps "Update Event"
5. Changes are saved to backend

#### Unauthenticated User
1. Unauthenticated user fills event form
2. User taps "Sign Up or Log In"
3. Event data is queued via `queueGuestEvent()`
4. User is navigated to Login screen
5. After authentication, queued event is created

### UI Components
- `LinearGradient` for background styling
- `Modal` components for pickers (time, age, cover)
- `ScrollView` with keyboard avoiding view for comfortable form entry
- Custom pill-style buttons for field values
- Cover image grid with 2-column layout

### Validation Rules
- At least event name OR description required
- User must be authenticated (or login before publishing)
- Past times cannot be selected for today's events
