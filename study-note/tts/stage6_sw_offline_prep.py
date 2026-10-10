#!/usr/bin/env python3
"""SW-only Chirp 3 HD Aoede MP3 batch planner. Fully offline; never calls TTS/GCS.

Reads a private export of live Study Note SW rows, validates scope and every
nonempty speech field, calculates the EXACT existing pronunciation and
segmentation rules, and optionally writes private, non-overwriting plans.
This program cannot generate MP3 files or submit chargeable requests.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any

import generate_mp3 as generator
import stage6_bulk_volume_preflight as volume

DOMAIN = "SW"
VOICE = "ko-KR-Chirp3-HD-Aoede"
DEFAULT_BATCH_SIZE = 10
FIELDS = tuple(volume.RELEASE_FIELDS)
PRIVATE_NAMES = (
    "sw_topics_private.json", "sw_expected_mp3_private.json",
    "sw_batches_private.json", "sw_summary_safe.json",
)


def canonical_sha(obj: Any) -> str:
    payload = json.dumps(obj, ensure_ascii=False, sort_keys=True,
                         separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def load_source(path: Path) -> list[dict]:
    obj = json.loads(path.read_text(encoding="utf-8-sig"))
    rows = obj.get("topics") if isinstance(obj, dict) else obj
    if not isinstance(rows, list) or not rows:
        raise ValueError("Nonempty private JSON topics list required.")
    if any(not isinstance(row, dict) for row in rows):
        raise ValueError("Every source row must be an object.")
    return rows


def prepare(rows: list[dict], dictionary: dict[str, str],
            batch_size: int = DEFAULT_BATCH_SIZE) -> tuple[dict, list, list, list]:
    if VOICE != volume.VOICE:
        raise ValueError("Expected Aoede voice has changed. STOP.")
    if not (1 <= batch_size <= 10):
        raise ValueError("SW batch size must be between 1 and 10.")
    if not rows:
        raise ValueError("No SW rows.")
    ids: set[str] = set()
    selected: list[dict] = []
    inactive = 0
    for row in rows:
        tid = generator.validate_topic(row)
        if tid in ids:
            raise ValueError("Duplicate SW topicId: " + tid)
        ids.add(tid)
        if str(row.get("domain", "")).strip() != DOMAIN or tid == volume.HOME:
            raise ValueError("Only SW domain topics, no home, are permitted.")
        target = str(row.get("studyTarget", "")).strip().upper()
        if target not in ("Y", "N"):
            raise ValueError("Study target must be Y or N for " + tid)
        if target == "N":
            inactive += 1
        else:
            selected.append(row)
    if not selected:
        raise ValueError("No SW study target Y rows.")

    tasks: list[dict] = []
    batches: list[dict] = []
    counts_by_field = {
        field: {"items": 0, "segments": 0, "sourceChars": 0,
                "inputChars": 0, "inputBytes": 0}
        for field, _, _ in FIELDS
    }
    total_source = total_chars = total_bytes = total_segments = 0
    for i, row in enumerate(selected):
        if i % batch_size == 0:
            batches.append({
                "batch": len(batches) + 1, "topicIds": [],
                "fields": 0, "requests": 0,
                "sourceChars": 0, "inputChars": 0, "inputBytes": 0,
            })
        b = batches[-1]
        tid = row["topicId"]
        b["topicIds"].append(tid)
        for field, prop, label in FIELDS:
            item = volume.planned_parts(row, field, prop, label, dictionary)
            entry = {
                "key": tid + ":" + field + ":" + VOICE,
                "topicId": tid, "field": field,
                "originalSha256": item["sourceHash"],
                "speechSha256": item["speechHash"],
                "files": item["paths"], "segments": item["segments"],
                "sourceChars": item["sourceChars"],
                "inputChars": item["inputChars"], "inputBytes": item["inputBytes"],
                "status": "PLANNED_NOT_UPLOADED",
            }
            tasks.append(entry)
            f = counts_by_field[field]
            f["items"] += 1
            f["segments"] += item["segments"]
            f["sourceChars"] += item["sourceChars"]
            f["inputChars"] += item["inputChars"]
            f["inputBytes"] += item["inputBytes"]
            b["fields"] += 1
            b["requests"] += item["segments"]
            b["sourceChars"] += item["sourceChars"]
            b["inputChars"] += item["inputChars"]
            b["inputBytes"] += item["inputBytes"]
            total_source += item["sourceChars"]
            total_chars += item["inputChars"]
            total_bytes += item["inputBytes"]
            total_segments += item["segments"]
    if sum(len(b["topicIds"]) for b in batches) != len(selected):
        raise AssertionError("Batch topic loss.")
    if sum(b["requests"] for b in batches) != total_segments:
        raise AssertionError("Batch segment loss.")
    if len(tasks) != len(selected) * len(FIELDS):
        raise AssertionError("Field loss.")
    if len({file for t in tasks for file in t["files"]}) != total_segments:
        raise ValueError("Duplicate planned MP3 paths. STOP.")
    summary = {
        "purpose": "SW-only offline Chirp3-HD Aoede plan; NOT a completed manifest",
        "voice": VOICE, "domain": DOMAIN,
        "sourceRowCount": len(rows),
        "studyTopics": len(selected), "inactiveExcluded": inactive,
        "fieldCount": len(tasks), "segments": total_segments,
        "sourceChars": total_source, "inputChars": total_chars,
        "inputBytes": total_bytes, "batchCount": len(batches),
        "batchSize": batch_size, "maxBatchRequests": max(b["requests"] for b in batches),
        "maxBatchUtf8Bytes": max(b["inputBytes"] for b in batches),
        "maxRequestInputChars": generator.MAX_SPEECH_CHARS,
        "maxRequestInputUtf8Bytes": generator.MAX_REQUEST_BYTES,
        "sourceAllRowsSha256": canonical_sha(rows),
        "sourceSelectedSha256": canonical_sha(selected),
        "pronunciationSha256": canonical_sha(dictionary),
        "fieldTotals": counts_by_field,
        "firstBatchTopicIds": batches[0]["topicIds"],
        "remoteManifestVerified": False,
        "remoteMp3ExistenceVerified": False,
        "payableCallAuthorized": False,
        "warning": "A local plan is NOT authorization for cloud TTS, uploads or charges.",
    }
    return summary, selected, tasks, batches


def safe_external_directory(destination: Path) -> Path:
    root = destination.resolve()
    repo = Path(__file__).resolve().parents[2]
    # Windows temp folders may reside on a different drive than the Git clone.
    try:
        in_repo = os.path.normcase(os.path.commonpath([str(root), str(repo)])) == os.path.normcase(str(repo))
    except ValueError:
        in_repo = False  # Different drives cannot overlap.
    if in_repo:
        raise ValueError("Private outputs must NEVER be written inside the Git repository.")
    return root


def write_private(destination: Path, summary: dict,
                  selected: list, tasks: list, batches: list) -> list[Path]:
    root = safe_external_directory(destination)
    # Check every target BEFORE any write; never replace an existing snapshot.
    outputs = [root / name for name in PRIVATE_NAMES]
    if any(p.exists() for p in outputs):
        raise FileExistsError("Private batch output exists. STOP; do not overwrite.")
    contents = (
        {"schemaVersion": 1, "topics": selected},
        {"schemaVersion": 1, "voice": VOICE, "entries": tasks,
         "warning": "PLANNED ONLY. NOT VALID PWA MANIFEST; NO MP3 PRESENT."},
        {"schemaVersion": 1, "domain": DOMAIN, "batches": batches},
        summary,
    )
    root.mkdir(parents=True, exist_ok=True)
    created: list[Path] = []
    try:
        for dest, payload in zip(outputs, contents):
            with dest.open("x", encoding="utf-8", newline="\n") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            created.append(dest)
            if os.name != "nt":
                dest.chmod(0o600)
    except Exception:
        for dest in created:
            dest.unlink(missing_ok=True)
        raise
    return outputs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="SW-only offline Aoede MP3 inventory and 10-topic batch planner.")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--dictionary", type=Path,
                        default=Path(__file__).with_name(
                            "pronunciations.ko-candidates.json"))
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--write-private", type=Path,
                        help="Optional NON-GIT directory; private JSON; never overwrite.")
    args = parser.parse_args(argv)
    try:
        data = load_source(args.source)
        dictionary = generator.load_dictionary(args.dictionary)
        summary, selected, tasks, batches = prepare(
            data, dictionary, args.batch_size)
        print("SW AOEDE STAGE 6-4 OFFLINE PLAN: PASS")
        for key in ("sourceRowCount", "studyTopics", "inactiveExcluded",
                    "fieldCount", "segments", "inputChars", "inputBytes",
                    "batchCount", "maxBatchRequests",
                    "maxBatchUtf8Bytes", "sourceAllRowsSha256"):
            print(key + ": " + str(summary[key]))
        print("First 10 topic IDs: " + ",".join(summary["firstBatchTopicIds"]))
        if args.write_private:
            names = write_private(args.write_private, summary, selected, tasks, batches)
            print("Private files prepared outside repository: " + str(len(names)))
        print("NO CLOUD REQUESTS / NO TTS / NO GCS UPLOAD / NO LIVE SHEETS WRITES")
        return 0
    except (ValueError, FileExistsError, OSError, json.JSONDecodeError) as exc:
        print("STOP SW AOEDE OFFLINE PLAN: " + str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
