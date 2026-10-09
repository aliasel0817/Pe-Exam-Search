#!/usr/bin/env python3
"""One-shot, explicitly authorized Study Note Aoede pilot: five private topics.

Only --execute together with BOTH approval flags can call Cloud TTS.
Always fail closed if output exists, even if the previous run only partly completed.
No GCS, Cloud Run, Google Sheets, GitHub write, or production PWA action.
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
TOPIC_IDS = ("T0001", "T1961", "T2238", "T2176", "T2354")
FIELD_IDS = ("topic", "concept", "background", "necessity", "features", "components", "keywords")
EXPECTED_CALLS = 35
EXPECTED_CHARS = 4577
EXPECTED_BYTES = 8674
EXPECTED_SAMPLE_SHA256 = "e7156d8a9377b9cc0421dbb52f3fa3838dc19a7287887486ac2833afd37a33f2"
EXPECTED_GENERATOR_GIT_SHA = "04e5f3f992b5d8883cb502afd9fbb45b3024526b"
EXPECTED_DICTIONARY_GIT_SHA = "dc3e1ceadde023a81475e4012b1fd770a56866b4"
ROOT = Path(__file__).resolve().parent


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_blob_hash(path: Path) -> str:
    contents = path.read_bytes()
    blob = b"blob " + str(len(contents)).encode("ascii") + b"\0" + contents
    return hashlib.sha1(blob).hexdigest()


def private_paths() -> tuple[Path, Path, Path]:
    home = Path.home()
    return (
        home / "study-note-tts-real-5.json",
        home / "study-tts-stage3-aoede-5",
        home / "study-tts-stage3-aoede-5.zip",
    )


def verify_plan(source: Path, destination: Path, zip_path: Path) -> list[dict]:
    """Read-only preflight; exact data, source, requests, texts and cloud locks."""
    if destination.exists() or zip_path.exists() or zip_path.with_suffix(".zip.pending").exists():
        raise ValueError("Pilot output/ZIP already exists. No retry or overwrite permitted.")
    if not source.is_file():
        raise ValueError("Private five-topic JSON is missing from Cloud Shell home directory.")
    if sha256_file(source) != EXPECTED_SAMPLE_SHA256:
        raise ValueError("Private topic JSON differs from the approved five-topic sample.")
    if git_blob_hash(ROOT / "generate_mp3.py") != EXPECTED_GENERATOR_GIT_SHA:
        raise ValueError("The generator version changed. Recheck before approved synthesis.")
    dictionary_file = ROOT / "pronunciations.ko-candidates.json"
    if git_blob_hash(dictionary_file) != EXPECTED_DICTIONARY_GIT_SHA:
        raise ValueError("The pronunciation dictionary changed. Recheck before synthesis.")

    settings = json.loads((ROOT / "cloud-project.json").read_text(encoding="utf-8"))
    if settings.get("projectId") != PROJECT or settings.get("schemaVersion") != 1:
        raise ValueError("Unexpected Google Cloud project or configuration schema.")
    for flag in ("ttsGenerationApproved", "gcsUploadApproved", "cloudRunRevisionUpdateUserApproved"):
        if settings.get(flag) is not False:
            raise ValueError("Unsafe global permission setting: " + flag)

    raw = json.loads(source.read_text(encoding="utf-8-sig"))
    raw_topics = raw.get("topics") if isinstance(raw, dict) else raw
    if not isinstance(raw_topics, list) or len(raw_topics) != len(TOPIC_IDS):
        raise ValueError("Expected exactly five private sample topics.")
    if tuple(topic.get("topicId") for topic in raw_topics) != TOPIC_IDS:
        raise ValueError("Unexpected topic IDs or order.")
    if any(topic.get("studyTarget") != "Y" for topic in raw_topics):
        raise ValueError("A selected topic is not marked studyTarget=Y.")
    if any(not str(topic.get(prop, "")).strip() for topic in raw_topics
           for field, prop, _ in t.FIELDS if field in FIELD_IDS):
        raise ValueError("Empty approved speech field.")

    tasks = t.plan(
        t.get_topics(source), VOICE, set(FIELD_IDS),
        t.load_dictionary(dictionary_file), destination,
        {"schemaVersion": 1, "entries": {}}, len(TOPIC_IDS),
    )
    requests = sum(len(entry["chunks"]) for entry in tasks)
    characters = sum(len(chunk) for entry in tasks for chunk in entry["chunks"])
    utf8_bytes = sum(t.utf8_len(chunk) for entry in tasks for chunk in entry["chunks"])
    expected_keys = [f"{topic_id}:{field}:{VOICE}" for topic_id in TOPIC_IDS for field in FIELD_IDS]
    if [entry["key"] for entry in tasks] != expected_keys:
        raise ValueError("The 35 planned topic-field entries do not match the approved scope.")
    if len(tasks) != EXPECTED_CALLS or requests != EXPECTED_CALLS:
        raise ValueError("Approved 35-call limit does not match the generation plan.")
    if characters != EXPECTED_CHARS or utf8_bytes != EXPECTED_BYTES:
        raise ValueError("Approved text length differs: " + str(characters) + " chars, " + str(utf8_bytes) + " bytes.")
    for entry in tasks:
        if len(entry["chunks"]) != 1 or len(entry["files"]) != 1:
            raise ValueError("A field unexpectedly requires multiple API calls.")
        relative = entry["files"][0]
        if not re.fullmatch(r"ko-KR-Chirp3-HD-Aoede/T[0-9]{4,6}/(?:topic|concept|background|necessity|features|components|keywords)-[a-f0-9]{12}\.mp3", relative):
            raise ValueError("Invalid manifest path: " + relative)
        if t.utf8_len(entry["chunks"][0]) > t.MAX_REQUEST_BYTES:
            raise ValueError("An API input chunk exceeds the per-request byte limit.")
    if len({entry["files"][0] for entry in tasks}) != EXPECTED_CALLS:
        raise ValueError("Output paths are not unique.")
    return tasks


def save_attempts(destination: Path, attempts: list[dict]) -> None:
    t.atomic_write(
        destination / "attempts.json",
        (json.dumps({
            "schemaVersion": 1,
            "projectId": PROJECT,
            "voice": VOICE,
            "approvedCalls": EXPECTED_CALLS,
            "approvedCharacters": EXPECTED_CHARS,
            "approvedUtf8Bytes": EXPECTED_BYTES,
            "sourceSha256": EXPECTED_SAMPLE_SHA256,
            "attempts": attempts,
        }, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )


def check_active_project() -> None:
    result = subprocess.run(
        ["gcloud", "config", "get-value", "project"],
        capture_output=True, text=True, timeout=20, check=True,
    )
    if result.stdout.strip() != PROJECT:
        raise ValueError(
            "Wrong Cloud Shell project. First run: gcloud config set project study-note-tts"
        )


def synthesize_once(tasks: list[dict], destination: Path, zip_path: Path) -> None:
    """No retries: preserve incomplete output and attempt journal on any error."""
    check_active_project()
    token = t.access_token()  # Must succeed before creating the irreversible one-shot directory.
    destination.mkdir(mode=0o700)  # FileExistsError prevents concurrent/double runs.
    attempts: list[dict] = []
    save_attempts(destination, attempts)
    manifest = {"schemaVersion": 1, "entries": {}}
    ledger_file = destination / "local-charge-guard.json"
    try:
        for entry in tasks:
            part = entry["chunks"][0]
            bytes_used = t.utf8_len(part)
            used_calls = len(attempts) + 1
            used_chars = sum(item["characters"] for item in attempts) + len(part)
            used_bytes = sum(item["utf8Bytes"] for item in attempts) + bytes_used
            if used_calls > EXPECTED_CALLS or used_chars > EXPECTED_CHARS or used_bytes > EXPECTED_BYTES:
                raise RuntimeError("STOP: Pilot approved budget exhausted before API request.")
            t.reserve_charge(ledger_file, t.current_month(), bytes_used)
            target = destination / entry["files"][0]
            record = {
                "number": used_calls,
                "topicId": entry["topicId"],
                "field": entry["key"].split(":")[1],
                "relativeFile": entry["files"][0],
                "characters": len(part),
                "utf8Bytes": bytes_used,
                "status": "attempted",
            }
            attempts.append(record)
            save_attempts(destination, attempts)  # Durably record BEFORE POST.
            print(f"Synthesizing {used_calls}/{EXPECTED_CALLS}: {record['topicId']} {record['field']}", flush=True)
            audio = t.synthesize(part, VOICE, PROJECT, token)  # Exactly one POST; no retries.
            t.atomic_write(target, audio)
            manifest["entries"][entry["key"]] = {
                "sha256": entry["originalHash"],
                "speechSha256": entry["speechHash"],
                "file": entry["files"][0],
            }
            t.manifest_save(destination / "index.json", manifest)
            record["status"] = "saved"
            save_attempts(destination, attempts)

        if len(attempts) != EXPECTED_CALLS or any(item["status"] != "saved" for item in attempts):
            raise RuntimeError("Incomplete attempt journal; ZIP generation refused.")
        if len(manifest["entries"]) != EXPECTED_CALLS:
            raise RuntimeError("Incomplete TTS manifest; ZIP generation refused.")
        if sum(item["characters"] for item in attempts) != EXPECTED_CHARS:
            raise RuntimeError("Unexpected final character count.")
        for entry in tasks:
            target = destination / entry["files"][0]
            if not target.is_file() or target.stat().st_size < 100:
                raise RuntimeError("Missing or empty MP3; ZIP generation refused.")

        # Zip contains exactly 35 listening-friendly files, with NO auth data or ledger.
        pending = zip_path.with_suffix(".zip.pending")
        with zipfile.ZipFile(pending, "x", compression=zipfile.ZIP_STORED) as archive:
            for entry in tasks:
                topic_id, field, _ = entry["key"].split(":")
                field_number = FIELD_IDS.index(field) + 1
                filename = f"{topic_id}/{field_number:02d}_{field}.mp3"
                archive.write(destination / entry["files"][0], filename)
        with zipfile.ZipFile(pending, "r") as archive:
            if len(archive.infolist()) != EXPECTED_CALLS or archive.testzip() is not None:
                raise RuntimeError("ZIP verification failed; do not upload or rerun.")
        os.link(pending, zip_path)  # Atomic no-overwrite publish; hard link fails if ZIP exists.
        pending.unlink()
        print("\nSTAGE3 AOEDE PILOT COMPLETE", flush=True)
        print(f"API attempts: {len(attempts)}", flush=True)
        print(f"Characters attempted: {EXPECTED_CHARS}", flush=True)
        print(f"MP3 files: {EXPECTED_CALLS}", flush=True)
        print(f"ZIP: {zip_path}", flush=True)
        print(f"Private manifest and attempts: {destination}", flush=True)
        print("GCS upload: NOT RUN | Cloud Run deploy: NOT RUN | main: UNCHANGED", flush=True)
    except BaseException:
        print("\nSTOPPED: Do not rerun or delete this folder. Keep attempts.json for review.", file=sys.stderr, flush=True)
        print(f"Attempts recorded: {len(attempts)}", file=sys.stderr, flush=True)
        print(f"Local directory: {destination}", file=sys.stderr, flush=True)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Exact one-shot Aoede five-topic approval; DRY RUN by default.")
    parser.add_argument("--execute", action="store_true", help="Actually synthesize 35 private MP3 files.")
    parser.add_argument("--accept-possible-charges", action="store_true")
    parser.add_argument("--approve-exact-35x4577", action="store_true")
    args = parser.parse_args(argv)
    try:
        source, destination, zip_path = private_paths()
        if args.execute and not (args.accept_possible_charges and args.approve_exact_35x4577):
            raise ValueError("--execute requires BOTH --accept-possible-charges and --approve-exact-35x4577.")
        if not args.execute and (args.accept_possible_charges or args.approve_exact_35x4577):
            raise ValueError("Approval flags may only be combined with --execute.")
        tasks = verify_plan(source, destination, zip_path)
        print("PREFLIGHT PASSED", flush=True)
        print(f"Voice: {VOICE} | Topics: {len(TOPIC_IDS)} | Fields: {len(FIELD_IDS)}", flush=True)
        print(f"Requests: {EXPECTED_CALLS} | Characters: {EXPECTED_CHARS} | UTF-8 bytes: {EXPECTED_BYTES}", flush=True)
        if not args.execute:
            print("DRY RUN - NO API CALLS, NO MP3 GENERATED, NO FILE WRITES", flush=True)
            return 0
        print("EXECUTE: This makes up to 35 paid-capable Google TTS POST requests.", flush=True)
        synthesize_once(tasks, destination, zip_path)
        return 0
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        print("ERROR: " + str(exc), file=sys.stderr, flush=True)
        return 2
    except KeyboardInterrupt:
        print("INTERRUPTED: Do not rerun. Preserve the attempts journal.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
