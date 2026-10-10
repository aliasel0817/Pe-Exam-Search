# 5단계 — 최종 Aoede MP3 7개 + 신규 토픽명 MP3 5개 GCS 통합 준비

기준일: 2026-10-10
브랜치: `feature/ai-natural-tts-20261009`

## 현재 완료 상태
- 1차 최종 본문 음성: MP3 7개, 3개 항목, 비공개 GCS 저장 및 브라우저 인증 재생 통과.
- 2차 토픽명 안내 음성 v2: MP3 5개, 5개 토픽, 180자/292바이트 합성 완료.
- 사용자 보고: 새 안내 음성 5개 무결성 검사 통과 및 청취 이상 없음.
- 종합 목표: 기존 3개 항목 + 신규 5개 토픽명 = 8개 매니페스트 항목 / 12개 MP3.
- 기존 7개 파일 및 index.json을 절대 덮어쓰거나 삭제하지 않는다.
- 전체 7항목 완전 토픽 읽기는 아직 불가능. 새로 5개 토픽명 파일을 GCS에 추가해도 나머지 항목은 미생성 상태.

## 이번 개발 내용 — 쓰기 없는 통합 사전 점검
- `stage5_private_gcs_merge_preflight.py`
- `test_stage5_private_gcs_merge_preflight.py`
- 새 통합 사전 검증기 15/15 테스트 통과 (임시 모의 MP3와 모의 GCS 응답).
- 정확히 기존 3항목·7 MP3 및 신규 5항목·5 MP3만 허용.
- 기존 3개 항목의 매니페스트 값을 바꾸지 않고 5개 키만 추가할 수 있는지 검사.
- MP3 원본 및 ZIP, TTS API 시도 이력, 원문/발음 사전 SHA-256, GCS 바인딩, 3개 글로벌 승인 잠금(false) 확인.
- 추가 용량 상한 5MiB, 총합 16MiB.
- 충돌, 기존 7 MP3 원격/로컬 불일치, 신규 객체가 이미 존재함, GCS 권한 오류는 모두 중단.
- `--execute` 옵션 없음. GCS 업로드 기능이 없는 읽기 전용 프로그램.

## Cloud Shell — 실제 로컬 MP3 읽기 전용 감사
```bash
cd "$HOME/pe-tts-dev"
git switch feature/ai-natural-tts-20261009
git pull --ff-only
python3 study-note/tts/stage5_private_gcs_merge_preflight.py
```
정상 결과 예:
```text
STAGE5 PRIVATE GCS MERGE LOCAL PREFLIGHT PASSED
Retain 3 original fields / 7 original MP3s / 351360 bytes
Add 5 title fields / 5 new MP3s / <실제 바이트>
Combined: 8 manifest entries / 12 MP3s
DRY RUN - NO GCS REQUESTS, NO FILE WRITES, NO TTS CALLS
```

## Cloud Shell — GCS 인증 읽기 전용 비교 (로컬 PASS 후)
```bash
python3 study-note/tts/stage5_private_gcs_merge_preflight.py --check-remote
```
- 전용 `study-note-tts` 버킷의 소유권·비공개 설정과 **기존 매니페스트 값 완전 일치** 확인.
- 기존 7개 GCS 파일을 READ하고 로컬 7개 SHA-256과 일치 확인.
- 신규 토픽명 5개 경로가 이미 GCS에 존재하는지 메타데이터 READ로 확인; 존재하면 중단.
- 대상은 GCS의 GET/메타데이터 조회 15회 정도이며 소액의 요청 비용이 발생할 수 있음.
- 새 MP3 전송 없음, 합성 없음, GCS 객체 쓰기 없음, Cloud Run/운영 main/Sheets/Apps Script 변경 없음.
- 기대: `STAGE5 PRIVATE GCS MERGE REMOTE READBACK PASSED`

## 진행 금지 조건
- GCS 통합 실행 및 매니페스트 업데이트는 **사용자의 별도 명시적 승인 전 금지**.
- `upload_gcs.py`를 직접 `--execute`로 수행하지 말 것: 충돌 키 자동 덮어쓰기 위험.
- 기존 7개와 새 5개 매니페스트를 로컬에서 단순 파일 복사로 합치거나 원격 index.json을 대체하지 말 것.
- 실제 업로드 구현 시 *현재* GCS 인덱스 세대번호(Generation)를 조건으로 사용하는 원자적 CAS와 업로드 후 12개 전체 SHA-256 재확인 필요.
- Cloud Run 재배포 및 PWA 운영 반영은 모두 별도 승인.
