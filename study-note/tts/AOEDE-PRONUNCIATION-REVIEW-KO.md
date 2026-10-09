# Aoede 기본 음성 확정 및 한국어 기술 용어 발음 검토 (2026-10-09)

## 음성 선정 결과
- **기본 음성: `ko-KR-Chirp3-HD-Aoede`**. 사용자가 비교 청취한 여성 음성 Aoede·Kore·Leda·Zephyr 중 Aoede의 억양이 가장 좋다고 선정함.
- Chirp 3: HD `ko-KR`, MP3 재사용 방식. 기존 `generate_mp3.py`의 `--voice` 기본값도 Aoede이므로 생성기 코드는 변경하지 않음.
- Aoede·Kore·Leda·Zephyr 비교 파일은 Cloud Shell의 사용자 로컬 파일이며 이 저장소나 GCS 운영 버킷에 업로드하지 않음.
- **2단계 음색 선정 완료, 용어별 발음 검수는 진행 중.** 발음이 좋다는 청취 평가는 기술 약어 정확성을 보증하지 않음.

## 발음 후보 파일과 승인 절차
- `pronunciations.example.json`: 기존 예시 5개, 변경 없음.
- `pronunciations.ko-candidates.json`: 학습용 기술 용어 30개 초안. **이 사전은 발음 검수 후보이며 운영 확정본이 아님.**
- `generate_mp3.py`는 `--pronunciations`에 지정한 JSON만 사용. 원문 Google Sheets/MASTER 토픽 값은 변경하지 않고 **합성 직전 음성 입력 텍스트**에서만 치환.
- 영문 약어의 한국어 독음은 관용·분야에 따라 다른 경우가 있음. 특히 `SQL`, `NoSQL`, `JSON`, `RAG`, `API`, `WAL`, `MemTable`, `SSTable`, `B-Tree` 등은 사용자 청취 및 명칭 검수 후 확정.
- 사전은 가장 긴 구절부터 치환하고 영숫자 경계를 확인하므로 `NoSQL` 속 `SQL` 등 부분 치환을 방지한다. 이 기본 로직은 기존 코드 그대로 사용.
- 사전 변경 시 음성 입력 해시가 변경되고 해당 세그먼트의 재합성이 필요할 수 있으므로, 비용/합성 범위를 미리 산정하고 별도 승인받을 것.

## 읽기 규칙 (기존 정책 유지)
토픽명(항상 읽음) → 개념 → 등장배경 → 필요성 → 특징 → 기술요소 및 구성요소 → 키워드.
선택한 필드만 재생, 공란 건너뛰기. 암기법 및 관련 토픽은 읽지 않음.

## 무료 오프라인 점검 (Cloud Shell)
```bash
cd "$HOME/pe-tts-dev"
git switch feature/ai-natural-tts-20261009
git pull --ff-only
python3 -m unittest discover -s study-note/tts -p "test_*.py" -v
python3 study-note/tts/generate_mp3.py \
  --input study-note/tts/voice-pilot.sample.json \
  --voice ko-KR-Chirp3-HD-Aoede \
  --pronunciations study-note/tts/pronunciations.ko-candidates.json \
  --fields topic,concept,keywords --max-topics 1 --max-new-requests 3
```
위 명령에는 `--execute`가 없어 Google TTS 합성 및 MP3 생성 없음. 예상: 총 11개 테스트와 `DRY RUN - NO API CALLS`. 기존 Cloud Shell의 개인용 MP3·사용량 기록 파일은 수정하지 않음. 운영 `main`, Google Sheets, Apps Script, Cloud Run/GCS 변경 없음.

## 다음 단계
1. 사용자와 30개 후보 중 중요한 용어의 한국어 읽는 방법을 검토.
2. 실제 MASTER 데이터의 소량 예제 3~5건을 **개인 로컬 공간**에만 준비해, 글자 수/요청 수/예상 비용의 DRY RUN 수행. 공개 GitHub 업로드 금지.
3. MP3 재생과 비공개 GCS 적재는 각각 별도 비용·변경 승인을 받은 뒤 진행.
4. 생성 완료 파일의 SHA·manifest·캐시/오프라인 재생을 확인하고 PC·Galaxy Tab·iPhone 실기기 QA.
