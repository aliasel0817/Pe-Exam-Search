#!/usr/bin/env python3
"""Read-only verification of the FIVE already-generated Aoede topic-intro MP3s.

No new synthesis, GCS calls, file writes, ZIP rewriting, or Cloud Run deploy.
This verifies the real saved audio, manifest, attempts ledger, source binding,
and ZIP byte-for-byte against the separately approved five-title input plan.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

import generate_mp3 as t
import topic_intro_v2 as intro
import stage5_topic_intro_v2_preflight as pre

RUNNER_GIT_BLOB = "58e5aa752ab9630f5890924d0567b56b7a4aaf1f"
EXPECTED_CHARS = 180
EXPECTED_UTF8_BYTES = 292
EXPECTED_CALLS = 5
FIELDS = ("topic",)
_ALLOWED_FLAGS = ("ttsGenerationApproved", "gcsUploadApproved",
                  "cloudRunRevisionUpdateUserApproved")


def _json_file(path: Path) -> dict:
    if path.is_symlink() or not path.is_file():
        raise ValueError("Missing/unsafe private file: " + path.name)
    result = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(result, dict):
        raise ValueError("Invalid JSON object: " + path.name)
    return result


def _mp3_header_ok(data: bytes) -> bool:
    return len(data) > 100 and (
        data.startswith(b"ID3") or (data[0] == 0xFF and data[1] & 0xE0 == 0xE0)
    )


def _inside_regular_file(root: Path, rel: str) -> Path:
    path = root / rel
    if any(part.is_symlink() for part in (root, *path.parents, path)):
        raise ValueError("Symlink in private MP3 path: STOP.")
    if not path.is_file():
        raise ValueError("Missing approved MP3 file: " + rel)
    return path


def verify_private_audio() -> dict:
    """Validate all real outputs; only file reads and in-memory hashes."""
    source, folder, archive = pre.private_paths()
    if source.is_symlink() or not source.is_file():
        raise ValueError("Original five-topic private JSON missing or symlinked.")
    if hashlib.sha256(source.read_bytes()).hexdigest() != pre.SOURCE_SHA256:
        raise ValueError("Private five-topic source SHA-256 changed.")
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError("Generated five-title audio folder missing or symlinked.")
    if archive.is_symlink() or not archive.is_file():
        raise ValueError("Listening ZIP missing or symlinked.")
    for filename, pinned in (
        ("generate_mp3.py", pre.LEGACY_GENERATOR_BLOB),
        ("pronunciations.ko-candidates.json", pre.DICTIONARY_BLOB),
        ("topic_intro_v2.py", pre.INTRO_V2_BLOB),
        ("stage5_topic_intro_v2_preflight.py", RUNNER_PREFLIGHT_BLOB),
        ("run_approved_topic_intro_v2_5.py", RUNNER_GIT_BLOB),
    ):
        if pre.git_blob_hash(pre.ROOT / filename) != pinned:
            raise ValueError("Pinned program/dictionary changed: " + filename)

    config = _json_file(pre.ROOT / "cloud-project.json")
    if config.get("schemaVersion") != 1 or config.get("projectId") != pre.PROJECT:
        raise ValueError("TTS project configuration differs.")
    if any(config.get(flag) is not False for flag in _ALLOWED_FLAGS):
        raise ValueError("Global synthesis/upload/deployment flags must remain false.")

    raw = json.loads(source.read_text(encoding="utf-8-sig"))
    topics = raw.get("topics") if isinstance(raw, dict) else raw
    if not isinstance(topics, list) or len(topics) != EXPECTED_CALLS or any(
        not isinstance(row, dict) for row in topics
    ):
        raise ValueError("Expected exactly five private topic records.")
    if tuple(row.get("topicId") for row in topics) != pre.TOPIC_IDS or any(
        row.get("studyTarget") != "Y" or not str(row.get("topicName", "")).strip()
        for row in topics
    ):
        raise ValueError("Unexpected topic ID, order, title or study target.")

    manifest = _json_file(folder / "index.json")
    journal = _json_file(folder / "attempts.json")
    ledger = _json_file(folder / "local-charge-guard.json")
    entries = manifest.get("entries")
    attempts = journal.get("records")
    if manifest.get("schemaVersion") != 1 or not isinstance(entries, dict) or len(entries) != EXPECTED_CALLS:
        raise ValueError("Manifest must have exactly five title entries.")
    if (journal.get("schemaVersion") != 1 or journal.get("projectId") != pre.PROJECT
            or journal.get("voice") != pre.VOICE or journal.get("introVersion") != intro.INTRO_VERSION
            or journal.get("sourceSha256") != pre.SOURCE_SHA256
            or journal.get("approvedCalls") != EXPECTED_CALLS
            or journal.get("approvedCharacters") != EXPECTED_CHARS
            or journal.get("approvedUtf8Bytes") != EXPECTED_UTF8_BYTES
            or not isinstance(attempts, list) or len(attempts) != EXPECTED_CALLS):
        raise ValueError("Private TTS API attempt journal differs from approved 5x180/292.")
    if not ledger or any(
        not re.fullmatch(r"[0-9]{4}-[0-9]{2}", str(month)) or
        not isinstance(value, int) or isinstance(value, bool) or
        value < 0 or value > t.HARD_MONTHLY_LIMIT
        for month, value in ledger.items()
    ) or sum(ledger.values()) < EXPECTED_UTF8_BYTES:
        raise ValueError("Local paid-use ledger is missing or differs from five requests.")

    dictionary = t.load_dictionary(pre.ROOT / "pronunciations.ko-candidates.json")
    expected_relpaths = set()
    expected_zip_names = set()
    chars_total, bytes_total, audio_bytes = 0, 0, 0
    with zipfile.ZipFile(archive) as zf:
        if zf.testzip() is not None:
            raise ValueError("ZIP CRC integrity check failed.")
        for number, (topic, attempt) in enumerate(zip(topics, attempts), start=1):
            tid = topic["topicId"]
            original = topic["topicName"].strip()
            spoken = intro.topic_intro_text(original, dictionary)
            chunks = t.split_speech(spoken)
            if len(chunks) != 1 or chunks[0] != spoken or not spoken.endswith(intro.INTRO_SUFFIX):
                raise ValueError("Spoken topic narration changed for " + tid)
            if t.synthesis_input(spoken) != {"markup": spoken}:
                raise ValueError("Short pause markup unavailable for " + tid)
            chars_total += len(spoken)
            bytes_total += t.utf8_len(spoken)

            original_hash = t.digest(original)
            speech_hash = t.digest(spoken)
            asset_hash = t.digest(original_hash + "|" + speech_hash)
            relative = t.paths_for(tid, "topic", pre.VOICE, asset_hash, 1)[0]
            key = f"{tid}:topic:{pre.VOICE}"
            stored = entries.get(key)
            if stored != {"sha256": original_hash,
                          "speechSha256": speech_hash, "file": relative}:
                raise ValueError("Manifest source/speech SHA or MP3 binding differs: " + tid)
            if not isinstance(attempt, dict) or any((
                attempt.get("number") != number,
                attempt.get("topicId") != tid,
                attempt.get("field") != "topic",
                attempt.get("introVersion") != intro.INTRO_VERSION,
                attempt.get("relativeFile") != relative,
                attempt.get("characters") != len(spoken),
                attempt.get("utf8Bytes") != t.utf8_len(spoken),
                attempt.get("status") != "saved",
                not isinstance(attempt.get("attemptUtc"), str),
                not bool(attempt.get("attemptUtc")),
            )):
                raise ValueError("Attempt journal record is inconsistent: " + tid)

            path = _inside_regular_file(folder, relative)
            mp3_bytes = path.read_bytes()
            if not _mp3_header_ok(mp3_bytes):
                raise ValueError("Damaged or too-short private MP3: " + tid)
            expected_relpaths.add(relative)
            audio_bytes += len(mp3_bytes)

            zip_name = f"{tid}/01_topic-intro-v2.mp3"
            expected_zip_names.add(zip_name)
            if hashlib.sha256(zf.read(zip_name)).digest() != hashlib.sha256(mp3_bytes).digest():
                raise ValueError("ZIP MP3 SHA-256 differs from private file: " + tid)
        if set(zf.namelist()) != expected_zip_names or len(zf.infolist()) != EXPECTED_CALLS:
            raise ValueError("Listening ZIP does not contain exactly five approved MP3s.")
    actual_relpaths = {
        str(path.relative_to(folder)).replace("\\", "/")
        for path in folder.rglob("*.mp3")
    }
    if actual_relpaths != expected_relpaths:
        raise ValueError("Unapproved or missing MP3s found in private output folder.")
    if (chars_total != EXPECTED_CHARS or bytes_total != EXPECTED_UTF8_BYTES
            or len(expected_relpaths) != EXPECTED_CALLS):
        raise ValueError("Exact approved character/byte count changed.")
    return {
        "files": EXPECTED_CALLS,
        "characters": chars_total,
        "utf8Bytes": bytes_total,
        "audioBytes": audio_bytes,
        "zipBytes": archive.stat().st_size,
        "zipSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "directory": folder,
        "archive": archive,
    }


RUNNER_PREFLIGHT_BLOB = "79b9077a3c7f6d9c45a235fbaaec0837c76b279f"


def main() -> int:
    try:
        result = verify_private_audio()
        print("STAGE5 FIVE TITLE AUDIO INTEGRITY PASSED")
        print(f"MP3: {result['files']} | API saved attempts: 5 | "
              f"Characters: {result['characters']} | UTF-8 bytes: {result['utf8Bytes']}")
        print(f"MP3 total bytes: {result['audioBytes']} | ZIP bytes: {result['zipBytes']}")
        print("ZIP SHA-256: " + result["zipSha256"])
        print("Private MP3 ↔ index.json ↔ attempts.json ↔ ZIP: VERIFIED")
        print("ZIP path: " + str(result["archive"]))
        print("READ-ONLY - NO TTS CALLS, NO GCS, NO CLOUD RUN, NO FILE WRITES")
        return 0
    except (ValueError, OSError, RuntimeError, TypeError, KeyError, json.JSONDecodeError,
            zipfile.BadZipFile) as exc:
        print("STOP: " + str(exc), file=sys.stderr)
        print("Preserve existing MP3s/ZIPs, do not regenerate or re-upload.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
