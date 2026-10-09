#!/usr/bin/env bash
# Read-only Cloud Run gateway smoke test for the ALREADY deployed revision.
# NO build, NO deployment, NO TTS generation and NO GCS upload.
set -euo pipefail

PROJECT="study-note-tts"
REGION="us-central1"
SERVICE="study-tts-audio-gateway"
ORIGIN="https://aliasel0817.github.io"

command -v gcloud >/dev/null || { echo "gcloud CLI missing" >&2; exit 2; }
command -v curl >/dev/null || { echo "curl missing" >&2; exit 2; }

echo "=== EXISTING CLOUD RUN URL (READ ONLY) ==="
URL="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --format='value(status.url)')"
case "$URL" in
  https://*.run.app) echo "SERVICE_URL=$URL" ;;
  *) echo "Unexpected or missing Cloud Run URL; no HTTP requests made" >&2; exit 2 ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "=== UNAUTHENTICATED MANIFEST (EXPECT APP JSON HTTP 401) ==="
MANIFEST_STATUS="$(curl --silent --show-error --max-time 45 \
  --request GET \
  --header "Origin: $ORIGIN" \
  --dump-header "$TMP/manifest-headers" \
  --output "$TMP/manifest-body" \
  --write-out '%{http_code}' \
  "$URL/v1/manifest")"
echo "UNAUTH_MANIFEST_HTTP=$MANIFEST_STATUS"
if [[ "$MANIFEST_STATUS" != "401" ]]; then
  echo "Expected 401. First response bytes for debugging:" >&2
  head -c 240 "$TMP/manifest-body" >&2
  echo >&2
  exit 2
fi
if ! grep -Fq '"error":"Google login required"' "$TMP/manifest-body"; then
  echo "401 did not originate from expected app authentication gate. Stop." >&2
  exit 2
fi
if ! tr -d '\r' < "$TMP/manifest-headers" |
    grep -Fixq "Access-Control-Allow-Origin: $ORIGIN"; then
  echo "Production GitHub Pages CORS origin header missing. Stop." >&2
  exit 2
fi
echo "APP_AUTH_GATE=OK"
echo "GITHUB_PAGES_CORS=OK"

echo "=== BROWSER PREFLIGHT (EXPECT HTTP 204) ==="
PREFLIGHT_STATUS="$(curl --silent --show-error --max-time 45 \
  --request OPTIONS \
  --header "Origin: $ORIGIN" \
  --header "Access-Control-Request-Method: GET" \
  --header "Access-Control-Request-Headers: Authorization" \
  --output "$TMP/preflight-body" \
  --write-out '%{http_code}' \
  "$URL/v1/manifest")"
echo "CORS_PREFLIGHT_HTTP=$PREFLIGHT_STATUS"
if [[ "$PREFLIGHT_STATUS" != "204" ]]; then
  echo "CORS preflight is not the expected 204. Stop." >&2
  exit 2
fi
echo "=== EXISTING CLOUD RUN SECURITY CHECK COMPLETE ==="
echo "No Cloud Run deploy, no TTS synthesis, no MP3 creation or upload."
echo "Note: /healthz is a reserved Cloud Run path; a later revision will use /health."
