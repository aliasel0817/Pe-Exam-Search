# R10 — six always-visible bottom navigation functions + direct AGPL notice

**Project:** Pe-Exam-Search / Issue #45.
**Source basis:** production main `3b840f26c48ac289a0fcbe2dade005998dc6aef2`.
**Device:** DESKTOP-5H5J4TU.
**Independent branch:** `fix/nav-six-visible-source-notice-20261104`.
**Independent directory:** `E:\Professional_Engine\Download\Development\Pe-Exam-Search_nav_notice_r10_20261104`.

## User requirement / result

The existing five direct navigation controls remain in this exact order:
`▲ 위 / ← 이전 / ☰ 목록 / 다음 → / ▼ 아래`.

The existing R4/AGPL copyright notice is now a **sixth directly visible**
`ⓘ 고지` item inside the same `#bottomNavActions` bar.
It is intentionally **not** hidden behind generic `더보기` because AGPLv3
section 13 asks for a prominent offer of Corresponding Source to network users.

Selecting `ⓘ 고지` expands a small popover **above** the same bar with
the pre-existing original AGPL text, third-party attribution URL and immutable
Corresponding Source URL. It no longer creates the old independent
`position:fixed; bottom:12px` button that collided with topic navigation.

The legacy optional navigation collapse control stays functional. Even after
the user collapses topic-navigation actions, the direct copyright/source
`ⓘ 고지` remains accessible and visible. Narrow devices (<=350px) lay
the 6 functional actions out in two rows, rather than clipping or hiding them.
The content bottom padding is extended for that narrow case and iPhone
safe-area remains accounted for.

The `☰ 목록` control is now visible on desktop as well as mobile.
Its original handler `openSidebar` is **unchanged**. Prev/next, top/bottom,
sidebar, PDF rendering/annotation, existing auth and server endpoints
are untouched.

## Exact source modifications

- `study-note/study-note.html`: desktop/mobile list visibility, docked
  notice mount option, 6-control responsive CSS + collision-free popover.
- `study-note/mupdf-migration/r4/r4-license-notice.js`: additional
  `docked:true` mounting mode. Original standalone R4/loopback default
  is preserved. Direct source/AGPL/notices links and accessible summary
  label retained; Escape and outside taps dismiss.
- `study-note/mupdf-migration/r10/tests/r10-nav-notice.test.cjs`:
  original five IDs + 6th direct notice, release source, preexisting R4
  fallback behavior and narrow mode.
- `study-note/mupdf-migration/r10/tests/r10-nav-browser-smoke.cjs`:
  actual Windows Chrome 156 UI layout at 1440, 768, 402, 375 and
  320 widths. Backend requests are blocked and no user data is loaded.

## Executed verification

- R4 + M7 + R10 static: **15/15 PASS**. The prior M7 strict HTML
  byte-equivalence guard is retained; it removes only the precisely marked
  R10 navigation CSS and `목록` visibility change before comparing all other
  bytes to the original reference.
- Real **Windows Chrome 156.0.8078.49**: all six visible without
  intersection, notice open/close, official source/AGPL/notices links,
  escape-close, and source visibility and panel bounds even when nav collapsed:
  **PASS** at all five viewport sizes. Mobile sizes are **emulations**, not
  physical Galaxy Tab S11 / iPhone Safari.
- Original bottom navigation scroll/collapse regression: **PASS** at
  320/390/820/1280px, with previous/next, list drawer, top/bottom and
  saved collapse state preserved. The one historical expectation that the
  entire actions container becomes `display:none` is updated: R10 keeps
  the container visible to keep the AGPL link prominent while hiding only
  the five topic actions in collapsed mode.
- Full synthetic topic-visibility browser regression: **56/56 viewport/topic
  scenarios PASS**, including 150/200/250% font sizes and iPhone safe-area
  simulation. At <=350px, the original flex navigation behavior is preserved
  with wrapping and an extra bottom reading margin to avoid text overlap.
- Real backend requests intercepted/blocked; application data writes **zero**.
- No LIVE MASTER, Apps Script, source PDFs/images/annotations/keys changed.

## Operational boundary

This work does **not** authorize or itself execute a new operating
`main` merge, GitHub Pages deployment or Apps Script change.
Deliver only an isolated review PR until the user explicitly authorizes
main merge and deployment for this **R10 interface change**.

## AGPL UI rationale

GNU AGPLv3 section 13 (official): https://www.gnu.org/licenses/agpl-3.0.html
The requirement is a prominent offer of the Corresponding Source, not
a mandated number of interface buttons. `ⓘ 고지` in the existing
user-visible navigation is clearer than a `더보기` submenu and preserves
the immediate source access without occlusion.
