#!/usr/bin/env python3
"""Stage-6 exact-text Aoede workload estimator. Read-only and offline.

Input: a PRIVATE local JSON export of the Study Note topics (same structure as
the existing 5-topic exports). Never commit the source snapshot. This module
has no cloud API calls, synthesis calls, storage mutations, or output writes.

A local manifest, if provided, allows metadata-only matching; it is NOT proof
that the corresponding GCS MP3 objects exist. Never publish private topic text.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import generate_mp3 as legacy
import topic_intro_v2 as intros

VOICE = intros.VOICE
HOME = "T0000"
RELEASE_FIELDS = tuple(legacy.FIELDS)
# Exact original synthesis title and its present LIVE display spelling.
TITLE_VARIANTS = {
    "T1961": ("몬테카를로 트리검색 (MCTS)", "몬테카를로 트리검색(MCTS)"),
    "T2354": ("SQL (Structured Query Language)", "SQL"),
}


def load_source(path: Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8-sig"))
    topics = raw.get("topics") if isinstance(raw, dict) else raw
    if not isinstance(topics, list) or not topics:
        raise ValueError("A nonempty JSON topics array is required.")
    if not all(isinstance(t, dict) for t in topics):
        raise ValueError("Every topic must be a JSON object.")
    return topics


def load_index(path: Path | None) -> dict:
    if path is None:
        return {"schemaVersion": 1, "entries": {}}
    obj = json.loads(path.read_text(encoding="utf-8-sig"))
    if (not isinstance(obj, dict) or obj.get("schemaVersion") != 1
            or not isinstance(obj.get("entries"), dict)):
        raise ValueError("Unexpected local MP3 manifest schema. STOP.")
    return obj


def planned_parts(topic: dict, field: str, prop: str, label: str,
                  dictionary: dict[str, str]) -> dict:
    original = str(topic.get(prop, "") or "").strip()
    if not original:
        raise ValueError(
            "Missing required audio field for " + topic["topicId"] + ":" + field)
    text = (
        intros.topic_intro_text(original, dictionary)
        if field == "topic"
        else legacy.for_speech(label, field, original, dictionary)
    )
    chunks = legacy.split_speech(text)
    if not chunks:
        raise ValueError("Empty synthesized plan: " + topic["topicId"] + ":" + field)
    if any(
        len(chunk) > legacy.MAX_SPEECH_CHARS or
        legacy.utf8_len(chunk) > legacy.MAX_REQUEST_BYTES
        for chunk in chunks
    ):
        raise ValueError("Audio chunk exceeds exact generator limits.")
    source_hash = legacy.digest(original)
    speech_hash = legacy.digest("\n".join(chunks))
    asset_hash = legacy.digest(source_hash + "|" + speech_hash)
    paths = legacy.paths_for(topic["topicId"], field, VOICE, asset_hash, len(chunks))
    return {
        "original": original,
        "sourceHash": source_hash,
        "speechHash": speech_hash,
        "paths": paths,
        "segments": len(chunks),
        "inputChars": sum(map(len, chunks)),
        "inputBytes": sum(map(legacy.utf8_len, chunks)),
        "sourceChars": len(original),
    }


def entry_matches(entry: Any, task: dict) -> bool:
    if not isinstance(entry, dict):
        return False
    paths = entry.get("files", [entry.get("file")])
    return (entry.get("sha256") == task["sourceHash"]
            and entry.get("speechSha256") == task["speechHash"]
            and paths == task["paths"])


def reused_type(entry: Any, task: dict, topic: dict, field: str,
                dictionary: dict[str, str]) -> str:
    if entry_matches(entry, task):
        return "exact"
    if field != "topic":
        return ""
    alias = TITLE_VARIANTS.get(topic["topicId"])
    if not alias or task["original"] != alias[0]:
        return ""
    old_topic = {"topicId": topic["topicId"], "topicName": alias[1]}
    previously_recorded = planned_parts(
        old_topic, "topic", "topicName", "토픽명", dictionary)
    return "verified-title-alias" if entry_matches(entry, previously_recorded) else ""


def estimate(topics: list[dict], dictionary: dict[str, str],
             manifest: dict | None = None, batch_size: int = 10,
             max_topics: int | None = None) -> dict:
    if not 1 <= batch_size <= 200:
        raise ValueError("Batch size must be between 1 and 200 (read only).")
    if max_topics is not None and max_topics < 1:
        raise ValueError("Max topics must be positive.")
    manifest = manifest or {"schemaVersion": 1, "entries": {}}
    if (manifest.get("schemaVersion") != 1 or
            not isinstance(manifest.get("entries"), dict)):
        raise ValueError("Invalid manifest for planning.")
    counts = {
        "studyTopics": 0, "homeExcluded": 0, "inactiveExcluded": 0,
        "fields": 0, "sourceChars": 0, "segments": 0,
        "inputChars": 0, "inputBytes": 0, "newFields": 0,
        "newSegments": 0, "newChars": 0, "newBytes": 0,
        "reusedExact": 0, "reusedTitleAliases": 0,
        "staleExistingFields": 0, "batchSize": batch_size,
        "batches": [],
    }
    known: set[str] = set()
    batch: dict[str, int] | None = None
    for topic in topics:
        tid = legacy.validate_topic(topic)
        if tid in known:
            raise ValueError("Duplicate topic ID: " + tid)
        known.add(tid)
        active = str(topic.get("studyTarget", "")).strip().upper()
        if active not in ("Y", "N"):
            raise ValueError("StudyTarget Y/N missing for: " + tid)
        if tid == HOME:
            counts["homeExcluded"] += 1
            continue
        if active == "N":
            counts["inactiveExcluded"] += 1
            continue
        if max_topics is not None and counts["studyTopics"] >= max_topics:
            continue
        if counts["studyTopics"] % batch_size == 0:
            batch = {"topics": 0, "newFields": 0, "newSegments": 0,
                     "newBytes": 0}
            counts["batches"].append(batch)
        assert batch is not None
        batch["topics"] += 1
        counts["studyTopics"] += 1
        for field, prop, label in RELEASE_FIELDS:
            task = planned_parts(topic, field, prop, label, dictionary)
            counts["fields"] += 1
            counts["sourceChars"] += task["sourceChars"]
            counts["segments"] += task["segments"]
            counts["inputChars"] += task["inputChars"]
            counts["inputBytes"] += task["inputBytes"]
            key = tid + ":" + field + ":" + VOICE
            entry = manifest["entries"].get(key)
            reused = reused_type(entry, task, topic, field, dictionary)
            if reused == "exact":
                counts["reusedExact"] += 1
            elif reused == "verified-title-alias":
                counts["reusedTitleAliases"] += 1
            else:
                if entry is not None:
                    counts["staleExistingFields"] += 1
                counts["newFields"] += 1
                counts["newSegments"] += task["segments"]
                counts["newChars"] += task["inputChars"]
                counts["newBytes"] += task["inputBytes"]
                batch["newFields"] += 1
                batch["newSegments"] += task["segments"]
                batch["newBytes"] += task["inputBytes"]
    if counts["studyTopics"] == 0:
        raise ValueError("No active study topics. STOP.")
    assert counts["fields"] == counts["studyTopics"] * len(RELEASE_FIELDS)
    return counts


def main(argv: list[str] | None = None) -> int:
    cli = argparse.ArgumentParser(
        description="Read-only offline Aoede TTS volume and batch estimation.")
    cli.add_argument("--input", type=Path, required=True,
                     help="PRIVATE local topics JSON, NEVER publish.")
    cli.add_argument("--manifest", type=Path,
                     help="Optional PRIVATE local index.json; metadata match only.")
    cli.add_argument("--dictionary", type=Path,
                     default=Path(__file__).resolve().parent /
                     "pronunciations.ko-candidates.json")
    cli.add_argument("--batch-size", type=int, default=10)
    cli.add_argument("--max-topics", type=int)
    args = cli.parse_args(argv)
    try:
        topics = load_source(args.input)
        manifest = load_index(args.manifest)
        dictionary = legacy.load_dictionary(args.dictionary)
        p = estimate(topics, dictionary, manifest,
                     batch_size=args.batch_size, max_topics=args.max_topics)
        print("STAGE6 OFFLINE READ-ONLY VOLUME PREFLIGHT PASSED")
        print("Study topics: {studyTopics} | Excluded HOME: {homeExcluded} | Excluded N: {inactiveExcluded}".format(**p))
        print("Original fields: {fields} | Original chars: {sourceChars}".format(**p))
        print("Whole workload chunks: {segments} | Input chars: {inputChars} | Input UTF-8 bytes: {inputBytes}".format(**p))
        print("Manifest reused exact: {reusedExact} | Whitelisted title alias: {reusedTitleAliases}".format(**p))
        print("Remaining fields: {newFields} | Requests: {newSegments} | UTF-8 input bytes: {newBytes}".format(**p))
        print("Existing manifest mismatches needing human review: {staleExistingFields}".format(**p))
        print("Planned batches: " + str(len(p["batches"])) +
              " | Each batch at most " + str(args.batch_size) + " study topics")
        for i, batch in enumerate(p["batches"][:3], 1):
            print("Batch {:03d}: {} topics / {} fields / {} requests / {} bytes".format(
                i, batch["topics"], batch["newFields"],
                batch["newSegments"], batch["newBytes"]))
        print("NO TTS API, NO CLOUD REQUESTS, NO GCS, NO SHEET WRITES, NO OUTPUT FILE WRITES")
        print("IMPORTANT: Local manifest metadata is NOT proof of remote MP3 existence.")
        return 0
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print("STOP - READ-ONLY STAGE6 PREFLIGHT: " + str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
