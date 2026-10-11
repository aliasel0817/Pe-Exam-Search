# 6-4 SW 도메인 Chirp3-HD Aoede 제작 — 오프라인 원본 검증·배치 준비 체크포인트

기준일: 2026-10-11 KST. 음성 모델 **`ko-KR-Chirp3-HD-Aoede` 고정**. 다른 음성 모델은 사용하지 않음.

## 1. 운영 보호와 범위

- 운영 PWA `main` 보호 기준: `2a44bc58ecc4285d2348146fbc1c7dbc447d89b3`.
- 개발·계획 브랜치: `feature/tts-sw-aoede-20261011` (운영에 머지하지 않음).
- 운영 Google Sheets `topic_study_data / 암기장`의 SW 708행(행 번호 433~1140)을 **읽기만** 수행.
- SW 학습대상 **Y 698개**, 제외 **N 10개**, 기타 도메인 **0개**. N 행 원본 변경/삭제 없음.
- 원본 범위의 정규화 JSON SHA-256: `d27ee06cf701559f6cf11aebe1bc5cc4bc6cbbc37d20214541e4db83a980b373`.
- Google Sheets 조회는 여러 개의 독립된 범위 조회여서 트랜잭션 스냅샷이 아니다. **실제 합성 전 최신 원문 SHA 재검증 필수**.
- 과거 GCS 기존 **12개 MP3**, 매니페스트 **8항목** 보존. 신규 원문을 기존 MP3로 임의 대체 금지.
- Apps Script, 신뢰기기 인증, PDF/필기/검색/관리, PWA 운영 `main`, Cloud Run/GCS 설정 변경 없음.

## 2. 실제 LIVE 암기장으로 확정한 제작량

| 항목 | 값 |
|---|---:|
| SW 학습대상 토픽 | **698** |
| 토픽당 7개 음성 항목 | **4,886** |
| 합성용 Aoede MP3 분할 파일 / API 호출 | **6,537** |
| 발음·쉼표·구분 라벨·토픽명 소개 문구 포함 입력 | **842,836자** |
| UTF-8 입력 | **1,414,191바이트** |
| 배치 크기 | **10개 토픽**, 총 **70배치** |
| 배치당 최대 분할 API 호출 | **124건** |
| 배치당 최대 입력 바이트 | **25,763바이트** |
| 필수 7개 음성 항목 누락 / 중복 경로 | **0건** |

반드시 정확한 음성 변환 규칙 `stage6_bulk_volume_preflight.planned_parts()`를 사용.
특히 **토픽명은 `topic_intro_v2.topic_intro_text()`의 "에 대한 설명" 소개 문구가 포함**되므로 기존 `generate_mp3.plan()`을 그대로 호출해 토픽명 MP3를 만들면 원문·speech SHA 또는 예상 파일명이 달라질 수 있다.

## 3. 1차 시험 합성 배치 (아직 실제 음성 합성 미실행)

- 토픽 ID 정확히 10개: `T0626, T0665, T0666, T0667, T0677, T0678, T0692, T0693, T0694, T0733`.
- 필드 70개, **API 합성 93회**, **12,973자**, UTF-8 **20,791바이트**.
- 이번 달 무료 문자량이 충분히 남았다면 TTS 합성 과금 0원 가능.
- 무료량을 보수적으로 **0자**로 가정하더라도 1차 시험 합성 금액은 **US$0.38919**. 계획용 보수 환율 1USD=1,500원, VAT 10% 적용 시 **약 642원**. 실제 Google 청구는 환율 및 과금 집계에 따라 달라짐.
- 전체 SW를 무료구간 없이 모두 제작할 경우 **US$25.28508**, 같은 보수 환율·VAT 가정 시 **약 41,720원**으로 사용자 월 1만 원 미만 의도에 부합하지 않음.
- 공식 기준: Chirp 3 HD 월 무료 최대 100만 자, 초과 시 미화 100만 자당 30달러. 출처: https://cloud.google.com/text-to-speech/pricing.

## 4. 오프라인 산출물과 재실행 방법

공개 저장소에는 **코드 및 통계 문서만** 보관. 실제 원문/MP3 파일 경로/필드 해시는 인가된 Windows PC의 **저장소 바깥** 경로에만 보관.

- 분석 원본 PC 경로: `D:\itpe_pwa_test\stage64_sw_private\sw_live_708_rows_private.json`.
- 승인된 제작 원문만: `D:\itpe_pwa_test\stage64_sw_private\prepared\sw_topics_private.json`.
- 미생성 MP3 4,886개 필드의 SHA·예상 경로: `...\prepared\sw_expected_mp3_private.json`.
- 70개 배치 정확한 목록: `...\prepared\sw_batches_private.json`.
- 비공개 문장을 포함하지 않는 통계: `...\prepared\sw_summary_safe.json`.

읽기 전용 / 원문 신규 파일 미생성 명령:
`python study-note/tts/stage6_sw_offline_prep.py --source [private SW JSON]`.

별도 로컬 폴더에 계획 파일을 **덮어쓰지 않고** 만들 때만 `--write-private [NON-GIT DIRECTORY]`를 명시. 기존 파일이 있으면 실패하며, 생성기에는 유료 합성 또는 GCS 업로드 기능이 **아예 없음**.

검증: SW 전용 **19개**, 기존 Stage6 수량 계획 **15개** → **34/34 통과**. 운영·개발 JS 회귀 **126/126 통과**. 정상 개발 브랜치에서도 PWA/Apps Script/GCS 설정 변경 없음.

## 5. 유료 합성 실행 전 필수 조건 — 진행 차단 지점

1. 실제 `study-note-tts`의 **당월 Chirp3-HD 합성 무료 잔량 / 청구·사용량**을 Google Cloud Billing에서 확인. 무료 한도는 월간 합산이고, 청구 데이터는 지연될 수 있음.
2. 실제 수행 환경에 **인증된 Google Cloud CLI/액세스 토큰이 없음**. 현재 Windows 원격 PC에는 `gcloud`, `GOOGLE_OAUTH_ACCESS_TOKEN`, `GOOGLE_APPLICATION_CREDENTIALS` 없음. 인증 없는 우회 사용 금지.
3. 실행기는 과거 5개 토픽 전용 코드와 구별해 신규 `SW`-전용 범위 검사, **1회 호출당 예약 기록, 중복 실행 차단, 반복 호출 금지, 안전 예산 한도**를 갖춰야 함. 기존 50,000바이트/월 합성 차단 장치를 검증 없이 제거하면 안 됨.
4. 원문 SHA·목소리·필드·분할 수를 검증한 승인된 SW 배치만 합성. 첫 배치 최대 **93번의 유료 가능 POST**; 유료가 아니라는 가정하에 호출하지 말 것. 장시간 또는 전체 배치 자동 실행 금지.
5. MP3 생성 후 **로컬 MP3 바이트/ID3·오디오 손상/해시/개수 검사**를 통과해야 함. 파일 전체를 한번에 GCS에 전송하기 전에 기존 매니페스트 및 객체 목록을 읽기 전용 비교.
6. 업로드 시 새 객체만 추가하고 기존 12개 MP3 덮어쓰기·삭제 금지. 실제 객체 검증 후 마지막에 새로운 매니페스트로 원자적 갱신.
7. 새로운 음성 업로드 후에도 Windows PC/Galaxy Tab/iPhone 재생 QA와 기존 기능 회귀 검사. 문제가 있으면 `main` PWA는 유지하고 새 인덱스 적용을 중단.

**현재 완료: 698개 SW 전수 원문·SHA·분할 수·배치 목록 준비. 아직 유료 합성 0건, MP3 생성 0건, GCS 업로드 0건, 지출 발생 작업 0건.** Cloud 사용량 및 실행자 인증 확인이 완료되면 1차 10토픽 파일 생성부터 진행.

## 6. 1차 10개 토픽용 실제 Aoede 음성 생성기 개발 완료 (실행 보류)

- `stage6_sw_pilot_v1.py`: **기본 DRY RUN**이며 음성을 생성하거나 Google Cloud를 호출하지 않음.
- 실사용 파일 `sw_topics_private.json`과 `sw_expected_mp3_private.json`, 검증된 사전 및 원문 SHA를 **모두 고정 확인**.
- 토픽 `10`개 / 필드 `70`개 / 유료 가능 POST 최대 **93회**, **12,973자 / 20,791바이트**만 허용.
- 유료 실행에는 별도 `--execute --accept-possible-charges` 및 **정확한 호출 수, 문자 수, 바이트 수, 최대 1,000원**을 명시해야 하며, 값이 하나라도 다르면 차단.
- 보수적인 계산은 **US$0.00003/자 × 가정 환율 2,000원/US$ × VAT 1.10**, 따라서 1차 시험 TTS 비용 최악 가정은 **약 856.22원**, 무료량이 남아 있으면 0원 가능. **이 금액은 다른 Cloud 비용과 실제 적용 환율을 보증하지 않음.**
- 프로젝트 식별 `study-note-tts` 확인 후에만 비공개 출력 폴더 생성; 인증이 없으면 결과를 남기지 않고 중단.
- 각 POST **전에** 시도 이력을 영구 기록. 실패한 호출은 자동 재시도하지 않으며, 불완전 폴더 재실행/덮어쓰기 차단.
- **50,000 UTF-8바이트 월별 기존 보수 제한 유지**. 1차 시험 20,791바이트는 한도 안.
- 결과는 로컬 비공개 MP3 및 **배치 단독 index.json**만 작성. Cloud Run/GCS 업로드, 운영 PWA 수정, 기존 인덱스 변경 없음.
- 오프라인 보호 시험 `test_stage6_sw_pilot_v1.py` **15/15 PASS**; 이전 계획 검증 **34/34 PASS**.
- 실제 SW 698개 원문으로 생성기 DRY RUN **93/93 음성 세그먼트 계획 일치**, 유료 API 호출 **0**.
- Windows 원격 PC에는 현재 Cloud SDK와 유료 TTS 호출용 인증이 없으므로 **실제 합성 MP3는 아직 생성하지 않음**.

**다음 실행 관문:** 사용자가 Google Cloud Console에서 이번 달 실제 사용량과 청구액을 확인하고, 별도 인증된 합성 실행 환경을 준비할 때까지 1차 10개 토픽의 **유료 가능 API POST는 실행하지 않는다**.

## 7. 최종 GitHub·로컬 전달 패키지 검증

- 별도 공개 GitHub 개발 브랜치 전체 변경은 **통계 문서 1개 + 생성/검증 Python 코드 4개 = 정확히 5개 파일 추가**. LIVE `main` 0개 수정.
- 새로 clone한 GitHub 원본 그대로 새 SW 계획/합성기 Python 전체 시험 **49/49 PASS**, 기존 PWA JavaScript 회귀 **126/126 PASS**, 실제 698개 입력으로 1차 시험 합성기 DRY RUN **93회·12,973자·20,791바이트** 정확히 일치.
- 최종 로컬 ZIP: `D:\itpe_pwa_test\stage64_sw_private\SW_AOEDE_BATCH001_LOCAL_ONLY_20261011.zip`
- ZIP 크기 **929,235바이트**, SHA-256 `52cd0a2d99801bf3018a35013a75255ab166e261e77f1264337b5fdf2f6193a7`.
- ZIP에 코드/발음 사전/비공개 SW 원문·계획만 11개 파일, MP3·계정 인증 토큰·비밀번호 0개. 무결성(압축 CRC) 통과.
- **매우 중요:** ZIP은 원본 학습 문장을 포함하므로 공개 GitHub, GitHub Pages 또는 공개 Drive에 업로드하지 않는다. Cloud Shell에 사용자 본인이 업로드하는 경우 해당 Google 계정의 비공개 홈 디렉터리에서만 사용.
- 임시 6개 범위 추출 JSON을 정리했고, 원본 통합 SW JSON과 사전 검증·배치 자료는 PC 비공개 작업 폴더에 그대로 보존.
- 실제 음성 합성에 필요한 인증된 Google Cloud SDK/Cloud Shell 계정은 현재 연결된 Windows Remote Desktop Commander 환경에 **없음**. 정상 인증을 확보하기 전에는 우회하지 않는다.

**현재 상황: SW 음성 합성 원문/계획과 1차 시험 실행 패키지 준비 완료; 실제 MP3 생성 0개, 실제 TTS API 호출 0건, GCS 추가 업로드 0개, 운영 데이터 변경 0건.**

## 8. SW 1차 93개 MP3 전용 GCS 추가 업로더·Cloud Shell 패키지 준비

- 새 `stage6_sw_batch001_gcs_append.py` 및 `test_stage6_sw_batch001_gcs_append.py` 개발.
- **기본 DRY RUN**: 로컬 MP3를 검증할 뿐, GCS/Cloud Run/TTS API 호출 없음.
- `--check-remote`: **GCS 읽기 전용**으로 기존 비공개 버킷 설정, 기존 8개 매니페스트 항목/12개 MP3의 세대번호·크기·CRC32C, 신규 93개 MP3 객체의 미등록 여부 확인. **소액 GCS 읽기 작업 요금 가능**.
- 실제 파일 등록 `--execute`는 별도의 원격 인덱스 Generation, 정확한 **93개 MP3 실제 바이트**, 특정 감사 파일, 비용 승인 플래그가 모두 일치할 때만 시도. 시작 전에 GCS 기존 인덱스 및 12개 MP3 정보 재확인.
- 신규 MP3 각각 `--if-generation-match=0` 조건부 PUT, 즉시 원격 SHA-256 읽기 비교. **기존 객체 덮어쓰기·삭제 없음**.
- 모든 93개가 확인된 뒤 기존 GCS `index.json` Generation 조건부 CAS로 **기존 8항목을 그대로 유지하면서 SW 70항목만 추가**. 예상 합산 **78항목 / 105 MP3**.
- 업로드 중 장애: 불변 1회 실행 이력 남기고 안전 중단, 자동 재시도·재생성·오래된 인덱스 강제 반영 없음.
- 실제 GCS 쓰기를 수행하지 않은 **모의 업로드 24개 테스트 PASS**. SW Python 관련 총 **73/73 PASS**, 기존 Node JavaScript **126/126 PASS**.
- 별도 원격 PC `D:\itpe_pwa_test\stage64_sw_private\SW_AOEDE_BATCH001_CLOUD_SHELL_READY_20261011.zip` 생성 및 압축 CRC 확인 완료.
- ZIP 크기 **957,486바이트**, SHA-256 **`6e94c2a8ff093fd223c91b2bd9c1bb3e37ba8ddd8e45d693165d36ad881fbda8`**, 비공개 ZIP 엔트리 18개.
- 기존 배포 ZIP과 달리 `study-note/tts/` 원래 위치 구조를 유지하여 Cloud Shell에서 Python 출력 경로·개인 데이터 보호 판단이 올바르게 작동하도록 개선.
- 비공개 ZIP **압축 해제 후 재검증**: 첫 10토픽, 70필드, 93 합성 API 계획, 12,973자 / 20,791바이트, TTS 호출·GCS 호출 0.
- ZIP은 **698개 SW 토픽 원문을 포함**하므로 공개 GitHub에 절대 등록하지 않는다. Google Cloud Shell 사용자 개인 홈으로만 업로드.
- **Cloud Cloud Shell/유료 호출 현실 상태:** 연결된 원격 PC에는 `gcloud` 인증 환경이 없음. 당월 실제 청구·무료 잔여 문자도 직접 조회하지 못했으므로 **실제 MP3 신규 생성 0, GCS 신규 업로드 0**.
- 사용자 월 1만원 미만 허용 기준: 1차 10토픽 합성 **잔여 무료 문자 0 기준 보수 예상 약 856원(가정 환율 2000원/USD+VAT 10%)**. 코드 상한도 1,000원. 단 이는 모델 요금 추정·사전 제한이지 Cloud Billing의 하드 결제 상한 기능은 아님.
- 단계별 사용자 실행 안내와 안전 원칙은 ZIP의 `README_PRIVATE.txt` 참조. 가장 먼저 **DRY RUN**과 프로젝트/월별 Cloud Billing 확인. 신규 MP3 없이는 GCS 업로드 검증기 --execute 불가.

**이관 체크포인트:** 6-4 SW 698개 전체 오프라인 계획 완료, 1차 10토픽 음성 생성기 및 93개 파일 GCS 안전 추가 업로더 구현·자동 검증 완료. 실클라우드 사용량 확인/인증 및 10개 Aoede MP3 생성부터 재개. `main`, Google Sheets, Apps Script, Cloud Run, 기존 MP3 12개는 변경하지 않음.

## 9. 2026-10-11 Cloud Shell 합성 93개 완료 및 GCS CRC32C 필드명 핫픽스

### 사용자 실실행 결과(캡처 확인)

- Cloud Shell에서 1차 SW 10토픽 `stage6_sw_pilot_v1.py --execute` **93/93 MP3 합성 완료**. 출력: `PILOT AUDIO COMPLETE; files on local PC only.` 여기서 실제 위치는 Windows PC가 아닌 **Cloud Shell 개인 홈**.
- Cloud Shell 비공개 MP3 위치: `$HOME/sw-aoede-batch001-private`. **절대 합성 명령 재실행 금지**; 시도 원장·MP3 보존.
- 로컬 GCS 업로드 사전검증 통과: **93개 / 4,571,520바이트 / 새 매니페스트 70항목**, 기존 원격 MP3 12개 유지.
- `--check-remote`는 **기존 T0001 concept 메타데이터 파싱에서 안전 중단**. 실제 GCS 업로드 명령은 실행하지 않았음. 신규 원격 MP3 등록 0개.

### 중단 원인 및 수정

- `gcloud storage objects describe --format=json`은 기본 출력에서 CRC32C 키가 **`crc32c_hash`**. 기존 `stage6_sw_batch001_gcs_append.py`가 `crc32c`만 조회하는 실수였음.
- 최신 수정 파일은 `crc32c_hash`와 원본 JSON API `crc32c`를 모두 지원하되 두 값 불일치·CRC32C 형식 오류면 중단. 인증·기존 SHA·generation 보호는 변경 없음.
- 코드 핫픽스 GitHub 커밋 `113a0bd6132cf3b26a5694ad5b7b8abf8ec92719`, `stage6_sw_batch001_gcs_append.py` blob `77be9b843e908d3c00b08d16c18fdd9ed4141e06`.
- Remote Desktop Commander 독립 파일 테스트: **SW Python 78/78, JavaScript 126/126 통과**. 공개 GitHub raw 파일 HTTP 200 및 `git hash-object` 해시 `77be9b...` 확인.
- 원래 ZIP에 들어간 코드는 구버전이므로 Cloud Shell에서는 **해당 Python 프로그램 1개만 핀 고정 코드로 교체**하고 기존 비공개 원문, 기존 합성 MP3 93개, 작업 원장은 보존.
- Cloud Shell에서 진단 재실행은 `--check-remote` 읽기 전용만. **실제 GCS --execute는 원격 검증 전체 통과 후 따로 진행**.
- 운영 `main`, Apps Script, Google Sheets, Cloud Run, 기존 12 MP3 변경 없음.

### 이관 체크포인트

**SW 698개 전체 오프라인 계획 / 1차 10토픽 93개 MP3 실제 생성 완료 / 로컬 93개 4,571,520바이트 검증 PASS / GCS 원격 검증은 필드명 패치 적용 대기 / 실 GCS 업로드 미실행.**

## 10. 2026-10-11 02:06 KST — SW 1차 10토픽 실제 GCS 추가 등록 완료 (사용자 Cloud Shell 화면 확인)

- 인증된 사용자 Cloud Shell에서 `stage6_sw_batch001_gcs_append.py --execute` 실행 후 출력: **`Verified 93/93 NEW SW MP3s`**, **`SW 10-TOPIC GCS APPEND VERIFIED: 8 original+70 new fields; 12+93 MP3s`**.
- 프로그램의 최종 검증 출력 근거로 GCS 기존 MP3 **12개 변경 없이 유지**, SW 신규 MP3 **93개 추가**, 매니페스트 **8→78개 항목**, GCS MP3 **12→105개**.
- 새 MP3 총 크기 **4,571,520바이트** (약 4.36 MiB). 첫 10토픽 원문·SHA 기반 Aoede MP3; 유료 합성은 1차 생성 시 완료, 이 단계에서는 **추가 TTS 합성 0**.
- 최종 매니페스트 등록 직전 보호 기준 GCS generation **`1791611070285551`**이며 조건부 갱신 성공 확인. **업로드/합성 명령 절대 재실행하지 않음**.
- 최종 성공 출력은 Cloud Shell 연결 끊김 배너와 별도로 실제 명령 완료 + 입력 프롬프트까지 확인됨. 연결 복구 시 쓰기 명령이 아닌 읽기 전용 점검만 수행.
- 기존 Cloud Run 인증 체계·서비스 재배포 없음. 기존 학습노트 HTML/JS 수정 및 Google Sheets·Apps Script 쓰기 없음.
- 독립 Windows PC에서 운영 PWA 및 자연음성 JS **HTTP 200**, 인증 토큰 없는 게이트웨이 `GET /v1/manifest` **HTTP 401**, 인증 우회 없음.
- 운영 `natural-tts.js`는 **브라우저 탭 메모리에 `cacheIndex`를 보관**하므로 새 SW MP3 확인 시 운영 PWA **새로고침 후 Google 음성 로그인** 필요. Cloud Run 자체 매니페스트 캐시는 최대 30초.
- **남은 검증:** 사용자 인가 계정으로 운영 PWA의 새 SW 토픽 1개 및 연속읽기 10토픽 실제 재생, Windows PC / Galaxy Tab / iPhone 실기기 QA, 새 MP3 93개 Cloud Shell 홈→Windows PC 백업, Google Billing 지출 확인. 사용자 3기기 정상 확인을 받기 전 6-4 1차 실기기 QA 완료 판정 금지.
- 남은 SW 688토픽은 아직 MP3 생성되지 않았으므로 자동으로 합성 또는 업로드하지 않는다.
- **실제 비용 미확정**: 무료 시험판 크레딧 잔여는 이전 스크린샷에 있었으나 이번 GCS 업로드 이후 최종 청구액은 확인하지 않았으므로 0원으로 단정하지 않는다.

**현재 체크포인트:** 첫 SW 10토픽 Aoede 93 MP3 실제 합성·GCS 추가 등록·인덱스 게시 및 무결성 검증 완료. 실기기 재생 QA 및 로컬 백업 단계로 진행.
