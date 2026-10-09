#!/usr/bin/env python3
"""Export a small private TTS test JSON from a locally downloaded Google Sheets CSV.

Offline only: never authenticates, calls Google APIs, synthesizes audio or uploads.
Use the '암기장' tab CSV downloaded by the sheet owner. Never commit the CSV/JSON.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
from pathlib import Path
import re
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
FIELD_COLUMNS = (
    ("topicId", "통합ID"),
    ("studyTarget", "학습대상"),
    ("topicName", "통합토픽"),
    ("concept", "개념"),
    ("background", "등장배경"),
    ("necessity", "필요성"),
    ("features", "특징"),
    ("technicalComponents", "기술요소·구성요소"),
    ("keywords", "키워드"),
)
MAX_SAMPLE_TOPICS = 5


def inside_repo(path: Path) -> bool:
    resolved = path.resolve()
    return resolved == REPO_ROOT or REPO_ROOT in resolved.parents


def parse_ids(raw: str) -> list[str]:
    ids = [item.strip() for item in raw.split(",")]
    if not 1 <= len(ids) <= MAX_SAMPLE_TOPICS:
        raise ValueError("Select between 1 and 5 topic IDs.")
    if any(not re.fullmatch(r"T[0-9]{4,6}", item) for item in ids):
        raise ValueError("Invalid topic ID; expected T0001,T0002.")
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate topic ID in --ids.")
    return ids


def collect(csv_file: Path, selected_ids: list[str]) -> list[dict]:
    if not csv_file.is_file():
        raise ValueError("CSV not found: " + str(csv_file))
    if inside_repo(csv_file):
        raise ValueError("Private CSV must be outside the GitHub working tree.")

    expected = {column for _, column in FIELD_COLUMNS}
    selected = set(selected_ids)
    found = {}
    with csv_file.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = set(reader.fieldnames or ())
        if not expected.issubset(headers):
            missing = sorted(expected - headers)
            raise ValueError("This is not the 암기장 CSV; missing columns: " + ", ".join(missing))
        for row in reader:
            ident = str(row.get("통합ID") or "").strip()
            if ident not in selected:
                continue
            if ident in found:
                raise ValueError("Duplicate topic ID found in CSV: " + ident)
            if str(row.get("학습대상") or "").strip().upper() != "Y":
                raise ValueError("Topic is not marked studyTarget=Y: " + ident)
            topic = {key: str(row.get(column) or "").strip()
                     for key, column in FIELD_COLUMNS}
            topic["studyTarget"] = "Y"
            if not topic["topicName"]:
                raise ValueError("Empty topic name: " + ident)
            if any(not topic[prop] for prop in (
                "concept", "background", "necessity", "features",
                "technicalComponents", "keywords",
            )):
                raise ValueError("Selected sample has an empty speech field: " + ident)
            found[ident] = topic
    missing_ids = [ident for ident in selected_ids if ident not in found]
    if missing_ids:
        raise ValueError("Topic IDs absent from CSV: " + ", ".join(missing_ids))
    return [found[ident] for ident in selected_ids]


def save_private_sample(csv_file: Path, out: Path, ids: list[str]) -> int:
    if inside_repo(out):
        raise ValueError("Output JSON must be outside the GitHub working tree.")
    if csv_file.resolve() == out.resolve():
        raise ValueError("Input and output cannot be the same file.")
    if out.exists():
        raise ValueError("Output already exists; never overwrite a pilot sample.")
    topics = collect(csv_file, ids)
    payload = {
        "schemaVersion": 1,
        "_note": "PRIVATE LOCAL REAL TOPICS. Do not commit or publish; dry-run only without separate synthesis approval.",
        "topics": topics,
    }
    out.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    data = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
    except BaseException:
        out.unlink(missing_ok=True)
        raise
    return len(topics)


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare a private, read-only, five-topic TTS pilot JSON.")
    parser.add_argument("--csv", required=True, type=Path, help="Downloaded 암기장 CSV, outside Git repo")
    parser.add_argument("--out", required=True, type=Path, help="Private JSON location, outside Git repo")
    parser.add_argument("--ids", required=True, help="1-5 comma-separated T IDs in the desired order")
    args = parser.parse_args()
    try:
        count = save_private_sample(args.csv, args.out, parse_ids(args.ids))
        print("PRIVATE SAMPLE READY: " + str(count) + " Y topics")
        print("PATH: " + str(args.out))
        print("NO TTS API CALLS, NO CLOUD UPLOAD, NO SHEET MODIFICATION")
        return 0
    except (ValueError, OSError, csv.Error) as exc:
        print("ERROR: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
