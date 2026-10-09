#!/usr/bin/env python3
"""One-off, tightly scoped private GCS pilot for the owner's approved 7 Aoede MP3s.

This is NOT a general TTS/GCS authorization. The existing three global cloud
approval flags must stay false. No synthesis, Cloud Run deploy, or Git writes.
The only cloud writes are the seven audit-pinned MP3s and their index.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import quality_aoede_7x984_preflight as quality
import stage4_private_audio_preflight as preflight
import upload_gcs as gcs

SCOPE = "approved-7x984"


def validated_scope() -> tuple[Path, dict, list[tuple[str, Path]], str, str, int]:
    """Run the complete read-only audit; permit only the fixed 7-MP3 pilot."""
    report = preflight.audit_local()
    _, audio_dir, _ = quality.private_paths()
    manifest, objects = gcs.validate_manifest(audio_dir)
    project, project_number = gcs.project_binding()
    expected_keys = {
        f"{topic}:{field}:{quality.VOICE}"
        for topic, field, *_ in quality.TARGETS
    }
    total_bytes = sum(path.stat().st_size for _, path in objects)
    settings = json.loads(gcs.PROJECT_CONFIG.read_text(encoding="utf-8"))
    if (project != quality.PROJECT or project_number != preflight.PROJECT_NUMBER or
            settings.get("bucketName") != preflight.BUCKET or
            any(settings.get(name) is not False for name in (
                "ttsGenerationApproved", "gcsUploadApproved",
                "cloudRunRevisionUpdateUserApproved"))):
        raise ValueError("Cloud project, private bucket, or three approval locks changed.")
    if (report["bucket"] != preflight.BUCKET or
            report["prefix"] != gcs.OBJECT_ROOT or
            report["files"] != 7 or report["fields"] != 3 or
            len(objects) != 7 or len(manifest["entries"]) != 3 or
            set(manifest["entries"]) != expected_keys or
            total_bytes != report["audioBytes"] or
            total_bytes > preflight.MAX_PRIVATE_PILOT_BYTES):
        raise ValueError("Unexpected private MP3 scope; no cloud action allowed.")
    return audio_dir, manifest, objects, project, project_number, total_bytes


def verify_remote(manifest: dict, objects: list[tuple[str, Path]],
                  project: str) -> None:
    """After uploading, read the private objects through authenticated gcloud."""
    prefix = f"gs://{preflight.BUCKET}/{gcs.OBJECT_ROOT}"
    remote = gcs.run(["gcloud", "storage", "cat", prefix + "/index.json",
                      "--project=" + project]).stdout
    if json.loads(remote.decode("utf-8")) != manifest:
        raise RuntimeError("Remote private index does not match the approved 3 entries.")
    for name, path in objects:
        data = gcs.run(["gcloud", "storage", "cat", prefix + "/" + name,
                        "--project=" + project]).stdout
        if hashlib.sha256(data).digest() != hashlib.sha256(path.read_bytes()).digest():
            raise RuntimeError("Remote audio SHA-256 mismatch: " + name)
    print("PRIVATE GCS READBACK VERIFIED: index.json + 7 MP3 SHA-256 matches")


def upload_once(audio_dir: Path, manifest: dict,
                objects: list[tuple[str, Path]],
                project: str, project_number: str) -> None:
    """Require an empty remote manifest: never replace prior published metadata."""
    gcs.check_bucket(preflight.BUCKET, project, project_number)
    existing, _ = gcs.remote_manifest(preflight.BUCKET, project)
    if existing is not None:
        raise RuntimeError("Remote audio index already exists; STOP instead of reuploading.")
    gcs.execute(audio_dir, preflight.BUCKET, manifest, objects,
                project, project_number)
    verify_remote(manifest, objects, project)
    print("STAGE4 APPROVED PRIVATE PILOT UPLOAD COMPLETE")
    print("No new synthesis, Cloud Run deployment, main change, or global unlock.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Exact 7-MP3 private GCS pilot only")
    parser.add_argument("--scope", choices=[SCOPE], required=True)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--accept-possible-cloud-charges", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.execute and not args.accept_possible_cloud_charges:
            raise ValueError("--execute requires --accept-possible-cloud-charges")
        audio_dir, manifest, objects, project, number, size = validated_scope()
        print(f"APPROVED SCOPE: 7 MP3 + 1 index.json | {size} audio bytes")
        print(f"TARGET: gs://{preflight.BUCKET}/{gcs.OBJECT_ROOT}/")
        if not args.execute:
            print("DRY RUN - NO CLOUD REQUESTS OR WRITES")
            return 0
        upload_once(audio_dir, manifest, objects, project, number)
        return 0
    except (ValueError, OSError, RuntimeError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print("STOP: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
