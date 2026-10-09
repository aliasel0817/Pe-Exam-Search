"""Offline tests: spoken body headings, short pause and data preservation."""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

import generate_mp3 as t


class SpeechHeadingTests(unittest.TestCase):
    EXPECTED = {
        "concept": "개념은, [pause short] ",
        "background": "등장배경은, [pause short] ",
        "necessity": "필요성은, [pause short] ",
        "features": "특징은, [pause short] ",
        "components": "기술요소 및 구성요소는, [pause short] ",
        "keywords": "키워드는, [pause short] ",
    }

    def test_every_body_field_has_distinct_heading_and_pause(self):
        original = "내용을 정확하게 구분하여 설명하는 기술"
        for field, _, label in t.FIELDS:
            if field == "topic":
                continue
            with self.subTest(field=field):
                spoken = t.for_speech(label, field, original, {})
                self.assertEqual(spoken, self.EXPECTED[field] + original)
                self.assertEqual(spoken.count(t.PAUSE_MARKER), 1)
                self.assertEqual(t.synthesis_input(spoken), {"markup": spoken})

    def test_topic_name_not_prefixed_with_heading(self):
        spoken = t.for_speech("토픽명", "topic", "SQL", {"SQL": "에스큐엘"})
        self.assertEqual(spoken, "에스큐엘")
        self.assertEqual(t.synthesis_input(spoken), {"text": "에스큐엘"})

    def test_heading_and_original_dot_pauses_are_both_preserved(self):
        original = "리프 노드 연결 · 순차 및 범위 탐색 성능 개선"
        spoken = t.for_speech("특징", "features", original, {})
        self.assertTrue(spoken.startswith(self.EXPECTED["features"]))
        self.assertIn("리프 노드 연결, [pause short] 순차", spoken)
        self.assertEqual(spoken.count(t.PAUSE_MARKER), 2)
        self.assertEqual(t.synthesis_input(spoken), {"markup": spoken})

    def test_english_korean_translation_stays_after_heading(self):
        spoken = t.for_speech("개념", "concept", "SQL(구조화 질의 언어)과 B+Tree",
                              {"B+Tree": "비 플러스 트리"})
        self.assertEqual(spoken,
                         "개념은, [pause short] 구조화 질의 언어와 비 플러스 트리")

    def test_plan_preserves_original_hash_and_does_not_call_tts(self):
        record = {"topicId": "T0001", "studyTarget": "Y",
                  "topicName": "학습 토픽", "concept": "원문 개념"}
        with TemporaryDirectory() as tmp:
            with mock.patch.object(t, "synthesize") as cloud:
                entries = t.plan([record], "ko-KR-Chirp3-HD-Aoede", {"concept"},
                                 {}, Path(tmp),
                                 {"schemaVersion": 1, "entries": {}}, 1)
            cloud.assert_not_called()
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["originalHash"], t.digest("원문 개념"))
            self.assertNotEqual(entries[0]["speechHash"], t.digest("개념. 원문 개념"))
            self.assertEqual(entries[0]["chunks"],
                             ["개념은, [pause short] 원문 개념"])
            self.assertEqual(record["concept"], "원문 개념")

    def test_split_long_body_keeps_single_heading_without_losing_words(self):
        original = ("인덱스 구성요소 설명과 검색 성능 향상 · " * 40).strip()
        spoken = t.for_speech("기술요소 및 구성요소", "components", original, {})
        parts = t.split_speech(spoken)
        self.assertGreater(len(parts), 1)
        self.assertEqual("".join("".join(parts).split()), "".join(spoken.split()))
        self.assertEqual("".join(parts).count("기술요소 및 구성요소는"), 1)
        self.assertEqual("".join(parts).count(t.PAUSE_MARKER),
                         spoken.count(t.PAUSE_MARKER))
        self.assertTrue(all(t.utf8_len(x) <= t.MAX_REQUEST_BYTES
                            and len(x) <= t.MAX_SPEECH_CHARS for x in parts))


if __name__ == "__main__":
    unittest.main()
