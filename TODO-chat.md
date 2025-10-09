# Real-time Chat Roadmap

## Stage 0 – Prep work
- [x] Finalise the long-term auth plan (Google Sign-In) and document how temporary users from the seeded table map to Google accounts once ready.
- [x] Sketch the chat data model (schemas + migrations) and message payload contract shared between backend and mobile.
- [x] Decide on environment configuration (WS base URL, feature flags) and how they surface in Expo + server.

## Stage 1 – Core messaging MVP
- [x] Add Gorilla WebSocket (or equivalent) and expose `/api/ws` for realtime messaging.
- [x] Create minimal SQLite schema: `conversations`, `conversation_members`, `messages` (timestamps + sender id).
- [x] Implement a simple in-memory hub that routes messages to members of a conversation and persists each payload.
- [x] Provide REST endpoints for listing user conversations and fetching latest messages (pagination stub).
- [x] Build a React context/service that opens one socket, handles reconnect/backoff, and surfaces a basic list + thread UI (text only, no typing indicators).
- [x] Surface a direct-message roster with participant name, event label, and last message preview before entering the thread.

## Stage 2 – Authentication bridge & stability
- [x] Introduce a lightweight token/session issued by the existing `/api/login` so MVP sockets can authenticate (upgrade middleware + REST guards).
- [x] Add keepalive pings + rate limiting to drop abusive/stale connections.
- [x] Store and expose read cursors per user (unread badge counts in conversation list).
- [x] Harden the UI with optimistic send + retry, scroll-to-latest, and manual refresh.
- [ ] Document how to migrate tokens to Google Sign-In once ready (identify fields to carry over).

## Stage 3 – Presence & richer UX
- [ ] Track online state per user (in-memory map + heartbeat expiry) and broadcast join/leave events in conversations.
- [ ] Show presence indicators in the UI and pipe typing indicators over the socket.
- [ ] Support attachments (begin with image upload to a storage bucket + message enrichment).
- [ ] Add push/local notifications when a new message arrives for inactive conversations.
- [ ] Instrument integration tests for message ordering, presence updates, and concurrency (at least happy-path automated coverage).

## Stage 4 – Production readiness
- [ ] Replace temporary login with Google Sign-In tokens for REST + WebSocket auth.
- [ ] Add load testing scripts, observability (structured logs, metrics), and a troubleshooting runbook in a dedicated README.
- [ ] Perform manual regression checklist (multi-device chat, offline/online transitions, attachment failure cases).
- [ ] Update `CHANGES.md` and product docs with rollout guidance.
