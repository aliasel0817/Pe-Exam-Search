# Study-Note-TTS — 2단계 자연음성 품질 파일럿 (Aoede 선정 완료)

## 최신 완료 기록 (2026-10-09)

- 사용자가 여성 음성 Aoede·Kore·Leda·Zephyr의 음색을 비교하여 **Aoede의 억양이 가장 만족스럽다**고 선정. 기본 음성 `ko-KR-Chirp3-HD-Aoede`.
- 초기 3개 목소리(Aoede·Kore·Charon) 샘플: 사용자 Cloud Shell 화면에서 실제 **9요청, 336자, MP3 9개 생성 및 합성 승인 잠금 복원** 확인. 이후 Leda·Zephyr 샘플도 사용자 실청취. 청취용 Cloud Shell 로컬 MP3는 공개 GitHub/GCS에 게시하지 않음.
- `pronunciations.ko-candidates.json`에 기술 용어 발음 후보 30건. 아직 **검수 후보**이며 확정 사전 아님.
- 사용자가 Cloud Shell에서 기존 테스트 **81개 모두 OK** 확인. Aoede+후보 사전으로 가상 T99991의 3필드 무료 DRY RUN **3요청·96자·232바이트**, 실제 유료 API 요청 **0회**.
- 실데이터 5건의 사전 추산 및 3단계 비공개 CSV→JSON/DRY RUN 절차는 `STAGE3-PRIVATE-SAMPLE-KO.md`를 참조.
- **현재 승인 잠금:** `ttsGenerationApproved=false`, `gcsUploadApproved=false`, `cloudRunRevisionUpdateUserApproved=false`. 새로운 합성·업로드·배포는 각각 별도 명시적 승인 필요.

---
## 최초 사전 준비 기록 (이하 내용은 실제 합성 승인 이전 스냅샷)


작성/검증: 2026-10-09. Google 로그인 실검증 완료(브라우저에서 Google ID 토큰/허용 계정 검사 통과, 목록 미생성으로 HTTP 503).

## 현재 확정된 조건

- AI 음성: Google Cloud Text-to-Speech, 한국어 Chirp 3: HD.
- 목소리 비교 후보: 여성 **Aoede**, 여성 **Kore**, 남성 **Charon** (`ko-KR-Chirp3-HD-*`).
- 고정 재생 순서: 토픽명 → 개념 → 등장배경 → 필요성 → 특징 → 기술요소·구성요소 → 키워드.
- 토픽명만 항상 읽고 나머지 6개 필드를 사용자 선택에 따라 고정 순서로 재생.
- 영문 약어 발음 사전: `pronunciations.example.json` (실제 운영 전 정확한 발음 사용자 확인).
- 오프라인 MP3 1회 합성 후 클라우드 공유 저장, 재합성 비용 최소화.
- **실제 API 요청·MP3 GCS 업로드·Cloud Run 추가 리비전 배포 금지**(각각 별도 승인 전).

## 비용 확인 (Google Cloud 공식 가격표)

- Chirp 3: HD: **매월 100만 글자까지 무료 사용량**; 초과 분량은 **US$30 / 100만 글자**(US$0.00003/글자).
- 청구 기준은 실제 합성 요청 글자 수이며, **목소리 세 개로 같은 문장을 각각 합성하면 세 번씩 글자 수가 계산**됨.
- Google TTS의 일반 텍스트 길이 제한: 요청당 5,000 UTF-8 바이트. 프로그램은 요청당 4,200바이트 이하로 분할.
- 개발 스크립트의 월 50,000 UTF-8바이트 로컬 제한은 실제 Google 청구서·다른 PC·다른 계정의 합성 사용을 차단하는 전사적 하드캡이 아님.
- Google Cloud의 무료 제공량·가격·사용량은 실제 프로젝트 청구 조건과 Google Cloud 공식 문서를 최종 확인할 것.
- Cloud Run·Cloud Storage 저장량·전송·로그 요금은 TTS 무료 글자 수와 별개.

공식 문서:
- https://cloud.google.com/text-to-speech/pricing?hl=ko
- https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types?hl=en
- https://docs.cloud.google.com/text-to-speech/quotas

## 안전한 음질 비교 설계

개발용 임시 데이터 `voice-pilot.sample.json`은 **실제 Google Sheets에 존재하지 않는 가상의 T99991 토픽**.
내용은 LSM-Tree 및 기술 약어의 음질 검사만을 위한 공개 예문. 학습노트 운영 MP3로 업로드하지 말 것.

**1차 음질 비교:** 동일한 가상 토픽 1개에서 토픽명/개념/키워드 세 항목만, 목소리 3개에 동일 적용.
총 후보 TTS 합성 호출: **3목소리 × 3필드 = 9 요청** (실제 API 승인 전에는 0 요청).

GitHub 자동 테스트에서 3개 목소리 각각 **112글자 / 212 UTF-8바이트 / 3요청**을 계산하여 검증함. 전체는 **336글자 / 636 UTF-8바이트 / 9요청**. **실제 생성·과금 요청은 0회**.


이후 사용자가 **한 목소리를 선택**한 다음에야 실제 학습노트 데이터 3~5건을 소량 생성해 품질·발음과 GCS 재생을 확인하는 것을 권장.
실제 토픽 데이터는 관리 중인 PWA의 `토픽 샘플 JSON 내보내기` 기능에서 추출하여 로컬에만 보관하고 GitHub 공개 저장소에 올리지 말 것.

## 무료 DRY RUN 일괄 명령 (Google Cloud API 호출 없음)

Cloud Shell에서 아래 전체 실행. GitHub 개발 소스 갱신 + 3개 목소리 글자 수/호출 수 계산.

```bash
(
  set -e
  git -C "$HOME/pe-tts-dev" pull --ff-only
  for voice in Aoede Kore Charon; do
    echo "=== VOICE TEST ESTIMATE: $voice ==="
    python3 "$HOME/pe-tts-dev/study-note/tts/generate_mp3.py" \
      --input "$HOME/pe-tts-dev/study-note/tts/voice-pilot.sample.json" \
      --out "$HOME/pe-tts-dev/study-note/tts/audio-pilot-local" \
      --voice "ko-KR-Chirp3-HD-$voice" \
      --pronunciations "$HOME/pe-tts-dev/study-note/tts/pronunciations.example.json" \
      --fields topic,concept,keywords \
      --max-topics 1 --max-new-requests 3
  done
  echo "=== 3 VOICE PILOTS PLANNED, NO GOOGLE TTS CALLS ==="
)
```

예상: 목소리마다 `DRY RUN - NO API CALLS`, `requests: 3` 표시. 총 호출 0. 외부 TTS API 과금 가능 요청 없음.
실제 합성은 예산·무료 제공량과 토픽 데이터·약어 발음·목소리 비교 범위를 확인하고 **별도 사용자 동의** 후에만 수행.
실제 테스트용 인증 토큰, 계정 이메일, MP3 파일 등은 GitHub와 채팅에 게시하지 않음.

## 2단계 종료 조건

1. 실제 생성 전에 9회 이내 요청 문자 수와 비용 영향 산정.
2. 사용자 별도 승인 하에 세 목소리의 짧은 실제 음성을 생성, 청취하여 최종 목소리 1개 선정.
3. SQL·LSM-Tree·MCTS·Bloom Filter 등 주요 약어 발음 사전 보강.
4. 음성 생성 비용·호출 수·실행 이력을 한 번에 확인하여 중복 생성 방지.
