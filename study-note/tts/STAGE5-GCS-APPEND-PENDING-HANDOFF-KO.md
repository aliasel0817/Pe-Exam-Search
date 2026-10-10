# 학습노트 AI TTS — 신규 토픽명 5개 + 기존 본문 7개 GCS 통합 인계

기준일: 2026-10-10
개발 브랜치: `feature/ai-natural-tts-20261009`

## 사용자 완료 확인
- 최종 본문 Aoede 7개 MP3, 3개 항목: 기존 비공개 GCS 업로드 완료, 인증 브라우저 재생 성공
- 토픽명 ‘[토픽명]에 대한 설명’ v2 Aoede 5개: Cloud Shell에서 5회 / 180자 / 292바이트 합성 완료
- 사용자 보고: 신규 MP3 및 ZIP 무결성 검증 통과, 5개 청취 이상 없음
- 기존 소스와 JSON, 35개 초기 MP3, 7개 고품질 MP3, ZIP 및 모든 GCS 객체는 보존

## 지금까지 개발 브랜치에 추가한 기능
- `stage5_private_gcs_merge_preflight.py`: 기존 3개 필드/7개 MP3 + 신규 5개 토픽명/5개 MP3를 읽기 전용으로 전수 검사
- `stage5_five_title_gcs_upload.py`: 별도 승인 후에만 실행할, 새 토픽명 5개 전용 비공개 GCS 업로드기. **현재 업로드 승인 없음.**
- `stage5_browser_audio_pilot.js`: 기존 3개 본문 필드 + 신규 5개 토픽명 필드의 8개 매니페스트 항목/12개 MP3를 인증 읽기하는 독립 재생 화면
- `stage5_browser_audio_pilot.html`: SRI 해시로 JS를 고정한 개발 브랜치 전용 페이지. **운영 main에 미반영**

## 자동 검증 완료
- 7+5 병합 검증 테스트 15/15 통과
- 5개 MP3 업로드 보호 테스트 16/16 통과 (모의 GCS만 사용)
- 이전 5개 토픽명 MP3 무결성 + 합성 실행기와 묶은 Python 회귀 **59/59 통과**
- 브라우저 12-MP3 보안·필드 검증 Node 테스트 **10/10 통과**
- 실제 Cloud Shell / GCS read-only 통합 감사는 **아직 사용자 측 실행 결과 미확인**
- 모든 테스트는 사용자 실데이터나 실제 GCS 쓰기/유료 API 호출 없이 수행

## GCS 업로드기의 보호 메커니즘
1. 정확히 신규 5 MP3만 허용 (신규 5개 파일 크기도 정확히 일치해야 함)
2. 원래 3개/7개 로컬 원본과 GCS 원본의 매니페스트 및 SHA-256 일치 검증
3. 신규 5개 파일이 GCS에 없음을 메타데이터로 확인
4. 실제 승인된 실행 시만 새 파일 PUT 5회, 각각 `--if-generation-match=0`로 기존 객체 덮어쓰기 원천 차단
5. 각 파일 PUT 후 GCS 재조회 및 SHA-256 비교
6. 새 5개가 모두 확인된 이후에만 `index.json`을 기존 정확한 GCS Generation 값에 대해 CAS 갱신
7. 업로드 후 8개 항목/12개 MP3 원격 SHA-256 전수 비교
8. 재실행 방지 `~/study-tts-stage5-five-title-gcs-upload-attempts.jsonl` 원장 생성
9. 중간 실패 시 STOP, 삭제·재업로드·재합성 자동 복구 금지
10. Google Sheets, Apps Script, Cloud Run, 운영 main은 절대 변경하지 않음

Google Cloud 공식 문서:
https://docs.cloud.google.com/sdk/gcloud/reference/storage/cp
https://docs.cloud.google.com/storage/docs/request-preconditions

## 현재 다음 액션 — Cloud Shell에서 세 단계 모두 READ ONLY

```bash
cd "$HOME/pe-tts-dev"
git switch feature/ai-natural-tts-20261009
git pull --ff-only
python3 study-note/tts/stage5_private_gcs_merge_preflight.py
python3 study-note/tts/stage5_private_gcs_merge_preflight.py --check-remote
python3 study-note/tts/stage5_five_title_gcs_upload.py
```

첫 검증:
`STAGE5 PRIVATE GCS MERGE LOCAL PREFLIGHT PASSED`

두 번째(소액 GCS 읽기 요청 발생 가능):
`STAGE5 PRIVATE GCS MERGE REMOTE READBACK PASSED`

세 번째:
`STAGE5 PRIVATE FIVE TITLE GCS APPEND PREFLIGHT PASSED`
`Exact newly generated MP3 bytes: <실제 수치>`
`DRY RUN - NO GCS REQUESTS, NO UPLOAD, NO FILE WRITES`

두 번째 출력의 `Checked existing manifest generation: <숫자>`도 기록.
**이 명령들은 업로드하지 않으며, --execute 옵션을 사용하지 않는다.**

## 업로드 승인 절차
- 세 read-only 감사가 성공하면 신규 MP3 5개 정확한 바이트·기존 원본 세대번호·호출/비용 가능성 명시
- 사용자에게 **5개 신규 MP3와 8개 항목짜리 매니페스트 갱신**만 따로 명시적 승인받을 것
- 승인 전까지 `stage5_five_title_gcs_upload.py --execute` 명령 안내 금지
- 설정의 `ttsGenerationApproved=false`, `gcsUploadApproved=false`, `cloudRunRevisionUpdateUserApproved=false` 그대로 유지
- 업로드 후 서비스의 기존 매니페스트 캐시 TTL 약 30초가 지나면 신규 목록 반영 가능
- 기존 운영 공개 `stage4_browser_audio_pilot.html`은 **3개 항목만 허용**하여 8개 매니페스트로 바뀌면 실패할 수 있음. 개발용 신규 12개 재생 시험 HTML만 별도 승인 후 main에 파일 하나만 올리는 방법을 검토
- 신규 독립 페이지는 아직 GitHub Pages에 게시되지 않았으며 실제 브라우저 테스트 미실행
- 실데이터 약 3,800개 전체 음성 합성 및 완전 토픽 읽기/연속 재생은 여전히 후속 단계, 무단 합성 금지
