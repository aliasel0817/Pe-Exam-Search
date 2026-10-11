#!/usr/bin/env python3
"""Fail-closed GCS append of exactly SW Aoede batch-001 (93 MP3s).

No cloud operations by default. An authenticated, explicit --execute may upload
only previously synthesized and hash-validated 93 NEW objects. Existing GCS
8-entry / 12-MP3 index is read-only until the final generation-locked CAS.
Cloud TTS synthesis, deletion, Cloud Run and Sheets writes are impossible here.
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

import generate_mp3 as t
import stage6_sw_offline_prep as sw
import stage6_sw_pilot_v1 as pilot
import upload_gcs as gcs

PROJECT = "study-note-tts"
NUMBER = "558407087449"
BUCKET = "study-note-tts-audio-558407087449"
MAX_NEW_FILES = 93
MAX_NEW_FIELDS = 70
MAX_NEW_BYTES = 160 * 1024 * 1024
MAX_SINGLE_MP3 = 5 * 1024 * 1024
EXISTING_KEYS = frozenset(
    [f"{tid}:{field}:{sw.VOICE}" for tid,field in (
        ("T0001","concept"), ("T2176","components"), ("T2354","components"))]
    + [f"{tid}:topic:{sw.VOICE}" for tid in
       ("T0001","T1961","T2238","T2176","T2354")]
)
EXISTING_OBJECTS = 12
LOG_FILENAME = "sw-aoede-gcs-batch001-attempts.jsonl"
INDEX_FILE = "index-batch001-only.json"


def sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def parts(entry: dict) -> list[str]:
    if not isinstance(entry,dict) or (("files" in entry) == ("file" in entry)):
        raise ValueError("Exactly one of file/files is required.")
    files = entry.get("files") if isinstance(entry.get("files"),list) else [entry.get("file")]
    if (not files or len(files)>100 or
            any(not isinstance(n,str) for n in files)):
        raise ValueError("Invalid manifest parts.")
    return files


def validate_remote_old_index(index: dict) -> list[str]:
    if (not isinstance(index,dict) or index.get("schemaVersion") != 1 or
            not isinstance(index.get("entries"),dict) or
            set(index["entries"]) != EXISTING_KEYS):
        raise ValueError("Remote original index is not exact 8 approved fields; STOP.")
    paths=[]
    for key,entry in index["entries"].items():
        if (not isinstance(entry,dict) or
                not re.fullmatch(r"[a-f0-9]{64}",str(entry.get("sha256",""))) or
                not re.fullmatch(r"[a-f0-9]{64}",str(entry.get("speechSha256","")))):
            raise ValueError("Original GCS entry hashes malformed: "+key)
        name,field,voice=key.split(":")
        for f in parts(entry):
            if (not gcs.ALLOWED_FILE.fullmatch(f) or
                    not f.startswith(voice+"/"+name+"/"+field+"-")):
                raise ValueError("Original GCS MP3 path corrupt: "+key)
            paths.append(f)
    if len(paths)!=EXISTING_OBJECTS or len(set(paths))!=len(paths):
        raise ValueError("Original GCS 12 MP3 paths invalid.")
    return sorted(paths)


def _validate_local_output(source: Path, expected: Path, dictionary: Path,
                           audio_dir: Path) -> dict:
    """Zero cloud calls. Fail on one missing/extra/corrupted pilot MP3."""
    audio_dir = audio_dir.resolve()
    if not audio_dir.is_dir() or audio_dir.is_symlink():
        raise ValueError("Completed PRIVATE pilot audio directory required.")
    tasks, chars, bytes_in = pilot.approved_plan(source,expected,dictionary)
    index_path = audio_dir / INDEX_FILE
    journal_path = audio_dir / "attempts.json"
    if not index_path.is_file() or not journal_path.is_file():
        raise ValueError("Synthesis not complete: batch index/journal missing.")
    index=json.loads(index_path.read_text(encoding="utf-8"))
    journal=json.loads(journal_path.read_text(encoding="utf-8"))
    if not isinstance(index,dict) or not isinstance(journal,dict):
        raise ValueError("Completed pilot index/journal must be JSON objects.")
    entries=index.get("entries")
    if (index.get("schemaVersion")!=1 or not isinstance(entries,dict) or
            len(entries)!=MAX_NEW_FIELDS or
            journal.get("schemaVersion")!=1 or
            journal.get("projectId")!=PROJECT or journal.get("voice")!=sw.VOICE or
            journal.get("batch")!=1 or
            journal.get("sourceSha256")!=pilot.PIN_FIRST10_SHA or
            journal.get("approvedCalls")!=MAX_NEW_FILES or
            journal.get("approvedCharacters")!=chars or
            journal.get("approvedUtf8Bytes")!=bytes_in):
        raise ValueError("Private batch index or journal scope differs; STOP.")
    expected_map={}
    files=[]
    segments=[]
    for task in tasks:
        key=task["key"]
        rels=task["files"]
        expected_map[key]={
            "sha256":task["sourceHash"],"speechSha256":task["speechHash"],
            **({"file":rels[0]} if len(rels)==1 else {"files":rels}),
        }
        segments.extend((task,chunk,f) for chunk,f in zip(task["chunks"],rels))
    if entries!=expected_map or set(entries)!=set(expected_map):
        raise ValueError("Local completed index differs from pinned full source.")
    attempts=journal.get("attempts")
    if not isinstance(attempts,list) or len(attempts)!=MAX_NEW_FILES:
        raise ValueError("Expected exactly 93 completed attempts.")
    if len(segments)!=MAX_NEW_FILES:
        raise ValueError("Pinned planned segment count changed.")
    total_bytes=0
    seen=set()
    for i,((task,chunk,rel),attempt) in enumerate(zip(segments,attempts),1):
        if not isinstance(attempt,dict) or any([
            attempt.get("attempt")!=i,
            attempt.get("status")!="saved",
            attempt.get("topicId")!=task["topicId"],
            attempt.get("field")!=task["field"],
            attempt.get("file")!=rel,
            attempt.get("characters")!=len(chunk),
            attempt.get("bytes")!=t.utf8_len(chunk)
        ]):
            raise ValueError("Audio audit journal mismatch at ordinal "+str(i))
        if rel in seen or not gcs.ALLOWED_FILE.fullmatch(rel):
            raise ValueError("Duplicate or unexpected private MP3 path.")
        seen.add(rel)
        local=audio_dir / rel
        if (local.is_symlink() or not local.is_file() or
                not local.resolve().is_relative_to(audio_dir)):
            raise ValueError("Missing or unsafe MP3: "+rel)
        size=local.stat().st_size
        if not 100<=size<=MAX_SINGLE_MP3:
            raise ValueError("MP3 size out of bounds: "+rel)
        with local.open("rb") as h:
            lead=h.read(3)
        if not (lead == b"ID3" or lead[:1] == b"\xff" and (lead[1]&0xE0)==0xE0):
            raise ValueError("Audio magic header invalid: "+rel)
        files.append((rel,local,sha_file(local),size))
        total_bytes+=size
    if total_bytes>MAX_NEW_BYTES:
        raise ValueError("Total MP3 bytes exceed hard batch limit.")
    actual=set(str(p.relative_to(audio_dir)).replace("\\","/") for p in audio_dir.rglob("*.mp3"))
    if actual!=seen:
        raise ValueError("Unexpected extra MP3 files in local pilot directory.")
    return {"entries":entries,"files":files,"fileCount":len(files),
            "audioBytes":total_bytes,"characters":chars,
            "sourceSha256":pilot.PIN_FIRST10_SHA}


def _is_404(result: subprocess.CompletedProcess) -> bool:
    if result.returncode == 0:
        return False
    detail=(result.stderr or b"").decode("utf-8",errors="replace").lower()
    return bool(re.search(r"\b404\b|\bnotfound\b|\bnot found\b|no urls matched",detail))


def _uri(relative: str) -> str:
    if not gcs.ALLOWED_FILE.fullmatch(relative) or not relative.startswith(sw.VOICE+"/"):
        raise ValueError("Unsafe GCS audio object path.")
    return f"gs://{BUCKET}/{gcs.OBJECT_ROOT}/{relative}"


def _object_metadata(relative: str) -> tuple[str,str,str]:
    result=gcs.run(["gcloud","storage","objects","describe",_uri(relative),
                    "--format=json","--project="+PROJECT])
    obj=json.loads(result.stdout.decode("utf-8"))
    gen=str(obj.get("generation",""))
    size=str(obj.get("size",""))
    crc=str(obj.get("crc32c",""))
    if (not re.fullmatch(r"[1-9][0-9]{0,24}",gen) or
            not re.fullmatch(r"[0-9]{1,20}",size) or not crc):
        raise RuntimeError("Remote object metadata incomplete: "+relative)
    return gen,size,crc


def _remote_read_preflight(local_plan: dict) -> dict:
    project,number=gcs.project_binding()
    cfg=json.loads(gcs.PROJECT_CONFIG.read_text(encoding="utf-8"))
    if (project!=PROJECT or number!=NUMBER or cfg.get("bucketName")!=BUCKET or
        any(cfg.get(flag) is not False for flag in
          ("ttsGenerationApproved","gcsUploadApproved",
           "cloudRunRevisionUpdateUserApproved"))):
        raise ValueError("Cloud project/bucket/global write locks must stay pinned.")
    gcs.check_bucket(BUCKET,PROJECT,NUMBER)
    old_index,generation=gcs.remote_manifest(BUCKET,PROJECT)
    if not re.fullmatch(r"[1-9][0-9]{0,24}",generation):
        raise ValueError("Missing safe remote original index generation.")
    old_paths=validate_remote_old_index(old_index)
    new_paths={rel for rel,_,_,_ in local_plan["files"]}
    if set(old_paths)&new_paths or set(old_index["entries"]) & set(local_plan["entries"]):
        raise ValueError("New audio overlaps original GCS manifest or objects.")
    old_meta={rel:_object_metadata(rel) for rel in old_paths}
    for rel in sorted(new_paths):
        result=gcs.run(["gcloud","storage","objects","describe",_uri(rel),
                        "--format=json","--project="+PROJECT],check=False)
        if result.returncode==0:
            raise ValueError("SW new MP3 path already exists in GCS: "+rel)
        if not _is_404(result):
            raise RuntimeError("Cannot prove SW new GCS object absent. STOP.")
    merged=dict(old_index)
    merged["entries"]={**old_index["entries"],**local_plan["entries"]}
    if len(merged["entries"])!=len(EXISTING_KEYS)+MAX_NEW_FIELDS:
        raise ValueError("Merged manifest count incorrect.")
    return {"old":old_index,"oldPaths":old_paths,"oldMeta":old_meta,
            "oldGeneration":generation,"merged":merged}


def _remote_same(plan: dict, remote: dict, check_all_old: bool) -> None:
    index,generation=gcs.remote_manifest(BUCKET,PROJECT)
    if index != remote["old"] or generation!=remote["oldGeneration"]:
        raise RuntimeError("Remote GCS original manifest changed: STOP.")
    if check_all_old:
        for rel,metadata in remote["oldMeta"].items():
            if _object_metadata(rel)!=metadata:
                raise RuntimeError("Existing GCS MP3 changed: "+rel)


def _journal_add(journal: Path,event: str, detail: str="") -> None:
    entry={"utc":datetime.now(timezone.utc).isoformat(),
           "event":event,"detail":detail}
    with journal.open("ab",buffering=0) as h:
        h.write((json.dumps(entry,sort_keys=True,ensure_ascii=False)+"\n").encode("utf-8"))
        os.fsync(h.fileno())


def _put_and_verify(rel: str, local: Path, expected_sha: str) -> None:
    gcs.run(["gcloud","storage","cp",str(local),_uri(rel),
             "--if-generation-match=0",
             "--content-type=audio/mpeg",
             "--cache-control=private, max-age=86400",
             "--project="+PROJECT])
    readback=gcs.run(["gcloud","storage","cat",_uri(rel),"--project="+PROJECT]).stdout
    if hashlib.sha256(readback).hexdigest()!=expected_sha:
        raise RuntimeError("GCS audio readback SHA mismatch: "+rel)


def _commit_manifest(plan: dict, remote: dict) -> None:
    _remote_same(plan,remote,check_all_old=True)
    with tempfile.TemporaryDirectory(prefix="sw-aoede-gcs-index-") as temp:
        path=Path(temp)/"index.json"
        path.write_text(json.dumps(remote["merged"],ensure_ascii=False,
                                   sort_keys=True,indent=2)+"\n",encoding="utf-8")
        dest=f"gs://{BUCKET}/{gcs.OBJECT_ROOT}/index.json"
        gcs.run(["gcloud","storage","cp",str(path),dest,
                 "--if-generation-match="+remote["oldGeneration"],
                 "--content-type=application/json",
                 "--cache-control=private, no-store",
                 "--project="+PROJECT])


def _execute(local: dict, remote: dict, journal: Path) -> None:
    if journal.exists() or journal.is_symlink():
        raise ValueError("GCS append journal exists; possible partial upload. STOP.")
    journal=sw.safe_external_directory(journal)
    if not journal.parent.is_dir():
        raise ValueError("Private GCS upload audit-log parent must exist.")
    with journal.open("xb") as h:
        record={"utc":datetime.now(timezone.utc).isoformat(),"event":"started",
                "project":PROJECT,"bucket":BUCKET,
                "oldIndexGeneration":remote["oldGeneration"],
                "newFiles":MAX_NEW_FILES,"newBytes":local["audioBytes"],
                "sourceSha256":local["sourceSha256"]}
        h.write((json.dumps(record,sort_keys=True)+"\n").encode("utf-8"))
        h.flush()
        os.fsync(h.fileno())
    try:
        for i,(rel,file,sha,size) in enumerate(local["files"],1):
            _journal_add(journal,"before_upload",rel)
            _put_and_verify(rel,file,sha)
            _journal_add(journal,"uploaded_and_sha256_verified",rel)
            print(f"Verified {i}/{MAX_NEW_FILES} NEW SW MP3s",flush=True)
        _journal_add(journal,"before_index_cas",remote["oldGeneration"])
        _commit_manifest(local,remote)
        _journal_add(journal,"index_cas_sent")
        new_index,generation=gcs.remote_manifest(BUCKET,PROJECT)
        if new_index!=remote["merged"] or not re.fullmatch(r"[1-9][0-9]{0,24}",generation):
            raise RuntimeError("Published GCS index does not exactly match approved merge.")
        for rel,expected in remote["oldMeta"].items():
            if _object_metadata(rel)!=expected:
                raise RuntimeError("Previously existing MP3 changed.")
        for rel,file,sha,_ in local["files"]:
            actual=gcs.run(["gcloud","storage","cat",_uri(rel),
                            "--project="+PROJECT]).stdout
            if hashlib.sha256(actual).hexdigest()!=sha:
                raise RuntimeError("Final new GCS MP3 SHA mismatch.")
        _journal_add(journal,"final_manifest_and_all_105_objects_verified")
        print("SW 10-TOPIC GCS APPEND VERIFIED: 8 original+70 new fields; 12+93 MP3s")
        print("NO TTS GENERATION, NO CLOUD RUN DEPLOY, NO LIVE STUDY DATA WRITES")
    except BaseException:
        _journal_add(journal,"STOPPED_POSSIBLE_PARTIAL_UPLOAD")
        print("STOP: keep partial cloud state and journal; NEVER rerun automatically.",
              file=sys.stderr,flush=True)
        raise


def main(argv:list[str]|None=None)->int:
    ap=argparse.ArgumentParser(description="SW 93 new Aoede MP3s append-only GCS (dry-run default).")
    ap.add_argument("--source",required=True,type=Path)
    ap.add_argument("--inventory",required=True,type=Path)
    ap.add_argument("--audio-dir",required=True,type=Path)
    ap.add_argument("--dictionary",type=Path,default=Path(__file__).with_name(
                    "pronunciations.ko-candidates.json"))
    ap.add_argument("--check-remote",action="store_true",
                    help="Authenticated read-only GCS object and index checks; small read costs possible.")
    ap.add_argument("--execute",action="store_true")
    ap.add_argument("--accept-possible-cloud-charges",action="store_true")
    ap.add_argument("--approve-exact-files",type=int)
    ap.add_argument("--approve-exact-bytes",type=int)
    ap.add_argument("--expect-existing-generation")
    ap.add_argument("--journal",type=Path)
    args=ap.parse_args(argv)
    try:
        approval=(
            args.accept_possible_cloud_charges or args.approve_exact_files is not None or
            args.approve_exact_bytes is not None or
            args.expect_existing_generation is not None or args.journal is not None
        )
        if args.check_remote and args.execute:
            raise ValueError("Choose either read-only --check-remote or --execute; never both.")
        if args.execute:
            if (not args.accept_possible_cloud_charges or args.approve_exact_files != MAX_NEW_FILES
                or args.approve_exact_bytes is None or args.journal is None
                or not re.fullmatch(r"[1-9][0-9]{0,24}",args.expect_existing_generation or "")):
                raise ValueError("GCS execute needs all exact-count approvals and original generation.")
        elif approval:
            raise ValueError("Upload approval switches without --execute are forbidden.")
        local=_validate_local_output(args.source,args.inventory,args.dictionary,args.audio_dir)
        if local["fileCount"]!=MAX_NEW_FILES:
            raise ValueError("Expected exactly 93 SW MP3s.")
        print("SW AOEDE BATCH001 GCS LOCAL PREFLIGHT PASSED")
        print(f"New objects: {MAX_NEW_FILES} | bytes: {local['audioBytes']}")
        print(f"New entries: {MAX_NEW_FIELDS} | original MP3s retained: {EXISTING_OBJECTS}")
        if not args.execute and not args.check_remote:
            print("LOCAL DRY RUN: NO GCS TRAFFIC, NO MP3 UPLOAD, NO FILE WRITES")
            return 0
        if args.execute and local["audioBytes"]!=args.approve_exact_bytes:
            raise ValueError("Cloud upload byte approval does not equal audited files.")
        active=subprocess.run(["gcloud","config","get-value","project"],
                              capture_output=True,text=True,check=True,timeout=20)
        if active.stdout.strip()!=PROJECT:
            raise ValueError("Active Cloud CLI project is not pinned TTS project.")
        remote=_remote_read_preflight(local)
        if args.check_remote:
            print("SW BATCH001 REMOTE READ-ONLY PRECHECK PASSED")
            print("Existing protected GCS index generation: "+remote["oldGeneration"])
            print("Existing MP3: 12 unchanged | Proposed NEW MP3: 93 confirmed absent")
            print("NO CLOUD WRITES, NO MP3 UPLOAD, NO TTS SYNTHESIS")
            return 0
        if remote["oldGeneration"]!=args.expect_existing_generation:
            raise ValueError("Remote original GCS index generation differs from approval.")
        _execute(local,remote,args.journal)
        return 0
    except (ValueError,OSError,RuntimeError,KeyError,TypeError,
            json.JSONDecodeError,subprocess.CalledProcessError,
            subprocess.TimeoutExpired) as exc:
        print("STOP SW GCS APPEND: "+str(exc),file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("INTERRUPTED. Inspect private audit log before any new action.",file=sys.stderr)
        return 130

if __name__=="__main__":
    raise SystemExit(main())
