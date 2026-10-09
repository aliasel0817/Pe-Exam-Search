# Study Note Private Google Cloud Storage gateway

**Not deployed.** This is a development-only implementation. It never generates TTS audio and cannot read Cloud Storage without owner-managed Google Cloud resources.

## Architecture
- Cloud Storage private Standard bucket in us-central1, uniform bucket-level access and public access prevention enforced.
- A dedicated Cloud Run service with a **runtime** service account authenticates a Google Sign-In ID token (audience and explicitly allowed email).
- GET /v1/manifest returns private GCS index.json only after identity verification.
- GET /v1/audio-url?file=... returns a 5-minute **GET-only** signed URL for a file listed in the manifest.
- Browser requests the MP3 directly from storage.googleapis.com with GCS CORS enabled, and stores raw MP3 bytes in a size-limited, separately named Cache Storage.
- There are **no** write, synthesis, public listing or delete endpoints.

## Required runtime environment (set only when you explicitly approve cloud deployment)
- TTS_BUCKET: unique private bucket name
- GOOGLE_WEB_CLIENT_ID: Google Identity Services Web OAuth client ID (public ID)
- ALLOWED_GOOGLE_EMAILS: allowlisted Google account email, comma separated
- TTS_ALLOWED_ORIGIN: https://aliasel0817.github.io
- PORT: provided by Cloud Run

Never add service account JSON/private key, OAuth secret, access token, or browser identity tokens to a public repo.

## Least privilege
Cloud Run runtime service account needs Cloud Storage objectViewer on this bucket, and permission to sign blobs on its own service account (iam.serviceAccounts.signBlob). Avoid exported service account keys. Cloud Run platform may need an unauthenticated HTTP invoker because browsers use application-level Google identity JWT verification; the service itself denies unverified requests. Use an exact allowed email list, not domain-only authorization.

## Safe operating constraints
- min-instances=0, max-instances=1, concurrency bounded.
- No synthesis or upload through this gateway.
- Production always allowlists GitHub Pages origin and owner email.
- JSON manifest maximum 20 MiB, cached in server memory for 30 s.
- Per-process 90 requests/minute per verified account; **not** a billing cap across restarts.
- Cloud billing budgets are alerts, not automatic hard stops.
- Cloud Run build, Artifact Registry, Cloud Storage operations, egress, signBlob, Cloud Logging may have their own charges. Initial test only after owner confirms settings and billing constraints.
- Signed URLs can be shared during their short validity; browser cache persists on a trusted device. No public bucket permissions.

## Google Cloud console steps (manual; do not run unapproved resources)
1. Create Cloud project and confirm billing/free-tier coverage.
2. Create Google Cloud Storage bucket in us-central1 using Standard storage, uniform bucket-level access, public-access prevention enforced. Consider soft-delete storage costs.
3. Apply gcs-cors.json with Cloud CLI: gcloud storage buckets update gs://BUCKET --cors-file=gcs-cors.json
4. Create runtime service account and grant objectViewer on that bucket.
5. Grant iam.serviceAccountTokenCreator on the runtime service account **to itself** only for signBlob use.
6. Configure Google OAuth Client (web), authorize https://aliasel0817.github.io JavaScript origin.
7. Deploy this Node.js gateway to Cloud Run only after reviewing source and spending implications.
8. Configure study-note/tts/cloud-config.json on *development branch first*: {"schemaVersion":1,"mode":"gcs-private","gatewayUrl":"https://YOUR-SERVICE.a.run.app","oauthClientId":"YOUR_WEB_CLIENT_ID"}
9. Generate 1–3 Korean sample topics only after granting Cloud TTS API permission and explicitly approving possible charges.
10. Upload MP3 from approved local generator with upload_gcs.py (dry-run by default), then sign in on preview and test PC/tablet/phone. Only deploy to main after verification.

## Official references
https://docs.cloud.google.com/storage/docs/access-control/signed-urls
https://docs.cloud.google.com/storage/docs/cross-origin
https://docs.cloud.google.com/free/docs/free-cloud-features
https://docs.cloud.google.com/run/docs/authenticating/end-users
