#!/usr/bin/env python3
"""Read-only 7x984 Aoede preflight; no synthesis or paid API functionality.

The user's old approval (7 calls / 939 characters) does not authorize 984.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

import generate_mp3 as t

PROJECT = "study-note-tts"
VOICE = "ko-KR-Chirp3-HD-Aoede"
SOURCE_SHA256 = "e7156d8a9377b9cc0421dbb52f3fa3838dc19a7287887486ac2833afd37a33f2"
GENERATOR_BLOB = "81d1a029e8cefc9d51877afaf31d53dd86f96944"
DICTIONARY_BLOB = "dc3e1ceadde023a81475e4012b1fd770a56866b4"
TOPIC_IDS = ("T0001", "T1961", "T2238", "T2176", "T2354")
# topic, field, number of MP3 chunks, characters, UTF-8 bytes
TARGETS = (
    ("T0001", "concept", 1, 80, 132),
    ("T2176", "components", 2, 346, 630),
    ("T2354", "components", 4, 558, 850),
)
CALLS = 7
CHARS = 984
BYTES = 1612
ROOT = Path(__file__).resolve().parent


def private_paths() -> tuple[Path, Path, Path]:
    home = Path.home()
    return (home / "study-note-tts-real-5.json",
            home / "study-tts-quality-aoede-7x984",
            home / "study-tts-quality-aoede-7x984.zip")


def git_blob_hash(path: Path) -> str:
    data = path.read_bytes()
    return hashlib.sha1(
        b"blob " + str(len(data)).encode("ascii") + b"\0" + data
    ).hexdigest()


def check_cloud_locks() -> None:
    settings = json.loads((ROOT / "cloud-project.json").read_text(encoding="utf-8"))
    if settings.get("schemaVersion") != 1 or settings.get("projectId") != PROJECT:
        raise ValueError("Unexpected Google Cloud project or settings.")
    for flag in ("ttsGenerationApproved", "gcsUploadApproved",
                 "cloudRunRevisionUpdateUserApproved"):
        if settings.get(flag) is not False:
            raise ValueError("Cloud approval unexpectedly enabled: " + flag)


def verify_plan() -> list[dict]:
    source, output_dir, archive = private_paths()
    if (output_dir.exists() or archive.exists() or
            archive.with_name(archive.name + ".pending").exists()):
        raise ValueError("Existing quality outputs detected; never overwrite or retry.")
    if not source.is_file():
        raise ValueError("Private 5-topic source JSON is missing.")
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError("Private source SHA-256 mismatch: STOP.")
    if git_blob_hash(ROOT / "generate_mp3.py") != GENERATOR_BLOB:
        raise ValueError("Generator version mismatch: STOP.")
    if git_blob_hash(ROOT / "pronunciations.ko-candidates.json") != DICTIONARY_BLOB:
        raise ValueError("Pronunciation dictionary version mismatch: STOP.")
    check_cloud_locks()
    topics = t.get_topics(source)
    if tuple(x.get("topicId") for x in topics) != TOPIC_IDS:
        raise ValueError("Unexpected topic IDs or order.")
    if any(x.get("studyTarget") != "Y" for x in topics):
        raise ValueError("Study target must be Y.")
    topic_map = {x["topicId"]: x for x in topics}
    dictionary = t.load_dictionary(ROOT / "pronunciations.ko-candidates.json")
    entries = []
    for tid, field, pieces, chars, size in TARGETS:
        result = t.plan([topic_map[tid]], VOICE, {field}, dictionary, output_dir,
                        {"schemaVersion": 1, "entries": {}}, 1)
        if len(result) != 1:
            raise ValueError("Missing target field: " + tid + "/" + field)
        entry = result[0]
        if entry["key"] != tid + ":" + field + ":" + VOICE:
            raise ValueError("Unexpected voice/topic/field.")
        chunks, paths = entry["chunks"], entry["files"]
        if (len(chunks) != pieces or len(paths) != pieces or
                sum(map(len, chunks)) != chars or
                sum(map(t.utf8_len, chunks)) != size):
            raise ValueError("Speech limits changed for " + tid + "/" + field)
        field_id, prop, label = next(row for row in t.FIELDS if row[0] == field)
        heading = label + t._agree_particle("는", label) + ", " + t.PAUSE_MARKER
        if not chunks[0].startswith(heading):
            raise ValueError("Spoken heading and pause not applied.")
        original = str(topic_map[tid][prop]).strip()
        speech = t.for_speech(label, field, original, dictionary)
        if "".join("".join(x.split()) for x in chunks) != "".join(speech.split()):
            raise ValueError("Speech content lost across chunks.")
        for rel, chunk in zip(paths, chunks):
            if not re.fullmatch(
                r"ko-KR-Chirp3-HD-Aoede/T[0-9]{4,6}/(?:concept|components)-[0-9a-f]{12}(?:-p[0-9]{2})?\.mp3",
                rel,
            ):
                raise ValueError("Unexpected MP3 output path.")
            if (not chunk or t.utf8_len(chunk) > t.MAX_REQUEST_BYTES or
                    len(chunk) > t.MAX_SPEECH_CHARS):
                raise ValueError("Out-of-bounds speech segment.")
            if t.PAUSE_MARKER in chunk and t.synthesis_input(chunk) != {"markup": chunk}:
                raise ValueError("Pause would not be sent as Chirp markup.")
        entries.append(entry)
    chunks = [part for entry in entries for part in entry["chunks"]]
    if (len(chunks) != CALLS or sum(map(len, chunks)) != CHARS or
            sum(map(t.utf8_len, chunks)) != BYTES):
        raise ValueError("Totals differ from exact 7x984/1612 preview.")
    return entries


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Only read-only Aoede 7x984 verification.")
    parser.parse_args(argv)
    try:
        entries = verify_plan()
        print("PREFLIGHT PASSED")
        for entry in entries:
            print(entry["topicId"], entry["key"].split(":")[1],
                  "requests:", len(entry["chunks"]),
                  "chars:", sum(map(len, entry["chunks"])),
                  "bytes:", sum(map(t.utf8_len, entry["chunks"])))
        print("Requests: 7 | Characters: 984 | UTF-8 bytes: 1612")
        print("DRY RUN - NO API CALLS, NO MP3 GENERATED, NO FILE WRITES")
        print("PAID SYNTHESIS NOT APPROVED FOR 984 CHARACTERS")
        return 0
    except (ValueError, OSError, RuntimeError, json.JSONDecodeError) as exc:
        print("STOP: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
