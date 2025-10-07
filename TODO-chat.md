# Real-time Chat TODO

- [ ] **Backend: WebSocket Infrastructure**
  - [ ] Add Gorilla WebSocket (or equivalent) dependency and wire a `/api/ws` endpoint that upgrades connections.
  - [ ] Model chat rooms/messages in SQLite (tables: `conversations`, `messages`, `conversation_members`).
  - [ ] Implement connection manager to broadcast messages to room members and handle join/leave lifecycle.
  - [ ] Persist inbound messages with sender metadata, timestamps, and delivery status.
  - [ ] Expose REST fallbacks for fetching recent conversations/history and for sending messages when sockets fail.

- [ ] **Authentication & Presence**
  - [ ] Re-use login credentials to authenticate socket handshakes (token or session cookie).
  - [ ] Track online/offline state per user and surface presence updates to room members.
  - [ ] Add rate limiting / heartbeat pings to detect stale connections.

- [ ] **Frontend: Messaging UX**
  - [ ] Create chat context/service to establish a WebSocket connection and manage reconnection/backoff.
  - [ ] Build conversation list screen with last message preview, unread count, and online status indicators.
  - [ ] Implement chat thread UI with message bubbles, typing indicators, and optimistic message sending.
  - [ ] Provide attachment support (images at minimum) and graceful error toasts/retry flows.

- [ ] **Notifications & Quality**
  - [ ] Trigger push/local notifications for new messages when chats are not in focus.
  - [ ] Add integration tests for message delivery ordering and load tests for concurrent connections.
  - [ ] Document setup/run instructions plus failure recovery procedures in `CHANGES.md` or dedicated README.
