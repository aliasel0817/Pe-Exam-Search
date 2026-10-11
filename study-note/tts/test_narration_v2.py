#!/usr/bin/env python3
"""Pure offline tests for draft narration v2. NEVER call Cloud TTS/GCS."""
import unittest
import narration_v2 as v2
import generate_mp3 as legacy


class NarrationV2Tests(unittest.TestCase):
    def test_two_separate_items_receive_long_pause_and_number(self):
        s = ("분석·설계·검증을 먼저 수행 · "
             "운영 이후 수정비용과 보안위험 감소")
        items=v2.speech_items("특징","features",s)
        self.assertEqual(len(items),2)
        self.assertIn("첫째,",items[0])
        self.assertTrue(items[0].endswith(". [pause long]"))
        self.assertTrue(items[1].startswith("둘째,"))
        self.assertIn("먼저 수행",items[0])
        self.assertIn("운영 이후",items[1])

    def test_repeated_technical_names_with_approved_gloss(self):
        s=("구성요소: Training/Requirements(조직 보안교육과 요구 정의) · "
           "Threat Modeling(공격경로·자산 분석) · "
           "Secure Design/Coding(보안 설계원칙 적용) · "
           "Security Review(배포 전 보안점검) · "
           "Incident Response(취약점 사후 대응)")
        a=v2.speech_items("기술요소 및 구성요소","components",s)
        self.assertEqual(len(a),5)
        for i,term in enumerate(v2.GLOSSARY_DRAFT):
            if term=="Fuzzing":continue
            self.assertIn(term+"(",a[i])
            self.assertIn(v2.SHORT,a[i])
            if i<4:self.assertIn(v2.LONG,a[i])
        for s in ["조직 보안교육과 요구 정의","공격경로","자산 분석",
                  "보안 설계원칙 적용","배포 전 보안점검","취약점 사후 대응"]:
            self.assertTrue(any(s in part for part in a),s)

    def test_top_level_only_and_balanced_nested_brackets(self):
        s=("Engine(Inner(한글 · 내부)이 있는 설명) · "
           "Threat Modeling(자산·공격경로 검증)")
        self.assertEqual(len(v2.split_items(s)),2)
        self.assertIn("Inner(한글 · 내부)",v2.split_items(s)[0])

    def test_non_spaced_dot_not_a_new_item(self):
        self.assertEqual(len(v2.split_items("분석·설계·코딩")),1)
        self.assertEqual(len(v2.split_items("A(항목 · 내부)")),1)

    def test_unbalanced_parenthesis_fails_closed(self):
        s="A(잘못된 구분 · B(설명)"
        self.assertEqual(v2.split_items(s),[s])

    def test_numbered_newlines_dont_get_double_ordinals(self):
        s="1. 사전 검증\n2. 배포 후 점검"
        out=v2.speech_items("특징","features",s)
        self.assertEqual(len(out),2)
        self.assertNotIn("첫째,",out[0])
        self.assertNotIn("둘째,",out[1])
        self.assertIn("[pause long]",out[0])

    def test_gloss_only_should_not_double_add(self):
        self.assertEqual(v2.spoken_component_item("Threat Modeling(위협 모델링)"),
                         "Threat Modeling(위협 모델링)")
        self.assertEqual(v2.spoken_component_item("SQL(Structured Query Language, 구조화질의언어)"),
                         "SQL(Structured Query Language, 구조화질의언어)")

    def test_english_name_with_description_not_removed(self):
        result=v2.spoken_component_item("Secure Design/Coding(보안 설계원칙 적용)")
        self.assertIn("Secure Design/Coding(보안 설계·안전 코딩)",result)
        self.assertIn("[pause short]",result)
        self.assertTrue(result.endswith("보안 설계원칙 적용"))

    def test_compound_slash_chain_remains_unmodified(self):
        s="A(English Full Name, 한글명)/B(Software Component, 구성요소)/Fuzzing(오류 입력 검사)"
        self.assertEqual(v2.spoken_component_item(s),s)

    def test_not_arbitrarily_translate_other_names(self):
        s="Unreviewed Technical Label(보안 관련 세부 설명)"
        r=v2.spoken_component_item(s)
        self.assertIn("Unreviewed Technical Label",r)
        self.assertIn("보안 관련 세부 설명",r)
        self.assertNotIn("번역",r)

    def test_only_speech_changes_not_source_sha(self):
        raw="앞의 조건 점검 · 다음 항목 검증"
        v=v2.planned_parts(raw,"features","특징")
        self.assertEqual(v["originalSha256"],legacy.digest(raw))
        self.assertNotEqual(v["speechSha256"],legacy.digest(
            "\n".join(legacy.split_speech(legacy.for_speech("특징","features",raw,{})))))
        self.assertTrue(v["previewOnly"])

    def test_pause_markers_atomic_across_all_chunks(self):
        raw="앞 단계 "+("임의 설명 내용 "*18)+" · 보안 검증 "+("추가 설명 "*30)
        v=v2.planned_parts(raw,"features","특징")
        for ch in v["chunks"]:
            self.assertLessEqual(len(ch),legacy.MAX_SPEECH_CHARS)
            self.assertLessEqual(legacy.utf8_len(ch),legacy.MAX_REQUEST_BYTES)
            self.assertNotIn("[pause lon",ch.replace("[pause long]",""))
            self.assertNotIn("[pause shor",ch.replace("[pause short]",""))
        self.assertTrue(any(v2.LONG in c for c in v["chunks"]))

    def test_empty_input_rejected_without_cloud(self):
        with self.assertRaises(ValueError):
            v2.speech_items("특징","features","  ")

    def test_no_glossary_insertion_for_non_components(self):
        s="Threat Modeling(공격경로 검증) · 다른 방법"
        v=v2.speech_items("특징","features",s)
        self.assertNotIn("(위협 모델링)",v[0])

    def test_legacy_bilingual_deletion_not_used(self):
        s="요구사항: Microsoft(마이크로소프트) 도구와 용어 유지"
        v=v2.speech_items("필요성","necessity",s)[0]
        self.assertIn("Microsoft(마이크로소프트)",v)
        old=legacy.for_speech("필요성","necessity",s,{})
        self.assertNotIn("Microsoft(마이크로소프트)",old)

    def test_source_cannot_be_mutated(self):
        s="구성요소: Threat Modeling(공격경로 분석) · B(기능 수행)"
        snapshot=s.encode("utf-8")
        v2.planned_parts(s,"components","기술요소 및 구성요소")
        self.assertEqual(s.encode("utf-8"),snapshot)

    def test_v2_markup_input_for_all_pauses(self):
        parts=v2.planned_parts("설계 검토 · 다음 활동","features","특징")["chunks"]
        self.assertTrue(all("markup" in v2.synthesis_input_v2(c) for c in parts))
        self.assertEqual(v2.synthesis_input_v2("a. [pause long] b"),
                         {"markup": "a. [pause long] b"})
        self.assertEqual(v2.synthesis_input_v2("plain"), {"text": "plain"})


if __name__=="__main__":
    unittest.main()
