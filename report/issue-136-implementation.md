# Issue 136 implementation

Branch: `master` (changes made directly on main)
Issue: <https://github.com/antash-mishra/who-else-is-free/issues/136>

## Findings and fixes

| Issue item | Root cause | Fix |
| --- | --- | --- |
| 1:1 chat header shows "11 Sep Fri" | `formatAbsoluteDateLabel` in `src/utils/dateTime.ts` omitted the comma the rest of the app uses ("11 Sep, Fri"). | Label now reads `DD Mon, Www`. Only the chat header subtitle consumed it. |
| Caret sits behind the placeholder in text inputs (Android) | Every `TextInput` used the negative tracking tokens (`-0.5` / `-0.3`). Android applies letter spacing symmetrically around each glyph, so the first placeholder glyph shifts left under the caret. | New `typography.inputLetterSpacing` / `inputDetailLetterSpacing` tokens are `0` on Android and unchanged on iOS. All nine `TextInput` styles use them. |
| Chat: while typing, earlier messages are hidden and cannot scroll | On Android the window stays in `ADJUST_NOTHING` and only the composer was translated up by the keyboard height; the message list kept its full height underneath. | `useAndroidKeyboardLift` pads the thread body by the keyboard lift, so composer and list move together and the list shrinks. Scroll-to-end runs once the lift settles. |
| Join announcement shows a red dot and bold preview | For 1:1 approvals the server persists the requester's intro as a normal user message before the system announcement. The host's unread count therefore became 1 even though the last message is a system row. On the client, a socket delivery of that intro also incremented the local count, and the conversation merge keeps the larger of server/local values. | Server: after approval the approver's read cursor advances to the latest message. Client: the approve response's `conversationId` is marked read locally and exempted from socket unread increments for 15 s. |
| Stray white shape in the overlay close icon; no blur behind it | The hero buttons used `BlurView` without `experimentalBlurMethod`, which on Android renders a flat tint and produced the artifact. | `HeroButtonBlur` enables `dimezisBlurView` on Android and layers `componentTokens.overlay.heroButtonTint` over it so the circle stays dark and the white ✕ readable. iOS is unchanged. |

## Files

- `src/utils/dateTime.ts`, `src/utils/chatHeaderSubtitle.ts`, `src/utils/__tests__/chatHeaderSubtitle.test.ts`
- `src/theme/typography.ts`, `src/theme/components.ts`
- `src/screens/ChatThreadScreen.tsx`
- `src/context/ChatContext.tsx`
- `src/screens/EventDetailsScreen.tsx`
- Input styles: `EventActionOverlay.styles.ts`, `CreateEventScreen.styles.ts`, `OnboardingScreen.tsx`, `LocationPickerModal.styles.ts`, `DescriptionEditorModal.tsx`, `CoverPickerModal.styles.ts`, `ui/TextField.tsx`, `EditProfileScreen.tsx`
- `server/chat_hub.go`
- Docs: `AGENTS.md`, `CLAUDE.md`, `report/shared-components-refactor-guide.md`, `TEST_RUNS.md`

## Verification

See `TEST_RUNS.md` (2026-09-05, issue 136) and `report/issue-136-assets/`.
