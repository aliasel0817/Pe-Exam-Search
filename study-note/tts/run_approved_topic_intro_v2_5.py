#!/usr/bin/env python3
"""One-shot, explicitly authorized 5-topic Aoede introduction MP3 pilot.

DRY RUN by default. No Google API can be called unless *all* explicit
execution and exact-count approval flags match the pinned private source.
Existing stage-3 audio/ZIP and stage-4 GCS objects are never read for writing,
regenerated, uploaded, removed, or replaced. No Cloud Run/main changes.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

import generate_mp3 as t
import stage5_topic_intro_v2_preflight as p

PREFLIGHT_GIT_BLOB = "79b9077a3c7f6d9c45a235fbaaec0837c76b279f"
MAX_APPROVED_CALLS = 5
MAX_APPROVABLE_CHARS = 500
MAX_APPROVABLE_UTF8_BYTES = 1500


def approved_plan() -> tuple[list[dict], int, int]:
    """Verify immutable policy, original JSON, 5 exact fields and limits."""
    if p.git_blob_hash(p.ROOT / "stage5_topic_intro_v2_preflight.py") != PREFLIGHT_GIT_BLOB:
        raise ValueError("Pinned title preflight changed: STOP.")
    tasks = p.verify_plan()  # Includes locked permissions and no-overwrite checks.
    if len(tasks) != MAX_APPROVED_CALLS:
        raise ValueError("Exactly five topic-name fields are required.")
    names = tuple(row["topicId"] for row in tasks)
    if names != p.TOPIC_IDS:
        raise ValueError("Unexpected topic IDs or order.")
    paths = []
    for row in tasks:
        if (row["key"] != f"{row['topicId']}:topic:{p.VOICE}" or
                row.get("introVersion") != "topic-about-v2" or
                len(row["chunks"]) != 1 or len(row["files"]) != 1):
            raise ValueError("Unexpected topic field or number of MP3s.")
        relative = row["files"][0]
        if not re.fullmatch(
            rf"{re.escape(p.VOICE)}/{row['topicId']}/topic-[0-9a-f]{{12}}\.mp3",
            relative,
        ):
            raise ValueError("Non-approved MP3 destination.")
        paths.append(relative)
    if len(set(paths)) != MAX_APPROVED_CALLS:
        raise ValueError("Duplicate planned file name.")
    segments = [row["chunks"][0] for row in tasks]
    characters = sum(map(len, segments))
    utf8_bytes = sum(map(t.utf8_len, segments))
    if not (0 < characters <= MAX_APPROVABLE_CHARS and
            0 < utf8_bytes <= MAX_APPROVABLE_UTF8_BYTES):
        raise ValueError("Five-title synthesis budget exceeds hard limits.")
    return tasks, characters, utf8_bytes


def check_active_project() -> None:
    result = subprocess.run(
        ["gcloud", "config", "get-value", "project"],
        text=True, capture_output=True, check=True, timeout=20,
    )
    if result.stdout.strip() != p.PROJECT:
        raise ValueError("Cloud Shell active project is not study-note-tts: STOP.")


def write_attempts(folder: Path, attempts: list[dict], chars: int, bytes_total: int) -> None:
    data = {
        "schemaVersion": 1,
        "projectId": p.PROJECT,
        "voice": p.VOICE,
        "introVersion": "topic-about-v2",
        "sourceSha256": p.SOURCE_SHA256,
        "approvedCalls": MAX_APPROVED_CALLS,
        "approvedCharacters": chars,
        "approvedUtf8Bytes": bytes_total,
        "records": attempts,
    }
    t.atomic_write(
        folder / "attempts.json",
        (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )


def execute_exactly_once(tasks: list[dict], chars: int, bytes_total: int) -> None:
    check_active_project()    # Fail without touching outputs.
    token = t.access_token()  # Fail without touching outputs.
    _, folder, archive = p.private_paths()
    folder.mkdir(mode=0o700)  # Fail if any previous partial or complete output exists.
    attempts: list[dict] = []
    write_attempts(folder, attempts, chars, bytes_total)
    index = {"schemaVersion": 1, "entries": {}}
    ledger = folder / "local-charge-guard.json"
    pending = archive.with_name(archive.name + ".pending")

    try:
        for entry in tasks:
            segment = entry["chunks"][0]
            relpath = entry["files"][0]
            attempt_no = len(attempts) + 1
            if attempt_no > MAX_APPROVED_CALLS:
                raise RuntimeError("Paid TTS call limit reached; STOP.")
            t.reserve_charge(ledger, t.current_month(), t.utf8_len(segment))
            record = {
                "number": attempt_no,
                "topicId": entry["topicId"],
                "field": "topic",
                "introVersion": "topic-about-v2",
                "relativeFile": relpath,
                "characters": len(segment),
                "utf8Bytes": t.utf8_len(segment),
                "attemptUtc": datetime.now(timezone.utc).isoformat(),
                "status": "attempted",
            }
            attempts.append(record)
            write_attempts(folder, attempts, chars, bytes_total)  # Persist before HTTP POST.
            print(f"Synthesizing {attempt_no}/{MAX_APPROVED_CALLS}: {entry['topicId']} topic v2",
                  flush=True)
            mp3 = t.synthesize(segment, p.VOICE, p.PROJECT, token)  # One POST; no retry.
            destination = folder / relpath
            if destination.exists() or destination.is_symlink():
                raise RuntimeError("Refusing MP3 overwrite: " + relpath)
            t.atomic_write(destination, mp3)
            record["status"] = "saved"
            write_attempts(folder, attempts, chars, bytes_total)
            index["entries"][entry["key"]] = {
                "sha256": entry["originalHash"],
                "speechSha256": entry["speechHash"],
                "file": relpath,
            }
            t.manifest_save(folder / "index.json", index)

        if (len(attempts) != MAX_APPROVED_CALLS or
                any(row["status"] != "saved" for row in attempts) or
                sum(row["characters"] for row in attempts) != chars or
                sum(row["utf8Bytes"] for row in attempts) != bytes_total or
                len(index["entries"]) != MAX_APPROVED_CALLS):
            raise RuntimeError("Incomplete journal/manifest or count mismatch.")
        for row in attempts:
            path = folder / row["relativeFile"]
            if not path.is_file() or path.is_symlink() or path.stat().st_size < 100:
                raise RuntimeError("Missing or unsafe MP3; refusing listening ZIP.")
        with zipfile.ZipFile(pending, "x", compression=zipfile.ZIP_STORED) as zipf:
            for row in attempts:
                zipf.write(folder / row["relativeFile"], f"{row['topicId']}/01_topic-intro-v2.mp3")
        with zipfile.ZipFile(pending) as zipf:
            if (len(zipf.namelist()) != MAX_APPROVED_CALLS or
                    len(set(zipf.namelist())) != MAX_APPROVED_CALLS or
                    zipf.testzip() is not None):
                raise RuntimeError("ZIP validation failed.")
        os.link(pending, archive)  # Atomic publish without overwriting previous ZIP.
        pending.unlink()
        print("\nSTAGE5 FIVE TOPIC INTRO V2 AUDIO COMPLETE", flush=True)
        print(f"API attempts: {len(attempts)} | Characters: {chars} | UTF-8 bytes: {bytes_total}",
              flush=True)
        print(f"Private MP3: {folder} | ZIP: {archive}", flush=True)
        print("NO GCS UPLOAD, NO CLOUD RUN DEPLOY, NO MAIN CHANGE", flush=True)
    except BaseException:
        print("\nSTOPPED: Preserve output folder and attempts.json. DO NOT RERUN.",
              file=sys.stderr, flush=True)
        print(f"Recorded attempts: {len(attempts)}", file=sys.stderr, flush=True)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Fixed five-title Aoede synthesis, DRY RUN by default.")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--accept-possible-charges", action="store_true")
    parser.add_argument("--approve-exact-five-intros", action="store_true")
    parser.add_argument("--approve-exact-characters", type=int)
    parser.add_argument("--approve-exact-utf8-bytes", type=int)
    args = parser.parse_args(argv)
    try:
        if args.execute:
            if (not args.accept_possible_charges or not args.approve_exact_five_intros
                    or args.approve_exact_characters is None
                    or args.approve_exact_utf8_bytes is None):
                raise ValueError(
                    "--execute needs BOTH authorization flags and exact character/byte totals.")
        elif (args.accept_possible_charges or args.approve_exact_five_intros or
              args.approve_exact_characters is not None or
              args.approve_exact_utf8_bytes is not None):
            raise ValueError("Approval flags cannot be used without --execute.")

        tasks, chars, utf8_bytes = approved_plan()
        print("STAGE5 FIVE TOPIC INTRO V2 PREFLIGHT PASSED")
        print(f"Proposed TTS calls: {len(tasks)}")
        print(f"Exact synthesis characters: {chars}")
        print(f"UTF-8 input bytes: {utf8_bytes}")
        print(f"Voice: {p.VOICE} | topic IDs: {', '.join(p.TOPIC_IDS)}")
        print(f"Future local output: ~/{p.OUTPUT_NAME}")
        if not args.execute:
            print("DRY RUN - NO API CALLS, NO MP3 GENERATION, NO FILE WRITES")
            return 0
        if (args.approve_exact_characters != chars or
                args.approve_exact_utf8_bytes != utf8_bytes):
            raise ValueError("User-approved exact character/byte totals differ; no API call.")
        print("EXECUTE: up to 5 paid-capable Cloud TTS API POSTs, NO RETRIES", flush=True)
        execute_exactly_once(tasks, chars, utf8_bytes)
        return 0
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError,
            json.JSONDecodeError) as error:
        print("STOP: " + str(error), file=sys.stderr, flush=True)
        return 2
    except KeyboardInterrupt:
        print("INTERRUPTED: keep attempts.json and do not rerun.", file=sys.stderr, flush=True)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
