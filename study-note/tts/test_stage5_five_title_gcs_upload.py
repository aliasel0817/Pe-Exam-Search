"""Offline tests of the separately-approval-gated private five-title GCS uploader.

All Cloud operations are mocked, including failure and stale-generation
simulation. No actual uploads, no paid synthesis, no production modifications.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

import stage5_five_title_gcs_upload as up
import stage5_private_gcs_merge_preflight as pre
import upload_gcs as gcs


class NewTitleAppendOnlyTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.base = Path(temp.name)
        self.journal = self.base / "upload-attempts.jsonl"
        self.objects_old = []
        self.objects_new = []
        self.old_index = {"schemaVersion": 1, "entries": {}}
        counter = 0
        # Exact production shape: 3 body fields, split into 1 + 2 + 4 MP3s.
        for topic_id, field, parts in (
            ("T0001", "concept", 1),
            ("T2176", "components", 2),
            ("T2354", "components", 4),
        ):
            part_names = []
            for number in range(1, parts + 1):
                counter += 1
                suffix = "" if parts == 1 else f"-p{number:02d}"
                name = f"{pre.VOICE}/{topic_id}/{field}-{counter:012x}{suffix}.mp3"
                file = self.base / f"old-{counter}.mp3"
                file.write_bytes(b"ID3" + bytes([counter]) * 256)
                self.objects_old.append((name, file))
                part_names.append(name)
            self.old_index["entries"][f"{topic_id}:{field}:{pre.VOICE}"] = {
                "sha256": "a"*64,
                **({"file": part_names[0]} if parts == 1 else {"files": part_names}),
            }
        for i, tid in enumerate(["T0001","T1961","T2238","T2176","T2354"], 1):
            name = f"{pre.VOICE}/{tid}/topic-{i:012x}.mp3"
            file = self.base / f"new-{i}.mp3"
            file.write_bytes(b"ID3" + bytes([i+13]) * 300)
            self.objects_new.append((name, file))
        self.new_index = {
            "schemaVersion": 1,
            "entries": {
                key.split("/")[1] + ":topic:" + pre.VOICE: {
                    "sha256": "b"*64, "file": key}
                for key, _ in self.objects_new
            },
        }
        self.merged = {
            "schemaVersion": 1,
            "entries": {**self.old_index["entries"], **self.new_index["entries"]}
        }
        self.plan = {
            "oldIndex": self.old_index, "newIndex": self.new_index,
            "merged": self.merged,
            "newObjects": self.objects_new,
            "oldObjects": self.objects_old,
            "oldBytes": sum(file.stat().st_size for _,file in self.objects_old),
            "newBytes": sum(file.stat().st_size for _,file in self.objects_new),
            "combinedDigest": hashlib.sha256(json.dumps(self.merged).encode()).hexdigest(),
        }
        self.generation = "1743465689000789"

    def authorized_args(self, amount=None, generation=None):
        if amount is None: amount=self.plan["newBytes"]
        if generation is None: generation=self.generation
        return [
            "--scope", up.SCOPE,
            "--execute",
            "--accept-possible-cloud-charges",
            "--approve-exact-five-titles",
            "--approve-exact-new-bytes", str(amount),
            "--expect-existing-generation", generation,
        ]

    def mock_cloud(self):
        calls = []
        def fake_run(command, check=True):
            calls.append(command)
            if command[:3]==["gcloud","storage","cp"]:
                return subprocess.CompletedProcess(command,0,stdout=b"Success",stderr=b"")
            if command[:3]==["gcloud","storage","cat"]:
                rel=command[3].split(gcs.OBJECT_ROOT+"/",1)[1]
                byname=dict(self.objects_old+self.objects_new)
                return subprocess.CompletedProcess(command,0,stdout=byname[rel].read_bytes(),stderr=b"")
            raise AssertionError("Unexpected cloud call: "+repr(command))
        return calls, fake_run

    def test_default_dry_run_does_not_contact_cloud_or_create_journal(self):
        with mock.patch.object(pre,"build_local_plan",return_value=self.plan), \
             mock.patch.object(up,"upload_approved_once",side_effect=AssertionError("unsafe upload")):
            self.assertEqual(up.main([]),0)
        self.assertFalse(self.journal.exists())

    def test_rejects_execute_with_missing_approval_flags(self):
        with mock.patch.object(pre,"build_local_plan",side_effect=AssertionError("preflight must not run")):
            for args in (["--execute"],
                         ["--execute","--accept-possible-cloud-charges"],
                         ["--execute","--accept-possible-cloud-charges","--approve-exact-five-titles"],
                         ["--execute","--accept-possible-cloud-charges","--approve-exact-five-titles",
                          "--approve-exact-new-bytes","1515"]):
                self.assertEqual(up.main(args),2)

    def test_dry_run_does_not_accept_execute_consent_flags(self):
        for args in (["--approve-exact-five-titles"],["--accept-possible-cloud-charges"],
                     ["--approve-exact-new-bytes","100"],["--expect-existing-generation","123"]):
            with mock.patch.object(pre,"build_local_plan",side_effect=AssertionError("wrong path")):
                self.assertEqual(up.main(args),2)

    def test_wrong_exact_byte_count_is_rejected_without_cloud(self):
        with mock.patch.object(pre,"build_local_plan",return_value=self.plan), \
             mock.patch.object(up,"upload_approved_once",side_effect=AssertionError("unsafe upload")):
            self.assertEqual(up.main(self.authorized_args(amount=self.plan["newBytes"]+1)),2)

    def test_generation_rejects_zero_negative_text_and_empty(self):
        for generation in ("0","-1","abc","","1.0"):
            with mock.patch.object(pre,"build_local_plan",return_value=self.plan), \
                 mock.patch.object(up,"upload_approved_once",side_effect=AssertionError("unsafe")):
                self.assertEqual(up.main(self.authorized_args(generation=generation)),2)

    def test_live_previous_generation_mismatch_stops_before_journal(self):
        with mock.patch.object(up.subprocess,"run",
                               return_value=mock.Mock(stdout=pre.PROJECT)), \
             mock.patch.object(pre,"check_remote_readonly",return_value="11"), \
             mock.patch.object(gcs,"run",side_effect=AssertionError("write not allowed")):
            with self.assertRaisesRegex(ValueError, "generation has changed"):
                up.upload_approved_once(self.plan,self.generation,self.journal)
        self.assertFalse(self.journal.exists())

    def test_wrong_active_project_stops_before_any_remote_calls(self):
        with mock.patch.object(up.subprocess,"run",
                               return_value=mock.Mock(stdout="other-project")), \
             mock.patch.object(pre,"check_remote_readonly",
                               side_effect=AssertionError("no remote read")):
            with self.assertRaisesRegex(ValueError,"active project differs"):
                up.upload_approved_once(self.plan,self.generation,self.journal)
        self.assertFalse(self.journal.exists())

    def test_preexisting_attempt_log_refuses_restart(self):
        self.journal.write_text("previous execution started\n")
        with mock.patch.object(pre,"check_remote_readonly",
                               side_effect=AssertionError("do not contact GCS")):
            with self.assertRaisesRegex(ValueError, "Prior upload journal"):
                up.upload_approved_once(self.plan,self.generation,self.journal)
        self.assertEqual(self.journal.read_text(),"previous execution started\n")

    def test_full_success_uploads_only_five_titles_and_single_cas_index(self):
        calls, runner=self.mock_cloud()
        with mock.patch.object(up.subprocess,"run",
                               return_value=mock.Mock(stdout=pre.PROJECT)), \
             mock.patch.object(pre,"check_remote_readonly",return_value=self.generation), \
             mock.patch.object(gcs,"remote_manifest",
                               side_effect=[(self.old_index,self.generation),
                                            (self.merged,"1743465689000790")]), \
             mock.patch.object(gcs,"run",side_effect=runner):
            up.upload_approved_once(self.plan,self.generation,self.journal)
        puts=[c for c in calls if c[:3]==["gcloud","storage","cp"]]
        reads=[c for c in calls if c[:3]==["gcloud","storage","cat"]]
        self.assertEqual(len(puts),6)
        self.assertEqual(len(reads),17) # five immediate checks, then all twelve
        self.assertTrue(all("--if-generation-match=0" in cmd for cmd in puts[:5]))
        self.assertTrue(all("/topic-" in cmd[4] for cmd in puts[:5]))
        old_remote_names = {name for name, _ in self.objects_old}
        self.assertTrue(all(not any(cmd[4].endswith(old_name) for old_name in old_remote_names)
                            for cmd in puts))
        self.assertTrue(all(cmd[3].endswith(".mp3") for cmd in puts[:5]))
        self.assertTrue(all(cmd[3].endswith("index.json") for cmd in puts[5:]))
        self.assertIn("--if-generation-match="+self.generation,puts[5])
        # Do not scan arbitrary temp-directory names for short fragments like
        # "rm": Windows temp paths may randomly contain those characters.
        # Instead, require exact approved local MP3 sources and one index.json.
        self.assertEqual({cmd[3] for cmd in puts[:5]},
                         {str(file) for _, file in self.objects_new})
        self.assertEqual(len({cmd[3] for cmd in puts[:5]}), 5)
        self.assertEqual(Path(puts[5][3]).name, "index.json")
        self.assertTrue(all(cmd[:3] in (
            ["gcloud", "storage", "cp"],
            ["gcloud", "storage", "cat"],
        ) for cmd in calls))
        logs=[json.loads(s) for s in self.journal.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(logs[0]["event"],"started")
        self.assertEqual(logs[-1]["event"],"all_12_remote_sha256_and_index_verified")
        self.assertEqual(sum(e["event"]=="new_object_sha256_verified" for e in logs),5)
        self.assertEqual(len([e for e in logs if e["event"]=="before_new_object_put"]),5)

    def test_cloud_put_fail_leaves_log_and_never_publishes_index(self):
        calls, baseline=self.mock_cloud()
        def failing(command,check=True):
            if command[:3]==["gcloud","storage","cp"]:
                calls.append(command)
                raise subprocess.CalledProcessError(412,command)
            return baseline(command,check)
        with mock.patch.object(up.subprocess,"run",
                               return_value=mock.Mock(stdout=pre.PROJECT)), \
             mock.patch.object(pre,"check_remote_readonly",return_value=self.generation), \
             mock.patch.object(gcs,"run",side_effect=failing):
            with self.assertRaises(subprocess.CalledProcessError):
                up.upload_approved_once(self.plan,self.generation,self.journal)
        self.assertEqual(len([c for c in calls if c[:3]==["gcloud","storage","cp"]]),1)
        self.assertTrue(self.journal.exists())
        self.assertIn("STOPPED_PRESERVE_ALL_FILES",self.journal.read_text(encoding="utf-8"))
        with mock.patch.object(gcs,"run",side_effect=AssertionError("no retry")):
            with self.assertRaisesRegex(ValueError,"Prior upload journal"):
                up.upload_approved_once(self.plan,self.generation,self.journal)

    def test_first_new_mp3_sha_mismatch_stops_before_index(self):
        calls,_=self.mock_cloud()
        def wrong(command,check=True):
            calls.append(command)
            if command[:3]==["gcloud","storage","cat"]:
                return subprocess.CompletedProcess(command,0,stdout=b"ID3wrong",stderr=b"")
            return subprocess.CompletedProcess(command,0,stdout=b"",stderr=b"")
        with mock.patch.object(up.subprocess,"run",
                               return_value=mock.Mock(stdout=pre.PROJECT)), \
             mock.patch.object(pre,"check_remote_readonly",return_value=self.generation), \
             mock.patch.object(gcs,"run",side_effect=wrong):
            with self.assertRaisesRegex(RuntimeError,"SHA-256 mismatch"):
                up.upload_approved_once(self.plan,self.generation,self.journal)
        self.assertEqual(len([c for c in calls if c[:3]==["gcloud","storage","cp"]]),1)

    def test_changed_previous_manifest_just_before_publish_is_blocked(self):
        calls, runner=self.mock_cloud()
        with mock.patch.object(up.subprocess,"run",
                               return_value=mock.Mock(stdout=pre.PROJECT)), \
             mock.patch.object(pre,"check_remote_readonly",return_value=self.generation), \
             mock.patch.object(gcs,"remote_manifest",
                               return_value=(self.old_index,"234")), \
             mock.patch.object(gcs,"run",side_effect=runner):
            with self.assertRaisesRegex(RuntimeError,"Original GCS manifest changed"):
                up.upload_approved_once(self.plan,self.generation,self.journal)
        puts=[c for c in calls if c[:3]==["gcloud","storage","cp"]]
        self.assertEqual(len(puts),5)

    def test_index_generation_precondition_failure_keeps_five_files_for_review(self):
        calls, runner=self.mock_cloud()
        def fail_index(command,check=True):
            if command[:3]==["gcloud","storage","cp"] and command[3].endswith("index.json"):
                calls.append(command)
                raise subprocess.CalledProcessError(412, command)
            return runner(command,check)
        with mock.patch.object(up.subprocess,"run",
                               return_value=mock.Mock(stdout=pre.PROJECT)), \
             mock.patch.object(pre,"check_remote_readonly",return_value=self.generation), \
             mock.patch.object(gcs,"remote_manifest",
                               return_value=(self.old_index,self.generation)), \
             mock.patch.object(gcs,"run",side_effect=fail_index):
            with self.assertRaises(subprocess.CalledProcessError):
                up.upload_approved_once(self.plan,self.generation,self.journal)
        self.assertEqual(len([c for c in calls if c[:3]==["gcloud","storage","cp"]]),6)
        self.assertIn("STOPPED_PRESERVE_ALL_FILES",self.journal.read_text(encoding="utf-8"))

    def test_post_index_remote_audio_mismatch_marks_incomplete(self):
        calls, runner=self.mock_cloud()
        state={"cats":0}
        def tamper(command,check=True):
            if command[:3]==["gcloud","storage","cat"]:
                state["cats"]+=1
                if state["cats"]==6:
                    calls.append(command)
                    return subprocess.CompletedProcess(command,0,stdout=b"bad",stderr=b"")
            return runner(command,check)
        with mock.patch.object(up.subprocess,"run",
                               return_value=mock.Mock(stdout=pre.PROJECT)), \
             mock.patch.object(pre,"check_remote_readonly",return_value=self.generation), \
             mock.patch.object(gcs,"remote_manifest",
                               side_effect=[(self.old_index,self.generation),
                                            (self.merged,"1743465689000790")]), \
             mock.patch.object(gcs,"run",side_effect=tamper):
            with self.assertRaisesRegex(RuntimeError,"SHA-256 mismatch"):
                up.upload_approved_once(self.plan,self.generation,self.journal)
        self.assertIn("STOPPED_PRESERVE_ALL_FILES",self.journal.read_text(encoding="utf-8"))
        self.assertNotIn("all_12_remote_sha256_and_index_verified",
                         self.journal.read_text(encoding="utf-8"))

    def test_extra_new_object_or_too_large_scope_is_blocked(self):
        bad=copy.deepcopy(self.plan)
        bad["newObjects"].append(bad["newObjects"][0])
        with mock.patch.object(pre,"check_remote_readonly",
                               side_effect=AssertionError("no cloud")):
            with self.assertRaisesRegex(ValueError,"Unexpected append-only"):
                up.upload_approved_once(bad,self.generation,self.journal)
        bad=copy.deepcopy(self.plan)
        bad["newBytes"]=up.MAX_NEW_BYTES+1
        with mock.patch.object(pre,"check_remote_readonly",
                               side_effect=AssertionError("no cloud")):
            with self.assertRaisesRegex(ValueError,"Unexpected append-only"):
                up.upload_approved_once(bad,self.generation,self.journal)

    def test_script_contains_no_tts_or_delete_cloud_operations(self):
        source=(Path(__file__).parent/"stage5_five_title_gcs_upload.py").read_text(encoding="utf-8")
        for forbidden in ["t.synthesize(", "gcloud run deploy", "gcloud storage rm",
                          "storage.objects.delete", "os.unlink(", "gcs.merged_manifest("]:
            self.assertNotIn(forbidden,source)


if __name__=="__main__":
    unittest.main()
