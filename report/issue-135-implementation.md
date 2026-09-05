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

## Native QA limitation and remaining work

A fresh Android build was attempted with `npx expo run:android --port 8087 --no-bundler`; prebuild failed because this checkout has no ignored `google-services.json`. An isolated synthetic sheet harness bundled successfully into the installed development client, but the emulator app became unresponsive and subsequent launch did not expose usable controls. The harness and temporary entry-point changes were removed, and its Metro process was stopped.

The intermittent **horizontal Event Details slide** was not reproduced or changed speculatively. The verified shared-sheet entry defect above is a separate finding, not proof that the horizontal-slide report is resolved. Native checks of keyboard/footer geometry and repeated navigation on iOS and Android remain required before closing issue 135. No production deployment or issue closure was performed.
