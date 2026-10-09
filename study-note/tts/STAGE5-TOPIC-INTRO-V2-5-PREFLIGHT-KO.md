# 5단계 토픽명 안내 음성 — 추가 합성 승인 전 체크포인트

**확정 발화:** `[토픽명]에 대한 설명, [pause short]` → 기존 본문 6개.
예: `B+Tree에 대한 설명`. 여기서 `[pause short]`는 실제로 말하지 않고 짧게 쉰다.

## 현재 상태
- 과거 35개 합성과 최종 품질 MP3 7개의 데이터·오디오·ZIP·해시는 그대로 보존.
- 기존 `generate_mp3.py` 고정 버전도 변경 없음.
- 새 안내 규칙은 `topic_intro_v2.py`에만 있으며 실제 MP3는 아직 합성하지 않음.
- 추가 읽기 전용 안전 검증기: `stage5_topic_intro_v2_preflight.py`.
- 신규 사전 검증기 테스트 `test_stage5_topic_intro_v2_preflight.py` **14개 통과** (Windows LF 체크아웃, 임시 테스트 데이터).
- 기존 안내 문구 v2 테스트 `test_topic_intro_v2.py`도 **14개 통과**.
- 전체 Python 테스트는 최신 Cloud Shell에서 사용자가 실행했으나, 결과 출력은 새 채팅에 아직 전달되지 않아 완료 판정은 보류.

## 원본 고정 및 충돌 방지
검증 대상:
- Cloud Shell 개인 데이터: `$HOME/study-note-tts-real-5.json`
- 기존 5개 ID 순서: `T0001, T1961, T2238, T2176, T2354`
- `generate_mp3.py` 및 발음 사전 Git blob 해시, `topic_intro_v2.py` 해시
- 비공개 JSON의 원본 SHA-256
- 세 개의 Cloud/TTS 승인 플래그 **모두 false**
- 새 결과 경로 `$HOME/study-tts-topic-intro-v2-5` 및
  `$HOME/study-tts-topic-intro-v2-5.zip` 사전 부재

기존 35개와 7개 출력 폴더는 **어떠한 경우에도 삭제·수정·덮어쓰기 금지**.

## Cloud Shell에서 안전 검증 (명령만 실행; 합성 불가)

```bash
cd "$HOME/pe-tts-dev"
git switch feature/ai-natural-tts-20261009
git pull --ff-only
python3 study-note/tts/stage5_topic_intro_v2_preflight.py
```

예상:
- `STAGE5 TOPIC INTRO V2 PREFLIGHT PASSED`
- `Proposed API attempts: 5`
- `Exact synthesis characters: ...` (실제 사용자 원본으로 계산)
- `UTF-8 input bytes: ...`
- `DRY RUN - NO CLOUD/API REQUESTS, NO MP3 GENERATION, NO FILE WRITES`

결과가 다르면 어떤 클라우드 호출도 수행하지 않고 먼저 분석할 것.

## 이후 절차
1. 실제 Cloud Shell 원본으로 사전 검증 통과 여부 및 문자/바이트 총량 확인.
2. 사용자에게 토픽명 5개만의 신규 유료 TTS 합성 예상 호출 수·요금 가능성과
   신규 로컬 출력 경로를 명시하고 **별도 명시적 승인** 요청.
3. 승인받기 전에는 유료 TTS 합성 전용 실행기를 실제 실행하지 않음.
4. 비공개 GCS 업로드/Cloud Run 재배포/운영 main 변경은 각각 별도 승인.
5. 실제 5개 토픽의 온전한 7개 항목 연속 재생을 위해서는 기존 35개 본문 품질/원본 일치 및
   GCS 매니페스트 통합 계획을 별도로 검증해야 함.
