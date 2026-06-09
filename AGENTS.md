# AGENTS.md

Project guide for coding agents and contributors working in this repository.

## Keep This File Updated

- Update this file whenever project conventions, folder structure, validation commands, shared primitives, or architectural rules change.
- If a refactor introduces a new preferred component, hook, service, API helper, or theme token, document the new rule here in the same change.
- If a command stops working or a new validation gate is added, update the commands below.
- Keep this file concise and practical. It should describe how to work in the repo, not every implementation detail.

## Working References

- Shared components and shared styling catalog: `report/shared-components-refactor-guide.md`.
- Refactor roadmap and rationale: `report/code-refactoring-consistency-plan.md`.
- Performance reports: `report/performance-consistency-audit.html` and `report/performance-baseline.html`.
- Mobile QA history reports belong in `report/`; keep QA history separate from evergreen component/style references.

Read `report/shared-components-refactor-guide.md` before adding or refactoring UI. It explains what each shared component is, where it is used, and which theme/style files act as shared CSS.

## Working Agreement

- Preserve behavior unless the task explicitly asks for behavior change.
- Prefer the existing shared component, hook, service, API helper, or theme token before creating a local implementation.
- Treat "shared CSS" in React Native as `src/theme` tokens plus shared component-owned styles.
- Keep screens focused on composition, state orchestration, and navigation. Move repeated UI, data mapping, and side-effect helpers into shared components/hooks/helpers.
- Refactor one user-visible area at a time and avoid mixing structural refactors with performance optimization unless the task asks for both.
- When a change introduces or changes a shared primitive, token, helper, validation command, or architectural rule, update `AGENTS.md`, `CLAUDE.md`, and the relevant report reference in the same change.
- Do not remove user changes or unrelated untracked files.

## Build And Run Commands

- Frontend dev server: `npm start`
- Android app: `npm run android`
- iOS app: `npm run ios`
- Web app: `npm run web`
- Frontend tests: `npm test`
- Frontend typecheck: `npm run typecheck`
- Frontend lint: `npm run lint`
- Format all files: `npm run format`
- Check formatting: `npm run format:check`
- Backend server: `cd server && go run .`
- Backend tests: `cd server && go test ./...`

`npm run lint` currently exits green with a warning baseline for existing import order, hardcoded colors, `any`, hook, and unused-code debt. Do not add new warnings casually; prefer reducing the baseline as files are touched.

## Architecture

- Frontend: React Native Expo app in `src/`, with root app setup in `App.tsx` and root registration in `index.ts`.
- Backend: Go Gin HTTP server in `server/` using SQLite.
- API: REST endpoints plus WebSocket chat at `/api/ws`.
- Navigation: React Navigation stack and bottom tabs in `src/navigation`.
- State: React Context providers currently handle auth, events, chat, push, covers, and bloom state.
- Theme: shared tokens live in `src/theme`, including colors, spacing, typography, springs, radii, shadows, layout, and component tokens.
- Shared UI primitives live in `src/components/ui`; use them before adding local button, icon button, text field, checkbox, separator, section header, or tab implementations.
- Shared sheet primitives live in `src/components/sheets`; use `BottomSheetHostProvider` for modal-sheet coordination and `BottomSheet`, `SheetHeader`, and `SheetActionList` for sheet surfaces and action menus before adding local sheet chrome.
- Modal bottom sheets should go through `BottomSheetModal` so iOS uses the shared host instead of stacking sibling native modals. Keep `CreateEventBottomSheet` for inline Create/Edit Event sheets.
- Shared event-list primitives live in `src/components/events`; use `EventSectionList`, `EventListPage`, and `eventListSections` helpers before duplicating event card lists or date grouping in screens.
- Shared component/style documentation lives in `report/shared-components-refactor-guide.md`; update it when shared components, shared style files, or theme-token ownership changes.
- Create/Edit Event form mapping lives in `src/screens/create-event/createEventForm.ts`; keep payload construction, edit hydration, guest draft mapping, and date normalization there instead of rebuilding them in `CreateEventScreen`.
- Shared request helpers live in `src/api/request.ts`; use them for repeated API timeout and abort-error handling instead of duplicating request infrastructure inside contexts.
- Haptics are centralized in `src/services/haptics.ts`; no other source file should import `expo-haptics`.
- Keep navigation route params typed in `src/navigation/types.ts`; use `NavigatorScreenParams` for nested navigators and avoid `navigation as any` casts for route jumps.
- Navigation-specific surfaces and status colors should use named tokens from `src/theme/colors.ts`, not local hex or rgba literals in `AppNavigator`.
- Tests: Jest tests live near source files under `__tests__`.

## Import Rules

Use this order:

1. React imports.
2. React Native imports.
3. External library imports.
4. Internal alias imports.
5. Relative imports.

Prefer aliases over deep relative paths when an alias exists:

- `@components/*`
- `@screens/*`
- `@navigation/*`
- `@theme/*`
- `@hooks/*`
- `@utils/*`
- `@context/*`
- `@api/*`
- `@services/*`
- `@assets/*`
- `@constants/*`

Keep aliases aligned across `tsconfig.json`, `babel.config.js`, and `jest.config.js`.

## TypeScript Rules

- Strict TypeScript is expected.
- Use interfaces or named types for component props, hook return values, context values, and API payloads.
- Avoid `any`. If external data is unknown, isolate parsing/casting in adapter or mapper files.
- Keep navigation params typed in `src/navigation/types.ts`.
- Do not spread `navigation as any` or `props: any` into new code. Add proper route/screen types instead.
- Prefer pure mapper functions for API payload conversion.

## React Native Component Rules

- Use functional components and hooks.
- Keep screens as composition layers. Move reusable UI, data derivation, and actions into components/hooks.
- Prefer shared primitives over duplicating local UI:
  - buttons
  - icon buttons
  - text fields
  - checkbox rows
  - empty states
  - list separators
  - section headers
  - sheets
  - tabs/segmented controls
  - event rows and member/request rows
- If two UI elements look like the same interaction, they should use the same component or hook so styling, animation, haptics, accessibility, loading, and disabled behavior stay consistent.
- Local one-off animation is allowed only for genuinely unique screen moments, not for common buttons, cards, tabs, sheets, menus, or CTAs.

## Styling And Theme Rules

- Prefer tokens from `src/theme` over raw values.
- Do not introduce new hardcoded colors, radii, shadows, spacing, button heights, or overlay opacity unless there is a specific reason.
- Add missing tokens before spreading a new repeated value across screens.
- Use `src/theme/radii.ts`, `shadows.ts`, `layout.ts`, and `components.ts` for repeated radius, shadow, screen padding, hit slop, z-index, button, input, icon, avatar, overlay, and segmented-control values.
- Shared components should own their visual states: default, pressed, disabled, loading, selected, error, and destructive.
- Keep brand-specific or screen-specific tokens named and centralized.
- Treat "shared CSS" in React Native as shared theme tokens plus shared components.
- Use feature-level `.styles.ts` files for complex component-local styling that is not broadly reusable yet. If a style pattern repeats across features, promote it to a theme token or shared component.

## Motion And Haptics Rules

- Shared UI components should own their motion and feedback behavior.
- Use semantic helpers from `src/services/haptics.ts` for feedback such as `selection`, `light`, `submit`, `success`, `warning`, `error`, and `destructive`.
- Do not import `expo-haptics` outside `src/services/haptics.ts`.
- Repeated interactions should share animation constants or component-level motion tokens.
- Bottom sheets, action menus, buttons, cards, tabs, and CTAs should feel consistent across the app.

## State And API Rules

- Keep API transport and payload normalization out of screen components.
- Prefer shared API helpers for auth headers, JSON parsing, timeout handling, and error handling once they exist.
- Keep context providers focused on state orchestration, not large transport implementations.
- Split large contexts by data/actions when high-churn state causes broad rerenders.
- Avoid navigation side effects inside contexts unless there is no practical alternative.

## Refactoring Rules

- Preserve behavior unless the task explicitly asks for behavior change.
- Refactor one user-visible area at a time.
- Start with low-risk shared foundations before large screen rewrites.
- Keep route names and navigation params stable during UI extraction.
- Do not combine structural refactors with performance optimizations unless the task asks for both.
- When extracting a component, move only the code required for that component and keep tests passing.
- Prefer mechanical extraction first, then cleanup.
- Do not remove user changes or unrelated untracked files.

## Current Refactor Plan

The working refactor roadmap is documented in:

- `report/code-refactoring-consistency-plan.md`
- `report/shared-components-refactor-guide.md`

Use that plan for ordering:

1. Guardrails and tooling.
2. Theme tokens.
3. Shared UI primitives.
4. Semantic haptics and pressables.
5. Sheet and overlay consolidation.
6. Event list refactor.
7. Event Details decomposition.
8. Create/Edit Event form refactor.
9. API client and context boundaries.
10. Navigation cleanup.
11. Final consistency pass.

Completed so far: guardrails/tooling, expanded theme tokens, shared UI primitives, semantic haptics/pressables, sheet/action overlay foundations, shared event-list foundations, Event Details overlay-route extraction, Create/Edit Event form mapping helpers, shared API request timeout helpers, typed nested navigation params, navigation color token cleanup, and mobile layout/accessibility fixes for the shared foundations.

## Testing And Validation

For frontend changes, run the narrowest relevant test first, then broader validation when the change has shared impact.

Recommended commands:

- Targeted Jest test: `npx jest <path-or-pattern> --runInBand --silent`
- Full frontend tests: `npm test -- --runInBand --silent`
- Frontend typecheck: `npm run typecheck`
- Frontend lint: `npm run lint`
- Format check: `npm run format:check`
- Backend tests: `cd server && go test ./...`

Run `npm run typecheck` for TypeScript refactors. For formatting, the full repo still has a legacy formatting baseline; use Prettier on touched files and avoid whole-repo formatting churn unless the task is explicitly a formatting pass.

For visual or interaction refactors, manually smoke test on the connected mobile app/emulator:

- Discover
- My Events
- Create Event
- Messages
- Profile
- Event Details
- Bottom sheets and action menus
- Back navigation

## Known Quality Gates To Improve

- Reduce lint warning baseline.
- Establish a green full-repo format baseline without mixing it into behavior refactors.
- Keep direct haptic imports restricted to `src/services/haptics.ts`.
- Reduce hardcoded style values outside theme.
- Reduce large screen/context files.
- Remove avoidable `any` casts.
- Consolidate repeated sheet, tab, button, list, and action-menu implementations.

## Backend Notes

- Keep backend changes inside `server/` unless frontend API types must be updated too.
- Run `cd server && go test ./...` after backend changes.
- Keep endpoint behavior and payload shape documented in frontend mappers when they are introduced.
