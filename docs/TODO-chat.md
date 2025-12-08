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
- [x] Persist chat sessions with secure token storage and auto-reconnect sockets when the app returns to the foreground.
- [x] Document how to migrate tokens to Google Sign-In once ready (identify fields to carry over).

Notes: Chat continues to use a single HMAC-signed session token issued by the backend. With Google Sign-In, the app exchanges the Google ID token for the same session token via POST /api/google-login. Existing users are matched by email; if a Google account uses a different email than the prior local account, update the users.email row to preserve identity and conversation visibility. No server chat changes required; REST (Bearer) and WS (?token=) auth flows remain the same.

## Stage 3 – Event-driven group chat
- [x] Auto-create a conversation when an event is published and persist the event/conversation linkage (creator joins as group host).
- [x] Add endpoints + repo helpers so attendees can request to join, hosts can approve/deny/remove members, and membership updates are pushed to connected WebSocket clients.
- [x] Update ChatContext to refresh membership rosters, surface event metadata (title/location/time) in the roster + thread, and react to membership churn.
- [ ] Introduce event-centric UI: entry points from events list/detail, host approval flows for join requests, and leave actions for attendees.
- [ ] Hook the Event Details “Interested” CTA into the join-request API so guests can submit their invitation note (POST `/api/events/:id/chat/requests`) and get inline success/error feedback instead of the placeholder alert.
- [ ] Deliver join-request notifications directly into the event’s group conversation (REST + WebSocket) so hosts see pending requests as system messages/cards and can accept/deny them without leaving the chat.
- [ ] When a host accepts or denies, update the conversation thread with a system message, refresh membership, and notify the requester (e.g., toast + chat badge) so the flow feels complete.
- [x] Seed sample events with multi-member chats so QA can verify the flow without manual setup.

## Stage 4 – Presence & richer UX
- [ ] Track online state per user (in-memory map + heartbeat expiry) and broadcast join/leave events in conversations.
- [ ] Show presence indicators in the UI and pipe typing indicators over the socket.
- [ ] Support attachments (begin with image upload to a storage bucket + message enrichment).
- [ ] Add push/local notifications when a new message arrives for inactive conversations.
- [ ] Instrument integration tests for message ordering, presence updates, and concurrency (at least happy-path automated coverage).

## Stage 5 – Production readiness
- [ ] Replace temporary login with Google Sign-In tokens for REST + WebSocket auth.
- [ ] Add load testing scripts, observability (structured logs, metrics), and a troubleshooting runbook in a dedicated README.
- [ ] Perform manual regression checklist (multi-device chat, offline/online transitions, attachment failure cases).
- [ ] Update `CHANGES.md` and product docs with rollout guidance.
