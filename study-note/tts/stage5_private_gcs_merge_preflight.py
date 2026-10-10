#!/usr/bin/env python3
"""Stage 5: fail-closed, read-only plan for merging five approved title MP3s
with the seven earlier private GCS MP3s.

Default: exhaustive local audit, *zero GCS requests*. --check-remote is an
opt-in authenticated GCS READ ONLY: verify the existing exact three-entry
index, the SHA-256 of each seven remote MP3s, and absence of five new objects.
No paid TTS, writes, uploads, deletes, Cloud Run deployment, or main changes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

import quality_aoede_7x984_preflight as original
import stage4_private_audio_preflight as previous
import stage5_topic_intro_v2_preflight as title_source
import upload_gcs as gcs
import verify_topic_intro_v2_5_audio as titles

PROJECT = "study-note-tts"
PROJECT_NUMBER = "558407087449"
BUCKET = "study-note-tts-audio-558407087449"
VOICE = "ko-KR-Chirp3-HD-Aoede"
OLD_FIELDS = 3
OLD_MP3 = 7
NEW_FIELDS = 5
NEW_MP3 = 5
COMBINED_FIELDS = 8
COMBINED_MP3 = 12
MAX_NEW_BYTES = 5 * 1024 * 1024
MAX_ALL_BYTES = 16 * 1024 * 1024
LOCKS = ("ttsGenerationApproved", "gcsUploadApproved",
         "cloudRunRevisionUpdateUserApproved")


def expected_keys() -> tuple[set[str], set[str]]:
    old = {f"{tid}:{field}:{VOICE}" for tid, field, *_ in original.TARGETS}
    new = {f"{tid}:topic:{VOICE}" for tid in title_source.TOPIC_IDS}
    return old, new


def paths_of(index: dict) -> set[str]:
    out = set()
    for entry in index["entries"].values():
        files = entry.get("files") if isinstance(entry.get("files"), list) else [entry.get("file")]
        if not files or any(not isinstance(name, str) or name in out for name in files):
            raise ValueError("Duplicate or invalid MP3 references in manifest.")
        out.update(files)
    return out


def build_local_plan() -> dict:
    """Verify BOTH previously-audited private data sets, with no file writes."""
    old_report = previous.audit_local()
    new_report = titles.verify_private_audio()
    _, old_dir, _ = original.private_paths()
    _, new_dir, _ = title_source.private_paths()
    old_index, old_objects = gcs.validate_manifest(old_dir)
    new_index, new_objects = gcs.validate_manifest(new_dir)
    old_keys, new_keys = expected_keys()
    old_names, new_names = paths_of(old_index), paths_of(new_index)
    project, project_number = gcs.project_binding()
    cfg = json.loads(gcs.PROJECT_CONFIG.read_text(encoding="utf-8"))

    if (project != PROJECT or project_number != PROJECT_NUMBER or
            cfg.get("bucketName") != BUCKET or
            any(cfg.get(key) is not False for key in LOCKS)):
        raise ValueError("Project, private bucket or three approval locks changed.")
    if (old_report["bucket"] != BUCKET or old_report["prefix"] != gcs.OBJECT_ROOT
            or old_report["fields"] != OLD_FIELDS or old_report["files"] != OLD_MP3):
        raise ValueError("Previous seven-MP3 audit does not match approved scope.")
    if (new_report["files"] != NEW_MP3 or new_report["characters"] != 180
            or new_report["utf8Bytes"] != 292):
        raise ValueError("New title-audio audit does not match five approved requests.")
    if (set(old_index["entries"]) != old_keys or set(new_index["entries"]) != new_keys
            or old_keys.intersection(new_keys)):
        raise ValueError("Unexpected or colliding old/new manifest keys.")
    if (len(old_objects) != OLD_MP3 or len(new_objects) != NEW_MP3
            or len(old_names) != OLD_MP3 or len(new_names) != NEW_MP3
            or old_names.intersection(new_names)):
        raise ValueError("Unexpected or colliding old/new MP3 object paths.")
    if ({name for name, _ in old_objects} != old_names
            or {name for name, _ in new_objects} != new_names):
        raise ValueError("MP3 filenames do not match manifest entries.")
    old_bytes = sum(file.stat().st_size for _, file in old_objects)
    new_bytes = sum(file.stat().st_size for _, file in new_objects)
    if (old_bytes != old_report["audioBytes"]
            or new_bytes != new_report["audioBytes"]
            or new_bytes <= 0 or new_bytes > MAX_NEW_BYTES
            or old_bytes + new_bytes > MAX_ALL_BYTES):
        raise ValueError("Audio size differs from approved source audits.")

    merged = {"schemaVersion": 1,
              "entries": {**old_index["entries"], **new_index["entries"]}}
    if (len(merged["entries"]) != COMBINED_FIELDS
            or len(paths_of(merged)) != COMBINED_MP3
            or any(merged["entries"][key] != old_index["entries"][key]
                   for key in old_keys)):
        raise ValueError("Combined index would change previously uploaded audio.")
    digest = hashlib.sha256(
        json.dumps(merged, ensure_ascii=False, sort_keys=True,
                   separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "oldIndex": old_index, "newIndex": new_index,
        "merged": merged, "oldObjects": old_objects,
        "newObjects": new_objects, "oldBytes": old_bytes,
        "newBytes": new_bytes, "combinedDigest": digest,
    }


def _not_found(result: subprocess.CompletedProcess) -> bool:
    if result.returncode == 0:
        return False
    detail = (result.stderr or b"").decode("utf-8", errors="replace").lower()
    # A permission, transport or quota failure must NOT count as nonexistence.
    return bool(re.search(r"\b404\b|notfound|not found|no urls matched", detail))


def check_remote_readonly(plan: dict) -> str:
    """Authenticated read-only GCS verification. No --execute option exists."""
    gcs.check_bucket(BUCKET, PROJECT, PROJECT_NUMBER)
    remote, generation = gcs.remote_manifest(BUCKET, PROJECT)
    if remote is None or remote != plan["oldIndex"]:
        raise ValueError("Remote index is not exactly the existing approved three fields; STOP.")
    if not re.fullmatch(r"[1-9][0-9]{0,24}", generation):
        raise ValueError("Remote index generation is missing or invalid.")
    prefix = f"gs://{BUCKET}/{gcs.OBJECT_ROOT}/"
    for name, local_file in plan["oldObjects"]:
        remote_bytes = gcs.run(
            ["gcloud", "storage", "cat", prefix + name, "--project=" + PROJECT]
        ).stdout
        if hashlib.sha256(remote_bytes).digest() != hashlib.sha256(
            local_file.read_bytes()
        ).digest():
            raise ValueError("Existing private GCS MP3 differs: " + name)
    for name, _ in plan["newObjects"]:
        result = gcs.run(
            ["gcloud", "storage", "objects", "describe", prefix + name,
             "--format=json", "--project=" + PROJECT], check=False
        )
        if result.returncode == 0:
            raise ValueError("One of the five new title MP3s already exists in GCS: STOP.")
        if not _not_found(result):
            raise RuntimeError("Cannot establish new MP3 absence; cloud read failed.")
    return generation


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="PRIVATE GCS five-title merge audit; always READ ONLY.")
    parser.add_argument("--check-remote", action="store_true",
                        help="Also read existing GCS objects; small cloud read charges may apply.")
    args = parser.parse_args(argv)
    try:
        plan = build_local_plan()
        print("STAGE5 PRIVATE GCS MERGE LOCAL PREFLIGHT PASSED")
        print(f"Retain 3 original fields / {OLD_MP3} original MP3s / {plan['oldBytes']} bytes")
        print(f"Add 5 title fields / {NEW_MP3} new MP3s / {plan['newBytes']} bytes")
        print(f"Combined: {COMBINED_FIELDS} manifest entries / {COMBINED_MP3} MP3s")
        print("Combined index SHA-256: " + plan["combinedDigest"])
        if args.check_remote:
            generation = check_remote_readonly(plan)
            print("STAGE5 PRIVATE GCS MERGE REMOTE READBACK PASSED")
            print(f"Verified seven existing GCS MP3s SHA-256; confirmed five new objects absent.")
            print("Checked existing manifest generation: " + generation)
            print("READ ONLY - GCS READ REQUESTS ONLY, NO UPLOAD OR CLOUD WRITES")
        else:
            print("DRY RUN - NO GCS REQUESTS, NO FILE WRITES, NO TTS CALLS")
            print("Run --check-remote separately to verify the existing live GCS objects.")
        print("NEW FIVE-MP3 GCS UPLOAD IS NOT AUTHORIZED BY THIS COMMAND")
        return 0
    except (ValueError, OSError, RuntimeError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print("STOP: " + str(exc), file=sys.stderr)
        print("Preserve both private MP3 folders and ZIPs. Do not upload or retry synthesis.",
              file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
