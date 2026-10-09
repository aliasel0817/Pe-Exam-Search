#!/usr/bin/env python3
"""Approved one-shot Aoede listening pilot: exactly 7 segments / 984 chars / 1612B.

Works only with the pinned, read-only 7x984 preflight and the exact five-topic
private JSON. No retries, no GCS upload, no Cloud Run or production changes.
Only --execute plus BOTH explicit approval switches can invoke the TTS API.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

import generate_mp3 as t
import quality_aoede_7x984_preflight as p

PREFLIGHT_GIT_BLOB = "7bf74f90c47d4e5982cecac8bcec873a771946cd"


def validated_tasks() -> list[dict]:
    """Return only the 7 previously verified private chunks, without writes."""
    if p.git_blob_hash(p.ROOT / "quality_aoede_7x984_preflight.py") != PREFLIGHT_GIT_BLOB:
        raise ValueError("Preflight version changed; approved synthesis blocked.")
    tasks = p.verify_plan()
    if len(tasks) != len(p.TARGETS):
        raise ValueError("Exactly three approved topic-field groups are required.")
    for entry, (topic_id, field, segments, chars, byte_count) in zip(tasks, p.TARGETS):
        if entry.get("key") != topic_id + ":" + field + ":" + p.VOICE:
            raise ValueError("Approved field and voice binding changed.")
        parts = entry["chunks"]
        if (len(parts) != segments or len(entry["files"]) != segments or
                sum(map(len, parts)) != chars or
                sum(t.utf8_len(x) for x in parts) != byte_count):
            raise ValueError("Approved per-field synthesis budget differs.")
    all_parts = [chunk for task in tasks for chunk in task["chunks"]]
    if (len(all_parts) != p.CALLS or
            sum(map(len, all_parts)) != p.CHARS or
            sum(map(t.utf8_len, all_parts)) != p.BYTES):
        raise ValueError("STOP: exact approval budget differs.")
    if len({f for entry in tasks for f in entry["files"]}) != p.CALLS:
        raise ValueError("Duplicate audio file destinations detected.")
    return tasks


def check_active_project() -> None:
    result = subprocess.run(
        ["gcloud", "config", "get-value", "project"],
        capture_output=True, check=True, text=True, timeout=20,
    )
    if result.stdout.strip() != p.PROJECT:
        raise ValueError("Wrong Cloud Shell project; select study-note-tts first.")


def save_attempts(folder: Path, records: list[dict]) -> None:
    journal = {
        "schemaVersion": 1,
        "projectId": p.PROJECT,
        "voice": p.VOICE,
        "approvedCalls": p.CALLS,
        "approvedCharacters": p.CHARS,
        "approvedUtf8Bytes": p.BYTES,
        "sourceSha256": p.SOURCE_SHA256,
        "records": records,
    }
    t.atomic_write(
        folder / "attempts.json",
        (json.dumps(journal, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )


def synthesize_once(tasks: list[dict], folder: Path, zip_path: Path) -> None:
    """One-way ledger; a failure preserves state and prevents a second run."""
    check_active_project()
    token = t.access_token()          # Fail before consuming the output lock.
    folder.mkdir(mode=0o700)          # Atomic no-overwrite lock; exist_ok=False.
    records: list[dict] = []
    save_attempts(folder, records)
    manifest = {"schemaVersion": 1, "entries": {}}
    ledger = folder / "local-charge-guard.json"
    pending = zip_path.with_name(zip_path.name + ".pending")

    try:
        for entry in tasks:
            field = entry["key"].split(":")[1]
            for i, (chunk, relpath) in enumerate(zip(entry["chunks"], entry["files"]), start=1):
                request_count = len(records) + 1
                char_count = sum(r["characters"] for r in records) + len(chunk)
                byte_count = sum(r["utf8Bytes"] for r in records) + t.utf8_len(chunk)
                if (request_count > p.CALLS or char_count > p.CHARS or
                        byte_count > p.BYTES):
                    raise RuntimeError("STOP: exact user-approved TTS budget exceeded.")
                t.reserve_charge(ledger, t.current_month(), t.utf8_len(chunk))
                record = {
                    "number": request_count,
                    "topicId": entry["topicId"],
                    "field": field,
                    "part": i,
                    "relativeFile": relpath,
                    "characters": len(chunk),
                    "utf8Bytes": t.utf8_len(chunk),
                    "attemptUtc": datetime.now(timezone.utc).isoformat(),
                    "status": "attempted",
                }
                records.append(record)
                save_attempts(folder, records)  # Persist BEFORE API POST.
                print("Synthesizing {}/7: {} {} part {}".format(
                    request_count, entry["topicId"], field, i), flush=True)
                audio = t.synthesize(chunk, p.VOICE, p.PROJECT, token)  # One POST; no retries.
                t.atomic_write(folder / relpath, audio)
                record["status"] = "saved"
                save_attempts(folder, records)

            manifest["entries"][entry["key"]] = {
                "sha256": entry["originalHash"],
                "speechSha256": entry["speechHash"],
                **({"file": entry["files"][0]} if len(entry["files"]) == 1
                   else {"files": entry["files"]}),
            }
            t.manifest_save(folder / "index.json", manifest)

        if (len(records) != p.CALLS or any(r["status"] != "saved" for r in records) or
                sum(r["characters"] for r in records) != p.CHARS or
                sum(r["utf8Bytes"] for r in records) != p.BYTES or
                len(manifest["entries"]) != len(p.TARGETS)):
            raise RuntimeError("Incomplete journal or wrong totals; ZIP generation refused.")
        for record in records:
            mp3 = folder / record["relativeFile"]
            if not mp3.is_file() or mp3.stat().st_size < 100:
                raise RuntimeError("Missing or empty MP3; ZIP generation refused.")

        # Private text, credentials and audit journals never enter the ZIP.
        with zipfile.ZipFile(pending, "x", compression=zipfile.ZIP_STORED) as archive:
            for entry in tasks:
                tid = entry["topicId"]
                field = entry["key"].split(":")[1]
                for index, relpath in enumerate(entry["files"], start=1):
                    archive.write(folder / relpath,
                                  "{}/{:02d}_{}.mp3".format(tid, index, field))
        with zipfile.ZipFile(pending, "r") as archive:
            if (len(archive.namelist()) != p.CALLS or
                    len(set(archive.namelist())) != p.CALLS or archive.testzip() is not None):
                raise RuntimeError("Invalid listening ZIP; publication refused.")
        os.link(pending, zip_path)   # Atomically publish without overwriting.
        pending.unlink()

        print("\nQUALITY AOEDE 7x984 COMPLETE", flush=True)
        print("API attempts: 7 | Characters attempted: 984 | UTF-8 bytes: 1612", flush=True)
        print("MP3 files: 7", flush=True)
        print("ZIP: {}".format(zip_path), flush=True)
        print("Private attempts and manifest: {}".format(folder), flush=True)
        print("GCS upload: NOT RUN | Cloud Run deploy: NOT RUN | main: UNCHANGED", flush=True)
    except BaseException:
        print("\nSTOPPED. Do NOT run again or delete output; preserve attempts.json.",
              file=sys.stderr, flush=True)
        print("Attempt records: {}".format(len(records)), file=sys.stderr, flush=True)
        print("Folder: {}".format(folder), file=sys.stderr, flush=True)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="One-shot approved Aoede quality sample (dry run by default).")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--accept-possible-charges", action="store_true")
    parser.add_argument("--approve-exact-7x984", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.execute and not (args.accept_possible_charges and args.approve_exact_7x984):
            raise ValueError("--execute requires BOTH explicit approval flags.")
        if not args.execute and (args.accept_possible_charges or args.approve_exact_7x984):
            raise ValueError("Approval flags must be combined with --execute.")
        tasks = validated_tasks()  # Read-only. Never alter the private input.
        print("PREFLIGHT PASSED")
        print("Voice: {} | Fields: 3 | Topics: 3".format(p.VOICE))
        print("Requests: 7 | Characters: 984 | UTF-8 bytes: 1612")
        if not args.execute:
            print("DRY RUN - NO API CALLS, NO MP3 GENERATED, NO FILE WRITES")
            return 0
        print("EXECUTE: exactly 7 paid-capable TTS POST requests, 984 characters.")
        _, folder, zip_path = p.private_paths()
        synthesize_once(tasks, folder, zip_path)
        return 0
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError,
            json.JSONDecodeError) as exc:
        print("ERROR: " + str(exc), file=sys.stderr, flush=True)
        return 2
    except KeyboardInterrupt:
        print("INTERRUPTED: do not rerun; keep local journal intact.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
