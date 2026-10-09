#!/usr/bin/env python3
"""Stage-4 local-only audit of the seven approved, already-created Aoede MP3s.

No cloud API calls, uploads, paid synthesis, writes, or credentials. Output is
limited to numerical diagnostics, never private topic text.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import zipfile

import generate_mp3 as t
import quality_aoede_7x984_preflight as p
import upload_gcs as u

PINNED_QUALITY_PREFLIGHT_BLOB = "7bf74f90c47d4e5982cecac8bcec873a771946cd"
BUCKET = "study-note-tts-audio-558407087449"
PROJECT_NUMBER = "558407087449"
MAX_PRIVATE_PILOT_BYTES = 12 * 1024 * 1024


def audit_local() -> dict:
    source, folder, archive_path = p.private_paths()
    if p.git_blob_hash(p.ROOT / "quality_aoede_7x984_preflight.py") != PINNED_QUALITY_PREFLIGHT_BLOB:
        raise ValueError("Pinned quality preflight has changed.")
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError("The existing private quality MP3 directory is missing or unsafe.")
    if not source.is_file() or source.is_symlink():
        raise ValueError("Private five-topic JSON missing or symlinked.")
    if hashlib.sha256(source.read_bytes()).hexdigest() != p.SOURCE_SHA256:
        raise ValueError("Private five-topic JSON no longer matches approved data.")
    if p.git_blob_hash(p.ROOT / "generate_mp3.py") != p.GENERATOR_BLOB:
        raise ValueError("Speech generator version changed.")
    if p.git_blob_hash(p.ROOT / "pronunciations.ko-candidates.json") != p.DICTIONARY_BLOB:
        raise ValueError("Pronunciation dictionary version changed.")
    p.check_cloud_locks()
    project, project_number = u.project_binding()
    if project != p.PROJECT or project_number != PROJECT_NUMBER:
        raise ValueError("Wrong bound Google Cloud project.")
    cfg = json.loads(u.PROJECT_CONFIG.read_text(encoding="utf-8"))
    if cfg.get("bucketName") != BUCKET:
        raise ValueError("Wrong private GCS bucket in project binding.")

    topics = t.get_topics(source)
    if tuple(x.get("topicId") for x in topics) != p.TOPIC_IDS:
        raise ValueError("Private sample topic IDs or order changed.")
    if any(x.get("studyTarget") != "Y" for x in topics):
        raise ValueError("Unexpected non-learning topic.")
    by_id = {x["topicId"]: x for x in topics}
    dictionary = t.load_dictionary(p.ROOT / "pronunciations.ko-candidates.json")

    manifest, listed = u.validate_manifest(folder)
    approved_keys = {tid + ":" + field + ":" + p.VOICE for tid, field, *_ in p.TARGETS}
    if set(manifest["entries"]) != approved_keys:
        raise ValueError("Manifest must contain exactly the three tested fields.")
    if len(listed) != p.CALLS:
        raise ValueError("Expected exactly seven manifest-listed MP3 files.")
    actual_mp3s = list(folder.rglob("*.mp3"))
    if len(actual_mp3s) != p.CALLS:
        raise ValueError("Unexpected extra or missing MP3 in local quality directory.")

    planned = []
    for tid, field, pieces, chars, byte_count in p.TARGETS:
        result = t.plan([by_id[tid]], p.VOICE, {field}, dictionary, folder,
                        {"schemaVersion": 1, "entries": {}}, 1)
        if len(result) != 1:
            raise ValueError("Unable to reproduce exact approved input.")
        entry = result[0]
        chunks, paths = entry["chunks"], entry["files"]
        if (len(chunks) != pieces or len(paths) != pieces or
                sum(map(len, chunks)) != chars or
                sum(map(t.utf8_len, chunks)) != byte_count):
            raise ValueError("Speech text or splitting changed.")
        actual = manifest["entries"].get(entry["key"], {})
        listed_paths = actual.get("files") if isinstance(actual.get("files"), list) else [actual.get("file")]
        if (actual.get("sha256") != entry["originalHash"] or
                actual.get("speechSha256") != entry["speechHash"] or
                listed_paths != paths):
            raise ValueError("Manifest does not match approved source and speech hash.")
        for i, (chunk, relpath) in enumerate(zip(chunks, paths), 1):
            file = folder / relpath
            if any(part.is_symlink() for part in (file, *file.parents) if part != folder.parent):
                raise ValueError("MP3 paths must not contain symlinks.")
            if not file.is_file() or file.stat().st_size < 100:
                raise ValueError("Missing or too-small MP3.")
            planned.append({
                "number": len(planned) + 1, "topicId": tid, "field": field,
                "part": i, "relativeFile": relpath,
                "characters": len(chunk), "utf8Bytes": t.utf8_len(chunk),
                "file": file, "friendly": "{}/{:02d}_{}.mp3".format(tid, i, field),
            })

    if (len(planned) != p.CALLS or
            sum(x["characters"] for x in planned) != p.CHARS or
            sum(x["utf8Bytes"] for x in planned) != p.BYTES):
        raise ValueError("Validated synthesis scope exceeds seven approved MP3s.")

    journal_file = folder / "attempts.json"
    if not journal_file.is_file() or journal_file.is_symlink():
        raise ValueError("Private durable API attempt history missing.")
    journal = json.loads(journal_file.read_text(encoding="utf-8"))
    if (journal.get("schemaVersion") != 1 or
            journal.get("projectId") != p.PROJECT or journal.get("voice") != p.VOICE or
            journal.get("approvedCalls") != p.CALLS or
            journal.get("approvedCharacters") != p.CHARS or
            journal.get("approvedUtf8Bytes") != p.BYTES or
            journal.get("sourceSha256") != p.SOURCE_SHA256):
        raise ValueError("Approval journal scope does not match.")
    records = journal.get("records")
    if not isinstance(records, list) or len(records) != p.CALLS:
        raise ValueError("Seven API attempts were not recorded.")
    for desired, recorded in zip(planned, records):
        if not isinstance(recorded, dict) or recorded.get("status") != "saved":
            raise ValueError("One or more audio API attempts is incomplete.")
        for field in ("number", "topicId", "field", "part", "relativeFile", "characters", "utf8Bytes"):
            if recorded.get(field) != desired[field]:
                raise ValueError("An API attempt does not correspond to the approved MP3.")
    size_bytes = sum(item["file"].stat().st_size for item in planned)
    if size_bytes > min(u.MAX_BYTES, MAX_PRIVATE_PILOT_BYTES):
        raise ValueError("Unexpected audio size; abort any upload plan.")

    if archive_path.is_symlink() or not archive_path.is_file():
        raise ValueError("Verified original listening ZIP is missing or symlinked.")
    with zipfile.ZipFile(archive_path) as archive:
        expected_names = {item["friendly"] for item in planned}
        if set(archive.namelist()) != expected_names or archive.testzip() is not None:
            raise ValueError("Existing listening ZIP content does not match seven MP3s.")
        for item in planned:
            if hashlib.sha256(archive.read(item["friendly"])).digest() != \
                    hashlib.sha256(item["file"].read_bytes()).digest():
                raise ValueError("Listening ZIP and local MP3 bytes differ.")
    return {"files": p.CALLS, "fields": len(p.TARGETS),
            "audioBytes": size_bytes, "characters": p.CHARS, "utf8Bytes": p.BYTES,
            "bucket": BUCKET, "prefix": u.OBJECT_ROOT}


def main() -> int:
    try:
        result = audit_local()
        print("STAGE4 PRIVATE AUDIO PREFLIGHT PASSED")
        print("Selected: {fields} fields | MP3: {files}".format(**result))
        print("Original synthesis: 7 API calls | 984 characters | 1612 UTF-8 bytes")
        print("Private MP3 total size: {} bytes".format(result["audioBytes"]))
        print("Future GCS target: gs://{bucket}/{prefix}/".format(**result))
        print("NOTE: 7 MP3s cover 3 fields only; full PWA topic-first playback is NOT ready.")
        print("DRY RUN - NO GCS REQUESTS, NO UPLOAD, NO FILE WRITES, NO TTS CALLS")
        print("PRIVATE GCS UPLOAD REQUIRES SEPARATE EXPLICIT USER APPROVAL")
        return 0
    except (ValueError, OSError, RuntimeError, json.JSONDecodeError,
            zipfile.BadZipFile) as exc:
        print("STOP: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
