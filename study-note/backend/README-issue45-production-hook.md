# Issue #45: production Apps Script reference PDF hook

## Verified baseline (2026-11-02)

- The user's current Apps Script project was cloned **read-only** using its exact editor script ID.
- `clasp deployments` identified the currently used web app deployment at **version 20**.
- Separate clones of source HEAD and deployed **version 20** contain identical `Code.js` bytes.
- Baseline `Code.js` SHA-256: `3ec5309482cb0531d0f2258f6c3284bb7cbefcf874e63a347a1efbb6ef933b2d`.
- Baseline schema is 15. Production `health` did not advertise `referencePdfContentReady`.

## Security finding

The currently deployed `doGet` source includes a `referencepdfcontent` branch **without** calling `validateSignedGet_`. Its handler accepts source/page values directly from unsigned query parameters. That route must not remain publicly callable.

## Minimal integration (not a full backend replacement)

`issue45-referencepdf-content-deployed-v20.patch` modifies only two places in the verified `Code.js`:

1. `doGet`: enforce `validateSignedGet_(params, ['ACTIVE'])` before any original PDF byte read. Take `sourceType` and `pageToken` **only** from the validated signed `authPayload`, then invoke the existing `readReferencePdfPageForSignedGet_` helper with a verified ACTIVE session.
2. `buildHealth_`: advertise `referencePdfContentReady` only when the original page sheet and the helper are both present.

The helper is **already tracked** at `study-note/backend/referencePdfContent.addon.gs`. Include it as a separate Apps Script source file `referencePdfContent.js` alongside `Code.js` (clasp names downloaded code files `.js`). Do not replace any unrelated project source.

No Google Sheets LIVE MASTER rows, Drive PDFs, annotations, ACLs, auth keys, or production deployment have been changed in this PR.

## Apply in an isolated local directory, only to the matching version 20 source

In Windows PowerShell, set `$srcDir` to a separate `clasp clone` of the verified project and `$repoDir` to the GitHub repository containing this patch. **Do not apply to a different hash.**

```powershell
$repoDir = 'E:\Professional_Engine\Download\Development\Pe-Exam-Search_issue45_backendpatch_20261102_chat'
$srcDir  = 'E:\Professional_Engine\Download\Development\Pe-Exam-Search_issue45_apps_script_candidate_20261102_chat'
$patch   = Join-Path $repoDir 'study-note\backend\issue45-referencepdf-content-deployed-v20.patch'
$helper  = Join-Path $repoDir 'study-note\backend\referencePdfContent.addon.gs'
# For a fresh clone of the unmodified baseline only:
# $sha = (Get-FileHash -LiteralPath (Join-Path $srcDir 'Code.js') -Algorithm SHA256).Hash.ToLower()
# if ($sha -ne '3ec5309482cb0531d0f2258f6c3284bb7cbefcf874e63a347a1efbb6ef933b2d') { throw 'Baseline mismatch: stop' }
# git -C $srcDir apply --check $patch
# git -C $srcDir apply $patch
# Copy-Item -LiteralPath $helper -Destination (Join-Path $srcDir 'referencePdfContent.js')
node --check (Join-Path $srcDir 'Code.js')
node --check (Join-Path $srcDir 'referencePdfContent.js')
```

The current local candidate has **already been patched and contains the helper**; do not apply the diff to it a second time.

## Approval boundary and remaining acceptance

**Do not run `clasp push`, `clasp version`, `clasp deploy`, GitHub `main` merge, or Apps Script deployment until the user explicitly approves the affected production action.**

After approval: recheck project/branch and `clasp status`, save a fresh source snapshot, push candidate safely, update **the existing versioned deployment ID** while retaining the URL, and verify:

- Health now returns `referencePdfContentReady: true`.
- Signed ACTIVE query obtains registered `MG:187` and `SW:10` original PDF bytes; unsigned/invalid signatures are rejected.
- The three existing PDF buttons open in their native viewer and zoom at 100%, 275%, 400%.
- Basic authentication, annotation, navigation and attachment regression continues to work.

The user will perform additional Samsung tablet and iPhone acceptance testing after deployment. Do **not** close Issue #45 or claim production completion before operational readback.
