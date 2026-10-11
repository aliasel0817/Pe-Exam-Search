#!/usr/bin/env python3
"""No-cloud regression tests for one-shot SW Aoede batch-001 GCS append."""
from __future__ import annotations

from contextlib import ExitStack,redirect_stdout,redirect_stderr
import copy
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import generate_mp3 as t
import stage6_sw_offline_prep as sw
import stage6_sw_pilot_v1 as pilot
import stage6_sw_batch001_gcs_append as app
import upload_gcs as gcs


def sample_topic(n):
    return {"topicId":f"T{850+n:04d}","domain":"SW","studyTarget":"Y",
            "topicName":f"학습 가상 SW {n}",
            "concept":"소프트웨어 구조 문제를 해결하기 위한 방법",
            "background":"가"*225,
            "necessity":"설계와 품질을 체계적으로 개선하기 위함",
            "features":"나"*225 if n>=3 else "확장성 및 재사용성",
            "technicalComponents":"다"*445 if n<3 else "구성요소별 단계적 검증",
            "keywords":"품질, 설계, 개발, 유지보수"}


def old_index():
    entries={}
    hash64="a"*64
    for tid,field in (
        ("T0001","concept"),("T2176","components"),("T2354","components"),
        ("T0001","topic"),("T1961","topic"),("T2238","topic"),
        ("T2176","topic"),("T2354","topic")
    ):
        count=4 if tid=="T2354" and field=="components" else 2 if tid=="T2176" and field=="components" else 1
        paths=[f"{sw.VOICE}/{tid}/{field}-{'a'*12}"+(f"-p{i:02d}" if count>1 else "")+".mp3" for i in range(1,count+1)]
        entries[f"{tid}:{field}:{sw.VOICE}"]={
            "sha256":hash64,"speechSha256":hash64,
            **({"file":paths[0]} if count==1 else {"files":paths})
        }
    return {"schemaVersion":1,"entries":entries}


class SwGcsBatch001Tests(unittest.TestCase):
    def setUp(self):
        self.root_ctx=tempfile.TemporaryDirectory()
        self.addCleanup(self.root_ctx.cleanup)
        self.root=Path(self.root_ctx.name)
        self.source=self.root/"source.json"
        self.inventory=self.root/"inventory.json"
        self.dictionary=self.root/"dict.json"
        self.audio=self.root/"audio"
        self.rows=[sample_topic(i) for i in range(10)]
        self.dict_obj={}
        summary,_,tasks,_=sw.prepare(self.rows,self.dict_obj)
        self.calls=summary["segments"]
        self.chars=summary["inputChars"]
        self.bytes=summary["inputBytes"]
        self.source.write_text(json.dumps({"topics":self.rows},ensure_ascii=False),encoding="utf-8")
        self.inventory.write_text(json.dumps({"schemaVersion":1,"entries":tasks},ensure_ascii=False),encoding="utf-8")
        self.dictionary.write_text("{}",encoding="utf-8")
        self.audio_bytes=b"ID3"+bytes(range(125))*2
        self.old=old_index()

    def mock_constants(self):
        stack=ExitStack()
        pins={
            "TOPIC_IDS":tuple(r["topicId"] for r in self.rows),
            "PIN_SELECTED_SHA":sw.canonical_sha(self.rows),
            "PIN_FIRST10_SHA":sw.canonical_sha(self.rows),
            "PIN_DICTIONARY_SHA":sw.canonical_sha(self.dict_obj),
            "EXACT_CALLS":self.calls,
            "EXACT_CHARACTERS":self.chars,
            "EXACT_UTF8_BYTES":self.bytes,
        }
        for k,v in pins.items():
            stack.enter_context(patch.object(pilot,k,v))
        return stack

    def generate_mock_mp3(self):
        with (self.mock_constants(),
              patch.object(pilot,"check_project_and_token",return_value="fake"),
              patch.object(t,"synthesize",return_value=self.audio_bytes),
              redirect_stdout(io.StringIO())):
            rc=pilot.main([
                "--source",str(self.source),"--inventory",str(self.inventory),
                "--dictionary",str(self.dictionary),"--output",str(self.audio),
                "--execute","--accept-possible-charges",
                "--approve-exact-calls",str(self.calls),
                "--approve-exact-characters",str(self.chars),
                "--approve-exact-utf8-bytes",str(self.bytes),
                "--max-pilot-krw","1000",
            ])
        self.assertEqual(rc,0)

    def validate_local(self):
        with self.mock_constants():
            return app._validate_local_output(
                self.source,self.inventory,self.dictionary,self.audio)

    def test_correct_original_eight_entries_and_12_paths(self):
        self.assertEqual(len(self.old["entries"]),8)
        self.assertEqual(len(app.validate_remote_old_index(self.old)),12)

    def test_original_unexpected_key_rejected(self):
        changed=copy.deepcopy(self.old)
        changed["entries"]["T9999:topic:"+sw.VOICE]=list(changed["entries"].values())[0]
        with self.assertRaisesRegex(ValueError,"exact 8"):
            app.validate_remote_old_index(changed)

    def test_original_path_swapped_rejected(self):
        changed=copy.deepcopy(self.old)
        entry=changed["entries"]["T0001:concept:"+sw.VOICE]
        entry["file"]=f"{sw.VOICE}/T9999/concept-{'a'*12}.mp3"
        with self.assertRaisesRegex(ValueError,"path corrupt"):
            app.validate_remote_old_index(changed)

    def test_original_missing_sha_rejected(self):
        changed=copy.deepcopy(self.old)
        entry=changed["entries"]["T0001:concept:"+sw.VOICE]
        entry.pop("sha256")
        with self.assertRaisesRegex(ValueError,"hashes malformed"):
            app.validate_remote_old_index(changed)

    def test_remote_manifest_files_xor_validation(self):
        self.assertEqual(app.parts({"file":"abc"}),["abc"])
        with self.assertRaisesRegex(ValueError,"Exactly one"):
            app.parts({"files":["a"],"file":"b"})
        with self.assertRaisesRegex(ValueError,"Exactly one"):
            app.parts({"sha256":"a"*64})

    def test_missing_audio_dir_blocks_dry_run_without_cloud(self):
        with (self.mock_constants(),
              patch.object(gcs,"run",side_effect=AssertionError("cloud")),
              redirect_stderr(io.StringIO())):
            self.assertEqual(app.main([
                "--source",str(self.source),"--inventory",str(self.inventory),
                "--dictionary",str(self.dictionary),"--audio-dir",str(self.audio)]),2)
        self.assertFalse(self.audio.exists())

    def test_correct_mock_mp3s_pass_exact_manifest_and_sha(self):
        self.generate_mock_mp3()
        local=self.validate_local()
        self.assertEqual(local["fileCount"],self.calls)
        self.assertEqual(local["audioBytes"],self.calls*len(self.audio_bytes))
        self.assertEqual(len(local["entries"]),70)
        self.assertTrue(all(len(sha)==64 for _,_,sha,_ in local["files"]))

    def test_offline_cli_never_calls_gcs(self):
        self.generate_mock_mp3()
        with (self.mock_constants(),patch.object(gcs,"run",side_effect=AssertionError("cloud")),
              patch.object(gcs,"remote_manifest",side_effect=AssertionError("cloud")),
              redirect_stdout(io.StringIO())):
            self.assertEqual(app.main([
                "--source",str(self.source),"--inventory",str(self.inventory),
                "--dictionary",str(self.dictionary),"--audio-dir",str(self.audio)]),0)

    def test_execute_requires_full_exact_flags(self):
        self.generate_mock_mp3()
        args=["--source",str(self.source),"--inventory",str(self.inventory),
                "--dictionary",str(self.dictionary),"--audio-dir",str(self.audio)]
        with self.mock_constants(),redirect_stderr(io.StringIO()):
            self.assertEqual(app.main(args+["--execute"]),2)
            self.assertEqual(app.main(args+["--approve-exact-files","93"]),2)

    def test_audio_deleted_fails_closed(self):
        self.generate_mock_mp3()
        files=sorted(self.audio.rglob("*.mp3"))
        files[0].unlink()
        with self.assertRaisesRegex(ValueError,"Missing or unsafe MP3"):
            self.validate_local()

    def test_audio_corrupted_fails_closed(self):
        self.generate_mock_mp3()
        files=sorted(self.audio.rglob("*.mp3"))
        files[0].write_bytes(b"NOT_AN_MP3"+b"x"*200)
        with self.assertRaisesRegex(ValueError,"magic header"):
            self.validate_local()

    def test_unexpected_extra_mp3_fails_closed(self):
        self.generate_mock_mp3()
        (self.audio/"extra.mp3").write_bytes(self.audio_bytes)
        with self.assertRaisesRegex(ValueError,"Unexpected extra"):
            self.validate_local()

    def test_changed_local_manifest_rejected(self):
        self.generate_mock_mp3()
        idx=self.audio/app.INDEX_FILE
        content=json.loads(idx.read_text(encoding="utf-8"))
        first=next(iter(content["entries"].values()))
        first["sha256"]="f"*64
        idx.write_text(json.dumps(content),encoding="utf-8")
        with self.assertRaisesRegex(ValueError,"completed index"):
            self.validate_local()

    def test_incomplete_journal_rejected(self):
        self.generate_mock_mp3()
        idx=self.audio/"attempts.json"
        data=json.loads(idx.read_text(encoding="utf-8"))
        data["attempts"][0]["status"]="attempted"
        idx.write_text(json.dumps(data),encoding="utf-8")
        with self.assertRaisesRegex(ValueError,"journal mismatch"):
            self.validate_local()

    def test_gcs_404_distinct_from_auth_denied(self):
        def res(code,err=b""):
            return subprocess.CompletedProcess([],code,b"",err)
        self.assertTrue(app._is_404(res(1,b"404 NOT FOUND")))
        self.assertFalse(app._is_404(res(1,b"403 permission denied")))
        self.assertFalse(app._is_404(res(0,b"")))

    def test_describe_accepts_gcloud_normalized_crc32c_hash(self):
        """Real gcloud --format=json uses crc32c_hash, not crc32c."""
        relative=f"{sw.VOICE}/T0001/concept-5aac6acdba8a.mp3"
        reported={"generation":"1780000000000001","size":35200,
                  "crc32c_hash":"pNKjPQ==","storage_class":"STANDARD"}
        with patch.object(gcs,"run",return_value=subprocess.CompletedProcess(
            [],0,json.dumps(reported).encode("utf8"),b"")) as run:
            got=app._object_metadata(relative)
        self.assertEqual(got,("1780000000000001","35200","pNKjPQ=="))
        self.assertIn("--format=json",run.call_args[0][0])

    def test_describe_accepts_raw_crc32c_key(self):
        relative=f"{sw.VOICE}/T0001/concept-5aac6acdba8a.mp3"
        reported={"generation":"1780000000000001","size":"35200",
                  "crc32c":"pNKjPQ=="}
        with patch.object(gcs,"run",return_value=subprocess.CompletedProcess(
            [],0,json.dumps(reported).encode("utf8"),b"")):
            self.assertEqual(app._object_metadata(relative),
                             ("1780000000000001","35200","pNKjPQ=="))

    def test_describe_rejects_disagreeing_crc32c_fields(self):
        relative=f"{sw.VOICE}/T0001/concept-5aac6acdba8a.mp3"
        reported={"generation":"1780000000000001","size":"35200",
                  "crc32c_hash":"pNKjPQ==","crc32c":"AAAAAAAA"}
        with patch.object(gcs,"run",return_value=subprocess.CompletedProcess(
            [],0,json.dumps(reported).encode("utf8"),b"")):
            with self.assertRaisesRegex(RuntimeError,"CRC32C representations disagree"):
                app._object_metadata(relative)

    def test_describe_fails_closed_for_missing_or_invalid_metadata(self):
        relative=f"{sw.VOICE}/T0001/concept-5aac6acdba8a.mp3"
        examples=[
            {"generation":"1780000000000001","size":35200},
            {"generation":"1780000000000001","size":35200,
             "crc32c_hash":""},
            {"generation":"1780000000000001","size":35200,
             "crc32c_hash":"not-base64"},
            {"generation":"0","size":35200,"crc32c_hash":"pNKjPQ=="},
            {"generation":"1780000000000001","size":"NaN","crc32c_hash":"pNKjPQ=="},
            ["invalid","metadata"]
        ]
        for sample in examples:
            with self.subTest(sample=sample),patch.object(
                gcs,"run",return_value=subprocess.CompletedProcess(
                    [],0,json.dumps(sample).encode("utf8"),b"")):
                with self.assertRaisesRegex(RuntimeError,"Remote object metadata"):
                    app._object_metadata(relative)

    def test_realistic_cli_normalized_metadata_for_all_old_files_readonly(self):
        """Do not stub the parser in 12-object remote inventory regression."""
        self.generate_mock_mp3()
        local=self.validate_local()
        known=set(app.validate_remote_old_index(self.old))
        present=[]
        missing=[]
        def fake_run(args,check=True,**kw):
            if args[:4]!=["gcloud","storage","objects","describe"]:
                raise AssertionError("Only read-only object describe permitted")
            uri=args[4]
            if any(uri.endswith("/"+name) for name in known):
                present.append(uri)
                response={"generation":"1780000000000001","size":35200,
                          "crc32c_hash":"pNKjPQ==","storage_class":"STANDARD"}
                return subprocess.CompletedProcess(
                    args,0,json.dumps(response).encode("utf8"),b"")
            missing.append(uri)
            return subprocess.CompletedProcess(args,1,b"",b"404 Not Found")
        with (
            patch.object(gcs,"project_binding",return_value=(app.PROJECT,app.NUMBER)),
            patch.object(gcs,"check_bucket"),
            patch.object(gcs,"remote_manifest",return_value=(self.old,"1234567")),
            patch.object(gcs,"run",side_effect=fake_run)
        ):
            result=app._remote_read_preflight(local)
        self.assertEqual(len(present),12)
        self.assertEqual(len(missing),self.calls)
        self.assertEqual(len(result["oldMeta"]),12)
        self.assertEqual(result["oldGeneration"],"1234567")

    def test_remote_read_preflight_detects_93_absent_new(self):
        self.generate_mock_mp3()
        local=self.validate_local()
        baseline=("13","333","AAAAAAA=")
        checks=[]
        def fake_run(args,check=True,**kw):
            if args[0:4]==["gcloud","storage","objects","describe"]:
                checks.append(args[4])
                return subprocess.CompletedProcess(args,1,b"",b"404 Not Found")
            raise AssertionError("Unexpected cloud call")
        with (patch.object(gcs,"project_binding",return_value=(app.PROJECT,app.NUMBER)),
              patch.object(gcs,"check_bucket"),
              patch.object(gcs,"remote_manifest",return_value=(self.old,"1234567")),
              patch.object(app,"_object_metadata",return_value=baseline),
              patch.object(gcs,"run",side_effect=fake_run)):
            plan=app._remote_read_preflight(local)
        self.assertEqual(len(checks),self.calls)
        self.assertEqual(plan["oldGeneration"],"1234567")
        self.assertEqual(len(plan["merged"]["entries"]),78)
        self.assertEqual(len(plan["oldMeta"]),12)

    def test_remote_preflight_rejects_new_object_exists(self):
        self.generate_mock_mp3()
        local=self.validate_local()
        with (patch.object(gcs,"project_binding",return_value=(app.PROJECT,app.NUMBER)),
              patch.object(gcs,"check_bucket"),
              patch.object(gcs,"remote_manifest",return_value=(self.old,"123")),
              patch.object(app,"_object_metadata",return_value=("1","333","abcd")),
              patch.object(gcs,"run",return_value=subprocess.CompletedProcess([],0,b"{}",b""))):
            with self.assertRaisesRegex(ValueError,"already exists"):
                app._remote_read_preflight(local)

    def test_gcs_upload_one_object_conditional_and_sha_verified(self):
        self.generate_mock_mp3()
        local=self.validate_local()
        rel,path,sha,size=local["files"][0]
        calls=[]
        def fake_run(args,check=True,**kw):
            calls.append(args)
            if args[:3]==["gcloud","storage","cat"]:
                return subprocess.CompletedProcess(args,0,path.read_bytes(),b"")
            return subprocess.CompletedProcess(args,0,b"",b"")
        with patch.object(gcs,"run",side_effect=fake_run):
            app._put_and_verify(rel,path,sha)
        self.assertEqual(len(calls),2)
        self.assertIn("--if-generation-match=0",calls[0])

    def test_gcs_upload_detects_wrong_remote_mp3(self):
        self.generate_mock_mp3()
        local=self.validate_local()
        rel,path,sha,size=local["files"][0]
        def fake_run(args,check=True,**kw):
            return subprocess.CompletedProcess(args,0,b"bad",b"")
        with patch.object(gcs,"run",side_effect=fake_run):
            with self.assertRaisesRegex(RuntimeError,"SHA mismatch"):
                app._put_and_verify(rel,path,sha)

    def test_mid_upload_failure_never_merges_index_and_logs(self):
        self.generate_mock_mp3()
        local=self.validate_local()
        remote={"oldGeneration":"123","old":self.old,
            "oldMeta":{},"merged":{"schemaVersion":1,"entries":{**self.old["entries"],**local["entries"]}}}
        record=[]
        def fail_n(rel,*args):
            record.append(rel)
            if len(record)==3:
                raise RuntimeError("Simulated upload failure")
        journal=self.root/"journal.jsonl"
        with (patch.object(app,"_put_and_verify",side_effect=fail_n),
              patch.object(app,"_commit_manifest",side_effect=AssertionError("SHOULD NOT MERGE")),
              redirect_stderr(io.StringIO())):
            with self.assertRaisesRegex(RuntimeError,"Simulated"):
                app._execute(local,remote,journal)
        events=[json.loads(line) for line in journal.read_text(encoding="utf8").splitlines()]
        self.assertEqual([x["event"] for x in events][-1],"STOPPED_POSSIBLE_PARTIAL_UPLOAD")
        self.assertEqual(len(record),3)
        with self.assertRaisesRegex(ValueError,"journal exists"):
            app._execute(local,remote,journal)

    def test_full_93_object_mock_append_preserves_all_12_original_objects(self):
        self.generate_mock_mp3()
        local=self.validate_local()
        old_paths=app.validate_remote_old_index(self.old)
        unchanged=("100", "333", "original-crc")
        remote={"oldGeneration":"123", "old":self.old,
                "oldMeta":{p:unchanged for p in old_paths},
                "merged":{"schemaVersion":1,
                          "entries":{**self.old["entries"],**local["entries"]}}}
        added=[]
        committed=[]
        def mark_upload(rel,loc,sha):
            self.assertEqual(app.sha_file(loc),sha)
            added.append(rel)
        def mark_commit(local_plan,remote_plan):
            self.assertEqual(remote_plan["oldGeneration"],"123")
            committed.append(len(added))
        def mock_gcs_run(args,check=True,**kwargs):
            self.assertEqual(args[:3],["gcloud","storage","cat"])
            return subprocess.CompletedProcess(args,0,self.audio_bytes,b"")
        journal=self.root/"success-journal.jsonl"
        with (patch.object(app,"_put_and_verify",side_effect=mark_upload),
              patch.object(app,"_commit_manifest",side_effect=mark_commit),
              patch.object(app,"_object_metadata",return_value=unchanged),
              patch.object(gcs,"remote_manifest",return_value=(remote["merged"],"124")),
              patch.object(gcs,"run",side_effect=mock_gcs_run),
              redirect_stdout(io.StringIO())):
            app._execute(local,remote,journal)
        self.assertEqual(len(added),93)
        self.assertEqual(committed,[93])
        self.assertEqual(len(set(added)),93)
        self.assertTrue(set(added).isdisjoint(set(old_paths)))
        self.assertEqual(len(remote["merged"]["entries"]),78)
        self.assertEqual(remote["merged"]["entries"] | self.old["entries"],remote["merged"]["entries"])
        events=[json.loads(x)["event"] for x in journal.read_text(encoding="utf8").splitlines()]
        self.assertEqual(events[-1],"final_manifest_and_all_105_objects_verified")

    def test_readonly_cloud_precheck_reports_existing_generation_without_upload(self):
        self.generate_mock_mp3()
        args=["--source",str(self.source),"--inventory",str(self.inventory),
              "--dictionary",str(self.dictionary),"--audio-dir",str(self.audio),
              "--check-remote"]
        output=io.StringIO()
        with (self.mock_constants(),
              patch.object(subprocess,"run",return_value=subprocess.CompletedProcess([],0,"study-note-tts\n","")),
              patch.object(app,"_remote_read_preflight",return_value={"oldGeneration":"1234"}) as read,
              patch.object(app,"_execute",side_effect=AssertionError("UPLOAD BLOCKED")),
              patch.object(gcs,"run",side_effect=AssertionError("GCS upload prohibited")),
              redirect_stdout(output)):
            self.assertEqual(app.main(args),0)
        self.assertIn("READ-ONLY PRECHECK PASSED",output.getvalue())
        self.assertIn("generation: 1234",output.getvalue())
        read.assert_called_once()

    def test_execute_and_readonly_precheck_are_mutually_exclusive(self):
        self.generate_mock_mp3()
        args=["--source",str(self.source),"--inventory",str(self.inventory),
              "--dictionary",str(self.dictionary),"--audio-dir",str(self.audio),
              "--check-remote","--execute"]
        with (self.mock_constants(),
              patch.object(gcs,"run",side_effect=AssertionError("NO CLOUD")),
              redirect_stderr(io.StringIO())):
            self.assertEqual(app.main(args),2)

    def test_manifest_cas_has_original_generation_precondition(self):
        self.generate_mock_mp3()
        local=self.validate_local()
        remote={"oldGeneration":"987","old":self.old,"oldMeta":{},
                "merged":{"schemaVersion":1,"entries":{**self.old["entries"],**local["entries"]}}}
        calls=[]
        with patch.object(app,"_remote_same") as chk,patch.object(gcs,"run",side_effect=lambda args,**kw:(calls.append(args) or subprocess.CompletedProcess(args,0,b"",b""))):
            app._commit_manifest(local,remote)
        chk.assert_called_once()
        self.assertEqual(len(calls),1)
        self.assertIn("--if-generation-match=987",calls[0])


if __name__=="__main__":
    unittest.main()
