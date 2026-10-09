"""Completely offline speech-quality regression tests; no API requests."""
import base64
import io
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest import mock

import generate_mp3 as t


class BilingualSpeechTests(unittest.TestCase):
    def test_short_bilingual_pairs_and_hangul_particles(self):
        examples = {
            "B+Tree(비플러스 트리)": "비플러스 트리",
            "SQL(구조화 질의 언어)": "구조화 질의 언어",
            "MCTS(몬테카를로 트리 탐색)": "몬테카를로 트리 탐색",
            "Machine Learning(기계 학습)": "기계 학습",
            "iOS(아이오에스)": "아이오에스",
            "SQL(에스큐엘)과 B+Tree(비플러스 트리)": "에스큐엘과 비플러스 트리",
            "SQL(구조화 질의 언어)과": "구조화 질의 언어와",
            "SQL(구조화 질의 언어)은": "구조화 질의 언어는",
            "SQL(구조화 질의 언어)을": "구조화 질의 언어를",
            "SQL(구조화 질의 언어)가": "구조화 질의 언어가",
            "MCTS(몬테카를로 트리 탐색)을": "몬테카를로 트리 탐색을",
            "AI(인공지능)는": "인공지능은",
            "AI(인공지능)로": "인공지능으로",
            "B+Tree(비플러스 트리)으로": "비플러스 트리로",
            "SQL(구조화 질의 언어)에서": "구조화 질의 언어에서",
            "SQL(구조화 질의 언어)의": "구조화 질의 언어의",
            "SQL(구조화 질의 언어)과 DBMS(데이터베이스 관리 시스템)을":
                "구조화 질의 언어와 데이터베이스 관리 시스템을",
            "단독 SQL": "단독 SQL",
        }
        for original, expected in examples.items():
            with self.subTest(original=original):
                self.assertEqual(t.prefer_korean_bilingual_terms(original), expected)

    def test_uncertain_or_complex_pairs_keep_source(self):
        samples = (
            "P(확률)", "자연어(한국어 설명)",
            "SQL(구조화 질의 언어, 표준)",
            "SQL(Structured Query Language)",
            "SQL(구조화 질의 언어(표준))",
            "CPU(중앙 처리 장치 / GPU 포함)",
            "T0001(토픽명)", "natural language processing(자연어 처리)",
            "some Machine Learning(기계 학습)",
            "SQL(구조화 질의 언어)과정",
            "AI(인공지능)으로부터",
        )
        for original in samples:
            with self.subTest(original=original):
                self.assertEqual(t.prefer_korean_bilingual_terms(original), original)

    def test_source_hash_is_preserved_but_spoken_text_uses_dictionary(self):
        original = "SQL(구조화 질의 언어)과 단독 SQL"
        spoken = t.for_speech("개념", "concept", original, {"SQL": "에스큐엘"})
        self.assertEqual(spoken, "개념. 구조화 질의 언어와 단독 에스큐엘")
        self.assertEqual(t.digest(original), t.digest("SQL(구조화 질의 언어)과 단독 SQL"))

    def test_dot_separator_inserts_pause_markup(self):
        text = "데이터 포인터를 리프에 모음 · 내부노드는 인덱스에 집중"
        spoken = t.for_speech("기술요소", "components", text, {})
        self.assertIn(", [pause short] 내부노드는", spoken)
        self.assertEqual(t.synthesis_input(spoken), {"markup": spoken})
        self.assertEqual(t.synthesis_input("개념. SQL"), {"text": "개념. SQL"})

    def test_actual_synthesize_http_request_uses_markup_offline(self):
        fake_audio = b"ID3" + b"0" * 170
        response = json.dumps({"audioContent": base64.b64encode(fake_audio).decode()}).encode()
        text = "첫 번째 문장, [pause short] 두 번째 문장"
        with mock.patch.object(t, "urlopen", return_value=io.BytesIO(response)) as opener:
            self.assertEqual(t.synthesize(text, "ko-KR-Chirp3-HD-Aoede",
                                          "study-note-tts", "FAKE-TOKEN"), fake_audio)
        sent = json.loads(opener.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(sent["input"], {"markup": text})
        self.assertEqual(sent["voice"]["name"], "ko-KR-Chirp3-HD-Aoede")
        # All network access is mocked; no user account or Cloud TTS request.

    def test_long_technical_text_splits_without_missing_syllables(self):
        original = ("저장소를 연결해 조회를 최적화 · 빠른 검색을 지원. " * 80).strip()
        spoken = t.for_speech("기술요소 및 구성요소", "components", original, {})
        chunks = t.split_speech(spoken)
        self.assertGreater(len(chunks), 5)
        self.assertTrue(all(len(x) <= t.MAX_SPEECH_CHARS and
                            t.utf8_len(x) <= t.MAX_REQUEST_BYTES for x in chunks))
        self.assertEqual("".join("".join(chunks).split()), "".join(spoken.split()))
        self.assertEqual("".join(chunks).count("[pause short]"),
                         spoken.count("[pause short]"))
        self.assertTrue(all(x.count("[pause short]") == x.count("[pause")
                            for x in chunks))

    def test_multifile_manifest_for_long_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            record = {"topicId": "T2176", "studyTarget": "Y",
                      "technicalComponents": ("리프를 연결한 인덱스 구조 · " * 40)}
            requests = t.plan([record], "ko-KR-Chirp3-HD-Aoede",
                              {"components"}, {}, Path(tmp),
                              {"schemaVersion": 1, "entries": {}}, 1)
            self.assertEqual(len(requests), 1)
            self.assertGreater(len(requests[0]["chunks"]), 1)
            self.assertEqual(len(requests[0]["chunks"]), len(requests[0]["files"]))
            self.assertIn("-p01.mp3", requests[0]["files"][0])
            self.assertTrue(all(t.utf8_len(x) <= t.MAX_REQUEST_BYTES
                                for x in requests[0]["chunks"]))

    def test_input_byte_limits_still_apply(self):
        text = "가" * 2000
        chunks = t.split_speech(text, 200)
        self.assertEqual("".join(chunks), text)
        self.assertTrue(all(t.utf8_len(x) <= 200 for x in chunks))
        with self.assertRaisesRegex(ValueError, "token exceeds"):
            t.split_speech("[pause short]", 4)
        with self.assertRaisesRegex(ValueError, "positive"):
            t.split_speech("테스트", 0)


if __name__ == "__main__":
    unittest.main()
