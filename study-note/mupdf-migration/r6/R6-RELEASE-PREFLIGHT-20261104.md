# R6 isolated release preflight (NO DEPLOY)

Date: 2026-11-04 Asia/Seoul. Repository: aliasel0817/Pe-Exam-Search.

## Confirmed starting evidence

- Main and integration/mupdf-migration: e758fc3145add56f151ec4231927001c28a142b6 (read via GitHub).
- Cumulative R5 draft PR #64, head da876a1103f20e0c729405e418ced4975ab3759c; 13 successful GitHub Actions workflows.
- R5 source-and-security and actual Linux C-to-WASM build jobs both succeeded; do not needlessly rebuild unchanged code.
- Source candidate already publicly visible on an unmerged R5 branch. This is NOT an immutable released source offer, authorization of third-party assets, or proof of full runtime compliance.
- R5 Windows checkout clean. New independent R6 folder and branch created; no edits to R5 checkout.
- Production viewer still gates M4/M5/M6 on localhost query parameters. No production high-quality migration can be claimed.
- Original Apps Script source is a version21 read-only snapshot; current deployed version and ACTIVE authentication not reverified.

## New R6 development

`r6-release-preflight.cjs` provides read-only, deterministic manifest generation of seven key source and build inputs with SHA-256 and GitHub URLs pinned to the current Git commit; it checks private viewer gating and release approval protection. It prints no secrets, deploys nothing and never opens an authenticated PDF URL. The script intentionally returns NO_GO while manual legal, authentication, device and release steps remain incomplete.

Run: `node study-note/mupdf-migration/r6/r6-release-preflight.cjs`

IMPORTANT: URLs produced by this utility are *candidate source references*, not a user-facing network source offer. Before publication, use a release commit or immutable tag and verify its matching binary and full corresponding source. This utility does not resolve the Apps Script or legal scope issue.

## Release blocking facts

1. Neither an independent final copyright/third-party review nor current production Apps Script readback was evidenced.
2. Signed source ACTIVE/PENDING/REVOKED, owner-only and isolated cloud annotation storage/recovery have not been physically confirmed.
3. Physical Galaxy Tab S11 S Pen and iPhone 16 Pro Safari have not been tested.
4. Real deployment-specific AGPL source-offer URL, public notice and MuPDF JS/WASM packaging/routing are not in production.
5. Production backups, roll-back, Pages/App Script deployment permissions and operation acceptance are not demonstrated.

**Decision: NO-GO for main integration, Apps Script deployment, Pages deployment and public MuPDF binary rollout.** Existing end-user data and existing production behavior must be preserved. Existing Draft PRs #52-#64 are unchanged.