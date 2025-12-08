# Critique - Feature 4: Messaging & Real-Time Chat

## Findings
- Unread counters are only zeroed locally; opening a conversation never advances the server read cursor, so `/api/conversations` keeps returning stale `unread_count` values and badges reappear after any refresh (`src/context/ChatContext.tsx:259-325`, `src/context/ChatContext.tsx:957-965`). The server only updates read state when sending a message (`server/chat_hub.go:433-444`, `server/repository.go:1362-1411`).
- Offline/closed-socket sends drop to a “failed” bubble and require manual retry; there’s no queue or auto-resume once the socket reconnects, so users can lose messages silently if they miss the failure state (`src/context/ChatContext.tsx:848-935`, `src/screens/ChatThreadScreen.tsx:167-173`).
- Message history is capped at the latest 50 messages with no pagination or “load earlier” path (`src/context/ChatContext.tsx:259-307`), so long-running conversations can’t be fully viewed.

## Recommendations
- Call a read-state endpoint (or piggyback on `refreshMessages`) to persist the latest read message ID so server `unread_count` matches what the UI shows.
- Introduce a send queue that retries automatically after reconnection, surfacing a single failure state if the payload never sends.
- Add pagination/“load earlier” support beyond the initial 50 messages to keep history accessible.
