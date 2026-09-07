# Animation repair — current status

Updated 7 September 2026. See the [full report with measurements, screenshots and recordings](performance-report.md).

Implementation and emulator verification are complete for this repair iteration. The broader smoothness acceptance plan remains open: frame results are mixed, and the exact user-reported failure after 40 seconds was not reproduced.

- Existing shared transition and splash preserved.
- Creation navigation/reconciliation, badge sequencing, shared-flight lifecycle, press/shimmer cleanup, image cache policy and idle confetti resource use repaired.
- Main measurement matrix: two baseline/candidate pairs, six scenarios, 144 inspected destination screenshots. Keyboard: 32 inspected screenshots. Earlier shared ageing/repetition: 54 inspected destinations.
- Final automated validation: 117 suites / 1,425 tests passed; typecheck passed; lint zero errors / 774 existing warnings; Android release build passed.
- No app-wide 60 FPS, guaranteed improvement percentage, physical-phone or iOS pass is claimed. Group-sheet opening regressed in the measured candidate.

Raw comparison data and method limitations are in the full report. Local measurement APKs target an emulator-only backend and are **not** phone release builds. Temporary native manifest changes were restored after building.
