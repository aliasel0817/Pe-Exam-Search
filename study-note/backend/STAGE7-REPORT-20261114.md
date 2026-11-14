# 학습노트 다중 기기 학습계획 동기화 — Stage 7 통합검수 결과

기준: 2026-11-14 KST | 상태: **운영 출시 BLOCKED** | 범위: 독립 합성 서버/클라이언트 자동검사 및 격리 후보 코드 최소 보완

## 1. 기준선 및 범위

- GitHub main 최신 확인: `56bf0901ee7a7d8e41165a90d6b65e41893f8ee3` (Stage7 시작 기준, PR #81 병합 뒤).
- PR #82 / #83 / #84 / #85 / #86 / #87: 모두 open Draft, 미병합.
- PR #85 head `a3f1b26267494a5322edf847d2ccfa53a6357bd1`, PR #86 head `d1236116244fc66cf6f5da2ccf6e37728d3b78cc`, PR #87 head `272eb580a992e340ab64180cf0e23ca934d0458b`.
- Stage7 branch `test/planner-sync-stage7-integration-20261114-2107`, Draft PR #88 stacked on #87.
- Stage3 independent server in PR #84 HEAD `9d063ae9e08f0c70534193bb4571cb9c65cebf7f`; Stage7 copies and minimally fixes this server candidate in **its own PR only**, leaving PR #84 unchanged. Stage8 must explicitly reconcile both versions; naive merging is unsafe.
- Actual GitHub Pages live HTML/JS network read could not be performed in this session (cache miss/access denied). Pages deployment bytes/behavior **UNVERIFIED**.
- Actual Apps Script deployment version, isolation spreadsheet ID, Script Properties, ACTIVE/HMAC/nonce running integration **UNVERIFIED**.
- Remote DESKTOP-5H5J4TU listed online but terminal attempts failed `spawn EPERM`; no remote filesystem/process changed. Other chat ownership unknown and protected.
- No main merge, GitHub Pages deployment, Apps Script deployment or production data access.

## 2. Work performed

| File | Change |
|---|---|
| `study-note/backend/planner-sync-stage3-isolated.addon.gs` | Stage3 candidate copied into isolated Stage7 branch; add single `DAY` multipart round consistency guard in `PS3_snapshot_` |
| `study-note/tests/test_planner_sync_stage7_integration.cjs` | New pinned Stage3 in-memory server + Stage6 client integration, 19,060-slot SHA-256 roundtrip, CAS/operationId/todo/highWatermark, invalid multipart round rejection |
| `.github/workflows/planner-sync-stage7-integration.yml` | GitHub Actions pinned Stage3 SHA and Stage7 candidate cross-branch synthetic job |
| `study-note/backend/STAGE7-REPORT-20261114.md` | This explicit evidence, scope and release gate report |

Original `study-note/study-note.html`, `study-note/service-worker.js`, existing MuPDF/PDF/assets/ink, original authenticated production backend and `LIVE MASTER` were not changed in this PR.

## 3. Tests A–E with strict boundaries

| Area | Test | Result |
|---|---|---|
| A | Stage3 isolated in-memory server API begin/put/commit, GET plans/schedule/progress, save progress | **PASS (Node synthetic)** |
| A | Real isolated Apps Script deployment, HMAC, nonce reuse, request time expiry and ACTIVE trust device end-to-end | **UNVERIFIED; release BLOCKED** |
| B | Original Stage5 fake-indexeddb backup/hash/3-way conflict/replay safe first-migration prior CI evidence | **PASS (prior synthetic run at d16b54b); not re-executed as Stage7** |
| B | Cross-branch operationId replay, progress CAS hold, explicit todo event | **PASS (Node synthetic)** |
| B | Independently hosted PC/tablet/mobile full first migration, physical backups | **UNVERIFIED; user data untouched** |
| C | 100 days × 5 rounds, 3,812 unique topics, 19,060 entries; Stage3 server/client SHA roundtrip | **PASS (Node VM synthetic)** |
| C | Multipart day round tamper guard after minimal server fix | **PASS (Node VM synthetic)** |
| C | Real GAS/Sheets throughput, concurrent LockService, quotas, 19,060 real rows | **UNVERIFIED; release BLOCKED** |
| D | Existing Stage4/5/6 prior workflow checks at `d16b54be...` | **PASS (historical CI evidence only)** |
| D | Full latest legacy records, MASTER, MuPDF, PDF/attachment/ink/auth/service-worker live Chromium E2E | **UNVERIFIED** |
| E | 1366/768/390 synthetic browser layouts from Stage6 prior CI | **PASS (historical CI evidence only)** |
| E | Latest Stage7 independent 1366/768/390 real-device/browser accessibility regression | **UNVERIFIED** |

No claim of real Apps Script, authenticated integration, network multi-device synchronization, or real-device acceptance from this test.

## 4. Stage7 CI proof and measured synthetic metrics

- GitHub Actions workflow `Planner Sync Stage7 Cross-Branch Synthetic Integration`
- Initial run #43595240851 FAIL: CI runner tried `node --check` directly on a `.gs` extension (unsupported); fixed workflow to syntax-check stdin. No product code impact.
- Verified later run **#43595285001**, job **132448350692**: **SUCCESS** on the Stage7 candidate after workflow fix.
- Baseline output `STAGE3_SYNTHETIC_PASS`: 100 days, 19,060 slots, 101 chunks, 360ms mock runtime.
- Stage7 combined output `STAGE7_CROSS_BRANCH_SYNTHETIC_PASS`:
  - days: 100, uniqueTopics: 3812, slots: 19060, chunks: 101
  - protocol logical request counts: begin=1, put=9, commit=1, plan/progress GET=5, progress POST=4
  - POST JSON total (instrumented): 404,512 bytes; largest one POST: 48,323 bytes
  - mock in-memory time: 449ms; **not a Google Sheets/GAS latency estimate**
  - canonical plan SHA roundtrip, schedule page retrieval, duplicate operation ACK, CAS conflict, explicit todo tombstone, pinned highWatermark, invalid round-part rejection, basic inactive device guard all PASS in simulation.
- The Stage7 additional check proves server candidate and actual client JSON contract agreement **only in Node VM with simulated SpreadsheetApp**. It does **not** prove HMAC/nonce correctness.

## 5. Defect/fix reasoning

`PS3_snapshot_` originally validated `partCount` and duplicate `partIndex` per DAY group but did not compare the `round` attribute across same-day parts. A crafted multipart DAY upload with unchanged payload and canonical SHA but divergent part round could have passed commit, producing a server snapshot the client rejects. Stage7 adds equality check for `g.round` and each `r[5]` on DAY parts and tests the rejection with a 700-topic multipart synthetic DAY. This is an isolated candidate-only change, not an operating server patch.

The CI `.gs` syntax extension failure was a test-runner configuration issue, remedied by `node --check < file.gs`, with successful full rerun.

## 6. Data, security and remote-process preservation

- GitHub repository only: new Stage7 dedicated branch/PR; no production main mutation.
- No operational Google Apps Script/Script Properties/Google Sheets reads/writes through this work.
- No LIVE MASTER, learningStates, study plans/progress, device backups/restores, authenticated secrets, PDF/ink changes.
- No remote process killed or modified. EPERM prevented remote execution; therefore remote working tree state and concurrent chat edits remain **UNVERIFIED**, not PASS.
- Cannot assert mutable production data byte-for-byte parity without access; changes by Stage7 to those systems = none.

## 7. Release blockers

**BLOCKED** until independently validated:
1. Actual separately deployed test Apps Script with isolated Google Sheets and verified identity, authenticated host routes HMAC, nonce replay and request time expiry, ACTIVE/inactive trusted-device boundaries.
2. Actual 19,060-slot test upload/read/rollback with Google Sheets and Apps Script runtime/size/quota/LockService measurements; valid handling of failures and concurrent operations.
3. Full legacy study-info + PDF/MuPDF/assets/ink/auth/service worker current regression in browser.
4. Three viewport checks and user physical device checks clearly separated from synthetic profiles.
5. Stage3 server candidate PR #84 and Stage7 fixed version reconciled, merge order and dependency conflict verified; no implicit production changes.
6. Explicit user approval for separate Stage8 production release, separate real-device full backups and human-reviewed first migration. No automatic real data migration.

**Stage8 may prepare release checklists, but operational launch is not authorized until all gates PASS and user explicitly approves.**
