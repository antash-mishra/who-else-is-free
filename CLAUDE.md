# Who Else Is Free

Event discovery and social coordination mobile app.

## Tech Stack

**Frontend:** React Native + Expo, TypeScript, React Navigation (bottom tabs + stack)
**Backend:** Go, SQLite, REST API + WebSocket (chat)
**Auth:** Google OAuth 2.0

## Project Structure

```
src/
├── screens/          # Main screens
│   ├── HomeScreen.tsx        # Event discovery (browse all events)
│   ├── CreateEventScreen.tsx # Create/edit events
│   ├── MyEventsScreen.tsx    # Created/Joined/Requested events
│   ├── MessagesScreen.tsx    # Conversation list
│   ├── ChatThreadScreen.tsx  # Real-time chat
│   ├── ProfileScreen.tsx     # User profile & sign out
│   └── GoogleSignIn.tsx      # Auth screen
├── context/          # Global state (AuthContext, EventsContext, ChatContext)
├── components/       # Reusable components (EventCard, etc.)
└── ...
server/               # Go backend
```

## Key Contexts

- **AuthContext** - User auth state, sign-in/out
- **EventsContext** - Events data, CRUD operations, user events
- **ChatContext** - Conversations, messages, WebSocket connection, join requests

## Commands

```bash
# Frontend
npx expo start          # Start dev server
npx expo run:android    # Run on Android
npx expo run:ios        # Run on iOS

# Backend (from server/)
go run .                # Start server
```

## Features

1. **Event Discovery** - Browse events by date (Today/Tomorrow), no auth required
2. **Event Creation** - Create events with preferences (group type, gender, age, time, location, cover)
3. **User Events** - Manage created/joined/requested events
4. **Messaging** - Real-time WebSocket chat, group chats linked to events
5. **Auth** - Google OAuth (requires native build, not Expo Go)
6. **Profile** - View info, sign out

## Notes

- Events organized by "Today"/"Tomorrow" sections
- Chat supports message retry on failure
- Guest users can browse events but need auth to create/join
- iOS/Android require native builds for Google Sign-In
