# Aoede 품질 보정 검증 — 정확히 7회 승인 (2026-10-09)

사용자 승인: Aoede, 실제 암기장 5건 중 T0001 개념(1구간·65자), T2176 기술요소(2구간·331자), T2354 기술요소(4구간·543자). **합계 최대 7회 TTS POST 및 939자.** 비용 발생 가능성 승인. 기존 35개 샘플 생성 승인을 새 범위로 확장하지 않음.

금지: 새 토픽/음성 생성, 기존 MP3/ZIP 변경, 개인 데이터 GitHub 커밋, GCS 업로드, Cloud Run 재배포, Apps Script/Sheets 변경, 운영 main 수정.

## 1. Cloud Shell 갱신 및 무료 검증

```bash
cd "$HOME/pe-tts-dev" &&
git switch feature/ai-natural-tts-20261009 &&
git pull --ff-only &&
gcloud config set project study-note-tts &&
python3 -m unittest discover -s study-note/tts -p "test_*.py" -q &&
python3 study-note/tts/run_approved_quality_aoede_7.py
```

테스트 OK, `PREFLIGHT PASSED`, `Requests: 7 | Characters: 939`, `DRY RUN - NO API CALLS`까지 확인. 입력 UTF-8 바이트 수는 실행 전 표시하며 상한 3,756바이트를 넘으면 차단.

## 2. 실제 합성 (무료 검증을 통과한 경우에만, 정확히 한 번)

```bash
cd "$HOME/pe-tts-dev" &&
python3 study-note/tts/run_approved_quality_aoede_7.py \
  --execute --accept-possible-charges --approve-exact-7x939
```

기존 `run_approved_stage3_aoede.py` 재실행 금지. 실패해도 새로운 실행기를 재실행하지 말 것. 원본 JSON 및 생성기/발음 사전 해시, 활성 프로젝트, 권한 잠금, 7회·939자 상한을 모두 검증한 후에만 TTS API를 실행함. 각 POST 직전에 `attempts.json`에 기록; 실패하면 자동 재시도하지 않음.

성공 시 Cloud Shell 로컬:
- `~/study-tts-quality-aoede-7/`: MP3 7개, `index.json`, `attempts.json`, 비용 방어용 로컬 원장
- `~/study-tts-quality-aoede-7.zip`: 듣기 편한 토픽 폴더로 분리된 MP3 7개만 포함
- 기존 `~/study-tts-stage3-aoede-5.zip`와 이전 폴더 유지

## 3. Windows PC 다운로드

Cloud Shell 상단 점 3개 → 파일 다운로드 → 아래 경로 입력:

```text
/home/aliasel840817/study-tts-quality-aoede-7.zip
```

다운로드 후 T0001(개념), T2176(기술요소 2파일), T2354(기술요소 4파일)을 재생하여 쉼과 마지막 문장까지 읽는지 청취 확인.

상한 검증과 요청 이력만으로 실제 청구액을 확정할 수 없음. 오프라인 자동 테스트는 API를 호출하지 않음.
