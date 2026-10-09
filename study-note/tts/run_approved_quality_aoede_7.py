#!/usr/bin/env python3
"""One-time, exact-scope quality listening pilot for three private study fields.

Authorized scope: Aoede, T0001/concept (1), T2176/components (2),
T2354/components (4); at most 7 Cloud TTS POSTs, 939 input characters.
No retries. No GCS, Cloud Run, Sheets, Apps Script, or GitHub writes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

import generate_mp3 as t

PROJECT = "study-note-tts"
VOICE = "ko-KR-Chirp3-HD-Aoede"
SAMPLE_SHA256 = "e7156d8a9377b9cc0421dbb52f3fa3838dc19a7287887486ac2833afd37a33f2"
GENERATOR_GIT_BLOB = "66257c47db82fa69c234ffaffcedbe49744ee7d8"
DICTIONARY_GIT_BLOB = "dc3e1ceadde023a81475e4012b1fd770a56866b4"
EXPECTED_TOPICS = ("T0001", "T1961", "T2238", "T2176", "T2354")
# (topic ID, field, number of resulting MP3 chunks, total chars after splitting)
TARGETS = (
    ("T0001", "concept", 1, 65),
    ("T2176", "components", 2, 331),
    ("T2354", "components", 4, 543),
)
MAX_CALLS = 7
MAX_CHARS = 939
MAX_UTF8_BYTES = MAX_CHARS * 4  # strict upper bound; actual bytes shown by preflight
ROOT = Path(__file__).resolve().parent


def private_paths() -> tuple[Path, Path, Path]:
    home = Path.home()
    return (home / "study-note-tts-real-5.json",
            home / "study-tts-quality-aoede-7",
            home / "study-tts-quality-aoede-7.zip")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_blob_hash(path: Path) -> str:
    data = path.read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def check_cloud_locks() -> None:
    settings = json.loads((ROOT / "cloud-project.json").read_text(encoding="utf-8"))
    if settings.get("schemaVersion") != 1 or settings.get("projectId") != PROJECT:
        raise ValueError("Unexpected project or Cloud configuration.")
    for key in ("ttsGenerationApproved", "gcsUploadApproved",
                "cloudRunRevisionUpdateUserApproved"):
        if settings.get(key) is not False:
            raise ValueError("Global Cloud approval must remain false: " + key)


def verify_plan(source: Path, destination: Path, zip_path: Path) -> list[dict]:
    """Strict read-only preflight. Existing outputs permanently block repetition."""
    pending = zip_path.with_name(zip_path.name + ".pending")
    if destination.exists() or zip_path.exists() or pending.exists():
        raise ValueError("Quality pilot output already exists: DO NOT RETRY or overwrite.")
    if not source.is_file():
        raise ValueError("Private approved sample JSON is missing.")
    if sha256_file(source) != SAMPLE_SHA256:
        raise ValueError("Approved 5-topic JSON SHA-256 does not match.")
    if git_blob_hash(ROOT / "generate_mp3.py") != GENERATOR_GIT_BLOB:
        raise ValueError("Generator changed since this approval; execution blocked.")
    if git_blob_hash(ROOT / "pronunciations.ko-candidates.json") != DICTIONARY_GIT_BLOB:
        raise ValueError("Pronunciation dictionary changed; execution blocked.")
    check_cloud_locks()
    topics = t.get_topics(source)
    if tuple(item["topicId"] for item in topics) != EXPECTED_TOPICS:
        raise ValueError("Approved private sample topics or ordering changed.")
    if any(item.get("studyTarget") != "Y" for item in topics):
        raise ValueError("Approved sample contains a non-study topic.")
    topic_map = {item["topicId"]: item for item in topics}
    dictionary = t.load_dictionary(ROOT / "pronunciations.ko-candidates.json")
    tasks = []
    for topic_id, field, expected_pieces, expected_characters in TARGETS:
        one = t.plan([topic_map[topic_id]], VOICE, {field}, dictionary, destination,
                     {"schemaVersion": 1, "entries": {}}, 1)
        if len(one) != 1:
            raise ValueError("Missing or unexpected field: " + topic_id + "/" + field)
        entry = one[0]
        if entry["key"] != topic_id + ":" + field + ":" + VOICE:
            raise ValueError("Approved topic-field-voice binding differs.")
        chunks = entry["chunks"]
        if len(chunks) != expected_pieces or len(entry["files"]) != expected_pieces:
            raise ValueError("Unexpected chunk count for " + topic_id + "/" + field)
        if sum(map(len, chunks)) != expected_characters:
            raise ValueError("Unexpected speech characters for " + topic_id + "/" + field)
        if not any(t.PAUSE_MARKER in chunk for chunk in chunks):
            raise ValueError("Pause control is missing for " + topic_id + "/" + field)
        for path, chunk in zip(entry["files"], chunks):
            if not re.fullmatch(
                r"ko-KR-Chirp3-HD-Aoede/T[0-9]{4,6}/(?:concept|components)-[a-f0-9]{12}(?:-p[0-9]{2})?\.mp3",
                path,
            ):
                raise ValueError("Unsafe or unexpected MP3 path: " + path)
            if t.utf8_len(chunk) > t.MAX_REQUEST_BYTES or not chunk:
                raise ValueError("Oversized or empty MP3 synthesis chunk.")
            if t.PAUSE_MARKER in chunk and t.synthesis_input(chunk) != {"markup": chunk}:
                raise ValueError("Pause markup is not sent through the markup API input.")
        tasks.append(entry)
    count = sum(len(entry["chunks"]) for entry in tasks)
    characters = sum(len(part) for entry in tasks for part in entry["chunks"])
    byte_count = sum(t.utf8_len(part) for entry in tasks for part in entry["chunks"])
    if (count != MAX_CALLS or characters != MAX_CHARS or
            byte_count > MAX_UTF8_BYTES):
        raise ValueError("The 7-call / 939-character approved ceiling does not match.")
    if len({path for entry in tasks for path in entry["files"]}) != MAX_CALLS:
        raise ValueError("MP3 output paths are not unique.")
    return tasks


def check_active_project() -> None:
    process = subprocess.run(["gcloud", "config", "get-value", "project"],
                             capture_output=True, text=True, check=True, timeout=20)
    if process.stdout.strip() != PROJECT:
        raise ValueError("Wrong gcloud project; use: gcloud config set project study-note-tts")


def save_attempts(destination: Path, attempts: list[dict]) -> None:
    journal = {
        "schemaVersion": 1,
        "projectId": PROJECT,
        "voice": VOICE,
        "approvedCalls": MAX_CALLS,
        "approvedCharacters": MAX_CHARS,
        "sourceSha256": SAMPLE_SHA256,
        "attempts": attempts,
    }
    t.atomic_write(destination / "attempts.json",
                   (json.dumps(journal, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


def synthesize_once(tasks: list[dict], destination: Path, zip_path: Path) -> None:
    """Write journal BEFORE each POST, with no automatic retry on any failure."""
    check_active_project()
    access_token = t.access_token()  # Resolve auth before claiming the one-shot folder.
    destination.mkdir(mode=0o700)    # Atomic lock: never use exist_ok=True.
    attempts = []
    save_attempts(destination, attempts)
    manifest = {"schemaVersion": 1, "entries": {}}
    ledger = destination / "local-charge-guard.json"
    pending = zip_path.with_name(zip_path.name + ".pending")
    try:
        for entry in tasks:
            for i, chunk in enumerate(entry["chunks"]):
                calls = len(attempts) + 1
                total_chars = sum(a["characters"] for a in attempts) + len(chunk)
                total_bytes = sum(a["utf8Bytes"] for a in attempts) + t.utf8_len(chunk)
                if calls > MAX_CALLS or total_chars > MAX_CHARS or total_bytes > MAX_UTF8_BYTES:
                    raise RuntimeError("STOP: approval ceiling reached before API request.")
                t.reserve_charge(ledger, t.current_month(), t.utf8_len(chunk))
                relpath = entry["files"][i]
                record = {
                    "number": calls,
                    "topicId": entry["topicId"],
                    "field": entry["key"].split(":")[1],
                    "part": i + 1,
                    "relativeFile": relpath,
                    "characters": len(chunk),
                    "utf8Bytes": t.utf8_len(chunk),
                    "status": "attempted",
                }
                attempts.append(record)
                save_attempts(destination, attempts)
                print("Synthesizing {}/7: {} {} part {}".format(
                    calls, record["topicId"], record["field"], i + 1), flush=True)
                audio = t.synthesize(chunk, VOICE, PROJECT, access_token)
                t.atomic_write(destination / relpath, audio)
                record["status"] = "saved"
                save_attempts(destination, attempts)
            manifest["entries"][entry["key"]] = {
                "sha256": entry["originalHash"],
                "speechSha256": entry["speechHash"],
                **({"file": entry["files"][0]} if len(entry["files"]) == 1
                   else {"files": entry["files"]}),
            }
            t.manifest_save(destination / "index.json", manifest)

        if len(attempts) != MAX_CALLS or any(r["status"] != "saved" for r in attempts):
            raise RuntimeError("Incomplete attempt journal; no ZIP will be created.")
        if len(manifest["entries"]) != len(TARGETS):
            raise RuntimeError("Incomplete private manifest.")
        if sum(r["characters"] for r in attempts) != MAX_CHARS:
            raise RuntimeError("Final character count differs from approval.")
        for record in attempts:
            audio_path = destination / record["relativeFile"]
            if not audio_path.is_file() or audio_path.stat().st_size < 100:
                raise RuntimeError("Missing or empty MP3: ZIP creation blocked.")
        # ZIP contains only the seven listening files, no private topic text/token/logs.
        with zipfile.ZipFile(pending, "x", compression=zipfile.ZIP_STORED) as archive:
            for entry in tasks:
                topic = entry["topicId"]
                field = entry["key"].split(":")[1]
                for i, relative in enumerate(entry["files"], start=1):
                    archive.write(destination / relative, "{}/{:02d}_{}.mp3".format(topic, i, field))
        with zipfile.ZipFile(pending, "r") as archive:
            if len(archive.infolist()) != MAX_CALLS or archive.testzip() is not None:
                raise RuntimeError("Invalid ZIP content: no publication.")
        os.link(pending, zip_path)  # Atomic publish; never overwrite an existing ZIP.
        pending.unlink()
        print("\nQUALITY AOEDE 7 PILOT COMPLETE", flush=True)
        print("API attempts: 7", flush=True)
        print("Characters attempted: 939", flush=True)
        print("UTF-8 bytes attempted: {}".format(sum(r["utf8Bytes"] for r in attempts)), flush=True)
        print("MP3 files: 7", flush=True)
        print("ZIP: {}".format(zip_path), flush=True)
        print("Private manifest and attempts: {}".format(destination), flush=True)
        print("GCS: NOT RUN | Cloud Run: NOT RUN | main: UNCHANGED", flush=True)
    except BaseException:
        print("\nSTOPPED. DO NOT RERUN OR DELETE outputs; preserve attempts.json.",
              file=sys.stderr, flush=True)
        print("Attempt records: {}".format(len(attempts)), file=sys.stderr, flush=True)
        print("Output folder: {}".format(destination), file=sys.stderr, flush=True)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="One-shot Aoede quality pilot, DRY RUN by default.")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--accept-possible-charges", action="store_true")
    parser.add_argument("--approve-exact-7x939", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.execute and not (args.accept_possible_charges and args.approve_exact_7x939):
            raise ValueError("--execute requires BOTH approval options.")
        if not args.execute and (args.accept_possible_charges or args.approve_exact_7x939):
            raise ValueError("Approval flags only apply with --execute.")
        source, destination, archive = private_paths()
        tasks = verify_plan(source, destination, archive)
        count = sum(len(entry["chunks"]) for entry in tasks)
        chars = sum(len(chunk) for entry in tasks for chunk in entry["chunks"])
        byte_count = sum(t.utf8_len(chunk) for entry in tasks for chunk in entry["chunks"])
        print("PREFLIGHT PASSED", flush=True)
        print("Voice: {} | Topics: 3 | Fields: 3".format(VOICE), flush=True)
        print("Requests: {} | Characters: {} | UTF-8 bytes: {}".format(
            count, chars, byte_count), flush=True)
        if not args.execute:
            print("DRY RUN - NO API CALLS, NO MP3 GENERATED, NO FILE WRITES", flush=True)
            return 0
        print("EXECUTE: up to 7 chargeable Google Cloud TTS POSTs (939 characters).",
              flush=True)
        synthesize_once(tasks, destination, archive)
        return 0
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError,
            json.JSONDecodeError) as exc:
        print("ERROR: " + str(exc), file=sys.stderr, flush=True)
        return 2
    except KeyboardInterrupt:
        print("INTERRUPTED: NEVER rerun; preserve attempts.json", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
