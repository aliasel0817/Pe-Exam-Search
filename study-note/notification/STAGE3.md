# Stage 3 — Kakao OAuth, guarded transport, host and settings UI candidate (NO DEPLOY)

## Source scope
Builds on stages 1–2 in the existing Draft PR #104. No production entry points or MASTER records changed. No real token, app registration, live send, OAuth callback route, actual authenticated API, private workbook creation or trigger installation.

New:
- study-notification-kakao.js: server-only authorization-code flow, one-use expiring state bound to verified session, app/account/talk_message consent validation, explicit account confirmation, separate arm gate, refresh and rotated-token persistence, fixed self-message endpoint, 200-character text template, local daily/monthly total-attempt budget, one-second pacing, final deadline/source check, local disconnect and conditional remote unlink. Same account remains bound after disconnect; switching accounts needs explicit future owner-reviewed reset.
- study-notification-kakao-gas.gs: private Script Properties vault candidate, dedicated-project marker, readback, HMAC-derived state using a separately provisioned strong secret, fixed HTTPS allowlist and no redirects. No actual GAS runtime test. Script editors can access properties; restrict the dedicated project. Host must provide one shared lock. No nested lock.
- study-notification-host.js: single configured owner and exact target plan ID/name, verified signed-request adapter contract, shared transaction, CAS settings, disarm before writes, verified plan/consent/explicit release gates, source preview, status and scheduler-only tick. No actual production verifier/route or trigger. Browser must never supply trusted context.
- study-notification-panel.js: explicit mount with injected authenticated transport, exact verified cloud plan selection, 8 fields, interval/order, save/CAS refresh, stop even when plan unavailable, preview, connection/disconnection and test button gates, counts. No automatic network or production mount.
- study-notification-preview.html: synthetic-only local demo and smoke assertions, no real send capability.
- study-notification-stage3.test.cjs: synthetic OAuth, quota, guards, host and selection assertions.

Changed isolated stage-2 files:
- service: pending state for certified not-attempted requests, final plan/time/source guard, per-request deadline, source eligibility and current-assignment status filtering. Unknown delivery remains held.
- plan-reader: fresh exact ID and studyTarget=Y eligibility check; deleted/missing/duplicate/excluded topics do not resume. No source writes.
- gas-store: offline buildCompaction verifies latest state preservation and source hash, generates a candidate only; original source is never written/deleted. Preserve full original journal for audit. No production generation switch, indexing, actual archival or capacity benchmark.
- stage2 test: compaction and prior regressions.

## Evidence
At 2026-11-27 inspection: main 0938b9e68de60b697d8b20868dfbe01ff1022d58; Pages HTTP 200, same planner/favorite script references. Public health ok=true, schemaVersion=15, no exact Apps Script deployment version or signed planner capability proved. LIVE MASTER plan/schedule ID columns both empty. Target plan ID, local plan device and actual first migration state remain unknown. No user data or credential access attempted through browser profiles.

Pinned code/test commit 9afa2fb85c8014d024ad3bfed9ac0ceebb914ba3 tested on an independent Windows temporary directory on DESKTOP-5H5J4TU:
- core.test.cjs PASS
- stage2.test.cjs PASS (including offline compaction)
- stage3.test.cjs PASS (including host, final quota attempt, current assignment)
- NODE_EXIT=0
All provider and Apps Script services are mocked or interface contracts; no actual Kakao or GAS test.
Actual independent Edge headless attempts for 1366/768/390 on earlier UI commit produced empty DOM and stderr; no PASS. Remote Node browser automation packages unavailable. Container raw GitHub network failed, so no alternate actual browser test. Keep UI/browser QA pending; no real mobile device QA.

Official API references:
https://developers.kakao.com/docs/ko/kakaologin/rest-api
https://developers.kakao.com/docs/ko/kakaotalk-message/rest-api
https://developers.kakao.com/docs/ko/kakaotalk-message/common
https://developers.kakao.com/docs/ko/message-template/default
https://developers.kakao.com/docs/ko/getting-started/quota
Self-message has no separate per-recipient send count in the detailed message policy, but app-wide quota and policy apply. Budget settings must be explicitly chosen from actual quota and app usage; local counters cannot prove global usage by other apps/processes. Use dedicated app with paid features disabled. No push notification expected. Confirm that user-configured periodic self-memo use is permitted before enabling.

## Next stage gates
1. Actual existing 3-round plan: user on device where it exists uses existing selected-plan JSON backup and progress backup, confirms first-migration status, authenticates existing ACTIVE device, uses existing approved migration/sync. Read back committed exact name/ID/revision/hash; do not create replacement, edit MASTER text, or overwrite progress. If inaccessible, keep cloud send disabled and continue independent work.
2. Provision dedicated Kakao app and dedicated Apps Script only in approved staging. Register exact HTTPS redirect and product link domain, enable talk_message and client secret. User must perform login/consent/confirm; do not request passwords, app secrets, access/refresh tokens in chat or GitHub. Owner config and state secret provision privately. Connect account without arming. Implement actual signed host routing, verified session binding, safe callback landing (no tokens/authorization code/state in logs or persistent browser storage), explicit confirm, CSRF/nonce, authorization and token revocation. The candidate host is not an authentication implementation. Restrict editor access. Verify refresh failure/revocation and actual provider responses.
3. Implement real scheduler host wrapper with fail-closed release flag, verified plan, token and settings; no trigger creation before separate approval. Actual test endpoint must be explicit, fixed safe self-test message, quota/unknown handling, no arbitrary-message route. Add UI flow for callback/confirmation, history detail, manual safe resolution of unknown/known rejection, unsent topics, next-send time. Real PWA entry integration and cache/version coordination only after authenticated route exists. Preserve old PWA/auth/data. 
4. Storage: offline compaction is not production-ready. Design verified archive plus new-generation switch or indexed partitions, preserve all audit transitions and daily/round dedupe, pending immutable parts, no destructive source changes. Benchmark representative volume and Apps Script calls/time. Confirm lock ownership and actual durable write semantics. Add realistic quota/rate limits (daily/monthly budget not set), handle failure/unknown and no rollover. A request initiated before cutoff can complete afterward; no new call after cutoff. 
5. Real isolated GAS/Sheets and actual browser tests on desktop/tablet/mobile viewports. Explicit user-approved Kakao self-test and actual message verification; no background activation or production deploy before separate approval. Draft PR remains blocked. Check latest main and PR state before each edit. Do not create duplicate PR.
