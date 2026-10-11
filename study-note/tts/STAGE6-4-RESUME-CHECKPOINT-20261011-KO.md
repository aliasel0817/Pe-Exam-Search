# Stage 6-4 Aoede 음성 제작 — 긴급 UI 수정 후 재개 체크포인트 (2026-10-11)

## 변경·중단 경계
- 기존 음성 제작 일시 중지 해제 요청을 받음. **기존 MP3 재합성/재업로드는 실행하지 않음**.
- Voice: `ko-KR-Chirp3-HD-Aoede` 고정. 도메인 SW만 진행. 다른 목소리/서비스 사용 금지.
- Google Cloud 프로젝트: `study-note-tts`.
- 마지막 TTS 브랜치 기준: `a2e461bfa5c836ba1c0d613e37404f36974b747d` (이 문서 작성 전).
- 운영 PWA 최신 main: `dcb25c59f87098366dcc74eb5a182065254fc2bc` (긴급 PDF/가독성 수정 포함).
- TTS 브랜치는 운영 main과 분기되어 있음. **자동 병합/강제 덮어쓰기 금지**.

## 재개 시 읽기 전용 재검증
1. Google Sheets `topic_study_data` / `암기장`, **A433:Z1140** (708행)을 읽기 전용 조회.
2. SW `Y=698`, `N=10`; 전체 708행의 10필드 정규화 JSON SHA-256은
   `d27ee06cf701559f6cf11aebe1bc5cc4bc6cbbc37d20214541e4db83a980b373`.
3. 해당 SHA가 Windows 비공개 원문 `D:\itpe_pwa_test\stage64_sw_private\sw_live_708_rows_private.json` 및 과거 6-4 문서의 체크포인트와 **정확히 일치**.
4. 개발 브랜치를 별도 임시 폴더에 clone하여 `stage6_sw_offline_prep.py --source <기존 비공개 SW JSON>` **기본 DRY RUN** 실행 PASS: 70배치, 4,886개 필드, 6,537개 MP3 분할, 842,836자/1,414,191 UTF-8 바이트.
5. SW Stage6 전용 Python 모의 테스트 **78/78 PASS** 및 자연음성 플레이어 `node --test test_player.cjs` **57/57 PASS**.
6. 주의: **전체 레거시 Python 테스트 318개 중 실패 20/오류 35**. 기존 핀 고정 해시, Windows에서 Unix/bash 전제 스크립트 등 과거 테스트 이슈가 있으므로 전체 테스트 초록색이라고 주장하지 않음. 운영/브랜치 병합 전 별도 진단 필요.
7. 현 Windows Remote Desktop Commander PC는 `gcloud`, `gsutil`, 인증 액세스 토큰 **없음**. Cloud Shell은 직접 연결되지 않아 실제 GCS·Cloud Billing 새 조회, MP3 제작/업로드는 이번 재개 점검에서 수행하지 않음.

## 완료된 Batch 001 — 이전 확인 체크포인트를 보존
- 첫 10토픽: `T0626,T0665,T0666,T0667,T0677,T0678,T0692,T0693,T0694,T0733`.
- 실제 Cloud Shell에서 MP3 **93개 합성·GCS 추가 업로드 및 매니페스트 게시 성공**(이전 사용자 실행 확인).
- 종전 GCS: 기존 MP3 12 + 신규 93 = **105개**, 매니페스트 8 + 신규 70 = **78개**. **이번 턴의 원격 GCS 재확인 수치가 아님**.
- Cloud Shell 개인 백업 원본 폴더: `$HOME/sw-aoede-batch001-private`. 이미 끝난 생성/업로드 명령 재실행하지 않음.

## Batch 002 — 오프라인 계획만 검증, 아직 음성 미제작
- 다음 10토픽: `T0771,T0772,T0774,T0779,T0805,T0806,T0835,T0852,T0861,T0866`.
- **70개 필드, API 88회/MP3 88개, 11,135자, UTF-8 18,445바이트**.
- 비공개 원문에 대한 70개 필드의 SHA 존재/길이, 음성 `ko-KR-Chirp3-HD-Aoede`, 88개 파일 경로 중복 0, Batch 001과 경로 교집합 0 검증 PASS.
- 무료 문자 잔량을 0으로 가정한 합성 문자비 약 **US$0.33405**. 계획용 환율 1USD=2,000KRW·VAT 10% 가정 시 약 **734.91원**(실제 결제 보증 아님, GCS/Cloud Run 별도).
- 기존 첫 10개용 합성기/업로더에는 범위가 고정돼 있으므로 **Batch 001의 실행 인자/명령 재사용 금지**. 2차부터는 별도 범위·총 월간 예산 관리·기존 인덱스 78항목 보존을 갖춘 도구와 검증 절차 필요.
- 이번 재개 점검에서 **TTS API 호출 0, MP3 합성 0, GCS 쓰기 0, Cloud Run 재배포 0, LIVE Sheets 수정 0**.

## 다음 관문
1. 인증된 PWA Windows PC / Galaxy Tab / iPhone에서 **Batch 001 실제 재생 품질 및 연속 읽기 QA** 결과 확인. 이전 UI 3기기 확인은 음성 재생 QA를 대체하지 않음.
2. Google Cloud Console의 당월 TTS 사용량/청구액 및 Cloud Run/GCS 기타 비용 확인.
3. Cloud Shell 개인 홈의 1차 MP3 93개를 안전하게 Windows PC 비공개 저장소로 백업·SHA 비교(덮어쓰기 금지).
4. 원격 GCS 78개 매니페스트 항목·105개 오브젝트 및 SHA 확인(읽기 전용), Cloud Run 인증 우회 여부 점검.
5. QA 후 Batch 002의 전용 생성기/업로더 추가 검증 → 정확히 승인된 10토픽만 합성/업로드. 반복/자동 재시도 금지.

## 반드시 유지
- 운영 main v4.6.5의 PDF/가독성 수정과 기존 TTS 재생기 보존. 이전 MP3를 재생성·덮어쓰기하지 않음.
- 비공개 698개 원문, SHA/MP3, Cloud Shell ZIP, 인증정보를 공개 저장소에 올리지 않음.
- 새 실행은 사용자 인증된 Cloud Shell에서만, 정확한 소요량과 현재 청구 확인 후 안전 체크포인트로 진행.
