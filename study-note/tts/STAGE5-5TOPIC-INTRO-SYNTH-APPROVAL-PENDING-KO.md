# STAGE5 — Five Aoede 'topic에 대한 설명' MP3s (approval pending)

Date: 2026-10-10
Branch: feature/ai-natural-tts-20261009
Status: DEV CODE + OFFLINE TESTS ONLY; **NO PAID TTS APPROVAL YET**.

## Existing user-verified state
- Previous Cloud Shell 181-test suite and five-title read-only preflight were reported successful by the user (screen capture not available).
- Existing MP3 35 original pilot, final-quality MP3 7, all old ZIPs and GCS objects are to be preserved. No recompilation of these.
- Google Sheets / Apps Script, PWA production main, and Cloud Run are unchanged.
- The old `generate_mp3.py` and its pinned blob SHA must stay unchanged.

## New run-only code and safety
- `run_approved_topic_intro_v2_5.py`: default dry-run, exact 5 title MP3s using Aoede `ko-KR-Chirp3-HD-Aoede`.
- Fixed order: T0001, T1961, T2238, T2176, T2354.
- Speech: **spoken title + `에 대한 설명` + `[pause short]`**. Existing six body headings remain unchanged.
- `stage5_topic_intro_v2_preflight.py`: read-only; pins exact local private JSON, historical generator, pronunciation dictionary, v2 function, Google project and three disabled approval settings.
- Hard ceilings: <= 5 calls; <= 500 UTF-8 codepoint characters; <= 1,500 UTF-8 bytes; 1 new segment per topic.
- Must pass both flags `--accept-possible-charges` and `--approve-exact-five-intros` **AND** exact character + UTF-8 byte counts to execute.
- Before any POST: validate inputs/project, check no preexisting output/ZIP, obtain token, reserve strict local ledger, append durable attempt journal.
- No automatic retry; output directory creation is a no-overwrite lock. Interrupted operations require forensic review, never rerun.
- No GCS upload, Cloud Run deployment, GitHub main commit, Sheets/Apps Script write or file deletion.
- Proposed output, once separately authorized:
  `$HOME/study-tts-topic-intro-v2-5`
  `$HOME/study-tts-topic-intro-v2-5.zip`
- The new output will be NEW MP3s and separate private `index.json`, `attempts.json`, local charge-guard ledger. Do not upload any of them to public GitHub.

## Offline test status
- `test_run_approved_topic_intro_v2_5.py`: **13 / 13 passed** on isolated Windows mock fixture; no Cloud TTS calls.
- Includes dry-run, complete exact authorization, over-limit refusal, manifest+ZIP checks, interruption/no-retry, wrong-project and missing-credentials rejection.
- Older new `test_topic_intro_v2.py` 14/14 passed; `test_stage5_topic_intro_v2_preflight.py` 14/14 passed.
- Full Linux Cloud Shell test suite after adding runner needs final confirmation; avoid rerunning user tests unnecessarily.

## Current suggested user action: dry run, no screenshot
```bash
cd "$HOME/pe-tts-dev"
git switch feature/ai-natural-tts-20261009
git pull --ff-only
python3 study-note/tts/run_approved_topic_intro_v2_5.py
```

Expected printed keys:
```
STAGE5 FIVE TOPIC INTRO V2 PREFLIGHT PASSED
Proposed TTS calls: 5
Exact synthesis characters: <ACTUAL>
UTF-8 input bytes: <ACTUAL>
DRY RUN - NO API CALLS, NO MP3 GENERATION, NO FILE WRITES
```

User need only send the TWO numbers, not screenshots, private text, or token.
Ask explicit user approval BEFORE presenting or running the `--execute` command.

## Price guide
Google Cloud Text-to-Speech Chirp 3 HD, current official list price after
free quota: USD $0.00003 per character; 500-character capped scope <= $0.015 TTS
synthesis charge, exclusive of other cloud costs and subject to remaining free tier.
Pricing: https://cloud.google.com/text-to-speech/pricing

## Next after explicit paid TTS permission
1. User manually executes exact single-shot approved synth command in Cloud Shell.
2. Verify number of MP3s, journal, hashes, ZIP and saved original files; no cloud upload.
3. User downloads new ZIP locally and confirms the new intro actually sounds like
   '토픽명에 대한 설명' with short pause.
4. Only after that request separate private GCS upload approval. Keep main untouched.
