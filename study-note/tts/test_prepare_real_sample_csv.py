"""Offline safety regression for the private Google Sheets 암기장 CSV exporter."""
import csv
import importlib.util
import json
from pathlib import Path
import os
import stat
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "prepare_real_sample_csv.py"
spec = importlib.util.spec_from_file_location("tts_private_exporter", SOURCE)
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)

FIELDS = [name for _, name in exporter.FIELD_COLUMNS]


class PrivateSampleCSVTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.csvfile = self.path / "owner-암기장.csv"
        self.output = self.path / "private" / "real-5.json"

    def example(self, topic_id, study_target="Y"):
        row = {name: "테스트 내용 " + name for name in FIELDS}
        row["통합ID"] = topic_id
        row["학습대상"] = study_target
        row["통합토픽"] = "예시 토픽 " + topic_id
        return row

    def write_csv(self, rows, columns=None):
        with self.csvfile.open("w", newline="", encoding="utf-8-sig") as file:
            writer = csv.DictWriter(file, fieldnames=columns or FIELDS)
            writer.writeheader()
            writer.writerows(rows)

    def test_two_real_format_rows_reordered_without_mutation(self):
        self.write_csv([self.example("T1961"), self.example("T0001")])
        before = self.csvfile.read_bytes()
        count = exporter.save_private_sample(
            self.csvfile, self.output, exporter.parse_ids("T0001,T1961")
        )
        self.assertEqual(count, 2)
        contents = json.loads(self.output.read_text(encoding="utf-8"))
        self.assertEqual([t["topicId"] for t in contents["topics"]], ["T0001", "T1961"])
        self.assertEqual(contents["topics"][0]["necessity"], "테스트 내용 필요성")
        self.assertEqual(contents["topics"][0]["technicalComponents"], "테스트 내용 기술요소·구성요소")
        self.assertEqual(before, self.csvfile.read_bytes())
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o600)

    def test_five_ids_validated_and_duplicate_ids_rejected(self):
        self.assertEqual(len(exporter.parse_ids("T0001,T1961,T2238,T2176,T2354")), 5)
        for ids in ["", "T0001,T0001", "T0001,T002", "T0001,T0002,T0003,T0004,T0005,T0006"]:
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                exporter.parse_ids(ids)

    def test_missing_or_not_y_topics_fail_closed(self):
        self.write_csv([self.example("T0001"), self.example("T1961", "N")])
        with self.assertRaisesRegex(ValueError, "studyTarget"):
            exporter.save_private_sample(
                self.csvfile, self.output, exporter.parse_ids("T0001,T1961")
            )
        self.assertFalse(self.output.exists())
        with self.assertRaisesRegex(ValueError, "absent"):
            exporter.save_private_sample(
                self.csvfile, self.output, exporter.parse_ids("T0001,T2354")
            )

    def test_duplicate_source_rows_fail_closed(self):
        self.write_csv([self.example("T0001"), self.example("T0001")])
        with self.assertRaisesRegex(ValueError, "Duplicate topic"):
            exporter.save_private_sample(
                self.csvfile, self.output, exporter.parse_ids("T0001")
            )

    def test_empty_speech_fields_are_rejected(self):
        row = self.example("T0001")
        row["필요성"] = ""
        self.write_csv([row])
        with self.assertRaisesRegex(ValueError, "empty speech field"):
            exporter.save_private_sample(
                self.csvfile, self.output, exporter.parse_ids("T0001")
            )

    def test_missing_necessity_column_is_rejected(self):
        columns = [f for f in FIELDS if f != "필요성"]
        row = self.example("T0001")
        del row["필요성"]
        self.write_csv([row], columns=columns)
        with self.assertRaisesRegex(ValueError, "missing columns"):
            exporter.save_private_sample(
                self.csvfile, self.output, exporter.parse_ids("T0001")
            )

    def test_existing_output_cannot_be_overwritten(self):
        self.write_csv([self.example("T0001")])
        self.output.parent.mkdir()
        self.output.write_text("PRESERVE", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "already exists"):
            exporter.save_private_sample(
                self.csvfile, self.output, exporter.parse_ids("T0001")
            )
        self.assertEqual(self.output.read_text(), "PRESERVE")

    def test_private_data_cannot_be_written_inside_repository(self):
        self.write_csv([self.example("T0001")])
        with self.assertRaisesRegex(ValueError, "outside the GitHub"):
            exporter.save_private_sample(
                self.csvfile, ROOT / "unsafe-output.json", exporter.parse_ids("T0001")
            )
        self.assertFalse((ROOT / "unsafe-output.json").exists())

    def test_repo_source_csv_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "outside the GitHub"):
            exporter.collect(ROOT / "voice-pilot.sample.json", ["T0001"])


if __name__ == "__main__":
    unittest.main()
