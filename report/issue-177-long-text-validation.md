# Issue #177 — long text validation

Implemented on `codex/issue-177-long-text`.

## Behavior

- Request/report inputs own their native scrolling inside a bounded, clipped viewport. Their action button remains outside the scrolling text.
- Chat stays pill-shaped for one line and uses smaller rounded corners for multiple lines. The input grows to a bounded height, then scrolls; the send control remains visible.
- Displayed names are one line with a trailing ellipsis in Profile, hosted-by details, member/request/accepted rows, the 1:1 hub, and chat sender labels. Join notices reserve space for “joined the plan/chat”. Existing Messages/header truncation is preserved.
- Onboarding/Profile name editors and Create/Edit title editors use shared `OverflowTextInput`: full native horizontal editing when focused, whole-word overflow preview when unfocused. Stored/submitted text stays intact. Removed Edit Profile's native 50-character clipping of previously saved names.

## Validation

- `npm test -- --runInBand`: 132 suites, 1,512 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed; existing warning baseline remains, no errors.
- `git diff --check` and formatting checks on touched files: passed.
- Android development build: passed.
- Native devices: Android 16 WEIF_API_36 (720 × 1600); iPhone 15 Pro simulator, iOS 17.4 (1178 × 2556).
- Fixture: a 1,596-character synthetic paragraph ending `END OF LONG TEXT`, also used as names and plan titles. Local REST fixtures used an isolated API/database on port 8083; no production data was changed.

## Native evidence

All screenshots are native captures, without image edits. Start/end pairs show different scroll positions of the same long value.

| Page/state                                    | Evidence                                                                                                                                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request intro, beginning/end                  | [iOS start](screenshots/issue-177/ios-request-start.png), [iOS end](screenshots/issue-177/ios-request-end.png), [Android start](screenshots/issue-177/android-request-start.png), [Android end](screenshots/issue-177/android-request-end.png) |
| Multiline chat, beginning/end and join notice | [Start](screenshots/issue-177/ios-chat-input-start.png), [End](screenshots/issue-177/ios-chat-input-end.png), [Notice](screenshots/issue-177/ios-chat-notice.png)                                                                              |
| Create title, editing/at rest                 | [Editing](screenshots/issue-177/ios-create-title-editing.png), [Rest](screenshots/issue-177/ios-create-title-rest.png), [Android editing](screenshots/issue-177/android-create-title-editing.png)                                              |
| Edit title, editing/at rest                   | [Editing](screenshots/issue-177/ios-edit-title-editing.png), [Rest](screenshots/issue-177/ios-edit-title-rest.png)                                                                                                                             |
| Onboarding name, editing/at rest              | [Editing](screenshots/issue-177/ios-onboarding-editing.png), [Rest](screenshots/issue-177/ios-onboarding-rest.png)                                                                                                                             |
| Edit Profile name, editing/at rest            | [iOS editing](screenshots/issue-177/ios-edit-profile-editing.png), [iOS rest](screenshots/issue-177/ios-edit-profile-rest.png), [Android editing](screenshots/issue-177/android-edit-profile-editing.png)                                      |
| Profile display name                          | [iOS](screenshots/issue-177/ios-profile.png), [Android](screenshots/issue-177/android-profile.png)                                                                                                                                             |
| Event Details hosted-by name                  | [iOS](screenshots/issue-177/ios-event-details-host.png), [Android](screenshots/issue-177/android-event-details-host.png)                                                                                                                       |
| Event Details Requests and Members            | [Requests](screenshots/issue-177/ios-event-requests.png), [Members](screenshots/issue-177/ios-event-members.png)                                                                                                                               |
| In-chat Requests sheet                        | [Requests](screenshots/issue-177/ios-join-request-sheet.png)                                                                                                                                                                                   |
| 1:1 Accepted and chat hub                     | [Accepted](screenshots/issue-177/ios-single-accepted.png), [Hub](screenshots/issue-177/ios-one-to-one-hub.png)                                                                                                                                 |
| Messages list                                 | [Messages](screenshots/issue-177/ios-messages.png)                                                                                                                                                                                             |

## Scope of device verification

The iOS simulator's existing development binary lacks a keychain entitlement. For onboarding only, a temporary local dev-login fallback opened the actual Onboarding route after authentication set the local user but credential persistence failed. This navigation-only workaround was reverted before final checks and is not part of the implementation. Input/UI code in the captures is the implemented code. Native login persistence and OS push delivery were not verified by this task.

The Android emulator became unresponsive during the final collection. The retained Android captures cover the request, Profile/Edit Profile, host label and focused Create title checks; the complete page coverage is supplied by iOS. The Android Create editing screenshot contains its development FPS monitor. Invalid/transition captures were discarded. The final cached-editor-paint alpha adjustment was verified for focus and preview on iOS; a complete final Android rerun remains a device-QA follow-up.
