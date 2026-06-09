# CLAUDE.md

Guide for Claude and other coding agents working in this repository.

Follow `AGENTS.md` first. This file mirrors the essentials for Claude-oriented workflows.

## Project

Who Else Is Free is an event discovery and social coordination app.

- Frontend: React Native Expo app in `src/`
- Backend: Go Gin server in `server/`
- API: REST plus WebSocket chat at `/api/ws`
- Navigation: React Navigation stack and bottom tabs in `src/navigation`
- State: React Context providers for auth, events, chat, push, covers, and bloom state

## Working References

- Repo working rules: `AGENTS.md`
- Shared components and shared styling catalog: `report/shared-components-refactor-guide.md`
- Refactor roadmap: `report/code-refactoring-consistency-plan.md`
- Performance reports: `report/performance-consistency-audit.html` and `report/performance-baseline.html`

Before adding or refactoring UI, read `report/shared-components-refactor-guide.md`. It explains what each shared component is, where it is used, and which theme/style files act as shared CSS.

## Working Agreement

- Preserve behavior unless the task explicitly asks for behavior change.
- Prefer existing shared components, hooks, services, API helpers, and theme tokens before adding local code.
- Keep screens focused on composition, state orchestration, and navigation.
- Move repeated UI, data mapping, payload construction, request helpers, haptics, and action behavior into shared components/helpers.
- Refactor one user-visible area at a time.
- Do not mix structural refactors with performance optimization unless explicitly asked.
- Do not remove user changes or unrelated untracked files.
- Update `AGENTS.md`, `CLAUDE.md`, and relevant report docs when conventions, validation commands, shared primitives, or architectural rules change.

## Shared Components And Styling

Treat "shared CSS" in React Native as:

- theme tokens in `src/theme`
- shared component-owned styles
- feature-level `.styles.ts` files for complex component-local styling

Use shared primitives before local UI:

- UI primitives: `src/components/ui`
- Sheets: `src/components/sheets`, `BottomSheetHostProvider`, `BottomSheetModal`, `CreateEventBottomSheet`
- Event lists: `src/components/events`
- Empty states: `EmptyState`
- Press motion and haptics: `ScalePressable`, `src/services/haptics.ts`
- Create/Edit Event mapping: `src/screens/create-event/createEventForm.ts`
- API timeout helpers: `src/api/request.ts`

Modal bottom sheets should use `BottomSheetModal` so they are coordinated by the shared host and do not stack sibling native modals on iOS. Keep `CreateEventBottomSheet` for inline Create/Edit Event sheets.

Do not import `expo-haptics` outside `src/services/haptics.ts`.

## Commands

Frontend:

```sh
npm start
npm run android
npm run ios
npm run web
npm test
npm run typecheck
npm run lint
npm run format:check
```

Backend:

```sh
cd server && go run .
cd server && go test ./...
```

`npm run lint` currently has an existing warning baseline. Do not add new warnings casually; reduce the baseline when touching files.

## Validation

For frontend changes:

- Run the narrowest relevant Jest test first: `npx jest <path-or-pattern> --runInBand --silent`
- Run `npm run typecheck` for TypeScript refactors.
- Run broader tests when changing shared components, navigation, contexts, or API helpers.
- Use Prettier on touched files rather than formatting the whole repo unless the task is a formatting pass.

For visual or interaction changes, smoke test on the connected mobile app/emulator:

- Discover
- My Events
- Create Event
- Messages
- Profile
- Event Details
- Bottom sheets and action menus
- Back navigation

## Import And Type Rules

Import order:

1. React imports.
2. React Native imports.
3. External library imports.
4. Internal alias imports.
5. Relative imports.

Prefer aliases when available:

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

Keep route params typed in `src/navigation/types.ts`. Avoid `navigation as any`, `props: any`, and new broad `any` casts.
