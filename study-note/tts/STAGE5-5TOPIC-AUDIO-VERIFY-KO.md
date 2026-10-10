# Stage 5 — five completed Aoede topic-intro MP3s: read-only verification and listening

Date: 2026-10-10. The user reports that the five approved Cloud Shell synthesis requests
(180 characters, 292 UTF-8 bytes) completed. No need to synthesize again.

## Safety
- No additional synthesis or paid API calls.
- No GCS upload or Cloud Run deployment.
- No operating main, Google Sheets, Apps Script, images, PDF, or annotation changes.
- All previously created original 35 MP3, quality 7 MP3, ZIPs and GCS objects preserved.
- The new 5-MP3 results live in
  `$HOME/study-tts-topic-intro-v2-5/` with archive
  `$HOME/study-tts-topic-intro-v2-5.zip`.
- Do NOT rerun `run_approved_topic_intro_v2_5.py --execute`.

## Cloud Shell verification
```bash
cd "$HOME/pe-tts-dev"
git switch feature/ai-natural-tts-20261009
git pull --ff-only
python3 study-note/tts/verify_topic_intro_v2_5_audio.py
```
Expected terminal summary:
```text
STAGE5 FIVE TITLE AUDIO INTEGRITY PASSED
MP3: 5 | API saved attempts: 5 | Characters: 180 | UTF-8 bytes: 292
Private MP3 ↔ index.json ↔ attempts.json ↔ ZIP: VERIFIED
READ-ONLY - NO TTS CALLS, NO GCS, NO CLOUD RUN, NO FILE WRITES
```
Additional lines show the actual size and SHA-256 of the ZIP. On any STOP,
preserve the files and share the error; do not retry synthesis or rewrite ZIP.

## User PC download after PASS
```bash
cloudshell download "$HOME/study-tts-topic-intro-v2-5.zip"
```
A browser download dialog may appear. If the browser is on Galaxy Tab rather
than Windows, download will go to that device instead; use Windows Chrome to
save the ZIP to the Windows PC. The browser only reads/downloads the ZIP.

Google official Cloud Shell documentation:
https://docs.cloud.google.com/shell/docs/using-cloudshell-command

## Listening pass/fail
Unzip locally; files:
- T0001/01_topic-intro-v2.mp3
- T1961/01_topic-intro-v2.mp3
- T2238/01_topic-intro-v2.mp3
- T2176/01_topic-intro-v2.mp3
- T2354/01_topic-intro-v2.mp3

Listen for the Korean phrase `...에 대한 설명` and a short pause, with no
clipped last syllable. The literal markup `[pause short]` must NOT be spoken.
Check long technical English names are pronounced sensibly. Do not treat
offline integrity as acoustic quality: user listening is required.

## Offline QA
`test_verify_topic_intro_v2_5_audio.py`: 15/15 passed, all with mocked MP3
bytes and a temporary fixture, **no live Cloud API**. Tests corrupt saved
MP3, attempts, ZIP, manifest, billable usage ledger and source on a temporary
sample to prove rejection. Confirm actual five private MP3s with the read-only
script above.

## Later work
The new topic-title MP3s are local only; they have not been put in GCS and
cannot yet supply complete PWA topic-first playback. Any private GCS upload
requires separate approval and careful merge with the existing private
`index.json` containing three body fields/7 MP3s. Do not replace the current
GCS index outright.
