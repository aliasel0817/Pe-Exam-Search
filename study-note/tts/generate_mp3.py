#!/usr/bin/env python3
"""Create Korean natural AI MP3 segments for Study Note, offline by default.

No TTS API request happens unless BOTH --execute and --accept-possible-charges
are supplied. Credentials are loaded at run time, never written to a repository.
Uses Python standard library and the official Google Cloud TTS REST endpoint.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

FIELDS = (
    ("topic", "topicName", "토픽명"),
    ("concept", "concept", "개념"),
    ("background", "background", "등장배경"),
    ("necessity", "necessity", "필요성"),
    ("features", "features", "특징"),
    ("components", "technicalComponents", "기술요소 및 구성요소"),
    ("keywords", "keywords", "키워드"),
)
VOICES = {
    "ko-KR-Chirp3-HD-Aoede",
    "ko-KR-Chirp3-HD-Kore",
    "ko-KR-Chirp3-HD-Charon",
}
HARD_MONTHLY_LIMIT = 50_000  # UTF-8 bytes, intentionally stricter than paid characters
MAX_REQUEST_BYTES = 4_200     # safely below Cloud TTS 5,000-byte input limit
MAX_TOPICS = 50
MAX_REQUESTS = 200
API_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"


def utf8_len(text: str) -> int:
    return len(text.encode("utf-8"))


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def validate_topic(item: dict) -> str:
    ident = str(item.get("topicId", "")).strip()
    if not re.fullmatch(r"T[0-9]{4,6}", ident):
        raise ValueError("Invalid topicId (expected T0001): " + repr(ident))
    return ident


def get_topics(path: Path) -> list[dict]:
    obj = json.loads(path.read_text(encoding="utf-8-sig"))
    topics = obj.get("topics") if isinstance(obj, dict) else obj
    if not isinstance(topics, list):
        raise ValueError("Input JSON must be an array or contain a topics array.")
    results, used = [], set()
    for topic in topics:
        if not isinstance(topic, dict):
            raise ValueError("Every topic must be a JSON object.")
        ident = validate_topic(topic)
        if ident in used:
            raise ValueError("Duplicate topic ID: " + ident)
        used.add(ident)
        if str(topic.get("studyTarget", "Y")).strip().upper() != "Y":
            continue
        results.append(topic)
    return results


def load_dictionary(path: Path | None) -> dict[str, str]:
    if path is None:
        return {}
    result = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(result, dict) or any(
        not isinstance(k, str) or not k or not isinstance(v, str) or not v
        for k, v in result.items()
    ):
        raise ValueError("Pronunciation dictionary must map nonempty strings to strings.")
    return result


def for_speech(label: str, field: str, original: str, dictionary: dict[str, str]) -> str:
    spoken = original
    for phrase, pronunciation in sorted(dictionary.items(), key=lambda pair: -len(pair[0])):
        # Avoid rewriting substrings inside longer English/digit identifiers.
        spoken = re.sub(
            r"(?<![A-Za-z0-9])" + re.escape(phrase) + r"(?![A-Za-z0-9])",
            lambda match: pronunciation, spoken, flags=re.IGNORECASE,
        )
    spoken = spoken.replace("·", ", ").replace(";", ". ")
    if field == "topic":
        return spoken
    return label + ". " + spoken


def split_speech(text: str, max_bytes: int = MAX_REQUEST_BYTES) -> list[str]:
    """Split text by punctuation/whitespace where possible; never exceed byte cap."""
    if not text:
        return []
    out = []
    rest = text.strip()
    while utf8_len(rest) > max_bytes:
        index, byte_count = 0, 0
        for char in rest:
            size = utf8_len(char)
            if byte_count + size > max_bytes:
                break
            byte_count += size
            index += len(char)
        if index < 1:
            raise ValueError("Unable to split long text.")
        # Prefer a sentence boundary in the last 45% of this chunk.
        minimum = int(index * 0.55)
        stop = -1
        for char in (".", "!", "?", "\n", ";", ",", " "):
            at = rest.rfind(char, minimum, index)
            if at >= minimum:
                stop = max(stop, at + 1)
        if stop > minimum:
            index = stop
        part = rest[:index].strip()
        if not part:
            raise ValueError("Empty speech chunk.")
        out.append(part)
        rest = rest[index:].strip()
    if rest:
        out.append(rest)
    return out


def load_manifest(path: Path) -> dict:
    if not path.exists():
        return {"schemaVersion": 1, "entries": {}}
    obj = json.loads(path.read_text(encoding="utf-8"))
    if obj.get("schemaVersion") != 1 or not isinstance(obj.get("entries"), dict):
        raise ValueError("Unsupported manifest schema: " + str(path))
    return obj


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".pending")
    try:
        with temp.open("wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def manifest_save(path: Path, obj: dict) -> None:
    atomic_write(path, (json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8"))


def paths_for(topic_id: str, field: str, voice: str, original_hash: str, count: int) -> list[str]:
    prefix = voice + "/" + topic_id + "/" + field + "-" + original_hash[:12]
    if count == 1:
        return [prefix + ".mp3"]
    return [prefix + "-p" + str(i + 1).zfill(2) + ".mp3" for i in range(count)]


def plan(topics: list[dict], voice: str, fields: set[str],
         dictionary: dict[str, str], audio_root: Path, manifest: dict,
         max_topics: int) -> list[dict]:
    requests = []
    for topic in topics[:max_topics]:
        ident = validate_topic(topic)
        for field, prop, label in FIELDS:
            if field not in fields:
                continue
            original = str(topic.get(prop, "") or "").strip()
            if not original:
                continue
            source_hash = digest(original)
            chunks = split_speech(for_speech(label, field, original, dictionary))
            files = paths_for(ident, field, voice, source_hash, len(chunks))
            key = ident + ":" + field + ":" + voice
            entry = manifest["entries"].get(key)
            listed = entry.get("files", [entry.get("file")]) if isinstance(entry, dict) else []
            if (isinstance(entry, dict) and entry.get("sha256") == source_hash and
                listed == files and all((audio_root / path).is_file() for path in files)):
                continue
            requests.append({
                "key": key, "originalHash": source_hash, "chunks": chunks,
                "files": files, "label": label, "topicId": ident,
            })
    return requests


def current_month() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m")


def reserve_charge(ledger_path: Path, month: str, byte_count: int) -> int:
    data = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else {}
    if not isinstance(data, dict):
        raise ValueError("Invalid billing guard ledger.")
    used = int(data.get(month, 0))
    if used < 0 or used + byte_count > HARD_MONTHLY_LIMIT:
        raise ValueError("Local 50,000-byte monthly guard reached. No new API request made.")
    data[month] = used + byte_count
    atomic_write(ledger_path, (json.dumps(data, indent=2) + "\n").encode("utf-8"))
    return data[month]


def access_token() -> str:
    token = os.getenv("GOOGLE_OAUTH_ACCESS_TOKEN", "").strip()
    if token:
        return token
    try:
        proc = subprocess.run(["gcloud", "auth", "print-access-token"],
                              check=True, capture_output=True, text=True, timeout=15)
        token = proc.stdout.strip()
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(
            "Google Cloud login is required. Set GOOGLE_OAUTH_ACCESS_TOKEN or run gcloud auth login."
        ) from exc
    if not token:
        raise RuntimeError("Google OAuth access token was empty.")
    return token


def synthesize(text: str, voice: str, project: str, token: str) -> bytes:
    if utf8_len(text) > MAX_REQUEST_BYTES:
        raise ValueError("Input segment exceeds byte budget.")
    payload = {
        "input": {"text": text},
        "voice": {"languageCode": "ko-KR", "name": voice},
        "audioConfig": {"audioEncoding": "MP3"},
    }
    req = Request(
        API_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + token,
            "x-goog-user-project": project,
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=65) as response:
            response_json = json.load(response)
    except HTTPError as exc:
        # Do not print the user text or OAuth token.
        raise RuntimeError("Google Cloud TTS rejected the request (HTTP " + str(exc.code) + ").") from exc
    except URLError as exc:
        raise RuntimeError("Google Cloud TTS connection failed.") from exc
    try:
        audio = base64.b64decode(response_json["audioContent"], validate=True)
    except (KeyError, ValueError, TypeError) as exc:
        raise RuntimeError("TTS response has no valid audioContent.") from exc
    if len(audio) < 100 or not (audio[:3] == b"ID3" or (audio[0] == 0xFF and audio[1] & 0xE0 == 0xE0)):
        raise RuntimeError("Cloud response was not a valid MP3 stream.")
    return audio


def execute(args: argparse.Namespace, requests: list[dict], manifest: dict) -> None:
    if not args.accept_possible_charges:
        raise ValueError("--execute also requires --accept-possible-charges.")
    if len(requests) == 0:
        print("No new audio requests; all files already exist.")
        return
    project = args.project or os.getenv("GOOGLE_CLOUD_PROJECT", "")
    if not re.fullmatch(r"[a-z][a-z0-9:-]{3,80}", project):
        raise ValueError("Set --project or GOOGLE_CLOUD_PROJECT to a valid project ID.")
    if args.max_new_requests > MAX_REQUESTS or args.max_new_requests < 1:
        raise ValueError("Maximum new requests must be between 1 and 200.")
    if args.max_topics > MAX_TOPICS or args.max_topics < 1:
        raise ValueError("Maximum topics must be between 1 and 50.")
    if sum(len(t["chunks"]) for t in requests) > args.max_new_requests:
        raise ValueError("Planned requests exceed --max-new-requests; reduce --max-topics/--fields.")
    token = access_token()
    ledger_path = Path(args.ledger).resolve()
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = ledger_path.with_suffix(ledger_path.suffix + ".lock")
    try:
        fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise RuntimeError("Billing guard ledger is locked by another process.") from exc
    try:
        os.close(fd)
        for record in requests:
            for chunk, relative in zip(record["chunks"], record["files"]):
                target = args.out / relative
                if target.is_file():
                    continue
                used = reserve_charge(ledger_path, current_month(), utf8_len(chunk))
                print("Synthesizing " + record["topicId"] + " " + record["label"] +
                      " | conservative monthly use " + str(used) + "/" + str(HARD_MONTHLY_LIMIT))
                audio = synthesize(chunk, args.voice, project, token)
                atomic_write(target, audio)
                time.sleep(0.3)
            manifest["entries"][record["key"]] = {
                "sha256": record["originalHash"],
                **({"file": record["files"][0]} if len(record["files"]) == 1
                   else {"files": record["files"]}),
            }
            manifest_save(args.out / "index.json", manifest)
    finally:
        lock_path.unlink(missing_ok=True)


def main() -> int:
    p = argparse.ArgumentParser(description="Create reusable natural Korean AI MP3 (dry-run by default).")
    p.add_argument("--input", required=True, type=Path, help="Local topic JSON; do not commit.")
    p.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "audio")
    p.add_argument("--voice", choices=sorted(VOICES), default="ko-KR-Chirp3-HD-Aoede")
    p.add_argument("--fields", default=",".join(x[0] for x in FIELDS))
    p.add_argument("--pronunciations", type=Path)
    p.add_argument("--max-topics", type=int, default=3)
    p.add_argument("--max-new-requests", type=int, default=30)
    p.add_argument("--ledger", default=str(Path(__file__).resolve().parent / "private-tts-ledger.json"))
    p.add_argument("--project", default="", help="Google Cloud project ID (only with --execute).")
    p.add_argument("--execute", action="store_true", help="Actually call paid-capable Google Cloud API.")
    p.add_argument("--accept-possible-charges", action="store_true")
    args = p.parse_args()
    try:
        if not 1 <= args.max_topics <= MAX_TOPICS:
            raise ValueError("--max-topics must be between 1 and " + str(MAX_TOPICS))
        fields = set(filter(None, args.fields.split(",")))
        if not fields or fields - {f[0] for f in FIELDS}:
            raise ValueError("Invalid --fields.")
        topics = get_topics(args.input)
        dictionary = load_dictionary(args.pronunciations)
        manifest = load_manifest(args.out / "index.json")
        requests = plan(topics, args.voice, fields, dictionary, args.out, manifest, args.max_topics)
        pieces = sum(len(item["chunks"]) for item in requests)
        byte_count = sum(utf8_len(chunk) for item in requests for chunk in item["chunks"])
        print("Mode: " + ("EXECUTE - API CALLS ENABLED" if args.execute else "DRY RUN - NO API CALLS"))
        print("Selected topics: " + str(min(len(topics), args.max_topics)) +
              " | missing fields: " + str(len(requests)) + " | requests: " + str(pieces))
        print("Conservative NEW request bytes: " + str(byte_count) +
              " | local monthly hard limit: " + str(HARD_MONTHLY_LIMIT))
        if byte_count > HARD_MONTHLY_LIMIT:
            raise ValueError("Planned requests exceed 50,000-byte safety cap.")
        if args.execute:
            execute(args, requests, manifest)
            print("MP3 generation finished. Do not publish private study content without approval.")
        else:
            print("No audio generated; use --execute --accept-possible-charges after verifying billing.")
        return 0
    except (ValueError, OSError, RuntimeError, json.JSONDecodeError) as exc:
        print("ERROR: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
