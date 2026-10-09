#!/usr/bin/env python3
"""Upload already-created MP3 files to a private GCS bucket; DRY RUN by default.

Never creates buckets, never changes IAM, never deletes cloud objects. Actual GCS
traffic requires --execute AND --accept-possible-cloud-charges. Manifest is
uploaded last and uses Cloud Storage generation-match to avoid lost updates.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from typing import Any

OBJECT_ROOT = "study-note/tts/audio"
ALLOWED_FILE = re.compile(
    r"^ko-KR-Chirp3-HD-(?:Aoede|Kore|Charon)/T[0-9]{4,6}/"
    r"(?:topic|concept|background|necessity|features|components|keywords)"
    r"-[a-f0-9]{12}(?:-p[0-9]{2})?\.mp3$"
)
BUCKET_NAME = re.compile(r"^[a-z0-9][a-z0-9._-]{1,60}[a-z0-9]$")
MAX_FILES = 100
MAX_BYTES = 40 * 1024 * 1024
PROJECT_CONFIG = Path(__file__).resolve().parent / "cloud-project.json"


def project_binding(path: Path = PROJECT_CONFIG) -> tuple[str, str]:
    """Read the previously confirmed Cloud project; fail if not explicitly approved."""
    config = json.loads(path.read_text(encoding="utf-8"))
    project_id = str(config.get("projectId", "")).strip()
    project_number = str(config.get("projectNumber", "")).strip()
    if (config.get("schemaVersion") != 1 or
        not re.fullmatch(r"[a-z][a-z0-9-]{3,62}", project_id) or
        not re.fullmatch(r"[0-9]{6,20}", project_number)):
        raise ValueError("Invalid cloud-project.json; no cloud action allowed.")
    return project_id, project_number



def validate_manifest(audio_dir: Path) -> tuple[dict[str, Any], list[tuple[str, Path]]]:
    manifest_file = audio_dir / "index.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1 or not isinstance(manifest.get("entries"), dict):
        raise ValueError("Invalid local TTS manifest.")
    planned: dict[str, Path] = {}
    for key, entry in manifest["entries"].items():
        if not re.fullmatch(r"T[0-9]{4,6}:(?:topic|concept|background|necessity|features|components|keywords):ko-KR-Chirp3-HD-(?:Aoede|Kore|Charon)", key):
            raise ValueError("Invalid entry key: " + repr(key))
        if not isinstance(entry, dict) or not re.fullmatch(r"[a-f0-9]{64}", str(entry.get("sha256", ""))):
            raise ValueError("Invalid source SHA-256: " + key)
        parts = entry.get("files") if isinstance(entry.get("files"), list) else [entry.get("file")]
        if not parts or len(parts) > 100:
            raise ValueError("Missing audio parts: " + key)
        for name in parts:
            if not isinstance(name, str) or not ALLOWED_FILE.fullmatch(name):
                raise ValueError("Invalid MP3 file path: " + str(name))
            if name.split("/")[1] + ":" + name.split("/")[-1].split("-")[0] + ":" + name.split("/")[0] != key:
                raise ValueError("Manifest object path does not match key: " + key)
            file = (audio_dir / name).resolve()
            if not file.is_relative_to(audio_dir.resolve()) or not file.is_file() or file.is_symlink():
                raise ValueError("Missing/unsafe local MP3 file: " + name)
            with file.open("rb") as handle:
                h = handle.read(3)
            if not (h == b"ID3" or h[:1] == b"\xff"):
                raise ValueError("Not an MP3: " + name)
            planned[name] = file
    return manifest, sorted(planned.items())


def run(args: list[str], *, check: bool = True, input_bytes: bytes | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(args, input=input_bytes, capture_output=True, check=check, timeout=120)


def validate_bucket_metadata(obj: dict, bucket: str, expected_project_number: str) -> None:
    if obj.get("name") != bucket:
        raise ValueError("GCS bucket name mismatch; upload aborted.")
    if str(obj.get("projectNumber", "")) != expected_project_number:
        raise ValueError("GCS bucket is NOT owned by the confirmed Study-Note-TTS project; upload aborted.")
    iam = obj.get("iamConfiguration") or {}
    public = str(iam.get("publicAccessPrevention", "")).lower()
    uniform = (iam.get("uniformBucketLevelAccess") or {}).get("enabled") is True
    location = str(obj.get("location", "")).lower()
    storage_class = str(obj.get("storageClass", "")).upper()
    if location != "us-central1":
        raise ValueError("Cloud bucket location must be us-central1 for this free-tier test.")
    if storage_class != "STANDARD":
        raise ValueError("Cloud bucket storage class must be STANDARD.")
    if public != "enforced" or not uniform:
        raise ValueError("Cloud bucket must enforce public access prevention and uniform access.")
    if (obj.get("billing") or {}).get("requesterPays") is True:
        raise ValueError("Requester Pays is not approved for the Study Note TTS bucket.")
    if (obj.get("autoclass") or {}).get("enabled") is True:
        raise ValueError("Autoclass must be disabled for this standard storage test.")
    if (obj.get("hierarchicalNamespace") or {}).get("enabled") is True:
        raise ValueError("Hierarchical namespace must be disabled for this small MP3 bucket.")
    if (obj.get("versioning") or {}).get("enabled") is True:
        raise ValueError("Object versioning is not approved for this cost-controlled test.")
    if obj.get("retentionPolicy"):
        raise ValueError("Object retention policy is not approved for this test.")
    soft_delete = obj.get("softDeletePolicy") or {}
    if soft_delete:
        seconds = int(soft_delete.get("retentionDurationSeconds", 0))
        if seconds > 7 * 24 * 60 * 60:
            raise ValueError("Soft delete retention is longer than the approved 7-day test period.")


def check_bucket(bucket: str, expected_project_id: str, expected_project_number: str) -> None:
    res = run(["gcloud", "storage", "buckets", "describe", "gs://" + bucket,
               "--raw", "--format=json", "--project=" + expected_project_id])
    obj = json.loads(res.stdout.decode("utf-8"))
    validate_bucket_metadata(obj, bucket, expected_project_number)


def merged_manifest(local: dict, cloud: dict | None) -> dict:
    if cloud is None:
        return local
    if cloud.get("schemaVersion") != 1 or not isinstance(cloud.get("entries"), dict):
        raise ValueError("Cloud manifest invalid; refusing overwrite.")
    old = cloud["entries"]
    new = local["entries"]
    return {"schemaVersion": 1, "entries": {**old, **new}}


def remote_manifest(bucket: str, project_id: str) -> tuple[dict | None, str]:
    uri = "gs://" + bucket + "/" + OBJECT_ROOT + "/index.json"
    meta = run(["gcloud", "storage", "objects", "describe", uri,
                "--format=json", "--project=" + project_id], check=False)
    if meta.returncode:
        # Only a genuine not-found may be treated as a new object; other errors abort.
        details = (meta.stderr or b"").decode("utf-8", errors="replace").lower()
        if "404" in details or "not found" in details or "notfound" in details:
            return None, "0"
        raise RuntimeError("Unable to inspect existing cloud manifest. Upload aborted.")
    props = json.loads(meta.stdout.decode("utf-8"))
    generation = str(props.get("generation", ""))
    if not re.fullmatch(r"[0-9]{1,25}", generation):
        raise RuntimeError("Unable to establish cloud manifest generation.")
    data = run(["gcloud", "storage", "cat", uri, "--project=" + project_id]).stdout
    if len(data) > 20*1024*1024:
        raise ValueError("Cloud manifest too large.")
    return json.loads(data.decode("utf-8")), generation


def execute(audio_dir: Path, bucket: str, local: dict, objects: list[tuple[str, Path]],
            project_id: str, project_number: str) -> None:
    check_bucket(bucket, project_id, project_number)
    previous, generation = remote_manifest(bucket, project_id)
    next_index = merged_manifest(local, previous)
    with tempfile.TemporaryDirectory(prefix="study-tts-manifest-") as tmp:
        index_file = Path(tmp) / "index.json"
        index_file.write_text(json.dumps(next_index, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                              encoding="utf-8")
        for name, path in objects:
            dest = "gs://" + bucket + "/" + OBJECT_ROOT + "/" + name
            run(["gcloud", "storage", "cp", str(path), dest,
                 "--no-clobber", "--content-type=audio/mpeg",
                 "--cache-control=private, max-age=86400",
                 "--project=" + project_id])
            print("Uploaded/kept " + name)
        dest = "gs://" + bucket + "/" + OBJECT_ROOT + "/index.json"
        # Atomic compare-and-swap protects another uploader's changes.
        run(["gcloud", "storage", "cp", str(index_file), dest,
             "--content-type=application/json",
             "--cache-control=private, no-store",
             "--if-generation-match=" + generation,
             "--project=" + project_id])
        print("Private GCS audio manifest uploaded successfully.")


def assert_upload_authorized(config: dict, bucket_name: str) -> None:
    if config.get("gcsUploadApproved") is not True:
        raise ValueError("Cloud GCS upload is not yet approved in cloud-project.json; NO cloud request made.")
    if config.get("budgetAlertsUserConfirmed") is not True:
        raise ValueError("Google Cloud budget confirmation is required before GCS upload.")
    if config.get("bucketCreatedUserConfirmed") is not True:
        raise ValueError("Cloud Storage bucket creation has not been user-confirmed.")
    if not isinstance(config.get("bucketName"), str) or config.get("bucketName") != bucket_name:
        raise ValueError("Upload destination is not the exact confirmed private GCS bucket.")


def main() -> int:
    parser = argparse.ArgumentParser(description="GCS private MP3 upload: dry-run unless explicitly authorized")
    parser.add_argument("--audio-dir", type=Path, default=Path(__file__).resolve().parent / "audio")
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--accept-possible-cloud-charges", action="store_true")
    args = parser.parse_args()
    try:
        if not BUCKET_NAME.fullmatch(args.bucket):
            raise ValueError("Invalid GCS bucket name.")
        project_id, project_number = project_binding()
        local, objects = validate_manifest(args.audio_dir.resolve())
        bytes_total = sum(file.stat().st_size for _, file in objects)
        if len(objects) > MAX_FILES or bytes_total > MAX_BYTES:
            raise ValueError("Upload safety cap: max 100 MP3 files and 40 MiB per invocation.")
        print("Mode:", "GCS UPLOAD EXECUTE" if args.execute else "DRY RUN - NO CLOUD REQUESTS")
        print("Confirmed project:", project_id, "| project number:", project_number)
        print("Bucket:", args.bucket, "| prefix:", OBJECT_ROOT)
        print("Audio files:", len(objects), "| bytes:", bytes_total)
        print("Manifest entries:", len(local["entries"]))
        if args.execute and not args.accept_possible_cloud_charges:
            raise ValueError("--execute requires --accept-possible-cloud-charges")
        if args.execute:
            permissions = json.loads(PROJECT_CONFIG.read_text(encoding="utf-8"))
            assert_upload_authorized(permissions, args.bucket)
            execute(args.audio_dir.resolve(), args.bucket, local, objects,
                    project_id, project_number)
        else:
            print("Dry run complete; no GCS calls, bucket creation, or writes.")
        return 0
    except (ValueError, OSError, RuntimeError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        print("ERROR:", str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
