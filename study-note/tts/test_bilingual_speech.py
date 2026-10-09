"""Offline tests for Korean-first TTS input; no paid synthesis."""
import unittest

from generate_mp3 import for_speech, prefer_korean_bilingual_terms, digest


class BilingualSpeechTests(unittest.TestCase):
    def test_simple_bilingual_pairs(self):
        cases = {
            "B+Tree(비플러스 트리)": "비플러스 트리",
            "SQL(구조화 질의 언어)": "구조화 질의 언어",
            "MCTS(몬테카를로 트리 탐색)": "몬테카를로 트리 탐색",
            "Machine Learning(기계 학습)": "기계 학습",
            "iOS(아이오에스)": "아이오에스",
            "SQL(에스큐엘)과 B+Tree(비플러스 트리)": "에스큐엘과 비플러스 트리",
            "단독 SQL": "단독 SQL",
        }
        for original, expected in cases.items():
            with self.subTest(original=original):
                self.assertEqual(prefer_korean_bilingual_terms(original), expected)

    def test_unsafe_parentheses_are_preserved(self):
        samples = (
            "P(확률)",
            "자연어(한국어 설명)",
            "SQL(구조화 질의 언어, 표준)",
            "SQL(Structured Query Language)",
            "SQL(구조화 질의 언어(표준))",
            "CPU(중앙 처리 장치 / GPU 포함)",
            "T0001(토픽명)",
            "natural language processing(자연어 처리)",
            "some Machine Learning(기계 학습)",
        )
        for original in samples:
            with self.subTest(original=original):
                self.assertEqual(prefer_korean_bilingual_terms(original), original)

    def test_speech_only_original_remains_unchanged(self):
        original = "SQL(구조화 질의 언어)과 단독 SQL"
        spoken = for_speech("개념", "concept", original, {"SQL": "에스큐엘"})
        self.assertEqual(spoken, "개념. 구조화 질의 언어과 단독 에스큐엘")
        self.assertEqual(digest(original), digest("SQL(구조화 질의 언어)과 단독 SQL"))


if __name__ == "__main__":
    unittest.main()
