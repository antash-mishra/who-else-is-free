# Shared Components And Shared Styling Guide

Updated: August 29, 2026

Branch: `refactor/code-consistency-shared-components`

## Purpose

This document explains the shared React Native components and shared styling system in this branch:

- what each shared component is responsible for
- where each component is currently used
- which theme tokens act like shared CSS
- which component-level style files should be reused instead of duplicating local styles

This is a developer reference. QA history and bug-fix notes live in separate reports.

## How To Read This

Start with the "Use This First" table when building a screen. Use the detailed sections when you
need to know ownership, current usage, or whether a component is generic enough for new code.

In this React Native app, "shared CSS" means:

- shared theme tokens in `src/theme`
- shared component styles owned by reusable components
- feature-level `.styles.ts` files that keep a complex component's style rules in one place

## Use This First

| Need                                          | Use                                                                                    | Current examples                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Primary, secondary, destructive, or ghost CTA | `AppButton`                                                                            | `EmptyState`, `SignInButtons`, `HelpForm`                             |
| Shared typography variant                     | `AppText`                                                                              | `EmptyState`, help screens, UI primitives                             |
| Text input                                    | `TextField`                                                                            | `HelpForm`                                                            |
| Checkbox row                                  | `CheckboxRow`                                                                          | `HelpForm`                                                            |
| Icon-only close/back/action button            | `IconButton`                                                                           | `ScreenHeader`, `SheetHeader`, Profile notifications bell             |
| Tabs or segmented controls                    | `AppTabs`, `SegmentedControl`                                                          | Discover, My Events                                                   |
| Sliding-underline tabs over a pager           | `SlidingTabs`                                                                          | Event Details requests/members tabs                                   |
| Numeric count badge in a header/row           | `CountBadge`                                                                           | Chat thread header, One-to-One Hub header, Profile notifications bell |
| Unread indicator dot on a list row            | `UnreadDot`                                                                            | Messages rows, One-to-One Hub rows, Notifications rows                |
| Join-request row with accept/decline          | `EventRequestRow`                                                                      | Event Details, Pending Requests                                       |
| Member row with menu or host label            | `EventMemberRow`                                                                       | Event Details members/accepted lists                                  |
| Press scale and haptics                       | `ScalePressable`                                                                       | UI primitives, event rows, profile/menu rows                          |
| Screen safe-area shell                        | `ScreenContainer`                                                                      | Most app screens                                                      |
| Standard back/title header                    | `ScreenHeader`                                                                         | Help screens, Edit Profile, Past Events                               |
| Empty state                                   | `EmptyState`                                                                           | Discover, My Events, Messages, request screens, Event Details         |
| Event card list and load state                | `EventListPage`, `EventSectionList`, `EventListLoadState`                              | Discover, My Events, Past Events                                      |
| Bottom sheet                                  | `BottomSheetHostProvider`, `BottomSheetModal`, `CreateEventBottomSheet`, `BottomSheet` | modal coordination, create-event sheets, action overlays              |
| Sheet action menu                             | `SheetActionList`                                                                      | event action menus and pending request menus                          |
| Event action prompt                           | `EventActionOverlay`                                                                   | Event Details, Chat Thread, Profile                                   |
| Avatar                                        | `UserAvatar`                                                                           | Profile, messages, chat, event members, onboarding                    |
| Shared haptics                                | `triggerHaptic` or shared `haptic` props                                               | navigation, forms, sheets, event actions                              |
| Dev-only logging                              | `logger`                                                                               | contexts, screens, hooks (no direct `console.*`)                      |
| Shared API request                            | `requestJson`, `ApiError` from `src/api/client.ts`                                     | `EventsContext`, `ChatContext`, `PushContext`, hooks                  |
| API payload normalization                     | `src/api/mappers/events.ts`, `src/api/mappers/chat.ts`                                 | `EventsContext`, `ChatContext`                                        |
| Shared API timeout                            | `createRequestTimeout`, `isAbortError`                                                 | `requestJson` (default 10s), custom fetch flows                       |
| Create/Edit Event mapping                     | `createEventForm.ts` helpers                                                           | `CreateEventScreen`                                                   |
| Event metadata separators                     | `EVENT_INFO_SEPARATOR` and `EVENT_DETAILS_INFO_SEPARATOR`                              | Event cards and Event Details respectively                            |

## Shared Styling System

### Theme Barrel

File: `src/theme/index.ts`

What it is:

- The preferred import surface for theme tokens.
- Re-exports colors, spacing, typography, radii, shadows, layout, and component tokens.

Where it is used:

- Most components and screens import tokens from `@theme/index`.
- `AppNavigator` imports `colors` and `Springs` directly from specific theme files because those
  files are used heavily there.

Rule:

- Prefer `@theme/index` for normal component styling.
- Prefer a direct theme-file import only when a file already uses that local pattern.

### Colors

File: `src/theme/colors.ts`

What it is:

- The app's named color palette and semantic color map.
- Covers app background, text, muted text, borders, buttons, inputs, errors, event details,
  create-event surfaces, navigation surfaces, and overlays.

Where it is used:

- Almost everywhere: screens, UI primitives, sheets, navigation, event cards, help screens,
  profile, chat, create event, and modals.

Important groups:

- App surfaces: `background`, `surface`, `card`, `actionSurface`
- Text: `text`, `muted`, `mutedText`, `subText`, `placeholder`
- Borders and controls: `border`, `borderSubtle`, `checkboxBorder`, `inputSurface`
- Buttons: `primaryButtonBackground`, `secondaryButtonBackground`, `buttonText`, `error`
- Navigation: `navigationBackground`, `navigationSheetBackdrop`, `tabBarFrostedOverlay`,
  `tabBarUnreadDot`, `activeTabIndicator`, `tabInactive`
- Event details: `eventDetailGradientStart`, `eventDetailGradientEnd`,
  `eventDetailButtonBackground`, `eventDetailRowText`
- Create event: `createGradientStart`, `createGradientEnd`, `createCardBackground`,
  `createTextPrimary`, `createButtonBackground`, `createButtonText`

Rule:

- Do not add repeated hex or rgba values in screens. Add or reuse a named color token.
- Local hardcoded colors are acceptable only for genuinely one-off artwork/gradient stops that are
  not part of a repeated UI system.

### Spacing

File: `src/theme/spacing.ts`

What it is:

- Shared spacing scale: `xs`, `sm`, `md`, `lg`, `xl`, `xxl`.

Where it is used:

- Screen headers, event lists, sheets, help forms, profile, messages, create-event layout,
  selection modals, and list separators.

Rule:

- Use spacing tokens for repeated gaps, margins, and padding.
- If a screen needs a responsive or calculated value, derive it from a spacing token where possible.

### Typography

File: `src/theme/typography.ts`

What it is:

- Shared font families, text sizes, line heights, and letter spacing.

Where it is used:

- `AppText`, `AppButton`, `EventCard`, sheet headers, Help screens, Profile, Messages,
  Event Details, Create Event, and modal style files.

Important tokens:

- Families: `fontFamilyRegular`, `fontFamilyMedium`, `fontFamilySemiBold`, `fontFamilyBold`
- Sizes: `header`, `title`, `subtitle`, `body`, `caption`, `small`, `cardTitle`, `cardMeta`
- Spacing: `lineHeight`, `titleLineHeight`, `letterSpacing`, `detailLetterSpacing`
- Inputs: `inputLetterSpacing`, `inputDetailLetterSpacing` (zero on Android so the caret does not overlap the placeholder; use these on every `TextInput`)

Rule:

- Use `AppText` for common text variants.
- Use typography tokens directly for complex layouts that cannot use `AppText`.

### Component Tokens

File: `src/theme/components.ts`

What it is:

- Repeated component dimensions and interaction constants.

Where it is used:

- `AppButton`, `TextField`, `CheckboxRow`, `IconButton`, `AppTabs`, `BottomSheet`,
  `SheetActionList`, `HoldToConfirmButton`, `PastEventsScreen`, and event lists.

Important groups:

- `button`: height, radius, horizontal padding
- `input`: height, radius, pill radius, padding
- `checkbox`: size, radius, tick size
- `iconButton`: button and icon sizes, plus `compactHitSlop` for compact header actions that retain a full touch target
- `avatar`: shared avatar sizes
- `overlay`: backdrop, close button background, destructive progress fill
- `segmentedControl`: tab gaps and padding
- `eventList`: item spacing, section spacing, top padding

Rule:

- Put repeated component measurements here before copying numbers across components.

### Radii

File: `src/theme/radii.ts`

What it is:

- Shared border radius scale: `sm`, `md`, `lg`, `xl`, `pill`, `sheet`.

Where it is used:

- Buttons, icon buttons, sheet action rows, bottom sheets, hold-to-confirm button, tabs, and modal
  surfaces.

Rule:

- Use `radii.pill` for fully rounded buttons/chips.
- Use `radii.sheet` for bottom-sheet top corners.

### Shadows

File: `src/theme/shadows.ts`

What it is:

- Shared elevation/shadow presets: `card`, `floating`, `sheet`.

Where it is used:

- `BottomSheet` uses `shadows.sheet`.
- Other card/floating surfaces should use these instead of inline shadow objects.

Rule:

- Do not create new shadow recipes unless a repeated visual need is missing.

### Layout

File: `src/theme/layout.ts`

What it is:

- Shared layout constants for screen padding, header height, tab height, sheet z-index, and hit slop.

Where it is used:

- `ScreenContainer`, `IconButton`, `BottomSheet`, and navigation-related layout.

Rule:

- Use `layout.hitSlop` for small press targets.
- Use `layout.screenHorizontalPadding` instead of hardcoding screen gutters.

### Motion

File: `src/theme/springs.ts`

What it is:

- Shared animation presets for press feedback, navigation, tabs, sheets, badges, and pager motion.

Where it is used:

- `ScalePressable`, `AnimatedPager`, `AppTabs`, `BottomSheet`, `AppNavigator`,
  `CreateEventScreen`.

Important presets:

- `snappy`: fast navigation/dismiss transitions
- `press`: press-release scale animation
- `bouncyUp`: sheet/badge slide-in
- `elegant`: tab icon bounce and softer entries

Rule:

- If two interactions should feel the same, they should share a spring preset.

File: `src/theme/motion.ts`

What it is:

- Scrapbook motion tokens, layered beside `springs.ts` rather than replacing it.
  `springs.ts` values are frozen because `src/navigation/transitions.ts` is tuned
  against them.

Important tokens:

- `Motion.settle`: spring for an item settling onto the page (one gentle overshoot)
- `motionTiming.staggerStepMs` / `staggerMaxSteps`: per-item delay, capped at 6 steps
- `motionGeometry.tiltMaxDeg` / `entryTranslateY` / `entryScaleFrom`: placed-item geometry

### Tabbed Pager Wiring

File: `src/hooks/useTabbedPages.ts`

What it is:

- The single wiring for a screen that pairs a tab strip with a swipeable pager,
  so the tab indicator tracks the swipe continuously instead of snapping.

Where it is used:

- `HomeScreen` (Discover sort tabs), `MyEventsScreen` (Hosting/Joined/Requests).

How to use it:

```tsx
const { pagerProps, tabsProps } = useTabbedPages(options, 'upcoming');

<AnimatedPager {...pagerProps}>{pages}</AnimatedPager>
<SegmentedControl {...tabsProps} />
```

Rules:

- Spread the bundles. Do not pass `pageOffsetSV`, `selectedIndex` or `onChange`
  by hand. Discover and My Events already used the same two components and the
  indicator still drifted apart, because the offset can be handed to the pager
  and forgotten on the tabs; spreading makes the correct wiring the only wiring.
- Selection is tracked by value, not index. Discover's options are dynamic
  ("Nearest" appears only with location), and an index silently points at the
  wrong tab when the list changes length.
- If the selected value leaves `options`, the hook falls back to the first
  option, which replaces per-screen reset effects.
- Memoise the options array; the hook keys its fallback off its identity.
- `HostRequestTabs` in Event Details keeps its own direction-locked pager and is
  deliberately not on this hook.

### Motion Primitives

Directory: `src/components/motion`

What it is:

- `Placed`: the scrapbook entry primitive. Children fade in, rise, scale up, and
  un-tilt as they settle, like a photograph laid on a page. `tiltMode` selects
  `entry` (settles square, right for text rows), `rest` (settles at a slight
  angle, right for photo cards), or `none` (no rotation, right for overlapping
  avatars).
- `staggerDelayMs(index)`: capped entry delay for a staggered group.
- `resetPlacedIds()`: test seam that clears the placed-once registry.

Where it is used:

- `EventSectionList` (Discover/My Events/Past Events rows), `EventDetailsHero`
  (cover card), `EventDetailsInfo` (going avatars).

Rules:

- `Placed` animates **once per `id`**, so `SectionList` recycling, pager page
  changes, and re-renders never replay an entry the user has already seen. Pass a
  stable, unique `id`.
- Every animated primitive must honour Reanimated's `useReducedMotion()` and
  degrade to a static or opacity-only presentation.
- Tilt angles come from `src/utils/seededRandom.ts` so they are deterministic per
  id; the confetti engine shares that generator.

### Component-Level Style Files

These are not global theme tokens, but they are still shared style owners for complex components.

| File                                           | Owns styles for                                                 | Used by                                            |
| ---------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| `src/components/CoverPickerModal.styles.ts`    | cover picker grid/cards/search states                           | `CoverPickerModal`                                 |
| `src/components/EventActionOverlay.styles.ts`  | event action prompts, confirm sheets, report/invite text fields | `EventActionOverlay.prompts`, `EventActionConfirm` |
| `src/components/EventDateTimeModal.styles.ts`  | date/time picker sheet content                                  | `EventDateTimeModal`                               |
| `src/components/LocationPickerModal.styles.ts` | location search/list/empty states                               | `LocationPickerModal`                              |
| `src/components/SelectionModal.styles.ts`      | generic option picker rows and selected states                  | `SelectionModal`                                   |
| `src/screens/CreateEventScreen.styles.ts`      | Create/Edit Event screen-specific visual system                 | `CreateEventScreen`                                |

Rule:

- Keep complex component styles beside the component when they are not broadly reusable.
- If a style pattern starts appearing in multiple feature components, move it into `src/theme` or a
  shared component.

## UI Primitives

### `AppButton`

File: `src/components/ui/AppButton.tsx`

What it is:

- Shared CTA button.
- Supports `primary`, `secondary`, `destructive`, and `ghost` variants.
- Owns loading, disabled state, accessibility state, optional icon, full width, and default haptics.

Where it is used:

- `src/components/EmptyState.tsx`
- `src/components/SignInButtons.tsx`
- `src/components/help/HelpForm.tsx`

Use it when:

- The button is a normal CTA.
- You need consistent loading/disabled/haptic behavior.

Do not use it when:

- The control is a highly custom gesture or card row. Use `ScalePressable` instead.

### `AppText`

File: `src/components/ui/AppText.tsx`

What it is:

- Shared text primitive with variants: `title`, `subtitle`, `body`, `caption`, `button`, `error`.

Where it is used:

- `src/components/EmptyState.tsx`
- `src/components/ui/AppButton.tsx`
- `src/components/ui/TextField.tsx`
- `src/components/ui/SectionHeaderText.tsx`
- `src/screens/HelpContactScreen.tsx`
- `src/screens/HelpFeedbackScreen.tsx`
- `src/screens/HelpFAQScreen.tsx`

Use it when:

- A text element matches a common semantic variant.

Do not use it when:

- The text needs complex screen-specific layout or a highly custom typographic treatment. Use
  typography tokens directly.

### `TextField`

File: `src/components/ui/TextField.tsx`

What it is:

- Shared `TextInput` wrapper for single-line and multiline inputs.
- Owns input background, placeholder color, border radius, padding, text style, and optional error
  message.

Where it is used:

- `src/components/help/HelpForm.tsx`

Use it when:

- A form needs a normal input or multiline message box.

### `CheckboxRow`

File: `src/components/ui/CheckboxRow.tsx`

What it is:

- Shared checkbox row with checked/unchecked visuals, label, disabled state, accessibility role, and
  selection haptic.

Where it is used:

- `src/components/help/HelpForm.tsx`

Use it when:

- A row toggles a boolean option.

### `IconButton`

File: `src/components/ui/IconButton.tsx`

What it is:

- Shared icon-only action button.
- Owns size, hit slop, rounded background variant, disabled state, haptics, and accessibility label.

Where it is used:

- `src/components/ScreenHeader.tsx`
- `src/components/sheets/SheetHeader.tsx`

Use it when:

- You need a close, back, or small icon-only action.

### `AppTabs`

File: `src/components/ui/AppTabs.tsx`

What it is:

- Shared tab primitive.
- Supports `pill` and `underline` variants.
- Owns selected animation, count labels, selection haptic, and test ID naming.

Where it is used:

- `src/components/SegmentedControl.tsx`

Use it when:

- A screen needs tabs with the same behavior as existing segmented controls.

### `SlidingTabs`

File: `src/components/ui/SlidingTabs.tsx`

What it is:

- Tab bar with a sliding underline that springs between tabs.
- Owns tab layout tracking, underline motion, count labels, selection haptics, and tab
  accessibility roles.
- External value changes (for example a pager swipe) move the underline through the same shared
  spring path as a tab press.
- Omit `onChange` for a static single-tab header with an underline.

Where it is used:

- `EventDetailsScreen` host requests/accepted/members tabs and the static Members headers.

Use it when:

- A screen pairs tabs with a pager-style section and needs the sliding underline treatment.

### `CountBadge`

File: `src/components/ui/CountBadge.tsx`

What it is:

- Shared numeric count badge (pill, 28pt, secondary surface) with built-in `99+` capping.

Where it is used:

- `ChatThreadScreen` header join-request count.
- `OneToOneHubScreen` header pending count.

Use it when:

- A header or row needs a numeric count chip.

### `UnreadDot`

File: `src/components/ui/UnreadDot.tsx`

What it is:

- Shared unread indicator dot (8pt, `colors.unreadIndicator`). Parents own positioning only.

Where it is used:

- `MessagesScreen` conversation rows.
- `OneToOneHubScreen` 1:1 request rows.

Use it when:

- A list row needs an unread marker.

### `ListSeparator`

File: `src/components/ui/ListSeparator.tsx`

What it is:

- Shared simple divider.

Where it is used:

- `src/screens/HelpScreen.tsx`

Use it when:

- A settings/list surface needs a tokenized horizontal separator.

### `SectionHeaderText`

File: `src/components/ui/SectionHeaderText.tsx`

What it is:

- Shared small section label built on `AppText`.

Where it is used:

- Exported from `src/components/ui/index.ts`.
- Available for new settings/list sections. It is not widely used yet.

Use it when:

- A list/settings group needs a consistent section heading.

## Layout, Interaction, And Common Visual Components

### `ScreenContainer`

File: `src/components/ScreenContainer.tsx`

What it is:

- Shared safe-area and screen gutter wrapper.
- Uses `colors.background` and `layout.screenHorizontalPadding`.

Where it is used:

- `GoogleSignIn`
- `HomeScreen`
- `MyEventsScreen`
- `MessagesScreen`
- `ChatThreadScreen`
- `ProfileScreen`
- `EditProfileScreen`
- `PrivacyPolicyScreen`
- `HelpScreen`, `HelpContactScreen`, `HelpFeedbackScreen`, `HelpFAQScreen`
- `OneToOneHubScreen`, `JoinRequestScreen`, `PendingRequestsScreen`
- `PastEventsScreen`

Use it when:

- Creating a normal full-screen route.

### `ScreenHeader`

File: `src/components/ScreenHeader.tsx`

What it is:

- Shared title/back header.
- Uses `IconButton` for the back action.

Where it is used:

- `EditProfileScreen`
- `PastEventsScreen`
- `HelpScreen`
- `HelpContactScreen`
- `HelpFeedbackScreen`
- `HelpFAQScreen`

Use it when:

- A pushed screen needs a simple title and back button.

### `ScalePressable`

File: `src/components/ScalePressable.tsx`

What it is:

- Shared pressable wrapper with scale animation and optional semantic haptic feedback.

Where it is used:

- `AppButton`
- `IconButton`
- `CheckboxRow`
- `AppTabs`
- `EventSectionList` event rows
- `EventDetailsScreen`
- `ProfileScreen`
- `MessagesScreen`
- `HelpScreen`
- `HelpFAQScreen`
- `EditProfileScreen`

Use it when:

- A custom row/card/control needs press scale and haptic behavior but is not a standard button.

### `AnimatedPager`

File: `src/components/AnimatedPager.tsx`

What it is:

- Shared horizontal pager with swipe and tap-driven transitions.
- Hides inactive pages from accessibility and pointer events.

Where it is used:

- `HomeScreen`
- `MyEventsScreen`

Use it when:

- A screen has sibling tab pages that should swipe like Discover/My Events.

### `SegmentedControl`

File: `src/components/SegmentedControl.tsx`

What it is:

- App-specific segmented control wrapper around `AppTabs` with `variant="pill"`.

Where it is used:

- `HomeScreen`
- `MyEventsScreen`

Use it when:

- A screen needs the standard pill segmented control.

### `EmptyState`

File: `src/components/EmptyState.tsx`

What it is:

- Shared empty-state content: image/illustration/icon, title, description, and optional primary or
  secondary actions.
- Uses `AppText` and `AppButton`.

Where it is used:

- `HomeScreen`
- `MyEventsScreen`
- `MessagesScreen`
- `OneToOneHubScreen`
- `JoinRequestScreen`
- `PastEventsScreen`
- `EventDetailsScreen`

Use it when:

- A list or screen has no content.

Placement rule:

- The parent list/screen owns centering and available height.
- `EmptyState` owns the content styling.

### `EventCard`

File: `src/components/EventCard.tsx`

What it is:

- Shared event preview card.
- Renders cover art, title, metadata, and badge labels.

Where it is used:

- `EventSectionList`
- Event-list helper types are also used by screens and contexts.

Use it when:

- Rendering an event in a list.

### `UserAvatar`

File: `src/components/UserAvatar.tsx`

What it is:

- Shared avatar component for image avatars and generated fallback initials.

Where it is used:

- `ProfileScreen`
- `EditProfileScreen`
- `MessagesScreen`
- `ChatThreadScreen`
- `OneToOneHubScreen`
- `JoinRequestScreen`
- `PendingRequestsScreen`
- `EventDetailsScreen`
- `OnboardingScreen`

Use it when:

- Rendering any user profile image or fallback avatar.

### `SignInButtons`

File: `src/components/SignInButtons.tsx`

What it is:

- Shared sign-in action block.
- Uses `AppButton` for sign-in CTAs and handles Google/Apple loading states.

Where it is used:

- `CreateEventScreen`
- `MyEventsScreen`
- `MessagesScreen`
- `ProfileScreen`
- `EventDetailsOverlayRoutes`

Use it when:

- A signed-out user needs to authenticate from an app surface.

### `EventActionBadge`

File: `src/components/EventActionBadge.tsx`

What it is:

- Shared transient badge/toast for event action results.

Where it is used:

- `HomeScreen`
- `MyEventsScreen`
- `EventDetailsOverlayRoutes`

Use it when:

- Event actions need a short success/result badge.

### `NotificationBanner` / `NotificationBannerHost`

Files: `src/components/NotificationBanner.tsx`, `src/components/NotificationBanner.styles.ts`, `src/components/NotificationBannerHost.tsx`

What it is:

- The single foreground in-app notification banner: a top-anchored, tappable, swipe-up-to-dismiss preview of an inbox row that just arrived over the WebSocket (`notification:new`). Built on Reanimated + Gesture Handler; dark frosted material (`BlurView` + `componentTokens.overlay.bannerTint`/`bannerBorder`, like `EventActionBadge`), content shaped per type by `buildBannerContent` (`src/utils/notificationBanner.ts`: person-led for messages and join requests, plan-led for outcomes), `componentTokens.banner`, `layout.bannerZIndex`, and `shadows.floating`.
- `NotificationBannerHost` owns the slot, subscribes to `useNotifications().subscribeToIncomingNotifications`, applies suppression (`shouldSuppressBanner`: navigator not ready, read/inactive rows, the `Notifications` route, the active chat conversation), and opens taps through `useOpenNotifications`.

Where it is used:

- `AppNavigator` (mounted once, as a sibling after the `NavigationContainer`)

Use it when:

- Never mount it yourself; notifications reach it through `NotificationsContext`. Use `EventActionBadge` for local action confirmations instead.

### `useOpenNotifications`

File: `src/hooks/useOpenNotifications.ts`

What it is:

- Shared open-and-resolve behaviour for notifications: resolves through `openNotification` (`POST /api/notifications/actions/resolve`), navigates, mirrors the resolution into `NotificationsContext`, and exposes `resolvingIDs` / `openError`.

Where it is used:

- `NotificationsScreen`
- `NotificationBannerHost`

### `ConfettiOverlay`

File: `src/components/ConfettiOverlay.tsx`

What it is:

- Shared celebration overlay.

Where it is used:

- `MyEventsScreen` for the Event Created badge moment.

Use it when:

- A celebratory screen action needs the same confetti behavior.

### `ChatEventHeader`

File: `src/components/ChatEventHeader.tsx`

What it is:

- Shared chat/event header row with event context and back behavior.

Where it is used:

- `ChatThreadScreen`
- `OneToOneHubScreen`
- `JoinRequestScreen`

Use it when:

- A chat-like surface needs the event-aware header treatment.

## Sheets, Modals, And Overlays

### `BottomSheet`

File: `src/components/sheets/BottomSheet.tsx`

What it is:

- Low-level shared bottom-sheet foundation.
- Owns modal/inline presentation, backdrop, open/close animation, safe area, keyboard avoidance,
  max height, optional snap height, and shared sheet styling.
- Keyboard avoidance uses `bottomObstruction.ts` to subtract the system safe-area region already
  reserved by the sheet from its translation. Android uses physical-screen keyboard-top coordinates
  so `adjustPan` does not collapse the translation to zero; iOS retains height-based animation
  timing. Both preserve the shared base content spacing. Do not compensate in prompt content.
- Exposes `onOpened` after its entry animation settles. Use it for keyboard focus and expensive
  child mounting rather than guessing a timeout in individual sheet content.

Where it is used:

- `BottomSheetModal`
- `CreateEventBottomSheet`

Use it when:

- Creating a new sheet wrapper or updating sheet mechanics.

### `BottomSheetHostProvider`

File: `src/components/sheets/BottomSheetHost.tsx`

What it is:

- App-level coordinator for modal bottom sheets.
- Keeps one native modal sheet mounted and swaps content when another `BottomSheetModal` becomes
  visible, avoiding sibling native modal handoff bugs on iOS.

Where it is used:

- `AppNavigator`
- `BottomSheetModal`

Use it when:

- Wiring app-level providers or coordinating modal sheet presentation.

### `BottomSheetModal`

File: `src/components/BottomSheetModal.tsx`

What it is:

- Standard modal sheet wrapper around `BottomSheet`.
- Supports optional title, close header, `avoidKeyboard`, `snapHeight`, and the forwarded
  `onOpened` entry-settled callback.
- Uses `BottomSheetHostProvider` when available and falls back to local modal rendering in isolated
  tests or stories.

Where it is used:

- `SelectionModal`
- `EventDateTimeModal`
- `CoverPickerModal`
- `LocationPickerModal`
- `EventActionOverlay`
- sign-in sheets in `MyEventsScreen`, `MessagesScreen`, `ProfileScreen`, and
  `EventDetailsOverlayRoutes`

Use it when:

- A normal modal sheet is needed.
- A sheet can transition to another modal sheet; do not hand-roll timers between sibling modals.

### `CreateEventBottomSheet`

File: `src/components/CreateEventBottomSheet.tsx`

What it is:

- Modal sheet wrapper for Create/Edit Event.
- Uses `BottomSheetModal` with keyboard avoidance disabled so Create/Edit Event sheets share the
  app-wide modal transition and host coordination.

Where it is used:

- `CreateEventScreen`

Use it when:

- Adding Create/Edit Event sheet content.

### `SheetHeader`

File: `src/components/sheets/SheetHeader.tsx`

What it is:

- Shared sheet title and close button.
- Uses `IconButton`.

Where it is used:

- `BottomSheet`

Use it when:

- A custom sheet wrapper needs the same header treatment.

### `SheetActionList`

File: `src/components/sheets/SheetActionList.tsx`

What it is:

- Shared vertical action row list for sheets.
- Owns row surface, destructive color, disabled/loading state, accessibility, and haptics.

Where it is used:

- `EventActionOverlay.prompts.tsx` for action menus.

Use it when:

- A sheet contains a list of actions.

### `EventActionOverlay`

File: `src/components/EventActionOverlay.tsx`

What it is:

- Shared overlay router for event-related prompts.
- Chooses the prompt body and renders it inside `BottomSheetModal`.

Where it is used:

- `EventDetailsOverlayRoutes`
- `ChatThreadScreen`
- `HomeScreen` for the one-shot notification unavailable result after a safe Discover redirect
- `ProfileScreen`

Supported prompt types:

- `invite`
- `confirm`
- `result`
- `report`
- `menu`
- `viewIntro`

Use it when:

- A flow needs an event action prompt, confirmation, menu, report form, invite prompt, or intro view.

### `EventActionOverlay.prompts`

File: `src/components/EventActionOverlay.prompts.tsx`

What it is:

- Prompt body implementations used by `EventActionOverlay`.
- Keeps the top-level overlay file from becoming one huge component.

Where it is used:

- `EventActionOverlay`

Use it when:

- Adding or updating an event action prompt body.

### `EventActionConfirm`

File: `src/components/EventActionConfirm.tsx`

What it is:

- Shared confirmation prompt for event/profile destructive actions.
- Uses `HoldToConfirmButton` when `holdToConfirm` is enabled.

Where it is used:

- `EventActionOverlay.prompts.tsx`

Use it when:

- A destructive or confirm action needs shared title/body/cancel/confirm treatment.

### `HoldToConfirmButton`

File: `src/components/HoldToConfirmButton.tsx`

What it is:

- Shared press-and-hold destructive confirmation button.
- Owns progress fill, destructive haptic, disabled state, and accessibility role/state.

Where it is used:

- `EventActionConfirm`

Use it when:

- A destructive action should require deliberate confirmation.

### `SelectionModal`

Files:

- `src/components/SelectionModal.tsx`
- `src/components/SelectionModal.styles.ts`

What it is:

- Generic option picker sheet.
- Also exports `SelectionModalContent` so Create Event can render the content inside
  `CreateEventBottomSheet`.

Where it is used:

- `CreateEventScreen` for category/group/age-style option selection content.

Use it when:

- A screen needs a reusable option list with selected state.

### `CoverPickerModal`

Files:

- `src/components/CoverPickerModal.tsx`
- `src/components/CoverPickerModal.styles.ts`

What it is:

- Cover image picker sheet/content for the categorized cover catalog
  (search pill, horizontal category chips, 3-column image grid).
- Search/filter logic lives in the shared `searchCovers` helper
  (`src/utils/coverSearch.ts`): text search matches tag segments and category
  labels and appends Generic covers so the search grid is never empty; a
  selected category chip shows only that category's covers.
- Catalog data (covers + ordered categories) comes from `CoversContext`,
  fed by `GET /api/covers` (generated by `server/cmd/covers-sync` from the
  team Google Drive folder into `server/covers_catalog.json`).
- Also exports `CoverPickerContent` for Create Event hosted sheet content.

Where it is used:

- `CreateEventScreen`

Use it when:

- A flow needs to select an event cover.

### `EventDateTimeModal`

Files:

- `src/components/EventDateTimeModal.tsx`
- `src/components/EventDateTimeModal.styles.ts`

What it is:

- Date/time picker sheet/content for events.
- Also exports `EventDateTimePickerContent`.

Where it is used:

- `CreateEventScreen`

Use it when:

- A flow needs event date/time selection.

### `LocationPickerModal`

Files:

- `src/components/LocationPickerModal.tsx`
- `src/components/LocationPickerModal.styles.ts`

What it is:

- Location search and selection sheet/content.
- Also exports content for Create Event hosted sheet usage.
- Defers autofocus until its containing sheet has settled and hides the empty-input placeholder
  while focused so the Android caret does not render over the first placeholder character.
- Accepts the ISO country code from `useViewerLocation`; autocomplete includes that value only when
  permission and reverse geocoding have resolved it, otherwise it remains available worldwide.

Where it is used:

- `CreateEventScreen`

Use it when:

- A flow needs location selection.

## Event List Foundations

### `EventListLoadState`

File: `src/components/events/EventListLoadState.tsx`

What it is:

- Shared full-page loading and error presentation for event-list screens.
- Owns the centered spinner, accessible error icon and message, and `Try again` action.

Where it is used:

- `HomeScreen`
- `MyEventsScreen`

Use it when:

- An event-list screen must distinguish an uncached initial load or load failure from a genuine
  empty result.
- Keep cached list content visible during background refreshes; callers own the state precedence
  and retry callback.

### `EventListPage`

File: `src/components/events/EventListPage.tsx`

What it is:

- Screen-level wrapper around `EventSectionList`.
- Coordinates top padding, bottom inset, and list wrapper styles.

Where it is used:

- `HomeScreen`
- `MyEventsScreen`

Use it when:

- A full screen or pager page renders event sections.

### `EventSectionList`

File: `src/components/events/EventSectionList.tsx`

What it is:

- Shared section list renderer for event cards.
- Owns section headers, event row press behavior, separators, empty-state wrapper, refresh control,
  footer spacing, and list padding.

Where it is used:

- `HomeScreen` through `EventListPage`
- `MyEventsScreen` through `EventListPage`
- `PastEventsScreen` directly

Use it when:

- Rendering event cards grouped into sections.

### `EventRequestRow`

File: `src/components/events/EventRequestRow.tsx`

What it is:

- Shared join-request row: avatar, name, intro message clamped from measured rendered lines with
  inline "See more"/"See less" controls, and accept/decline actions with loading states.
- Owns action haptics (`submit` accept, `destructive` decline) — callers must not re-trigger.
- Also exports `EventRequestRowSeparator` for the inset divider between rows.

Where it is used:

- `EventDetailsScreen` host Requests tab.
- `OneToOneHubScreen` and the notification-opened `JoinRequestScreen`.
- `PendingRequestsScreen`.

Use it when:

- A host needs to review join requests anywhere in the app.

### `EventMemberRow`

File: `src/components/events/EventMemberRow.tsx`

What it is:

- Shared member row: avatar, name, and an optional trailing "more" menu button or text label
  (for example "Host"). Optional whole-row press.

Where it is used:

- `EventDetailsScreen` Accepted/Members lists, group overlay members, and read-only members.

Use it when:

- Rendering event members or accepted requesters in a list.

### `eventListSections`

File: `src/components/events/eventListSections.ts`

What it is:

- Shared mappers for event-list data.

Exports:

- `toEventCardItem`
- `buildEventSections`
- `buildSingleEventSection`
- `buildEventItemSections`
- `sortEventsByCreatedAtDesc`

Where it is used:

- `HomeScreen`
- `MyEventsScreen`
- `PastEventsScreen`

Use it when:

- A screen needs event cards grouped by date, sorted, or converted into `EventCard` props.

## Feature Shared Components And Helpers

### `NotificationRow`

File: `src/components/NotificationRow.tsx`

What it is:

- Feature row for the Notifications inbox. Owns active unread, read, resolving, and muted inactive
  states, including the `Handled`/`Unavailable` status icon and label, accessibility copy, and press
  haptic (`triggerHaptic('light')`).
- Renders each server-supplied single-row inbox body verbatim, bolding only structured actor/event
  values. Push and inbox copy is finalized by `notificationCopyFor` in
  `server/notification_payloads.go`; collapsed chat/join groups own their aggregate presentation.

Where it is used:

- `NotificationsScreen`

Use it when:

- A notifications-list row is needed. Keep it a feature row (not promoted to `src/components/ui`) until it repeats across screens.

### `SupportSubmissionRow`

File: `src/components/admin/SupportSubmissionRow.tsx`

What it is:

- Admin Support Inbox feature row built from `ScalePressable` and shared text/theme primitives.
- Owns the type, status, urgent-safety, sender, preview, timestamp, press motion, and accessibility
  presentation for a support submission.

Where it is used:

- `AdminSupportInboxScreen`

Use it when:

- Rendering Contact Us or Feedback records in the admin inbox. Keep it feature-scoped; it is not a
  general settings or notification row.

### `HelpForm`

File: `src/components/help/HelpForm.tsx`

What it is:

- Shared help/contact/feedback form layout.
- Composes `TextField`, `CheckboxRow`, and `AppButton`.
- Accepts server-aligned message and reply-email maximum lengths from `src/api/adminHelp.ts`.

Where it is used:

- `HelpContactScreen`
- `HelpFeedbackScreen`

Use it when:

- A help-related screen needs the same message/email/checkbox/submit layout.

### `createEventForm`

File: `src/screens/create-event/createEventForm.ts`

What it is:

- Shared Create/Edit Event form mapper. `createEmptyFormState` accepts a supplied cover key so a
  new Create session can select from the loaded catalog while Edit hydration remains deterministic.
- Keeps payload construction, edit hydration, guest draft mapping, and date normalization out of
  `CreateEventScreen`.

Exports:

- `createEmptyFormState`
- `createFormStateFromEvent`
- `normalizeCreateEventForm`
- `buildCreateEventPayload`
- `buildUpdateEventPayload`
- `buildGuestEventDraft`

Where it is used:

- `CreateEventScreen` (via `useCreateEventForm`)

Use it when:

- Create/Edit Event form state or API payload behavior changes.

### Create/Edit Event screen modules

Files: `src/screens/create-event/`

What they are:

- `useCreateEventForm.ts` — reducer-backed form state built around `CreateEventFormState`
  (fields, location display name, temp picker selections) with `applyFormState`, `resetForm`,
  `applyEventToForm`, `selectLocation`, and `getCurrentFormState`.
- `useCreateEventSheets.ts` — sheet routing state machine (`activeSheet`/`renderedSheet`,
  keyboard-settle timers, `openSheet`/`closeActiveSheet`/`closeSheetImmediately`) and the
  `CreateEventSheet` type.
- `CreateEventHeader.tsx` — fixed title + close button.
- `CreateEventFormFields.tsx` — cover card, name/description inputs, and option rows.
- `CreateEventSubmitButton.tsx` — error row plus shimmer/scale submit button and its loading state.
- `CreateEventSheetContent.tsx` — sheet title (`getCreateEventSheetTitle`) and content switch.

Styling:

- These components intentionally share `src/screens/CreateEventScreen.styles.ts` (single styles
  file for the screen family) and the `createField*` / `createText*` / `createError*` tokens in
  `src/theme/colors.ts`.

Where they are used:

- `CreateEventScreen`, which stays a thin container for shared signed-in/signed-out validation,
  submission, and navigation orchestration (`handleSubmit` / `handlePrimaryAction`). Successful
  creation returns directly to My Events with its existing created badge/confetti.

Use them when:

- Create/Edit Event layout, sheet timing, or form state behavior changes.

### Event Details screen modules

Files: `src/screens/event-details/`

What they are:

- `useEventDetailsData.ts` — event snapshot lookup/sync, conversation lookup, request store keys,
  derived owner/member/request state (`pendingRequests`, `acceptedRequests`, `confirmedMembers`,
  `overlayMembers`, going participants), host request polling, the read-only members fetch, and
  the viewer's intro message fetch. Also exports the `EventDetailsRoute`/`EventDetailsNavigation`
  types and the `EventDetailMember` shape.
- `useEventDetailsActions.ts` — guest/owner actions: join request send/cancel (including the
  sign-in redirect and auto-send-after-sign-in effect), edit, delete, report event, leave, CTA
  press, open chat, and the three-dot `menuItems`. Owns the overlay/prompt visibility state those
  flows drive (invite, report, delete, leave, menu, badges). API failures are mapped to fixed,
  user-safe copy by `eventDetailsErrors.ts`; raw server response bodies are never shown.
- `useHostRequestActions.ts` — host-side request/member actions: accept/decline join requests,
  request row expansion, the member menu, remove member, and report member (confirmation first,
  then the shared report prompt owned by `useEventDetailsActions`).
- `EventDetailsHero.tsx` — blurred background image, dark/light overlays, elevated cover card.
- `EventDetailsInfo.tsx` — title, host line, going avatars stack, detail rows, and the expandable
  description (owns description measurement/expansion state).
- `HostRequestTabs.tsx` — `SlidingTabs` header plus a direction-locked animated two-page pager
  (both pages stay rendered; 280ms slide) for request and accepted/member lists. Horizontal swipes
  change tabs, edge swipes clamp locally, inactive pages do not receive pointer/accessibility
  events, and vertical drags fail early to the outer Event Details `ScrollView`. The Event Details
  stack route disables back-swiping so navigation cannot steal this horizontal gesture.
- `EventDetailsMembers.tsx` — group overlay members list and read-only members list (with
  loading/error states) under a static `SlidingTabs` header (`variant: 'overlay' | 'readOnly'`).
- `EventDetailsCTA.tsx` — pinned Interested/Pending Request and Go to Chat CTAs over the white
  fade gradient.

Styling:

- These components intentionally share `src/screens/event-details/EventDetailsScreen.styles.ts`
  (single styles file for the screen family); hardcoded colors with exact-match tokens were
  replaced (`colors.subText`, `colors.iconColor`, `colors.text`, `colors.inputSurface`,
  `colors.secondaryButtonBackground`, `colors.actionSurface`, `colors.background`,
  `componentTokens.overlay.backdrop`).

Where they are used:

- `EventDetailsScreen`, which stays a thin container: the outer event fetch wrapper plus a content
  component that composes the three hooks, the section components, and
  `EventDetailsOverlayRoutes`.

Use them when:

- Event Details layout, request/member actions, or detail data derivation behavior changes.

### API client and errors

Files: `src/api/client.ts`, `src/api/errors.ts`

What they are:

- `requestJson<T>(path, options)` — the shared way to call the backend. Prefixes the API base
  URL, injects `Authorization: Bearer <token>` when a `token` option is passed, applies a
  default 10s timeout (`timeoutMs: null` disables it), parses JSON tolerantly, and throws a
  typed `ApiError` on non-OK responses with the server-extracted message.
- `fetchImpl` option lets call sites pass `AuthContext.authFetch` so its 401-retry/session-expiry
  semantics are preserved; `errorMessage` (string or `(status) => string`) keeps user-facing error
  strings stable at each call site.
- `ApiError` carries `status` plus optional `code`/`data`; `extractServerErrorMessage` replaces
  the repeated `response.json().catch(() => ({}))` + `data.error` pattern.

Where they are used:

- `EventsContext`, `ChatContext`, `PushContext`, `CoversContext`, `AuthContext` profile calls,
  `useSingleEventMemberActions`.

Use them when:

- Any code calls the backend over HTTP. Do not hand-roll fetch + auth header + timeout + error
  extraction. Raw `fetch` remains only in flows with bespoke semantics (sign-in, WebSocket,
  places autocomplete, status-code-driven Event Details actions).

### Admin help API and hooks

Files: `src/api/adminHelp.ts`, `src/hooks/useAdminAccess.ts`,
`src/hooks/useAdminHelpSubmissions.ts`

What they are:

- Typed transport and snake_case-to-app mapping for help submission creation, admin access, inbox
  pagination, detail reads, and status changes.
- `useAdminAccess` controls Profile menu visibility; it is never the server authorization boundary.
- `useAdminHelpSubmissions` owns filter-aware refresh, cursor pagination, de-duplication, and error
  state without adding a global context for a single admin surface.

Use them when:

- Extending the admin Support Inbox. Keep all sensitive endpoints protected by both session and
  database-backed admin middleware.

### API mappers

Files: `src/api/mappers/events.ts`, `src/api/mappers/chat.ts`

What they are:

- `mappers/events.ts` — `mapApiEventToUserEvent` plus the `ApiEvent`/`UserEvent`/`DateLabel`
  types (re-exported from `@context/EventsContext` for existing imports).
- `mappers/chat.ts` — `normalizeParticipant`, `normalizeJoinRequest`,
  `normalizeConversationEvent`, `normalizeConversation`, and the chat domain types, built on
  typed `Raw*` payload interfaces (snake_case and camelCase fields) instead of `any`.

Where they are used:

- `EventsContext` and `ChatContext`; unit-tested in `src/api/mappers/__tests__`.

Use them when:

- A server payload needs converting to app types. Keep normalization here, not in contexts or
  screens, and extend the `Raw*` adapter types rather than casting.

### `request`

File: `src/api/request.ts`

What it is:

- Shared request timeout and abort helpers.

Exports:

- `createRequestTimeout`
- `isAbortError`

Where it is used:

- `src/api/client.ts` (default timeout inside `requestJson`)
- Custom fetch flows that bypass the client

Use it when:

- A custom fetch flow needs timeout and abort handling without the full client.

### `haptics`

File: `src/services/haptics.ts`

What it is:

- Shared semantic haptics service.
- The only source file that should import `expo-haptics`.

Exports:

- `triggerHaptic`
- `selection`
- `lightImpact`
- `mediumImpact`
- `submit`
- `success`
- `warning`
- `error`
- `destructive`

Where it is used:

- `ScalePressable`
- `AnimatedPager`
- `SheetActionList`
- `EventActionOverlay.prompts`
- `CreateEventScreen`
- `EventDetailsScreen`
- `ChatThreadScreen`
- `MessagesScreen`
- `ProfileScreen`
- `OneToOneHubScreen`
- `JoinRequestScreen`
- `PendingRequestsScreen`
- `OnboardingScreen`
- navigation tab buttons

Use it when:

- A user action needs tactile feedback.

Rule:

- Do not import `expo-haptics` outside this file.

### `logger`

File: `src/services/logger.ts`

What it is:

- Shared dev-only logging service. Forwards to `console` only when `__DEV__` is true.

Exports:

- `logger` (`logger.log`, `logger.warn`, `logger.error`)

Where it is used:

- Contexts (`AuthContext`, `EventsContext`, `ChatContext`, `PushContext`, `CoversContext`)
- Screens and screen hooks (Event Details hooks, Create Event, Chat, Profile, Onboarding, sign-in)
- `App.tsx`, `src/api/config.ts`, `src/services/analytics.ts`, shared components and hooks

Use it when:

- Code needs to report a non-fatal failure for debugging.

Rule:

- Do not call `console.*` directly in app code; use `logger` instead (tests may still spy on
  `console`).

### Startup permission orchestration

Files: `src/context/BloomContext.tsx`, `src/context/PushContext.tsx`,
`src/hooks/useViewerLocation.ts`, `src/screens/HomeScreen.tsx`

What it is:

- `BloomContext.transitionComplete` marks the end of the splash-to-app visual handoff.
- `PushContext.requestPushPermission` owns the explicit notification authorization request; its
  mount effect only registers a token when authorization already exists.
- `useViewerLocation` checks existing location authorization silently and exposes
  `requestPermission` for a deliberate prompt.
- `HomeScreen` waits until Discover is focused and the bloom is gone, then requests notification
  and location authorization sequentially so native dialogs never overlap the splash or each
  other.

Rule:

- Do not request startup system permissions from `App.tsx`, provider mount effects, or the splash
  route. Keep first-time prompts in the post-splash Discover sequence.

## Artwork Palette Exceptions

These files contain brand/artwork palette data and are documented exceptions to the
theme-token rule (the eslint hardcoded-color warning is disabled for them):

- `src/utils/avatar.ts` — avatar color palette
- `src/components/ConfettiOverlay.tsx` — confetti palettes

(`src/constants/covers.ts` was removed from this list when the cover gradient
pairs were deleted with the categorized cover catalog work.)

## Visual References

Screenshots captured during the shared-component review:

| Surface                              | Screenshot                                                      |
| ------------------------------------ | --------------------------------------------------------------- |
| Discover event list and shared tabs  | `report/screenshots/shared-components-discover-event-list.png`  |
| My Events shared tabs and event list | `report/screenshots/shared-components-my-events-tabs.png`       |
| Create Event sheet                   | `report/screenshots/shared-components-create-event-sheet.png`   |
| Help form primitives                 | `report/screenshots/shared-components-help-form.png`            |
| Event action confirmation sheet      | `report/screenshots/shared-components-event-action-confirm.png` |

## Rules For New Work

- Use shared components before adding local UI.
- Add a theme token before repeating a raw color, radius, shadow, spacing value, or component size.
- Shared components should own visual states: default, pressed, disabled, loading, selected, error,
  and destructive.
- Shared interactions should own motion, haptics, accessibility role, accessibility state, and hit
  slop.
- Keep screen components focused on orchestration and composition.
- Keep feature-specific style files next to their component until a pattern becomes broadly shared.
- Keep `AGENTS.md` updated when adding a new shared primitive, token file, helper, or validation
  rule.

## Plan details and input-sheet contracts

- Group member presentation includes the host exactly once, first with a Host label and no moderation menu. Group headline counts and Members lists use the same roster. The 1:1 Accepted list remains requester-only.
- Event Details member reports carry an explicit person target; plan and person prompts must identify the same target as their submit handler. Accepted guests read their intro from More actions, not an inline Introduction section.
- `EventActionConfirm.headerAlign` defaults to left; use center for removal confirmations. Report-plan menu entries use normal text; destructive leaving/removal retains its warning color.
- Shared `BottomSheet` entry waits for native `onShow`, runs once per opening, and does not restart on content or viewport updates. Input sheets constrain height above the keyboard; `EventActionOverlay` keeps the CTA outside the scrollable text-entry body.

## Event shared transition (cover + title)

- `EventSharedTransitionProvider` (`src/components/events/EventSharedTransition.tsx`) owns the single root overlay that flies an event card's cover and title into Event Details. `EventSectionList` primes the card's frames at press-in (before the press scale distorts them), hands `{ imageUri, title, titleStyle, coverRef, titleRef }` to `open`, and passes `sharedCover` through its press callback into the typed Event Details route. Preserve this callback argument in new list entry points. Rows read the stable actions context plus `useEventSharedTransitionState`, and the tapped card hides its own cover and title while its event is `flying` so the elements move rather than duplicate.
- `EventDetailsHero` lands the cover (`land(eventId, 'cover', frame, { rotation })`) and `EventDetailsInfo` lands the title (`land(eventId, 'title', frame, { titleStyle })`). Both hide their duplicate while their event is in flight and keep the resting tilt without replaying `Placed`. The flight starts once the cover has landed and the title has landed or `titleGraceMs` has passed; `landTimeoutMs` releases a tap whose destination never lands.
- The overlays are transform-only. The cover is laid out once at `heroCoverSize` and moved with translate/scale/rotate plus a scale-compensated border radius, so no frame commits a shadow tree or resizes the image view (expo-image re-decodes the bitmap on every resize). The title is a single one-line replica in the Details style that scales from the card's font size from its top-left corner; the Details title stays hidden until hand-off, where the replica is pixel-identical to its first line (revealing it earlier reads as a second copy). Take-off waits for the cover bitmap's `onLoad` or `imageGraceMs`. Never animate `width`, `height`, `top`, or `left` on these overlays; that is what made the original flight stutter. Overlay worklets read only shared values and per-flight constants (the cover target is written to a shared value right before take-off, and the title body mounts only once its frames are known): a closure that changes at landing reaches the UI thread through a React effect, which a busy JS thread delays by several frames.
- Card-origin Event Details wraps its content in `EventSharedTransitionPage`, whose opacity follows the flight progress up to `pageRevealEnd`. `sharedCoverScreenOptions` keeps the stack card transparent and holds the origin list attached for `holdMs`; only the close is a stack fade. Reduced motion fades the page in place without a flight, other entry points keep the slide, leaving the page releases its flight, and a card-origin open whose event is not cached (Past Events) releases the flight and fades its loading fallback in.
- `eventSharedMotion` in `src/theme/motion.ts` owns every duration, deadline, and radius; `heroCoverWidthFraction` is shared with the hero styles. Keep the overlay outside the stack so list clipping and screen transforms cannot clip the moving elements.
