#!/usr/bin/env bash
# Read-only Google Cloud TTS infrastructure check. Never enable/deploy/create.
set -euo pipefail
PROJECT="study-note-tts"
REGION="us-central1"

echo "=== API STATUS CHECK (read only) ==="
ENABLED="$(gcloud services list --enabled --project="$PROJECT" --format="value(config.name)")"
for api in \
  iamcredentials.googleapis.com \
  texttospeech.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
do
  if printf '%s\n' "$ENABLED" | grep -Fxq "$api"; then
    echo "OK: $api"
  else
    echo "NOT ENABLED: $api" >&2
    exit 1
  fi
done

echo "=== CLOUD RUN SERVICES (read only) ==="
gcloud run services list --region="$REGION" --project="$PROJECT"
echo "=== CHECK COMPLETE; NO DEPLOY, NO SYNTHESIS ==="
