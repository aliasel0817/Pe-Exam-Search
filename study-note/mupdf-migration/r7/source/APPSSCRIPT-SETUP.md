# Apps Script open-source build/install notes (review-only, NOT the live project)

The exact 2026-11-04 R2 read-only version21 source snapshot is in `Code.js` (SHA-256 `e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f`), `referencePdfContent.js` (SHA-256 `0ff6da5c6a3635b0fb83429ade3386ba50c195d2fbe24b5a4ea0e6a3022dafed`), and `appsscript.json` (SHA-256 `fd4aadebaeb248c3befaeab7de7470d48afd4f2cca3573eaf8358d1b7d391d6d`). These **are source code/manifest**, not live credentials or deployed changes.

To reconstruct the server in a separate authorized **test** project:
1. Copy these three files into a fresh, isolated Apps Script working folder. If using clasp, the source project may require the `.js` filenames converted to `.gs` or retained according to the actual clasp version/tooling. Keep the implementation unchanged unless tool-specific adaptation is proven.
2. Create a new Apps Script project under the tester's own Google account and supply a **private** `.clasp.json` (example: `clasp.example.json`; never commit the actual Script ID).
3. Set up the required Script Properties and OAuth/security/device settings using the public constant/property-name declarations in `Code.js`, providing the tester's own private values. Do not copy the operating system's HMAC/session keys, OAuth private values, owner identity, existing sheet/Drive IDs, LIVE MASTER rows, or user annotations.
4. Create fresh empty or synthetic test Sheets/Drive materials based on the app's documented schema; do not connect the production LIVE MASTER.
5. Deploy only into the isolated account after explicit permission and review. The current task does **not** authorize changing the operating Apps Script project, deployment versions, permissions or keys.
6. Verify ACTIVE/PENDING/REVOKED/owner-only, signed GET/nonce/TTL and schema3 user/page/attachment annotation isolation in the test environment.

The actual live Apps Script version at the moment of a later operating deployment must be compared read-only with these snapshots. Exact source correspondence for a public release is a separate checkpoint.

**Never commit actual `.clasp.json`, OAuth/HMAC values, device registry, Google Sheets/Drive contents or real signed URLs.**
