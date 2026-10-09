#!/usr/bin/env bash
# Study Note TTS dedicated Cloud Build account. No Cloud Run deployment.
# DRY RUN unless --execute --approve-project-builder-role.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$HERE/../cloud-project.json"
PROJECT="study-note-tts"
PROJECT_NUMBER="558407087449"
BUILD_ID="study-tts-build"
BUILD_EMAIL="$BUILD_ID@$PROJECT.iam.gserviceaccount.com"
ROLE="roles/run.builder"

if [[ "$#" -eq 0 ]] || { [[ "$#" -eq 1 ]] && [[ "$1" == "--dry-run" ]]; }; then
  echo "=== TTS DEDICATED BUILD IDENTITY: DRY RUN; ZERO GOOGLE API CALLS ==="
  echo "Project: $PROJECT ($PROJECT_NUMBER)"
  echo "Identity to create: $BUILD_EMAIL"
  echo "Project IAM: $ROLE on that exact identity only"
  echo "Default Compute service account: NO CHANGE"
  echo "No Cloud Run build/deploy, MP3 synthesis, GCS upload, keys or additional roles."
  echo "IAM changes require --execute --approve-project-builder-role."
  exit 0
fi
if [[ "$#" -ne 2 || "$1" != "--execute" || "$2" != "--approve-project-builder-role" ]]; then
  echo "Usage: bash setup_build_identity.sh [--dry-run | --execute --approve-project-builder-role]" >&2
  exit 2
fi
# Check local plan and unchanged billing/synthesis locks before any Google Cloud request.
python3 - "$CONFIG" <<'PY'
import json,sys
from pathlib import Path
p=json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for key,expected in {
    "projectId":"study-note-tts",
    "projectNumber":"558407087449",
    "dedicatedBuildServiceAccountEmail":"study-tts-build@study-note-tts.iam.gserviceaccount.com",
    "dedicatedBuildRolePlanned":"roles/run.builder",
    # IAM-only setup is independent of whether one Cloud Run pilot was approved.
    # This script never deploys any Cloud Run resource.
    "ttsGenerationApproved":False,
    "gcsUploadApproved":False,
}.items():
    if p.get(key)!=expected:
        raise SystemExit("IAM SETUP BLOCKED: unexpected "+key+"; no Google Cloud request.")
print("Dedicated build account plan validated; Cloud Run/TTS/audio writes remain locked.")
PY
command -v gcloud >/dev/null || { echo "gcloud CLI not found" >&2; exit 2; }
ACTUAL_NUMBER="$(gcloud projects describe "$PROJECT" --format="value(projectNumber)")"
if [[ "$ACTUAL_NUMBER" != "$PROJECT_NUMBER" ]]; then
  echo "IAM SETUP BLOCKED: project number mismatch" >&2
  exit 2
fi
EXISTING="$(gcloud iam service-accounts list --project="$PROJECT" --format="value(email)")"
if grep -Fxq -- "$BUILD_EMAIL" <<< "$EXISTING"; then
  echo "Dedicated build service account already exists: $BUILD_EMAIL"
else
  gcloud iam service-accounts create "$BUILD_ID" --project="$PROJECT" \
    --display-name="Study Note TTS Cloud Build" \
    --description="Dedicated build identity for Study Note TTS Cloud Run source deployment"
  echo "Dedicated build service account created: $BUILD_EMAIL"
fi
# Check for exact unconditional roles/run.builder membership on this project only.
get_role() {
  gcloud projects get-iam-policy "$PROJECT" --format="json(bindings)" |
    EXPECTED_MEMBER="serviceAccount:$BUILD_EMAIL" python3 -c '
import json,os,sys
policy=json.load(sys.stdin)
member=os.environ["EXPECTED_MEMBER"]
present=any(
    b.get("role")=="roles/run.builder" and
    member in b.get("members",[]) and not b.get("condition")
    for b in policy.get("bindings",[])
)
print("PRESENT" if present else "NOT_FOUND")
'
}
status="$(get_role)"
if [[ "$status" != "PRESENT" ]]; then
  # IAM can take 60+ seconds to recognize a newly created service account.
  # Only the exact "new service account does not exist" error is retried.
  # All other failures (permission denied, invalid role, wrong project) fail closed.
  granted=0
  for delay in 0 10 20 40 60; do
    if [[ "$delay" -gt 0 ]]; then
      echo "Waiting $delay seconds for Google IAM account propagation..."
      sleep "$delay"
    fi
    if message="$(gcloud projects add-iam-policy-binding "$PROJECT" \
      --member="serviceAccount:$BUILD_EMAIL" \
      --role="$ROLE" --condition=None --quiet 2>&1)"; then
      granted=1
      echo "Project Cloud Run Builder role granted ONLY to dedicated build account."
      break
    fi
    if [[ "$message" == *"Service account $BUILD_EMAIL does not exist"* ]]; then
      echo "New service account is not yet visible to project IAM; bounded retry."
    else
      printf '%s\n' "$message" >&2
      echo "IAM SETUP STOPPED: non-propagation error. No further attempts." >&2
      exit 2
    fi
  done
  if [[ "$granted" != 1 ]]; then
    echo "IAM SETUP INCOMPLETE: service account propagation timeout; no deployment attempted." >&2
    exit 2
  fi
else
  echo "Project Cloud Run Builder role already present on dedicated build account."
fi
# Project policy reads can also briefly lag behind a successful IAM change.
confirmed=0
for delay in 0 5 10 20; do
  if [[ "$delay" -gt 0 ]]; then
    echo "Waiting $delay seconds for IAM role visibility..."
    sleep "$delay"
  fi
  if [[ "$(get_role)" == "PRESENT" ]]; then
    confirmed=1
    break
  fi
done
if [[ "$confirmed" != 1 ]]; then
  echo "IAM SETUP INCOMPLETE: dedicated builder role not yet visible. No deployment attempted." >&2
  exit 2
fi
echo "=== DEDICATED BUILD ACCOUNT READY ==="
echo "ACCOUNT: $BUILD_EMAIL"
echo "PROJECT_ROLE: roles/run.builder PRESENT"
echo "DEFAULT COMPUTE ACCOUNT: UNCHANGED"
echo "NO CLOUD RUN DEPLOY, TTS SYNTHESIS OR MP3 UPLOAD"
