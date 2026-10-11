# Chirp3-HD Aoede 발화 가독성 수정 — V2 오프라인 검증 체크포인트

기준 2026-10-11. **실제 합성/업로드/배포 금지**, 원본 Google Sheets 쓰기 금지, 기존 MP3·매니페스트 불변.

## 사용자 보고 및 실제 재현

- 현재 SW 첫 토픽 `T0626 Microsoft SDL`의 특징은 서로 다른 3개 최상위 항목이 원문 ` · `으로 연결되어 있음.
- 구버전 `generate_mp3.for_speech()`가 모든 `·`를 똑같은 `[pause short]`로 치환하여, 첫 번째와 두 번째 항목 사이에 의도한 긴 쉼이 없음.
- 구버전 `prefer_korean_bilingual_terms()`가 일부 `English(한글)`을 **한글만 남기는 방식**으로 변환. 실제 T0626에서 `Secure Design/Coding`, `Security Review`가 음성 문장에서 빠졌음을 확인. Google Sheets 원문은 남아 있음.
- T0626 원문에는 `Training/Requirements`, `Threat Modeling`, `Secure Design/Coding` 등의 **요소명 한글 번역 자체가 없음**. 설명문과 요소명 번역은 다른 것.
- Google 공식 Chirp3-HD 문서에서 `input.markup`의 `[pause short]`, `[pause long]` 지원 확인. **음성에서 정확한 휴지 길이는 비결정적**이며 실제 청취 검증 필수. https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd

## V2 분리 브랜치·코드

- 브랜치 `feature/tts-narration-v2-pauses-glossary-20261011`은 6-4 checkpoint `ff91f662...`에서 분기.
- `study-note/tts/narration_v2.py`: **사전 계산/스크립트 출력만**, TTS API 호출·파일 생성·GCS 작업 없음.
- `study-note/tts/test_narration_v2.py`: 오프라인 자동 테스트 **17/17 통과**.
- 최상위 ` · ` 항목만 구분; 번역·설명·수식 등 괄호 내부의 구분점은 항목으로 나누지 않음.
- 첫째/둘째/... 안내, 항목 경계 `[pause long]`, 요소명과 상세 설명 경계 `[pause short]`. 기존 긴/짧은 표기는 모델 해석에 따라 차이가 있을 수 있음.
- **영문 병기 삭제 규칙은 V2에서 사용하지 않음**. 발음 사전(예: SQL → 에스큐엘)은 소리 변환 목적만 유지.
- 사전 검토용 요소명 6개: `Training/Requirements(교육·요구사항 정의)`, `Threat Modeling(위협 모델링)`, `Secure Design/Coding(보안 설계·안전 코딩)`, `Security Review(보안 검토)`, `Incident Response(사고 대응)`, `Fuzzing(퍼징)`. 한국어 용어/휴지 길이 사용자 청취 검토 전 **확정 아님**.
- `SAST(...)/SCA(...)/Fuzzing(...)`처럼 괄호 외부 `)/`로 연결된 복합 항목은 기존 영어 약칭과 번역을 보존하면서 분리함. 원문 어휘 순서 변경 없음.
- **`synthesis_input_v2()` 중요**: 구버전 `synthesis_input()`은 `[pause short]`만 마크업으로 처리하므로 긴 쉼만 있는 파일에서 실패. 신규 전용 함수를 유료 실행기에 연결할 때 검증할 것.

## LIVE/전체 SW 검사 및 보호

- 운영 Google Sheets `암기장` A433:Z1140, 708행: Y=698, N=10.
- SW 원본 708행 SHA-256 `d27ee06cf701559f6cf11aebe1bc5cc4bc6cbbc37d20214541e4db83a980b373` 이전 체크포인트와 일치.
- SW 698건 × 필수 6개 본문 필드 = **4,188개 필드**의 V2 원문 어휘/숫자 토큰 순서 보존 검증: **누락 0, 파싱 실패 0**. 원본 값이나 SHA 변경 없음.
- 전체 SW 기술요소의 한글 뜻이 확인되지 않은 영문 요소명 **2,302회 / 중복 제거 1,771종**. 문맥 없는 자동 번역은 오류 위험이 커서 추가하지 않음. 용어집 배치 검토 필요.
- SW 최초 10토픽 Batch001: 구버전 총 MP3 93개. V2 발화 원문 SHA는 70필드 모두 일치하지만 **speech SHA가 48필드에서 변동**, 나머지 22필드는 이전과 동일. V2 전체 예정 분할 149개. 이미 등록된 105 MP3를 덮어쓰지 않는 **변경 필드만 새로운 SHA 경로에 재합성** 필요. 48필드 신규 계획 파일 분할 127개/10,699자. 이는 비용 승인 없이 실행 금지.
- SW Batch002 10토픽은 V2 기준 149개 음성 세그먼트/10,496자 계획(종전 88개/11,135자 계획에서 변경); 아직 최초 생성 안 됨. 기존 Batch001 생성/업로드 프로그램을 재사용하면 안 됨.

## 완료/미완료

완료: 재현, 6개 예시 기술요소명 사전 초안, 읽기 전용 신규 변환 모듈, 17/17 테스트, SW 4,188필드 원문 단어 손실 0, 기존 브랜치/운영 main 보호.

미완료: 사용자 번역/청취 승인, 다른 영문 요소명 큐레이션, 실제 Aoede MP3 1토픽 샘플 청취·쉼 길이 검증, 신규 파일 생성기/불변 GCS 추가 업로더/리비전 매니페스트 검증, 3기기 QA, 운영 반영. **현재 생성 신규 MP3 0, API 호출 0, GCS 쓰기 0, Cloud Run 배포 0**.

**운영 main은 `dcb25c59f87098366dcc74eb5a182065254fc2bc`에서 변경하지 않았으며, 실제 학습노트의 기존 음성 재생은 변함 없음.**
