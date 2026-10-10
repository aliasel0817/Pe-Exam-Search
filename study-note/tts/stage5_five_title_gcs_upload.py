#!/usr/bin/env python3
"""Strict, single-shot Stage-5 private GCS append-only uploader (NOT YET APPROVED).

No synthesis, main/Cloud Run/Sheets mutations, or deletes. Default is local
DRY RUN with zero GCS calls. --execute requires separate owner approval plus
explicit exact byte count, original index generation, and charge consent.
Five new files use GCS if-generation-match=0, and index.json is protected by
a generation-match compare-and-swap. Existing seven MP3s are never written.
On partial failure STOP; keep immutable attempt log for forensic review.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

import stage5_private_gcs_merge_preflight as preflight
import upload_gcs as gcs

SCOPE = "five-title-about-v2-only"
LOG_NAME = "study-tts-stage5-five-title-gcs-upload-attempts.jsonl"
MAX_NEW_FILES = 5
MAX_NEW_BYTES = 5 * 1024 * 1024


def _is_valid_generation(number: str) -> bool:
    return isinstance(number, str) and bool(re.fullmatch(r"[1-9][0-9]{0,24}", number))


def _jsonl(log: Path, row: dict) -> None:
    """Append durable audit line; log is a new one-off user-private file."""
    data = (json.dumps(row, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")
    with log.open("ab", buffering=0) as file:
        file.write(data)
        os.fsync(file.fileno())


def _event(log: Path, status: str, detail: str = "") -> None:
    _jsonl(log, {
        "utc": datetime.now(timezone.utc).isoformat(),
        "event": status,
        "detail": detail,
    })


def _open_once_log(path: Path, plan: dict, original_generation: str) -> None:
    """Never overwrite or resume a partial earlier attempt."""
    if path.exists() or path.is_symlink():
        raise ValueError("Previous GCS upload journal exists; STOP instead of retrying.")
    with path.open("xb") as file:
        data = {
            "utc": datetime.now(timezone.utc).isoformat(),
            "event": "started",
            "scope": SCOPE,
            "project": preflight.PROJECT,
            "bucket": preflight.BUCKET,
            "newFiles": MAX_NEW_FILES,
            "newBytes": plan["newBytes"],
            "oldIndexGeneration": original_generation,
            "mergedIndexSha256": plan["combinedDigest"],
        }
        file.write((json.dumps(data, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8"))
        file.flush()
        os.fsync(file.fileno())


def _gcs_prefix() -> str:
    return f"gs://{preflight.BUCKET}/{gcs.OBJECT_ROOT}/"


def _sha_file(file: Path) -> bytes:
    with file.open("rb") as source:
        return hashlib.sha256(source.read()).digest()


def _check_uploaded_object(name: str, local: Path) -> None:
    data = gcs.run([
        "gcloud", "storage", "cat", _gcs_prefix() + name,
        "--project=" + preflight.PROJECT,
    ]).stdout
    if hashlib.sha256(data).digest() != _sha_file(local):
        raise RuntimeError("Remote MP3 SHA-256 mismatch; no manifest publish: " + name)


def _put_new_only(name: str, file: Path) -> None:
    dest = _gcs_prefix() + name
    gcs.run([
        "gcloud", "storage", "cp", str(file), dest,
        "--if-generation-match=0",
        "--content-type=audio/mpeg",
        "--cache-control=private, max-age=86400",
        "--project=" + preflight.PROJECT,
    ])
    _check_uploaded_object(name, file)


def _check_original_index_unchanged(plan: dict, expected_generation: str) -> None:
    current, generation = gcs.remote_manifest(preflight.BUCKET, preflight.PROJECT)
    if current != plan["oldIndex"] or generation != expected_generation:
        raise RuntimeError("Original GCS manifest changed; STOP before index publish.")


def _publish_index(plan: dict, original_generation: str) -> None:
    """One conditional replacement, only after all five new MP3s are verified."""
    _check_original_index_unchanged(plan, original_generation)
    with tempfile.TemporaryDirectory(prefix="study-tts-stage5-merge-") as folder:
        index_file = Path(folder) / "index.json"
        index_file.write_text(
            json.dumps(plan["merged"], ensure_ascii=False, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        gcs.run([
            "gcloud", "storage", "cp", str(index_file),
            _gcs_prefix() + "index.json",
            "--if-generation-match=" + original_generation,
            "--content-type=application/json",
            "--cache-control=private, no-store",
            "--project=" + preflight.PROJECT,
        ])


def _readback_all(plan: dict) -> None:
    remote_index, generation = gcs.remote_manifest(preflight.BUCKET, preflight.PROJECT)
    if remote_index != plan["merged"] or not _is_valid_generation(generation):
        raise RuntimeError("Published GCS index differs from protected 8-field merge.")
    for name, local in plan["oldObjects"] + plan["newObjects"]:
        _check_uploaded_object(name, local)


def upload_approved_once(plan: dict, expected_generation: str,
                         journal: Path | None = None) -> None:
    """Only callable after exact-scope authorization at CLI boundary."""
    if not _is_valid_generation(expected_generation):
        raise ValueError("Original generation must be an exact positive integer.")
    if (len(plan["newObjects"]) != MAX_NEW_FILES or
            not 0 < plan["newBytes"] <= MAX_NEW_BYTES or
            len(plan["merged"]["entries"]) != preflight.COMBINED_FIELDS):
        raise ValueError("Unexpected append-only GCS upload scope.")
    if journal is None:
        journal = Path.home() / LOG_NAME
    if journal.exists() or journal.is_symlink():
        raise ValueError("Prior upload journal exists. NEVER rerun a partial upload.")
    active = subprocess.run(
        ["gcloud", "config", "get-value", "project"],
        capture_output=True, text=True, timeout=20, check=True,
    )
    if active.stdout.strip() != preflight.PROJECT:
        raise ValueError("Cloud Shell active project differs. STOP before any write.")
    actual_generation = preflight.check_remote_readonly(plan)
    if actual_generation != expected_generation:
        raise ValueError("Previously approved original GCS index generation has changed.")
    # Durable one-off journal is created ONLY after all checks succeed, before cloud writes.
    _open_once_log(journal, plan, actual_generation)
    try:
        for index, (name, file) in enumerate(plan["newObjects"], 1):
            _event(journal, "before_new_object_put", name)
            _put_new_only(name, file)
            _event(journal, "new_object_sha256_verified", name)
            print(f"Verified new MP3: {index}/{MAX_NEW_FILES}", flush=True)
        _event(journal, "before_index_compare_and_swap", actual_generation)
        _publish_index(plan, actual_generation)
        _event(journal, "index_compare_and_swap_finished")
        _readback_all(plan)
        _event(journal, "all_12_remote_sha256_and_index_verified")
        print("STAGE5 PRIVATE FIVE TITLE GCS APPEND VERIFIED")
        print("Remote index: 8 unchanged-and-appended entries | MP3: 12")
        print("No TTS synthesis, no Cloud Run deployment, no main change")
    except BaseException:
        _event(journal, "STOPPED_PRESERVE_ALL_FILES")
        print("STOP: possible partial private GCS upload. DO NOT RETRY.",
              file=sys.stderr, flush=True)
        print("Keep existing objects, old/new audio, ZIPs and journal intact.",
              file=sys.stderr, flush=True)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Append five new private GCS MP3s only")
    parser.add_argument("--scope", choices=(SCOPE,), default=SCOPE)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--accept-possible-cloud-charges", action="store_true")
    parser.add_argument("--approve-exact-five-titles", action="store_true")
    parser.add_argument("--approve-exact-new-bytes", type=int)
    parser.add_argument("--expect-existing-generation")
    args = parser.parse_args(argv)
    try:
        flags = (
            args.accept_possible_cloud_charges,
            args.approve_exact_five_titles,
            args.approve_exact_new_bytes is not None,
            args.expect_existing_generation is not None,
        )
        if args.execute and not all(flags):
            raise ValueError("--execute requires ALL exact five-title upload approvals.")
        if not args.execute and any(flags):
            raise ValueError("Cannot provide upload approval flags in DRY RUN mode.")
        plan = preflight.build_local_plan()
        print("STAGE5 PRIVATE FIVE TITLE GCS APPEND PREFLIGHT PASSED")
        print("Retain GCS 7 original MP3s / append exactly 5 new MP3s")
        print("Exact newly generated MP3 bytes: " + str(plan["newBytes"]))
        print("Combined GCS index: 8 entries / 12 MP3s")
        print("Index SHA-256: " + plan["combinedDigest"])
        if not args.execute:
            print("DRY RUN - NO GCS REQUESTS, NO UPLOAD, NO FILE WRITES")
            print("NOT AUTHORIZED UNTIL USER APPROVES FIVE TITLE GCS UPLOAD SEPARATELY")
            return 0
        if (args.approve_exact_new_bytes != plan["newBytes"] or
                not _is_valid_generation(args.expect_existing_generation)):
            raise ValueError("Approval amount or old index generation differs; STOP.")
        upload_approved_once(plan, args.expect_existing_generation)
        return 0
    except (ValueError, RuntimeError, OSError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        print("STOP: " + str(error), file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("INTERRUPTED: inspect journal; do not rerun.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
