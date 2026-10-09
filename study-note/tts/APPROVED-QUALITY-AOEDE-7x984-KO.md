# Aoede 품질 최종 7회/984자 승인형 합성 (2026-10-09)

사용자 실제 합성 승인 범위: Aoede, T0001 개념 1개(80자/132B), T2176 기술요소 2개(346자/630B), T2354 기술요소 4개(558자/850B).
총 7개 TTS API POST, 984자, 1,612 UTF-8바이트. 실제 비용 발생 가능성 확인.
원본 5개 토픽 JSON SHA-256, 생성기와 발음 사전 Git blob 및 사전검증 프로그램 Git blob을 고정 검증.
기존 35개 및 오래된 7x939 ZIP/MP3는 보존. Google Sheets/Apps Script, GitHub main, GCS 업로드, Cloud Run 재배포 전면 금지.

## 1. Cloud Shell 무료 검증
```bash
cd "$HOME/pe-tts-dev" &&
git switch feature/ai-natural-tts-20261009 &&
git pull --ff-only &&
gcloud config set project study-note-tts &&
python3 -m unittest discover -s study-note/tts -p "test_*.py" -q &&
python3 study-note/tts/run_approved_quality_aoede_7x984.py
```
예상: 신규 11개 포함 140개 OK, PREFLIGHT PASSED, Requests: 7 | Characters: 984 | UTF-8 bytes: 1612, DRY RUN - NO API CALLS.
실제 검증 결과가 예상과 다르면 즉시 중단하고 화면을 공유할 것.

## 2. 승인받은 유료 가능 실제 합성 (검증 후 정확히 한 번)
```bash
cd "$HOME/pe-tts-dev" &&
python3 study-note/tts/run_approved_quality_aoede_7x984.py \
  --execute --accept-possible-charges --approve-exact-7x984
```

정상 종료: QUALITY AOEDE 7x984 COMPLETE, API attempts: 7, 984 chars, 1,612 bytes, MP3 files: 7.
Cloud Shell 홈의 ~/study-tts-quality-aoede-7x984 디렉터리에 개별 MP3, index.json, attempts.json, local-charge-guard.json 기록.
ZIP: ~/study-tts-quality-aoede-7x984.zip (7개 MP3만 포함).
요청 전에 상태를 영속 기록하며, 중간 실패 시 자동 재시도하지 않음. 실패하면 디렉터리/기존 파일을 절대로 삭제하거나 재실행하지 말 것.

## 3. Windows PC에 다운로드
Cloud Shell 상단 점 3개 → Download file에서 다음 절대 경로 입력:
`/home/aliasel840817/study-tts-quality-aoede-7x984.zip`
ZIP은 T0001 개념 1개, T2176 기술요소 2개, T2354 기술요소 4개 폴더로 구성.
쉼, 여섯 필드 제목 구분, 긴 기술요소의 마지막 문장 누락 여부를 청취해 확인.

비고: 로컬 guard는 Cloud 계정 전체의 비용 상한은 아니며, Google Cloud 청구 내역과는 별도.
기존 7x939용 실행기와 35개 생성용 실행기는 재실행 금지.
