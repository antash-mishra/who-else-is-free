# Feature 4: Messaging & Real-Time Chat

## Overview
The Messaging & Chat feature provides real-time communication between users, supporting both one-on-one conversations and group chats linked to specific events.

## What It Does
- **View conversations**: Display list of active chat conversations
- **Send messages**: Send real-time messages in conversations
- **Message status tracking**: Show message delivery status (pending, failed, sent)
- **Unread badges**: Display count of unread messages
- **Event-linked chats**: Associate conversations with specific events
- **Group chats**: Support conversations with multiple participants
- **Message retry**: Resend failed messages
- **Join request management**: Track and manage event join requests within chats

## Technical Details

### Location
- **Conversation List**: `src/screens/MessagesScreen.tsx` (bottom tab "Messages")
- **Chat Thread**: `src/screens/ChatThreadScreen.tsx` (stack navigation)

### Core Components

#### Messages Screen (Conversation List)
- `FlatList` displaying all active conversations
- Conversation preview cards with:
  - Avatar initial (first letter of name)
  - Conversation title (user name or event name)
  - Event metadata (location, time, date)
  - Last message preview
  - Message timestamp
  - Unread message badge
- Pull-to-refresh functionality
- Empty state for unauthenticated users
- Connection status indicator

#### Chat Thread Screen
- `FlatList` for message display
- Real-time message bubbles with:
  - Message text content
  - Sender identification
  - Timestamp
  - Delivery status (Sending, Failed, Sent)
- Message input composer with send button
- Header with conversation name
- Join request badge (for event hosts)
- Back navigation to conversation list
- Keyboard handling for iOS/Android

### Message Types and Status

#### Message Properties
- `id`: Unique message identifier
- `body`: Message text content
- `senderId`: User ID of sender
- `conversationId`: Parent conversation ID
- `createdAt`: Timestamp
- `pending`: Boolean indicating unsent status
- `failed`: Boolean indicating send failure

#### Message States
- **Pending**: "Sending…" indicator
- **Failed**: "Failed. Tap to retry." with red styling
- **Sent**: Timestamp display (HH:mm format)

### Conversation Types

#### One-on-One Conversations
- Between two users
- Display counterpart's name
- No event association

#### Event-Linked Group Chats
- Associated with a specific event
- Multiple participants from same event
- Display event name as conversation title
- Show event metadata (location, date/time)
- May include "With [user name]" for additional context

#### Group Conversations
- Multiple participants
- May or may not be event-linked
- Display group title or display name

### State Management
- Uses `ChatContext` for:
  - `conversations`: List of active conversations
  - `messages`: Messages in active conversation
  - `activeConversationId`: Currently open conversation
  - `isConnecting`: WebSocket connection status
  - `error`: Connection/sync errors
  - `joinRequestsByConversation`: Join requests per conversation
- WebSocket integration for real-time updates
- Conversation refresh endpoint

### User Interface Features

#### Conversation Row
- Avatar with contact initial in circle
- Three-line layout:
  1. Conversation name (ellipsis if too long)
  2. Event metadata (if applicable)
  3. Last message preview
- Metadata section on right with:
  - Last message time
  - Unread badge (only if > 0)

#### Message Bubbles
- Different styling for own vs. other messages
- Own messages: right-aligned, primary color background
- Other messages: left-aligned, surface color background
- Max width of 80% of screen
- Rounded corners (16px radius)
- Padding for comfortable reading

#### Composer
- Text input for message composition
- Send button (enabled only with text)
- Keyboard-avoiding view for proper spacing
- Safe area handling for iPhone notch

### Join Request Management
- Event hosts see badge with pending request count
- Requests can be managed within chat context
- Separate API endpoint for join request data
- Refreshes automatically when conversation is opened

### Navigation
- Messages tab shows conversation list
- Tapping conversation navigates to chat thread
- Back button returns to conversation list
- Login prompt for unauthenticated users

### Keyboard Handling
- iOS: Uses `keyboardWillShow/Hide` events
- Android: Uses `keyboardDidShow/Hide` events
- Dynamic offset adjustment for proper spacing
- Dismisses keyboard on tap with `keyboardShouldPersistTaps`

## User Workflow

### Viewing Conversations
1. User taps "Messages" tab
2. All conversations are displayed
3. User sees unread badges on conversations with new messages
4. User pulls to refresh for latest messages
5. User taps conversation to open chat

### Sending Messages
1. User types message in composer
2. User taps "Send" button
3. Message shows with "Sending…" status
4. Once delivered, timestamp displays
5. If send fails, error message appears with retry option

### Retrying Failed Messages
1. User taps on failed message bubble
2. Message resends
3. Status updates to "Sending…"
4. Once delivered, shows timestamp

### Managing Join Requests (Host)
1. Event host opens conversation
2. Badge shows number of pending requests
3. Host can view/manage requests within chat context

## Authentication
- Unauthenticated users see empty state
- Must login to access messaging features
- User context determines sender identification
