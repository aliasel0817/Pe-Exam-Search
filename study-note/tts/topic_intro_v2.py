#!/usr/bin/env python3
"""Versioned read-only topic-title narration plan for future Aoede synthesis.

Existing 35-MP3 and 7-MP3 quality pilots PIN the old generate_mp3.py byte
hash. Keep that historical generator untouched. This module adds a new
explicitly opt-in plan for *future* topic-name MP3s only.

NO TTS API calls; NO gcloud, GCS uploads, local output writes, or cloud
permissions. Any future paid execution needs a separately approved runner.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

import generate_mp3 as legacy

VOICE = "ko-KR-Chirp3-HD-Aoede"
INTRO_VERSION = "topic-about-v2"
INTRO_SUFFIX = "에 대한 설명, " + legacy.PAUSE_MARKER
ORDER = tuple(field for field, _, _ in legacy.FIELDS)


def topic_intro_text(original: str, dictionary: dict[str, str]) -> str:
    """Say '<pronounced topic>에 대한 설명', then a short audible pause.

    The source title is never rewritten or stored; dictionary and bilingual
    normalization are those of the immutable historical generator.
    """
    if not isinstance(original, str) or not original.strip():
        raise ValueError("Topic name must be nonempty.")
    spoken_name = legacy.for_speech("토픽명", "topic", original.strip(), dictionary)
    if not spoken_name.strip():
        raise ValueError("Normalized topic name is empty.")
    return spoken_name.rstrip() + INTRO_SUFFIX


def plan_topic_intros(
    topics: list[dict], dictionary: dict[str, str], audio_root: Path,
    manifest: dict, max_topics: int,
) -> list[dict]:
    """Make new content-addressed plans; never reuse legacy title-only audio.

    Existing index entries may be present, but only the *new speech hash* can
    mark a title complete. New generated filenames use that speech hash.
    """
    if not 1 <= max_topics <= legacy.MAX_TOPICS:
        raise ValueError("Invalid topic limit.")
    if manifest.get("schemaVersion") != 1 or not isinstance(manifest.get("entries"), dict):
        raise ValueError("Unsupported audio manifest.")
    tasks = []
    for topic in topics[:max_topics]:
        topic_id = legacy.validate_topic(topic)
        if str(topic.get("studyTarget", "Y")).strip().upper() != "Y":
            continue
        original = str(topic.get("topicName") or "").strip()
        if not original:
            continue
        chunks = legacy.split_speech(topic_intro_text(original, dictionary))
        original_hash = legacy.digest(original)
        speech_hash = legacy.digest("\n".join(chunks))
        asset_hash = legacy.digest(original_hash + "|" + speech_hash)
        paths = legacy.paths_for(topic_id, "topic", VOICE, asset_hash, len(chunks))
        key = f"{topic_id}:topic:{VOICE}"
        current = manifest["entries"].get(key)
        listed = current.get("files", [current.get("file")]) if isinstance(current, dict) else []
        identical = (
            isinstance(current, dict)
            and current.get("sha256") == original_hash
            and current.get("speechSha256") == speech_hash
            and listed == paths
        )
        if identical and all(
            (audio_root / rel).is_file()
            and not (audio_root / rel).is_symlink()
            and (audio_root / rel).stat().st_size >= 100
            for rel in paths
        ):
            continue
        # New content-addressed names should never overwrite a private file.
        if any((audio_root / rel).exists() or (audio_root / rel).is_symlink()
               for rel in paths):
            raise ValueError("Planned title MP3 already exists but lacks verified manifest: STOP.")
        tasks.append({
            "key": key, "topicId": topic_id, "label": "토픽명",
            "originalHash": original_hash, "speechHash": speech_hash,
            "chunks": chunks, "files": paths, "introVersion": INTRO_VERSION,
        })
    return tasks


def plan_v2(
    topics: list[dict], fields: set[str], dictionary: dict[str, str],
    audio_root: Path, manifest: dict, max_topics: int,
) -> list[dict]:
    """Preserve topic-first ordering while leaving all six body fields intact.

    Future synthesis code can use these records with a separately approved
    execution guard. Importing or calling this function cannot charge money.
    """
    if not fields or fields - set(ORDER):
        raise ValueError("Unexpected requested speech field.")
    approved_topics = [
        row for row in topics[:max_topics]
        if str(row.get("studyTarget", "Y")).strip().upper() == "Y"
    ]
    intros = (
        plan_topic_intros(approved_topics, dictionary, audio_root, manifest, max_topics)
        if "topic" in fields else []
    )
    body = legacy.plan(approved_topics, VOICE, fields - {"topic"},
                       dictionary, audio_root, manifest, max_topics)
    lookup = {record["key"]: record for record in intros + body}
    ordered = []
    for row in approved_topics:
        topic_id = legacy.validate_topic(row)
        for field in ORDER:
            if field in fields:
                key = f"{topic_id}:{field}:{VOICE}"
                if key in lookup:
                    ordered.append(lookup[key])
    return ordered


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Read-only Aoede title + six-body speech preview (NO paid API).")
    parser.add_argument("--input", required=True, type=Path,
                        help="Local private study JSON; never add it to GitHub.")
    parser.add_argument("--pronunciations", type=Path)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "audio",
                        help="Existing private audio folder (read-only check).")
    parser.add_argument("--max-topics", type=int, default=5)
    parser.add_argument("--fields", default="topic", help="Comma-separated field IDs.")
    args = parser.parse_args(argv)
    try:
        fields = set(args.fields.split(","))
        dictionary = legacy.load_dictionary(args.pronunciations)
        topics = legacy.get_topics(args.input)
        manifest = legacy.load_manifest(args.out / "index.json")
        tasks = plan_v2(topics, fields, dictionary, args.out, manifest, args.max_topics)
        chunks = [piece for task in tasks for piece in task["chunks"]]
        print("TOPIC INTRO VERSION: " + INTRO_VERSION)
        print("Voice: " + VOICE)
        print("Fields: " + ",".join(f for f in ORDER if f in fields))
        print("Planned entries: " + str(len(tasks)) +
              " | MP3 requests: " + str(len(chunks)) +
              " | characters: " + str(sum(map(len, chunks))) +
              " | UTF-8 bytes: " + str(sum(map(legacy.utf8_len, chunks))))
        for task in tasks:
            print(task["topicId"] + " " + task["key"].split(":")[1] +
                  " | chunks: " + str(len(task["chunks"])) +
                  " | chars: " + str(sum(map(len, task["chunks"]))))
        print("DRY RUN - NO CLOUD/API REQUESTS, NO FILE WRITES, NO SYNTHESIS")
        print("Future paid synthesis requires separate user approval.")
        return 0
    except (ValueError, OSError, RuntimeError) as exc:
        print("STOP: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
