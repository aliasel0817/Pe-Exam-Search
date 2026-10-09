#!/usr/bin/env bash
# Read-only Cloud Build identity and run.builder role preflight.
set -euo pipefail
PROJECT="study-note-tts"
REGION="us-central1"
echo "=== BUILD IDENTITY (READ ONLY) ==="
RAW="$(gcloud builds get-default-service-account --project="$PROJECT" --region="$REGION" --format="value(serviceAccountEmail)")"
BUILD_SA="$(printf '%s' "$RAW" | sed 's|.*/||')"
if [[ "$BUILD_SA" != *"@"* ]]; then
  echo "BUILD_SERVICE_ACCOUNT_UNAVAILABLE"
  echo "Cloud Build identity must be reviewed before source deployment."
  exit 0
fi
echo "BUILD_SERVICE_ACCOUNT: $BUILD_SA"
echo "=== PROJECT-LEVEL RUN BUILDER ROLE (READ ONLY) ==="
gcloud projects get-iam-policy "$PROJECT" --format="json(bindings)" |
  BUILD_SA="$BUILD_SA" python3 -c '
import json, os, sys
policy=json.load(sys.stdin)
member="serviceAccount:"+os.environ["BUILD_SA"]
present=any(
    record.get("role")=="roles/run.builder"
    and member in record.get("members",[])
    and not record.get("condition")
    for record in policy.get("bindings",[])
)
print("RUN_BUILDER_DIRECT_ROLE: "+("PRESENT" if present else "NOT_FOUND"))
if not present:
    print("Missing direct Cloud Run Builder role may require a narrow IAM grant before source deploy.")
'
echo "=== PREDEPLOY CHECK COMPLETE; NO CHANGES MADE ==="
