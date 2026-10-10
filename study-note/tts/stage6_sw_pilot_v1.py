#!/usr/bin/env python3
"""One-shot SW Chirp3-HD Aoede batch-001 synthesizer; offline DRY RUN by default.

For actual synthesis a user must supply explicit exact-count/charge approval,
authorized Cloud SDK identity, and an unused private output folder.
NO GCS upload, NO Cloud Run deploy, NO Sheets/GitHub writes. Never retries.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import json
import os
from pathlib import Path
import re
import subprocess
import sys

import generate_mp3 as t
import stage6_sw_offline_prep as sw
import stage6_bulk_volume_preflight as pre
import topic_intro_v2 as intros

PROJECT = "study-note-tts"
VOICE = sw.VOICE
BATCH_NUMBER = 1
TOPIC_IDS = ("T0626","T0665","T0666","T0667","T0677",
             "T0678","T0692","T0693","T0694","T0733")
PIN_SELECTED_SHA = "c8cf9a9cf188728a852d3a1582ba7ec5effd85c402382c8146b8c3b8d6ca5792"
PIN_FIRST10_SHA = "078cdb0b86b80653486e18b7404a6e8918722e4c854e58c69205a96be60a3654"
PIN_DICTIONARY_SHA = "ff5e01b18e8c9d355dd057d95d54073f1dcd90f9379e4a4b0b6c13064d6ff334"
EXACT_CALLS = 93
EXACT_CHARACTERS = 12973
EXACT_UTF8_BYTES = 20791
MAX_PILOT_WON = Decimal("1000")
# Deliberate conservative planning ceiling; not a Google spot exchange quote.
WON_PER_USD_CEILING = Decimal("2000")
VAT_MULTIPLIER = Decimal("1.10")
USD_PER_CHARACTER = Decimal("0.00003")


def conservative_krw(chars: int) -> Decimal:
    return (Decimal(chars) * USD_PER_CHARACTER *
            WON_PER_USD_CEILING * VAT_MULTIPLIER)


def approved_plan(source: Path, expected_index: Path,
                  dictionary_path: Path) -> tuple[list[dict], int, int]:
    data = json.loads(source.read_text(encoding="utf-8-sig"))
    records = data.get("topics") if isinstance(data, dict) else data
    if not isinstance(records, list) or len(records) < len(TOPIC_IDS):
        raise ValueError("Private SW study topics must have at least 10 rows.")
    dictionary = t.load_dictionary(dictionary_path)
    if sw.canonical_sha(dictionary) != PIN_DICTIONARY_SHA:
        raise ValueError("Pinned Aoede pronunciation dictionary changed. STOP.")
    if sw.canonical_sha(records) != PIN_SELECTED_SHA:
        raise ValueError("LIVE source has changed since SW plan; recalculate first. STOP.")
    first = records[:len(TOPIC_IDS)]
    if tuple(x.get("topicId") for x in first) != TOPIC_IDS:
        raise ValueError("Exact approved first ten SW topics differ. STOP.")
    if sw.canonical_sha(first) != PIN_FIRST10_SHA:
        raise ValueError("Approved first ten source hash changed. STOP.")
    if any(row.get("domain") != "SW" or row.get("studyTarget") != "Y"
           for row in first):
        raise ValueError("Only ten active SW topics may be synthesized.")

    inventory = json.loads(expected_index.read_text(encoding="utf-8-sig"))
    listed = inventory.get("entries") if isinstance(inventory, dict) else None
    if not isinstance(listed, list):
        raise ValueError("Expected private MP3 inventory list missing.")
    expected = {x["key"]: x for x in listed}
    if len(expected) != len(listed):
        raise ValueError("Duplicate inventory key. STOP.")
    tasks = []
    paths = set()
    for row in first:
        tid = row["topicId"]
        for field, prop, label in sw.FIELDS:
            planned = pre.planned_parts(row, field, prop, label, dictionary)
            original = str(row.get(prop, "") or "").strip()
            text = (intros.topic_intro_text(original, dictionary) if field == "topic"
                    else t.for_speech(label, field, original, dictionary))
            chunks = t.split_speech(text)
            if (t.digest(original) != planned["sourceHash"] or
                    t.digest("\n".join(chunks)) != planned["speechHash"] or
                    len(chunks) != planned["segments"]):
                raise ValueError("Incorrect approved speech transform or source SHA.")
            key = tid + ":" + field + ":" + VOICE
            e = expected.get(key)
            if (not isinstance(e, dict) or
                    e["originalSha256"] != planned["sourceHash"] or
                    e["speechSha256"] != planned["speechHash"] or
                    e["files"] != planned["paths"] or
                    e["status"] != "PLANNED_NOT_UPLOADED"):
                raise ValueError("Private inventory does not match exact planned MP3: " + key)
            for f in e["files"]:
                if not re.fullmatch(
                    re.escape(VOICE) + "/" + re.escape(tid) + "/" +
                    re.escape(field) + r"-[0-9a-f]{12}(?:-p[0-9]{2,4})?\.mp3",
                    f,
                ) or f in paths:
                    raise ValueError("Unexpected, duplicate or unsafe MP3 object path.")
                paths.add(f)
            tasks.append({
                "topicId": tid, "field": field, "key": key,
                "files": planned["paths"], "chunks": chunks,
                "sourceHash": planned["sourceHash"],
                "speechHash": planned["speechHash"],
            })
    chars = sum(len(c) for x in tasks for c in x["chunks"])
    bytes_total = sum(t.utf8_len(c) for x in tasks for c in x["chunks"])
    calls = sum(len(x["chunks"]) for x in tasks)
    if (len(tasks) != 70 or calls != EXACT_CALLS or
            chars != EXACT_CHARACTERS or bytes_total != EXACT_UTF8_BYTES or
            len(paths) != calls):
        raise ValueError("Exact batch-001 request/character totals differ. STOP.")
    if bytes_total > t.HARD_MONTHLY_LIMIT:
        raise ValueError("Original conservative 50K-byte generator guard exceeded.")
    if conservative_krw(chars) > MAX_PILOT_WON:
        raise ValueError("Worst-case pilot TTS cost exceeds 1000 KRW budget. STOP.")
    return tasks, chars, bytes_total


def check_project_and_token() -> str:
    cli = subprocess.run(["gcloud", "config", "get-value", "project"],
                         capture_output=True, text=True, check=True, timeout=20)
    if cli.stdout.strip() != PROJECT:
        raise ValueError("Active Cloud SDK project is not study-note-tts.")
    return t.access_token()


def persist_journal(folder: Path, rows: list[dict],
                    chars: int, bytes_total: int) -> None:
    record = {"schemaVersion": 1, "projectId": PROJECT, "voice": VOICE,
              "batch": BATCH_NUMBER, "sourceSha256": PIN_FIRST10_SHA,
              "approvedCalls": EXACT_CALLS,
              "approvedCharacters": chars, "approvedUtf8Bytes": bytes_total,
              "attempts": rows}
    t.atomic_write(folder / "attempts.json",
                   (json.dumps(record,ensure_ascii=False,indent=2)+"\n").encode("utf-8"))


def synthesize_one_shot(tasks: list[dict], chars: int, bytes_total: int,
                        output: Path) -> None:
    output = sw.safe_external_directory(output)
    if output.exists():
        raise ValueError("Output directory exists: NO retry/overwrite.")
    if not output.parent.is_dir():
        raise ValueError("Parent of private output directory must exist.")
    token = check_project_and_token()  # Verify BEFORE creating any files.
    output.mkdir(mode=0o700)
    journal: list[dict] = []
    persist_journal(output,journal,chars,bytes_total)
    monthly_ledger = output / "billing-byte-guard.json"
    completed: dict[str,dict] = {}
    try:
        for entry in tasks:
            for chunk, rel in zip(entry["chunks"], entry["files"]):
                n = len(journal) + 1
                if n > EXACT_CALLS:
                    raise RuntimeError("Exceeded paid TTS call cap.")
                # Record attempt BEFORE sending POST; repeated failures never auto-retry.
                t.reserve_charge(monthly_ledger,t.current_month(),t.utf8_len(chunk))
                row = {"attempt": n,"topicId":entry["topicId"],
                       "field":entry["field"],"file":rel,
                       "characters":len(chunk),"bytes":t.utf8_len(chunk),
                       "startedUtc":datetime.now(timezone.utc).isoformat(),
                       "status":"attempted"}
                journal.append(row)
                persist_journal(output,journal,chars,bytes_total)
                print(f"Aoede MP3 {n}/{EXACT_CALLS}: {entry['topicId']} {entry['field']}",flush=True)
                audio=t.synthesize(chunk,VOICE,PROJECT,token) # one API POST, no retry
                dest=output / rel
                if dest.exists() or dest.is_symlink():
                    raise RuntimeError("Planned MP3 already exists: STOP.")
                t.atomic_write(dest,audio)
                row["status"]="saved"
                persist_journal(output,journal,chars,bytes_total)
            files=entry["files"]
            completed[entry["key"]]={
                "sha256":entry["sourceHash"],
                "speechSha256":entry["speechHash"],
                **({"file":files[0]} if len(files)==1 else {"files":files})
            }
        if (len(journal)!=EXACT_CALLS or len(completed)!=70 or
                any(v["status"]!="saved" for v in journal) or
                sum(v["characters"] for v in journal)!=chars or
                sum(v["bytes"] for v in journal)!=bytes_total):
            raise RuntimeError("Incomplete batch after last synthesis: STOP.")
        if any((output / v["file"]).is_symlink() or
               (not (output / v["file"]).is_file()) or
               (output / v["file"]).stat().st_size<100 for v in journal):
            raise RuntimeError("Generated MP3 failed minimum validity check.")
        t.manifest_save(output / "index-batch001-only.json",
                        {"schemaVersion":1,"entries":completed})
        print("PILOT AUDIO COMPLETE; files on local PC only.",flush=True)
        print("NO GCS UPLOAD, NO CLOUD RUN DEPLOY, NO LIVE DATA CHANGES",flush=True)
    except BaseException:
        print("STOP: Partial result preserved. Do not rerun automatically.",file=sys.stderr)
        raise


def main(argv: list[str] | None = None) -> int:
    parser=argparse.ArgumentParser(description="Aoede SW first ten pilot (DRY RUN default).")
    parser.add_argument("--source",type=Path,required=True)
    parser.add_argument("--inventory",type=Path,required=True)
    parser.add_argument("--dictionary",type=Path,default=Path(__file__).with_name(
                        "pronunciations.ko-candidates.json"))
    parser.add_argument("--output",type=Path,help="Empty PRIVATE external folder for paid execution.")
    parser.add_argument("--execute",action="store_true")
    parser.add_argument("--accept-possible-charges",action="store_true")
    parser.add_argument("--approve-exact-calls",type=int)
    parser.add_argument("--approve-exact-characters",type=int)
    parser.add_argument("--approve-exact-utf8-bytes",type=int)
    parser.add_argument("--max-pilot-krw",type=int)
    args=parser.parse_args(argv)
    try:
        consent=(args.accept_possible_charges or args.approve_exact_calls is not None
                 or args.approve_exact_characters is not None
                 or args.approve_exact_utf8_bytes is not None
                 or args.max_pilot_krw is not None)
        if args.execute:
            if not args.output or not args.accept_possible_charges:
                raise ValueError("Paid execution requires private output and charge approval.")
            if (args.approve_exact_calls, args.approve_exact_characters,
                args.approve_exact_utf8_bytes, args.max_pilot_krw) != (
                EXACT_CALLS, EXACT_CHARACTERS, EXACT_UTF8_BYTES, int(MAX_PILOT_WON)):
                raise ValueError("Exact SW pilot counts and max KRW amount not approved.")
        elif consent:
            raise ValueError("Charge consent is invalid in DRY RUN.")
        tasks, chars, byte_count=approved_plan(args.source,args.inventory,args.dictionary)
        print("SW AOEDE PILOT PREFLIGHT PASS")
        print(f"Topics: {len(TOPIC_IDS)} | fields: {len(tasks)} | API calls: {EXACT_CALLS}")
        print(f"Chars: {chars} | UTF-8 bytes: {byte_count}")
        print(f"Conservative worst-case TTS under 1000 won: {conservative_krw(chars):.2f} KRW")
        if not args.execute:
            print("DRY RUN ONLY. 0 API POSTS, 0 MP3, 0 GCS REQUESTS")
            return 0
        synthesize_one_shot(tasks,chars,byte_count,args.output)
        return 0
    except (ValueError, OSError, RuntimeError, KeyError, json.JSONDecodeError,
            subprocess.SubprocessError, InvalidOperation) as exc:
        print("STOP SW AOEDE PILOT: "+str(exc),file=sys.stderr,flush=True)
        return 2
    except KeyboardInterrupt:
        print("INTERRUPTED: preserve attempts.json; no automatic retry.",file=sys.stderr)
        return 130


if __name__=="__main__":
    raise SystemExit(main())
