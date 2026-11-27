# Kakao study notification — stage 1 (not deployed)

This directory is an isolated candidate, not loaded by the production PWA. No credentials, user study records, live sheet IDs, network calls or timers belong here.

Requirements: user-selected exact three-round plan ID; current Korea date only; 08:30 inclusive to 20:00 exclusive; five-minute proposed default, configurable; topic name always included; eight existing fields independently selectable; original content preserved in numbered parts; same day and same round deduplication. Default disabled.

Production gates:
- Verify actual 3-round plan in authenticated cloud storage, exact plan ID, active revision and all schedule chunk/hash integrity using existing planner protocol. No fallback to another plan. Read-only investigation on 2026-11-27 found no records in live plan and schedule ID columns. Do not invent or regenerate the plan; preserve any local data and resolve sync with the owner.
- Confirm Kakao personal self-message use policy, OAuth consent, text template limit, current quotas; use official API only. No push alert is expected from self-message. Never expose credentials or tokens in GitHub or browser.
- Implement server-side authentication and authorization, settings CAS, atomic slot and topic reservation, durable per-part state, trusted master adapter, send rate/cap enforcement, and an independent cloud scheduler. A pure proposal is NOT an atomic reservation; adapter must enforce both daily and round identities, next-eligible timestamp across settings changes, and message cap. Stop at 20:00 even during batches. Unknown delivery is held for user verification; no blind retries. Distinguish confirmed API acceptance from actual reading. Partial retries resume saved payload only. Define behavior when a long topic exceeds a slot cap without silently dropping it.
- The verified plan flag is an internal trusted adapter contract, not authentication. Validate active revision again before reservation. Do not expose personal data or settings through public repository.
- Integrate settings/preview/history UI after backend contract and auth review; keep existing study status and original master untouched.
- Use synthetic tests first, then real browser regression and explicit approval before deployment. No activation until account connection and actual plan confirmed.

Run synthetic core test: node study-note/notification/study-notification-core.test.cjs

Stage 1 intentionally does not implement network transport, UI, OAuth, durable storage, or scheduler activation. The exact production plan and backend remain unverified. Do not label the system ready.
