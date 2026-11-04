# R7 isolated Apps Script security source candidate — NOT DEPLOYED

- `Code.js`: 173,359-byte R7 candidate based on historically verified version 21 `r5/source/Code.js`, with security/owner/idempotency corrections described by `../R7-CODE-PROVENANCE.json`.
- `referencePdfContent.js`: unmodified R5 official signed GET helper, retained for source and behavior correspondence.
- `appsscript.json`: unmodified original manifest.
- `clasp.example.json`: **template only**. Operating Script ID, actual `.clasp.json`, sessions, OAuth secrets, Script Properties, HMAC keys, PDF bytes and user annotations must remain private.
- `APPSSCRIPT-SETUP.md`: inherited setup procedures; review for relevance before use.

**Current operational Apps Script deployment was NOT modified and is NOT independently verified to match this candidate.**

The R7 differences move signed-write idempotency cache reservation after valid ACTIVE/HMAC/nonce and owner authorization inside one ScriptLock, while the untrusted `registerdevice` path redeems its Google OAuth code before cache reservation. The historical R5 snapshot remains unchanged for provenance. Owner-only, TTL, nonce replay and annotation read/write are tested **in a local synthetic V8/mock environment**, not on live Google cloud. Passing unit tests does not establish actual Apps Script quotas, LockService races, current deployment source parity or live sheet/Drive authentication.

**No `clasp push`, `clasp deploy`, LIVE MASTER read/write or actual customer ink operation is permitted by this candidate.** Before using it in an isolated deployment, back up source/settings, review the new registration retry flow, verify owner session handling and Cloud sheet persistence, then obtain separate approval before any production rollout.
