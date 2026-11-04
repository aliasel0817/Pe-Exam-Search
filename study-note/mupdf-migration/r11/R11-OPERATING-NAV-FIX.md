# R11 — Missing five topic controls / source notice docking fix

Date: 2026-11-04 (Asia/Seoul), independent Windows checkout at
`E:\Professional_Engine\Download\Development\Pe-Exam-Search_nav_notice_r11_20261104`.

## Production incident and exact root cause

The user's production desktop screenshot showed the standalone bottom-right
`오픈소스 고지` while all five navigation actions were absent. Verified:
- PR #70 with the docked R10 six-control layout was still a Draft, **not
  merged** to production `main`; production was still the previous R9 tree.
- The existing `peStudyNote.bottomNavCollapsed.v1` localStorage flag loaded
  `1` on subsequent visits and hid the five navigation actions.
- Historical R10 Chrome test silently removed `nav-collapsed` from the DOM
  before checking the buttons, masking this exact issue.

## Fix

- Include the already validated cumulative R10 `ⓘ 고지` dock integration:
  `▲ 위 / ← 이전 / ☰ 목록 / 다음 → / ▼ 아래 / ⓘ 고지`, all visible.
- R11 starts each page expanded, regardless of any old localStorage value.
  Manual collapse remains available within the current page only and does
  not persist. Every topic selection automatically re-expands the bar.
- Keep direct AGPL source, full license and third-party notices available
  within the bar rather than an overlapping independent fixed widget.
- Restore an actionable test: inject a real saved `=1` collapsed state in
  actual Chrome **before page load**, verify six visible controls and no
  overlap on five viewport sizes (1440, 768, 402, 375, 320), then collapse
  and reload and confirm the controls reappear.
- Preserve M7 strict byte-equivalence test by stripping **only** documented
  R10/R11 UI deltas; preserve signed GET, schema3 annotations, fallback and
  all data, algorithms and authentication unchanged.

## Verification (test environment, not live production until deployment)

- Windows Chrome 156 R10 six-control browser QA: **PASS** five viewports with
  old persisted collapsed flag set, notice popover and source links, reload,
  no JavaScript errors, zero operational writes.
- Windows Chrome 156 synthetic topic navigation QA: **PASS** 320, 390, 820
  and 1280 widths, old flag ignored on reload, correct prev/next/list/
  top/bottom, long-scroll content not obscured.
- M7 strict HTML schema/source test: **4/4 PASS**.
- Earlier R10 R4 tests: unchanged and reused. Real Tab S11 and iPhone Safari
  must remain **NOT VERIFIED** until tested on physical devices.

Operating approval was previously explicitly given for the same R10 navigation
change. This independent R11 release follows that authorization with backup,
single cumulative PR, CI, main/Pages verification and no Apps Script changes.
