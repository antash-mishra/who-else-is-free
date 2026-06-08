# App-Level Mobile Issues Found During Member And Pending Requester Testing

## Scope

- Tested on Android emulator/device `001206477005760`.
- App account was tested first as a pending requester, then after the request was approved as a member.
- Primary flow covered: Discover, My Events, Event Details, Event Details action menu, chat entry from Event Details, chat composer, and Profile.
- The roles are the test entry points, not the full impact boundary. Most findings below are app-level issues surfaced while testing these states.

## Evidence

- Event Details member action-sheet spacing screenshot: `report/member-event-action-sheet-extra-space.png`

## App-Level Themes

| Theme                                                             | Observed During                  | Likely Shared Owner                                     |
| ----------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| Startup/loading state can stall even when event data is available | Discover as member               | App bootstrap, events context, Discover render gates    |
| Shared bottom sheets can render with excessive empty space        | Event Details member action menu | `BottomSheet`, `BottomSheetModal`, `EventActionOverlay` |
| Shared empty-state layout can break visually                      | My Events Hosting/Requested tabs | `EmptyState`, shared UI primitives, screen containers   |
| Inactive tabs remain exposed to accessibility                     | Navigation across member screens | Bottom tab navigator/screen accessibility isolation     |
| Overlay/sheet safe-area spacing is inconsistent                   | Chat event-details overlay       | Shared overlay/sheet layout and safe-area rules         |
| Some sheet actions are not exposed as buttons                     | Leave Event confirmation         | Shared action sheet/pressable primitives                |

## Confirmed Issues

### 1. Discover can stay blank/loading too long on first app open

**Impact level:** App-level startup/data hydration issue.

**Observed state:** Member session, also likely affects pending requester sessions.

**What happened:** After terminating and relaunching the app, Discover initially rendered as a blank/empty loading surface even though the accessibility tree already exposed Discover data and the single event. A later screenshot showed the page correctly.

**Why it matters:** When there is only one event on Discover, the user can think the app is stuck even though data appears to be available.

**Reproduction notes:**

1. Log in as a non-host user.
2. Ensure Discover has only one available event.
3. Fully terminate the app.
4. Relaunch and watch the first Discover render.

**Likely area to inspect:** Discover screen loading gates, event/context hydration, image loading, and any render condition that waits after data is already available.

### 2. Event Details three-dot action sheet has a large empty area below actions

**Impact level:** App-level shared sheet/layout issue.

**Observed state:** Confirmed as member.

**What happened:** Tapping the three-dot menu on Event Details opens the bottom action sheet with actions near the top and a large blank white area below. The element bounds showed `bottom-sheet-modal` from about `y=983` to the bottom of the screen, while the final action ended around `y=1476`.

**Why it matters:** The menu looks broken and heavier than intended. It also makes the sheet feel like it has missing content.

**Reproduction notes:**

1. Open Event Details as a joined member.
2. Tap the top-right three-dot button.
3. Observe `View Intro Message`, `Leave Event`, and `Report Event` at the top of a very tall sheet.

**Likely cause:** `EventActionOverlay` uses the shared `BottomSheetModal` with keyboard avoidance enabled by default. Non-input overlays such as `menu`, `confirm`, and `viewIntro` should probably disable keyboard avoidance, while input overlays such as `invite` and `report` should keep it.

### 3. My Events empty states are visually broken

**Impact level:** App-level shared empty-state/layout issue.

**Observed state:** Confirmed as member on empty Hosting and Requested tabs.

**What happened:** Empty states in My Events show a large/cropped illustration area, and the empty-state text is not legible visually even though accessibility exposes the expected text.

**Why it matters:** Empty tabs look unfinished and do not communicate what the user should do next.

**Reproduction notes:**

1. Log in as a member who has no hosted events.
2. Open My Events.
3. Check Hosting.
4. Check Requested when there are no pending requests.

**Likely area to inspect:** `EmptyState`, `MyEventsScreen`, and image/container sizing after the shared primitive refactor.

### 4. Inactive tab content is still exposed to accessibility

**Impact level:** App-level navigation/accessibility issue.

**Observed state:** Confirmed while navigating as member.

**What happened:** While on screens such as Profile, the mobile element tree still reported elements from inactive tabs such as Discover, My Events, and Chat.

**Why it matters:** Screen readers and automated tests may see controls that are not visually active, causing confusing navigation and false positives.

**Reproduction notes:**

1. Navigate to Profile.
2. Inspect the element tree.
3. Notice elements from other tabs are still exposed.

**Likely area to inspect:** Bottom tab navigator screen mounting behavior and whether inactive screen roots need `accessibilityElementsHidden`, `importantForAccessibility`, or a navigation-level option.

### 5. Chat header event-details overlay is cramped near the bottom gesture area

**Impact level:** App-level overlay/safe-area issue.

**Observed state:** Confirmed as member after opening chat from Event Details.

**What happened:** The chat header/event details overlay places bottom content close to the Android gesture/navigation area.

**Why it matters:** The overlay feels cramped and could become hard to interact with on devices with larger safe-area insets.

**Reproduction notes:**

1. Open Event Details as a member.
2. Tap `Go to Chat`.
3. Open the chat event-details/header overlay.
4. Inspect spacing near the bottom of the screen.

**Likely area to inspect:** Chat thread event-details overlay, safe-area handling, and bottom padding.

### 6. Leave Event confirmation destructive action is not exposed as a button

**Impact level:** App-level accessibility issue in shared sheet actions.

**Observed state:** Confirmed as member.

**What happened:** The Leave Event confirmation destructive action was exposed in the element tree as a generic `ViewGroup` instead of a button.

**Why it matters:** Accessibility users and automation cannot reliably identify the destructive confirmation as an actionable button.

**Reproduction notes:**

1. Open Event Details as a member.
2. Tap the three-dot menu.
3. Tap `Leave Event`.
4. Inspect the confirmation sheet element tree.

**Likely area to inspect:** `ConfirmActionSheet`, `SheetActionList`, and any custom pressable used for destructive actions.

## Pending Requester Notes

- Pending request status itself was expected: the user clarified that the event was supposed to appear as pending before approval.
- The pending requester menu shape appeared correct for the state: `View Intro Message`, `Cancel Request`, and `Report Event`.
- The large action-sheet spacing issue was not seen in the earlier pending screenshot, but because it comes from the shared `EventActionOverlay`/`BottomSheetModal` path, it may still affect pending requester action sheets after keyboard or sheet interactions.

## Role-Specific Findings

- No member-only business logic issue was confirmed during this pass.
- No pending-requester-only business logic issue was confirmed during this pass after the pending state was clarified as expected.
- The most important follow-up is to fix the shared foundations above, then retest member, pending requester, host, and guest flows to make sure each role benefits from the same repairs.

## Not Counted As Issues

- The earlier pending state before approval is not a bug. It matched the intended request lifecycle.
- As a member, the Event Details page correctly showed `Introduction` and `Go to Chat`.
- `Go to Chat` correctly opened the 1:1 chat thread.
- The chat composer handled the keyboard correctly during the member smoke test.
- Profile correctly showed `0 Hosted · 1 Joined` for the tested account.
