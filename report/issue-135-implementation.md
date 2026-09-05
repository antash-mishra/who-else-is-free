# Issue 135 implementation

Branch: `codex/issue-135-plan-details`  
Base: `a7e4907cb84a34f810147f33b4d0652191dfc63d`  
Issue: <https://github.com/antash-mishra/who-else-is-free/issues/135>

## Implemented

- Person reports carry an explicit target instead of a fabricated join request. The form names that person; submission still uses the member-report endpoint. Event changes remount detail state to clear previous targets.
- Group header counts and Members lists use one host-inclusive, deduplicated roster. The host appears first with a Host label and no moderation action, including before chat creation. Singular/plural labels use Member/Members. The 1:1 Accepted list remains requester-only.
- Accepted guests read their intro through More actions; the inline Introduction section is removed. The intro sheet uses regular text.
- Joined menus put Report plan second and Leave plan third. Report plan uses normal text in all its menu states; Leave remains destructive.
- Confirmation buttons say Remove and Report & block. Removal titles/descriptions are centered through a scoped shared-component option.
- Input sheets cap their height above the keyboard and keep submit buttons outside scrollable input content. Short input does not expand the scroll region to fill the screen.
- Shared sheet entry waits for native onShow, starts once, and no longer restarts on content/geometry updates. Reopening during dismissal cancels the pending unmount.

## Verification

- Reproduced the initial UI failures with focused red tests before production fixes. Existing expectations for inline intro and Joined counts were deliberately updated for the requested contract.
- Final `npm test -- --runInBand --silent`: **93 suites, 1,304 tests passed**.
- Final `npm run typecheck`: passed.
- Final `npm run lint`: passed with **0 errors, 791 warnings**; existing repository warnings remain.
- `npm run format:check`: failed on 114 files in the repository formatting backlog. All changed files were formatted and checked separately; unrelated formatting was preserved.
- `git diff --check`: passed. Complete code and test diff reviewed.
- Backend tests not run; no backend code changed.

## Native QA

Android emulator verification completed on 2026-09-05 against commit `005470e3` (AVD `WEIF_API_36`, API 36; see `TEST_RUNS.md` for the flows and `report/issue-135-assets/` for screenshots). Every issue item passed on device except the intermittent horizontal Event Details slide, which was not reproduced and stays open. iOS was not checked.

Earlier attempts on another checkout were blocked (missing `google-services.json`, unresponsive development client); those notes remain in `TEST_RUNS.md`. The shared-sheet entry fix is a separate finding from the horizontal-slide report and is not proof that it is resolved. No production deployment or issue closure was performed.
