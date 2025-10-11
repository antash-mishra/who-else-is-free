# Project Changes

## Initial setup
- Scaffolded Expo React Native app with TypeScript and configured module resolver aliases.
- Added global theme utilities (colors, spacing, typography) and a shared `ScreenContainer` layout helper.

## Event browsing experience
- Implemented bottom tab navigation shell and placeholder tabs for Messages and Profile.
- Built events feed with segmented control, sectioned list of sample data, reusable event cards, and empty state routing into creation flow.
- Created a Create Event form view with structured inputs and publish call-to-action.

## SVG illustration update
- Added SVG transformer configuration and typings to load local vector assets.
- Replaced the empty state icon with the provided `create-event.svg` illustration.

## Typography
- Installed Inter font family and load it at app startup.
- Applied Inter font variants across components via the typography theme helpers.
- Standardized letter spacing and line height across all text elements.

## Layout refinements
- Matched event card layout to Figma spacing, ensuring image and content stack align width 321 × 80 frame.
- Added uniform 20px spacing between sections and consistent separation between list rows.
- Prevented section headers from wrapping while keeping them within the viewport.

## Create event workspace
- Removed navigation chrome on the Create route and aligned the form styling with the provided mock, including grey field rows, multi-handle age slider, Today/Tmrw toggle, and modal time picker that hides past time slots for today.
- Added `prop-types` dependency required by the multi-slider control.
- Anchored the Create CTA to the bottom of the screen and restrict the time picker edits to filter only today's past slots.
- Introduced an events context so newly created events appear in the "Your Events" tab with the same card styling as the main feed.

## Backend service
- Added a modular Gin + SQLite server (`server/`) with repository, handlers, and router packages for events.
- Implemented `/api/events` GET/POST endpoints backed by the `event.sqlite` database, including automatic schema migration at startup.

## Frontend & API integration
- Hooked the React Native create flow to the events API so that newly created plans persist through the backend.
- Pulled event listings from the API into the "Your Events" tab, keeping the UI and server data in sync.

## Navigation refinements
- Replaced the static SVG tab assets with focus-aware icons so the active tab fills solid black while inactive states remain outlined.
- Split "Your Events" into a dedicated `MyEvents` screen and removed the segmented control from the `Events` feed, keeping that view focused on all listings.
- Wired the My Events tab to the new screen and now route users there automatically after creating an event.
- Restored screen headings so the Events feed shows “All Events” and the My Events tab reads “Your Events,” matching the latest mock.

## Visual polish
- Introduced a two-stop gradient background token set and threaded it through the shared `ScreenContainer` so screens fade from white into a warm cream near the tab bar.
- Iterated on the gradient overlay to extend the fade horizontally toward the bottom-right corner, keeping the top half solid white for readability.

## User accounts
- Created a SQLite `users` table with seed demo profiles and a `/api/login` endpoint that authenticates email/password pairs.
- Documented shared API base URL resolution so both authentication and events modules target the same backend host.

## Authentication flow
- Added a dedicated login screen with form validation, seeded credential hints, and loading/error feedback.
- Introduced an auth context and navigation guard so the tab experience loads only after a successful sign in.

## Chat MVP (Stage 1)
- Implemented conversation/message tables with seeded one-to-one chats between demo users.
- Added Gin handlers and Gorilla WebSocket hub (`/api/ws`) plus REST endpoints for conversations and messages.
- Created a React Native chat context with WebSocket wiring and a basic Messages screen UI supporting optimistic sends.
- Shifted the experience to direct user-to-user conversations with name/preview roster and detail thread view selection.

## Chat Stage 2 – Auth & stability
- Issued HMAC-signed session tokens from `/api/login` and protected chat REST/WS flows with middleware + query token verification.
- Added WebSocket rate limiting, reused ping/pong keepalives, and tracked per-user read cursors with unread counts in summaries.
- Hardened the client: Authorization headers on chat fetches, token-based sockets, conversation pull-to-refresh, auto-scroll to latest, and retry taps for failed sends.

## Chat Stage 3 – Event-driven group chat
- Linked events to conversations so publishing an event provisions a matching group chat with the creator enrolled as host.
- Added join-request storage, approval + denial endpoints, and membership removal handlers that push live updates over the WebSocket hub.
- Seeded demo data with a multi-member event chat and a standalone “Planning Crew” group so QA can verify roster flows immediately.
- Updated the React chat client to fetch event metadata, render participant avatars, show group titles correctly, and auto-refresh when screens regain focus.
- Improved the Messages screen UX with keyboard avoidance, avatar-aligned bubbles, and reliable scroll-to-latest behaviour.

## Chat resilience updates
- Persisted auth sessions with Expo SecureStore so both REST and WebSocket calls survive app restarts without forcing a fresh sign-in.
- Added automatic WebSocket reconnects (with missed-message refresh) whenever the app returns to the foreground or a send occurs while the socket is down.
- Centralised chat socket cleanup to avoid duplicate close errors and ensure backgrounded apps pause traffic without losing state.

## Chat server – concurrency & docs
- Simplified server chat hub by removing the per-client `subscriptionsMu` lock; authorization now uses a DB membership check in `handleSend` to avoid stale client state (server/chat_hub.go).
- Added thorough, doc-style comments throughout the hub (pumps, membership updates, registration) and every chat HTTP handler to explain inputs, responses, and side effects.
- Maintained the same fan-out behavior and rate limiting; membership updates still broadcast `conversation:membership` events to live subscribers.

## Event ownership
- Added `user_id` ownership metadata to events across schema, repository, and API payloads with backward-compatible migration.
- Guarded event creation behind authentication on the client and wired the Events context to persist the creator id when posting new plans.
- Seeded additional demo events linked to existing users for easier backend/frontend verification.

## Product vision
- Building a companion-finder that helps people discover last-minute event buddies, create new gatherings, and keep track of their own plans in one place.
