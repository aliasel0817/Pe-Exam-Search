"""Offline Stage-4 local private MP3 audit tests; never accesses GCS."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

import stage4_private_audio_preflight as s


class Stage4PrivateAudioAuditTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        self.source = root / "approved.json"
        self.folder = root / "7-mp3"
        self.archive = root / "7-mp3.zip"

    def make_sample(self):
        rows = []
        for tid in s.p.TOPIC_IDS:
            rows.append({"topicId": tid, "studyTarget": "Y",
                         "concept": "예시 개념", "technicalComponents": "시험 구성요소"})
        self.source.write_text(json.dumps({"topics": rows}, ensure_ascii=False), encoding="utf-8")
        planned = []
        specs = [
            ((80, 26),),
            ((173, 71), (173, 71)),
            ((140, 37), (140, 37), (139, 36), (139, 36)),
        ]
        for (tid, field, _, _, _), splits in zip(s.p.TARGETS, specs):
            chunks = ["가" * korean + "a" * (total - korean)
                      for total, korean in splits]
            filenames = [
                "{}/{}/{}-{:012x}{}.mp3".format(
                    s.p.VOICE, tid, field, len(planned)+3,
                    "" if len(chunks) == 1 else "-p{:02d}".format(i))
                for i in range(1, len(chunks)+1)
            ]
            row = next(row for row in rows if row["topicId"] == tid)
            original = row["concept" if field == "concept" else "technicalComponents"]
            planned.append({
                "key": "{}:{}:{}".format(tid, field, s.p.VOICE),
                "topicId": tid, "chunks": chunks, "files": filenames,
                "originalHash": s.t.digest(original),
                "speechHash": s.t.digest("\n".join(chunks)),
            })
        self.folder.mkdir()
        manifest = {"schemaVersion":1,"entries":{}}
        records=[]
        for entry in planned:
            tid = entry["topicId"]
            field = entry["key"].split(":")[1]
            manifest["entries"][entry["key"]] = {
                "sha256":entry["originalHash"],"speechSha256":entry["speechHash"],
                **({"file":entry["files"][0]} if len(entry["files"]) == 1 else
                   {"files":entry["files"]})
            }
            for i,(text,name) in enumerate(zip(entry["chunks"],entry["files"]),start=1):
                path=self.folder/name
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_bytes(b"ID3"+b"x"*200)
                records.append({
                    "number":len(records)+1,"topicId":tid,"field":field,
                    "part":i,"relativeFile":name,"characters":len(text),
                    "utf8Bytes":s.t.utf8_len(text),"status":"saved"
                })
        (self.folder/"index.json").write_text(json.dumps(manifest),encoding="utf-8")
        (self.folder/"attempts.json").write_text(json.dumps({
            "schemaVersion":1,"projectId":s.p.PROJECT,"voice":s.p.VOICE,
            "approvedCalls":7,"approvedCharacters":984,
            "approvedUtf8Bytes":1612,
            "sourceSha256":hashlib.sha256(self.source.read_bytes()).hexdigest(),
            "records":records,
        }),encoding="utf-8")
        with zipfile.ZipFile(self.archive,"w") as z:
            for entry in planned:
                tid=entry["topicId"]
                field=entry["key"].split(":")[1]
                for i,name in enumerate(entry["files"],1):
                    z.write(self.folder/name,"{}/{:02d}_{}.mp3".format(tid,i,field))
        return planned

    def mocks(self, planned):
        return [
            mock.patch.object(s.p,"private_paths",return_value=(self.source,self.folder,self.archive)),
            mock.patch.object(s.p,"SOURCE_SHA256",hashlib.sha256(self.source.read_bytes()).hexdigest()),
            mock.patch.object(s.t,"plan",side_effect=lambda topics,*a,**kw:
                [next(e for e in planned if e["topicId"]==topics[0]["topicId"] and
                      e["key"].split(":")[1] in a[1])]),
        ]

    def test_preflight_rejects_missing_output(self):
        with mock.patch.object(s.p,"private_paths",return_value=(self.source,self.folder,self.archive)):
            with self.assertRaisesRegex(ValueError,"missing or unsafe"):
                s.audit_local()

    def test_exact_scope_has_three_fields_and_seven_audio_parts(self):
        self.assertEqual(len(s.p.TARGETS),3)
        self.assertEqual(sum(x[2] for x in s.p.TARGETS),7)
        self.assertEqual(sum(x[3] for x in s.p.TARGETS),984)
        self.assertEqual(sum(x[4] for x in s.p.TARGETS),1612)

    def test_global_cloud_permissions_still_locked(self):
        s.p.check_cloud_locks()

    def test_only_read_only_main_is_exposed(self):
        self.assertFalse(hasattr(s,"upload") or hasattr(s,"execute"))
        self.assertEqual(s.BUCKET,"study-note-tts-audio-558407087449")

    def test_broken_attempts_are_rejected_before_any_cloud_work(self):
        planned=self.make_sample()
        path=self.folder/"attempts.json"
        obj=json.loads(path.read_text())
        obj["records"][1]["status"]="attempted"
        path.write_text(json.dumps(obj))
        patches=self.mocks(planned)
        with mock.patch.object(s.p,"git_blob_hash",side_effect=[
                 s.PINNED_QUALITY_PREFLIGHT_BLOB,s.p.GENERATOR_BLOB,s.p.DICTIONARY_BLOB]), \
             mock.patch.object(s.u,"run",side_effect=AssertionError("cloud invoked")), \
             patches[0],patches[1],patches[2]:
            with self.assertRaisesRegex(ValueError,"incomplete"):
                s.audit_local()

    def test_valid_synthetic_audio_is_verified_without_cloud_calls(self):
        planned=self.make_sample()
        patches=self.mocks(planned)
        with mock.patch.object(s.p,"git_blob_hash",side_effect=[
                 s.PINNED_QUALITY_PREFLIGHT_BLOB,s.p.GENERATOR_BLOB,s.p.DICTIONARY_BLOB]), \
             mock.patch.object(s.u,"run",side_effect=AssertionError("cloud invoked")), \
             patches[0],patches[1],patches[2]:
            info=s.audit_local()
        self.assertEqual(info["files"],7)
        self.assertEqual(info["fields"],3)
        self.assertEqual(info["audioBytes"],7*203)

    def test_modified_zip_is_rejected(self):
        planned=self.make_sample()
        with zipfile.ZipFile(self.archive,"a") as z:
            z.writestr("EXTRA.txt",b"no")
        patches=self.mocks(planned)
        with mock.patch.object(s.p,"git_blob_hash",side_effect=[
                 s.PINNED_QUALITY_PREFLIGHT_BLOB,s.p.GENERATOR_BLOB,s.p.DICTIONARY_BLOB]), \
             mock.patch.object(s.u,"run",side_effect=AssertionError("cloud invoked")), \
             patches[0],patches[1],patches[2]:
            with self.assertRaisesRegex(ValueError,"ZIP content"):
                s.audit_local()


if __name__ == "__main__":
    unittest.main()
