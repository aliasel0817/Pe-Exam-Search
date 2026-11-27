# Stage 4 — isolated cloud host, signed relay and draft PWA integration (NO PRODUCTION DEPLOY)

Retrospective record from the Stage 4 handoff and Stage 5 readback. Code/test commit `29cc88c016aa5f85c1f57ae8f60f79ed6a8f155c`; at Stage 5 start PR #104 draft/open, 52 commits ahead of main `0938b9e68de60b697d8b20868dfbe01ff1022d58`, 23 new files and one modified study-note.html. No production change.

- Added relay protocol, GAS HMAC + bounded durable nonce ledger, verified existing-host ACTIVE owner/session bridge candidate, dedicated doPost and scheduler entry, callback, signed browser transport, guarded build script and Stage 4 tests.
- PWA settings menu lazy-loads only on click, validates origin/default API and existing ACTIVE auth, no startup request. No operating entry point changed.
- Added daily fixed self-test gate (separate authorization; no auto-arm), history pagination, next-check estimate and verified compaction/generation switch retaining old workbook.
- Stage 1–4 Node tests PASS on isolated Windows directory; mocked GAS/provider services. Chrome/Edge dump-dom did not yield evidence in Stage 4.
- Built dedicated code SHA256 ee1251415cd7f00ad264f6217ec2ac40511ccd885e58df679966446cd4949165; bridge SHA256 acbc329ada47025c8d1c44617b5a8b000ac1174d6153409a1e6bfba6dc995b83. mainPatched=false.
- One owner-only private dedicated Apps Script project created; HEAD source pushed, no versioned web app or trigger. Stage 5 readback confirmed the above Stage 4 code SHA256. Stage 4 spreadsheet import failed; Stage 5 created and verified the actual distinct private store.
- Actual plan/schedule ID columns empty; exact 3-round plan and device migration not verified. Actual production Apps Script source/deployment version, real Kakao app and consent, signed production route and runtime tests remain blocked. No MASTER writes, tokens, secrets or private learning data committed.

See STAGE5.md for current state. Exact private project/store IDs and isolated local paths are in the user handoff, not GitHub. Never merge or deploy without explicit approval.
