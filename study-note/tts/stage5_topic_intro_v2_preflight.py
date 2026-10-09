#!/usr/bin/env python3
"""Read-only, pinned preflight for five future 'topic에 대한 설명' Aoede MP3s.

This file has no Google Cloud API, gcloud, GCS upload or write path.
Run only to estimate an exact future five-title approval. Old MP3s and ZIPs
must not be rerun or replaced. Never commit the private JSON source.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

import generate_mp3 as legacy
import topic_intro_v2 as intro

PROJECT = "study-note-tts"
VOICE = "ko-KR-Chirp3-HD-Aoede"
TOPIC_IDS = ("T0001", "T1961", "T2238", "T2176", "T2354")
SOURCE_SHA256 = "e7156d8a9377b9cc0421dbb52f3fa3838dc19a7287887486ac2833afd37a33f2"
LEGACY_GENERATOR_BLOB = "81d1a029e8cefc9d51877afaf31d53dd86f96944"
DICTIONARY_BLOB = "dc3e1ceadde023a81475e4012b1fd770a56866b4"
INTRO_V2_BLOB = "c304b470889aad0f3184517a8eec7a491ac06b73"
ROOT = Path(__file__).resolve().parent
ALLOWED_KEYS = ("ttsGenerationApproved", "gcsUploadApproved", "cloudRunRevisionUpdateUserApproved")
OUTPUT_NAME = "study-tts-topic-intro-v2-5"
ZIP_NAME = "study-tts-topic-intro-v2-5.zip"


def git_blob_hash(path: Path) -> str:
    data = path.read_bytes()
    return hashlib.sha1(
        b"blob " + str(len(data)).encode("ascii") + b"\\0" + data
    ).hexdigest()


def private_paths() -> tuple[Path, Path, Path]:
    home = Path.home()
    return (
        home / "study-note-tts-real-5.json",
        home / OUTPUT_NAME,
        home / ZIP_NAME,
    )


def verify_plan() -> list[dict]:
    source, output, archive = private_paths()
    if not source.is_file() or source.is_symlink():
        raise ValueError("Private five-topic JSON is missing or unsafe.")
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError("Private source SHA-256 differs from the earlier approved five topics.")
    if output.exists() or output.is_symlink() or archive.exists() or archive.is_symlink():
        raise ValueError("New title pilot outputs already exist; no overwrite/retry allowed.")
    if archive.with_name(archive.name + ".pending").exists():
        raise ValueError("Unfinished title pilot archive present; STOP.")

    for filename, pinned_hash in (
        ("generate_mp3.py", LEGACY_GENERATOR_BLOB),
        ("pronunciations.ko-candidates.json", DICTIONARY_BLOB),
        ("topic_intro_v2.py", INTRO_V2_BLOB),
    ):
        if git_blob_hash(ROOT / filename) != pinned_hash:
            raise ValueError("Pinned script or dictionary changed: " + filename)

    settings = json.loads((ROOT / "cloud-project.json").read_text(encoding="utf-8"))
    if settings.get("schemaVersion") != 1 or settings.get("projectId") != PROJECT:
        raise ValueError("Unexpected Cloud project or settings.")
    if any(settings.get(flag) is not False for flag in ALLOWED_KEYS):
        raise ValueError("Global TTS/GCS/Cloud Run approval flag must remain false.")

    raw = json.loads(source.read_text(encoding="utf-8-sig"))
    topics = raw.get("topics") if isinstance(raw, dict) else raw
    if (not isinstance(topics, list) or len(topics) != len(TOPIC_IDS)
            or any(not isinstance(t, dict) for t in topics)):
        raise ValueError("Exactly five original sample topic records are required.")
    if tuple(t.get("topicId") for t in topics) != TOPIC_IDS:
        raise ValueError("Topic IDs/order differ from the previously tested five-topic source.")
    if any(t.get("studyTarget") != "Y" for t in topics):
        raise ValueError("All five sample topics must be active learning targets.")
    if any(not str(t.get("topicName", "")).strip() for t in topics):
        raise ValueError("All five sample topic names must be present.")

    dictionary = legacy.load_dictionary(ROOT / "pronunciations.ko-candidates.json")
    tasks = intro.plan_v2(topics, {"topic"}, dictionary, output,
                          {"schemaVersion": 1, "entries": {}}, len(TOPIC_IDS))
    if len(tasks) != len(TOPIC_IDS):
        raise ValueError("Five unique topic-name entries expected.")
    seen_paths = set()
    for item, source_topic in zip(tasks, topics):
        tid = source_topic["topicId"]
        if (item["key"] != f"{tid}:topic:{VOICE}" or
                item.get("introVersion") != intro.INTRO_VERSION or
                item["originalHash"] != legacy.digest(source_topic["topicName"].strip())):
            raise ValueError("Unexpected title identity or original-source hash: " + tid)
        speech = intro.topic_intro_text(source_topic["topicName"].strip(), dictionary)
        chunks = item["chunks"]
        if len(chunks) != 1 or len(item["files"]) != 1:
            raise ValueError("Unexpected title MP3 segmentation: " + tid)
        if chunks[0] != speech or not speech.endswith(intro.INTRO_SUFFIX):
            raise ValueError("Spoken topic title is missing '에 대한 설명' or short pause: " + tid)
        if (item["speechHash"] != legacy.digest(speech) or
                legacy.synthesis_input(speech) != {"markup": speech} or
                len(speech) > legacy.MAX_SPEECH_CHARS or
                legacy.utf8_len(speech) > legacy.MAX_REQUEST_BYTES):
            raise ValueError("Speech hash/markup/limits differ for: " + tid)
        rel = item["files"][0]
        if (not re.fullmatch(
                rf"{VOICE}/{tid}/topic-[0-9a-f]{{12}}\\.mp3", rel)
                or rel in seen_paths):
            raise ValueError("Unexpected MP3 output name or duplicate: " + tid)
        seen_paths.add(rel)
    return tasks


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Five-topic title-intro cost/size preflight; no paid/API execution.")
    parser.parse_args(argv)
    try:
        plan = verify_plan()
        chunks = [chunk for item in plan for chunk in item["chunks"]]
        print("STAGE5 TOPIC INTRO V2 PREFLIGHT PASSED")
        print("Approved scope to request LATER: exactly five new Aoede topic-name MP3s")
        print("Voice: " + VOICE + " | Source: pinned existing five-topic private JSON")
        print("Proposed API attempts: " + str(len(chunks)))
        print("Exact synthesis characters: " + str(sum(map(len, chunks))))
        print("UTF-8 input bytes: " + str(sum(map(legacy.utf8_len, chunks))))
        for row in plan:
            print(row["topicId"] + " topic -> 1 new MP3 | input chars: "
                  + str(len(row["chunks"][0])))
        print("Output folder reserved for future approval: ~/" + OUTPUT_NAME)
        print("Original JSON/old 35 MP3/quality 7 MP3/ZIPs: UNCHANGED")
        print("DRY RUN - NO CLOUD/API REQUESTS, NO MP3 GENERATION, NO FILE WRITES")
        print("NOT AUTHORIZED TO SYNTHESIZE, UPLOAD TO GCS OR REDEPLOY CLOUD RUN")
        return 0
    except (ValueError, OSError, RuntimeError, json.JSONDecodeError) as exc:
        print("STOP: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
