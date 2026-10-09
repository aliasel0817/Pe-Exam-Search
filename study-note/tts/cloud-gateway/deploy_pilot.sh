#!/usr/bin/env bash
# Cloud Run AI TTS gateway deployment: dry-run only unless separately approved.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
CONFIG="$HERE/../cloud-project.json"
PROJECT="study-note-tts"
BUCKET="study-note-tts-audio-558407087449"
REGION="us-central1"
SERVICE="study-tts-audio-gateway"
READER="study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com"
BUILD_EMAIL="study-tts-build@study-note-tts.iam.gserviceaccount.com"
CLIENT="1054197140509-60r8da165v63qghfn6558o5d48crl02g.apps.googleusercontent.com"

if [[ "$#" == 0 || ("$#" == 1 && "$1" == "--dry-run") ]]; then
  echo "=== CLOUD RUN GATEWAY: DRY RUN, NO GOOGLE API REQUEST ==="
  echo "Project: $PROJECT / Region: $REGION / Service: $SERVICE"
  echo "Private MP3 storage: $BUCKET / runtime reader: $READER"
  echo "Dedicated Cloud Build identity: $BUILD_EMAIL (default Compute service account unchanged)"
  echo "1 vCPU, 512 MiB RAM, 0 minimum and 1 maximum instance, concurrency 4"
  echo "Cloud Run accepts HTTPS/CORS, but MP3 manifest and signed URLs require Google login."
  echo "Actual source build/deployment may use Cloud Build, Artifact Registry, Cloud Run, egress and logs."
  echo "No build, no deploy, no paid-capable API request made."
  exit 0
fi
if [[ "$#" != 2 || "$1" != "--execute" || "$2" != "--accept-possible-charges" ]]; then
  echo "Usage: bash deploy_pilot.sh [--dry-run | --execute --accept-possible-charges]" >&2
  exit 2
fi

# Explicit owner consent and safety gates: inspect local JSON before ANY gcloud call.
python3 - "$CONFIG" <<'PY'
import json,sys
from pathlib import Path
project=json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
checks={
  "schemaVersion":1, "projectId":"study-note-tts", "projectNumber":"558407087449",
  "bucketName":"study-note-tts-audio-558407087449", "region":"us-central1",
  "budgetAlertsUserConfirmed":True, "bucketReaderIamUserConfirmed":True,
  "signBlobRoleUserConfirmed":True, "requiredApisUserConfirmed":True,
  "buildApisUserConfirmed":True, "cloudBuildIdentityCheckedUserConfirmed":True,
  "dedicatedBuildServiceAccountEmail":"study-tts-build@study-note-tts.iam.gserviceaccount.com",
  "dedicatedBuildServiceAccountCreatedUserConfirmed":True,
  "dedicatedBuildRoleGrantedUserConfirmed":True,
  "cloudRunServiceNamePlanned":"study-tts-audio-gateway",
  "cloudRunDeploymentUserApproved":True, "cloudProvisioningApproved":True,
  "ttsGenerationApproved":False, "gcsUploadApproved":False
}
for name, expected in checks.items():
  if project.get(name)!=expected:
    raise SystemExit("DEPLOYMENT BLOCKED: " + name + " not approved/expected; no Cloud API request.")
print("Pilot Cloud Run deployment approval gates passed.")
PY

command -v gcloud >/dev/null || { echo "gcloud CLI is required" >&2; exit 2; }
command -v git >/dev/null || { echo "git is required" >&2; exit 2; }
[[ "$(git -C "$REPO_ROOT" branch --show-current)" == "feature/ai-natural-tts-20261009" ]] || {
  echo "Refusing deployment from anything other than feature/ai-natural-tts-20261009" >&2
  exit 2
}
[[ -f "$HERE/server.cjs" && -f "$HERE/package.json" ]] || {
  echo "No Node.js Cloud gateway source at expected path" >&2
  exit 2
}
ACTIVE_EMAIL="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
[[ "$ACTIVE_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || {
  echo "No valid active Google account email in Cloud Shell" >&2; exit 2;
}
[[ "$(gcloud config get-value project 2>/dev/null)" == "$PROJECT" ]] || {
  echo "Active Cloud Shell project must be study-note-tts" >&2; exit 2;
}
EXISTING="$(gcloud run services list --region="$REGION" --project="$PROJECT" --format='value(metadata.name)')"
if printf '%s\n' "$EXISTING" | grep -Fxq "$SERVICE"; then
  echo "Existing Cloud Run service found. Refusing to replace any live service." >&2
  exit 2
fi

echo "Beginning approved Cloud Run source deployment; charges may occur."
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --source="$HERE" \
  --build-service-account="projects/$PROJECT/serviceAccounts/$BUILD_EMAIL" \
  --service-account="$READER" \
  --allow-unauthenticated \
  --ingress=all \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=4 \
  --timeout=30s \
  --min-instances=0 \
  --max-instances=1 \
  --no-cpu-boost \
  --set-env-vars="TTS_BUCKET=$BUCKET,GOOGLE_WEB_CLIENT_ID=$CLIENT,ALLOWED_GOOGLE_EMAILS=$ACTIVE_EMAIL,TTS_ALLOWED_ORIGIN=https://aliasel0817.github.io" \
  --quiet

echo "=== GATEWAY DEPLOYED. NO MP3 CREATED OR UPLOADED. ==="
echo "Public Cloud Run transport is needed for browser preflight, protected routes still verify ID token and allowlist."
echo "Allowed account defaults to active Cloud Shell Google email; verify it matches the PWA login account."
