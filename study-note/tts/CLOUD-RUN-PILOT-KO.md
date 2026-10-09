# 학습노트 TTS — 배포 서버 인증 보호·CORS 실검증 통과 (2026-10-09)

사용자 Cloud Shell 결과:
- `SERVICE_URL=https://study-tts-audio-gateway-hgli3gua6q-uc.a.run.app` (사용자 화면에 나타난 실제 `status.url`, Google Cloud는 추가 URL 표시 가능)
- `UNAUTH_MANIFEST_HTTP=401` — 로그인 없는 MP3 목록 요청이 앱 수준에서 거부됨
- `APP_AUTH_GATE=OK` — 앱 JSON 응답으로 확인 (Cloud Run 자체 에러와 구분)
- `GITHUB_PAGES_CORS=OK` — `https://aliasel0817.github.io` Origin 허용
- `CORS_PREFLIGHT_HTTP=204` — 브라우저 OPTIONS 사전 요청 정상
- `EXISTING CLOUD RUN SECURITY CHECK COMPLETE` — 전체 확인 완료
- 테스트 과정에서 **Cloud Run 신규 빌드/배포, TTS 합성, MP3 업로드 없음**

진행 완료: Google Cloud API 5개, 비공개 버킷, CORS, 전용 빌드/런타임 서비스 계정, Cloud Run 게이트웨이 최초 배포, 무인증 접근 차단 및 브라우저 CORS.

다음 미완료: 사용자 Google Sign-In ID 토큰의 실서버 `audience`·허용 이메일 검증, 이후 음성 생성/MP3 GCS 저장 및 PC·태블릿·iPhone QA(별도 승인 필요).

**보호 잠금:** `cloudRunRevisionUpdateUserApproved=false`, `ttsGenerationApproved=false`, `gcsUploadApproved=false`, `cloud-config.json.mode=disabled`; 운영 main v4.6.3 미변경. 보안 점검 성공을 이유로 추가 Cloud Run 배포를 실행하지 않음.

## 로그인 실검증 준비 방향
현재 운영 GitHub Pages URL과 동일한 `https://aliasel0817.github.io` 출처에서 Google ID 토큰을 얻어 직접 서버의 `/v1/manifest`로 보낼 시험 화면을 개발 브랜치에서 준비할 수 있음.
단, **개발 브랜치의 HTML 파일을 작성하는 것만으로 GitHub Pages 운영 URL에 게시되지는 않음**.
로그인 테스트 페이지를 실제 GitHub Pages에 공개 게시하려면 운영 main에 독립 HTML 파일만 추가하는 별도 변경이 필요하여 사용자 승인 전 게시하지 않음.
토큰은 짧게 메모리에만 보관하고 UI·로그·URL·Cloud Shell에 출력하지 않음. 인증된 요청 후 저장소에 index.json이 아직 없으면 503이 정상 예상 가능하며 503의 오류 성격을 구별해 확인.

---

# 학습노트 TTS — Cloud Run 최초 배포 성공, 404 원인 분석 (2026-10-09)

## 화면에서 확인된 현황
- Cloud Run 서비스: `study-tts-audio-gateway` / 프로젝트 `study-note-tts` / 지역 `us-central1`.
- **사용자 Cloud Shell 화면에 빌드·배포 Done, 리비전 트래픽 100% 표시**. 최초 Cloud Run 테스트 서비스 1개 배포 완료.
- 최초 상태 검사 `/healthz`: `HEALTH_HTTP=404`. 후속 `/v1/manifest` 무인증 검사는 `set -e`로 중단되어 실행되지 않음.
- Google 공식 Cloud Run known issues: `z`로 끝나는 일부 URL 경로가 예약되어 있음. `/healthz`가 해당하여 404를 반환할 수 있음.
- GitHub **개발 브랜치에만** 상태 경로를 `/health`로 수정함. 기존 Cloud Run 최초 리비전은 그대로이며 재배포되지 않음.
- 운영 GitHub `main` 학습노트 v4.6.3, Google Sheets, 필기, Apps Script 변경 없음.
- AI TTS 합성 및 GCS MP3 업로드: **승인 없음(false)·미실시**.

## 사용자 다음 Cloud Shell 묶음 작업 — 현재 배포의 로그인 차단·CORS 실동작 점검
아래 명령을 한 번에 실행합니다. **Cloud Run 추가 배포, 이미지 빌드, GCS 쓰기, TTS API 요청이 없음**.

```bash
(
  set -e
  git -C "$HOME/pe-tts-dev" pull --ff-only
  bash "$HOME/pe-tts-dev/study-note/tts/cloud-gateway/verify_remote.sh"
)
```

조회 스크립트에서 수행:
1. Cloud Run의 현재 `status.url`을 조회.
2. **로그인 없이 `GET /v1/manifest`** → 서버 자신의 JSON `{"error":"Google login required"}`, **HTTP 401**을 기대.
3. Origin `https://aliasel0817.github.io`에 대한 응답 CORS 헤더 검사.
4. 동일한 경로에 `OPTIONS` 브라우저 사전 요청 → **HTTP 204**를 기대.

예상 정상 결과: `UNAUTH_MANIFEST_HTTP=401`, `APP_AUTH_GATE=OK`, `GITHUB_PAGES_CORS=OK`, `CORS_PREFLIGHT_HTTP=204`, `EXISTING CLOUD RUN SECURITY CHECK COMPLETE`.
이 조회는 Cloud Run 요청/로그 소량 과금 가능성이 있지만 신규 빌드·배포는 없음.
오류 시 반복 배포하지 말고 결과를 공유. 실패하면 서비스 URL/접근 정책/로그를 분리해서 진단.

## 보호 잠금
- `cloudRunDeploymentUserConfirmed=true`; **이미 배포된 서버가 있으므로 초기 배포 스크립트는 재실행 차단**.
- `cloudRunRevisionUpdateUserApproved=false`: 건강 상태 경로 `/health`를 실제 서버에 반영하는 새 리비전의 배포는 아직 별도 승인받지 않음.
- `ttsGenerationApproved=false` 및 `gcsUploadApproved=false` 유지.
- `cloud-config.json.mode=disabled`; 운영 학습노트에 연결되지 않음.

공식: https://docs.cloud.google.com/run/docs/known-issues

---

# 이전 Cloud Run 배포 준비 기록

# 학습노트 AI TTS — Cloud Run 배포 직전 체크리스트

작성 기준: 2026-10-09 / 작업 브랜치 `feature/ai-natural-tts-20261009`

## 확인 완료
- Google Cloud 프로젝트: study-note-tts / 프로젝트 번호 558407087449
- 결제 계정 연결, 월 예산 알림 Study-Note-TTS-Budget (사용자 완료 보고)
- 비공개 GCS: study-note-tts-audio-558407087449, us-central1, Standard
- 버킷 CORS: https://aliasel0817.github.io, http://localhost:8765 / GET, HEAD
- Cloud Run 런타임 서비스 계정: study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com
- 버킷 한정 roles/storage.objectViewer, 서비스 계정 자체 roles/iam.serviceAccountTokenCreator
- Google Cloud API 5개 모두 활성화 (Cloud Shell 화면에 OK 5개)
  - iamcredentials.googleapis.com
  - texttospeech.googleapis.com
  - run.googleapis.com
  - cloudbuild.googleapis.com
  - artifactregistry.googleapis.com
- Cloud Run 서비스 조회 결과 `Listed 0 items.`
- 실제 AI 음성 생성, MP3 업로드, Cloud Run 배포는 아직 하지 않음

## DRY RUN 완료 (2026-10-09)
사용자가 Cloud Shell 화면을 제공했고, GitHub TTS 개발 브랜치의 소스 clone과 `deploy_pilot.sh --dry-run` 성공을 확인함.
출력에 `No build, no deploy, no paid-capable API request made.` 표시. 실제 배포/비용 가능 작업 미실시.

## Cloud Build 기본 계정 점검 결과 및 보안 선택 (2026-10-09)
사용자의 Cloud Shell 화면에서 아래 결과 확인:
- 기본 빌드 계정: `558407087449-compute@developer.gserviceaccount.com`
- 직접 Cloud Run Builder 권한: `RUN_BUILDER_DIRECT_ROLE: NOT_FOUND`
- `PREDEPLOY CHECK COMPLETE; NO CHANGES MADE` 정상 출력

Google Cloud에서는 **Cloud Run 소스 빌드에 별도 지정 서비스 계정 사용을 권장**합니다.
이에 따라 기본 Compute 계정의 권한을 변경하지 않고, TTS 전용 서비스 계정 `study-tts-build@study-note-tts.iam.gserviceaccount.com`을 새로 사용하도록 코드를 변경했습니다.
이 전용 계정에는 프로젝트 `study-note-tts` 내의 `roles/run.builder`만 부여. 버킷 objectViewer, 서비스 계정 Token Creator, Owner, Editor 권한은 부여하지 않음.
**Cloud Run 런타임 서비스 계정은 여전히 `study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com`** 입니다.

## 전용 빌드 계정 권한 완료 (2026-10-09)

Cloud Shell 실행 결과에서 아래 사항을 사용자 화면으로 확인:
- `Dedicated build service account already exists`: 재생성하지 않음
- `Project Cloud Run Builder role granted ONLY to dedicated build account.`: 프로젝트의 `roles/run.builder`를 **study-tts-build 계정에만** 부여
- `PROJECT_ROLE: roles/run.builder PRESENT`: IAM 재조회로 확인
- `DEFAULT COMPUTE ACCOUNT: UNCHANGED`: 기본 Compute 계정 유지
- `NO CLOUD RUN DEPLOY, TTS SYNTHESIS OR MP3 UPLOAD`: 실제 배포·음성 생성·MP3 업로드 없음

현재 Cloud Run 테스트 게이트웨이는 **아직 존재하지 않습니다**. 다음 작업은 과금 가능성이 있는 소스 빌드/Artifact Registry/Cloud Run 실제 배포이므로, 실행 전에 사용자에게 별도 명시적 동의를 요청해야 합니다.

### 테스트 서버 배포 계획
- 프로젝트: `study-note-tts`, 지역: `us-central1`
- 서비스: `study-tts-audio-gateway`
- 빌드 계정: `study-tts-build@study-note-tts.iam.gserviceaccount.com`
- 런타임 계정: `study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com`
- 1 vCPU / 메모리 512Mi / 최소 인스턴스 0 / 최대 1 / 동시 요청 4
- Cloud Run HTTPS 호출 허용. **MP3 목록·서명 URL은 Google ID 토큰과 허용 이메일 서버 검증이 필요**. 다른 사용자에게 MP3 접근 권한을 허용하지 않음
- 서버는 MP3 합성·GCS 업로드·삭제 기능이 없으며 클라우드 읽기 전용
- 배포 소스는 별도 기능 브랜치의 `study-note/tts/cloud-gateway` 내 Node 서버
- 기존 학습노트 운영 `main`은 미변경; Cloud Run 배포만 수행해도 운영 앱에 자동 연결되지 않음

### 비용 및 승인
- 현재 Cloud Run 소스 배포는 이미지 빌드와 Artifact Registry 이미지 저장을 만들 수 있어 요금이 발생할 수 있음.
- Cloud Run request-based 요금은 서비스 요청·CPU/메모리 사용량에 따르며, 최소 인스턴스 0을 설정해도 비용 0을 보장하지 않음.
- Google Cloud 예산 경고는 자동 결제 차단 장치가 아님.
- 사용자 명시적 승인 전까지 아래 잠금을 유지:
  - `cloudRunDeploymentUserApproved=false`
  - `cloudProvisioningApproved=false`
  - `ttsGenerationApproved=false`
  - `gcsUploadApproved=false`
- 명시적 동의 후에만 배포 전용 두 잠금을 해제하고 `deploy_pilot.sh --execute --accept-possible-charges` 안내. TTS 생성 및 GCS 업로드 잠금은 그대로 유지.
- 승인 전에는 Cloud Shell에서 `--execute` 명령을 실행하지 말 것.

공식 비용 자료:
- https://cloud.google.com/run/pricing
- https://cloud.google.com/build/pricing
- https://cloud.google.com/artifact-registry/pricing

## Cloud Run 테스트 게이트웨이 1개 배포 명시적 승인 완료 (2026-10-09)

사용자가 **Cloud Run 서버 1개 배포에 따른 과금 가능성을 이해하고 명시적으로 동의**함.
동시에 **실제 Google Cloud TTS 음성 합성과 MP3 GCS 업로드는 계속 비활성화**하도록 요청함.

### 이번 승인 범위
- Google Cloud 프로젝트: `study-note-tts`
- 서비스: `study-tts-audio-gateway`, 리전: `us-central1`
- 메모리 512MiB, 1 vCPU, 최소 인스턴스 0, 최대 인스턴스 1 (서비스 수준 `--min=0 --max=1` 및 리비전 수준 `--min-instances=0 --max-instances=1` 이중 제한)
- 전용 빌드 계정 `study-tts-build@study-note-tts.iam.gserviceaccount.com`
- MP3 조회용 런타임 계정 `study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com`
- Cloud Run 공용 HTTPS 접근은 허용. 비공개 MP3 조회 API는 Google ID 토큰/허용 이메일 검사. `/healthz`는 인증 없이 허용.
- Cloud Run 소스 빌드·Artifact Registry 이미지 저장·서버 실행 요금이 발생할 수 있음.
- Cloud Shell 사용자 본인의 활성 Google 이메일만 `ALLOWED_GOOGLE_EMAILS`로 설정하고, 허용된 Google 웹 OAuth 클라이언트만 신뢰.
- 실제 배포 성공 및 Google 계정 로그인 검증은 **아직 수행 전**.

### 승인 상태
- `cloudRunDeploymentUserApproved=true`
- `cloudProvisioningApproved=true` (이 단일 서비스 배포만)
- `cloudRunDeploymentApprovalScope=one-service-study-tts-audio-gateway-us-central1`
- `cloudRunDeploymentUserConfirmed=false` (실제 배포 결과 대기)
- `ttsGenerationApproved=false`, `gcsUploadApproved=false` (**유지, 변경 불가**)
- `cloud-config.json.mode=disabled` / GitHub 운영 `main` 미변경

### 실제 Cloud Shell 일괄 배포 및 기본 접근 제어 검증
아래 전체 복사 후 한 번 실행:

```bash
(
  set -e
  git -C "$HOME/pe-tts-dev" pull --ff-only
  bash "$HOME/pe-tts-dev/study-note/tts/cloud-gateway/deploy_pilot.sh" --execute --accept-possible-charges

  SERVICE_URL=$(gcloud run services describe study-tts-audio-gateway \
    --project=study-note-tts --region=us-central1 \
    --format='value(status.url)')
  test -n "$SERVICE_URL"
  echo "=== CLOUD RUN SERVICE URL ==="
  echo "$SERVICE_URL"

  echo "=== HEALTH CHECK (EXPECT HTTP 200) ==="
  HEALTH_STATUS=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$SERVICE_URL/healthz")
  echo "HEALTH_HTTP=$HEALTH_STATUS"
  test "$HEALTH_STATUS" = "200"

  echo "=== PRIVATE MANIFEST, WITHOUT LOGIN (EXPECT HTTP 401) ==="
  AUTH_STATUS=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$SERVICE_URL/v1/manifest")
  echo "UNAUTH_MANIFEST_HTTP=$AUTH_STATUS"
  test "$AUTH_STATUS" = "401"

  echo "=== DEPLOY AND BASIC SECURITY CHECKS COMPLETE ==="
)
```

정상 시 `HEALTH_HTTP=200`, `UNAUTH_MANIFEST_HTTP=401`. 이 검증은 인증된 MP3를 읽지 않고, 구글 클라우드 음성 합성·GCS 파일 업로드를 하지 않음.
오류 시 `set -e`가 후속 검사를 중단. 배포 성공 후 조회 단계만 실패해도 **같은 배포 명령을 다시 실행하지 말 것**, 결과를 공유할 것. 재배포 스크립트는 기존 서비스가 있다면 거부함.

Cloud Run 서비스와 빌드 이미지는 사용하지 않아도 비용이 발생할 수 있으며 예산 경고는 강제 한도가 아님. 최소 0/최대 1은 사용량을 줄일 뿐 비용 상한을 보장하지 않음.

공식:
- https://docs.cloud.google.com/run/docs/deploying-source-code
- https://docs.cloud.google.com/run/docs/configuring/services/build-service-account
- https://cloud.google.com/run/pricing

## 실제 배포 동의 기록(이전 설계)
`deploy_pilot.sh`는 기본 dry-run. 다음 두 잠금값을 승인 전까지 false로 유지:
- `cloudRunDeploymentUserApproved=false`
- `cloudProvisioningApproved=false`

이것을 변경하려면 사용자가 **Cloud Run 배포의 과금 가능성과 공개 HTTP 도달성(백엔드의 JWT 인증 적용)을 확인하고 명시적으로 동의**해야 함. `--execute --accept-possible-charges` 플래그만 추가해도 잠금이 유지되면 실행되지 않음.

승인 후 서버 계획:
- 서비스명 study-tts-audio-gateway / 지역 us-central1
- 전용 Cloud Build: study-tts-build@study-note-tts.iam.gserviceaccount.com (프로젝트 roles/run.builder)
- 1 vCPU / 512 MiB RAM / 0 최소 인스턴스 / 최대 인스턴스 1 / 동시 요청 4 / CPU 요청 시만 할당
- GitHub Pages 및 별도 로컬 테스트 환경용 브라우저 CORS 정책
- HTTPS 공개 접근 허용은 브라우저 preflight를 위한 전달 계층 설정일 뿐, **MP3 목록과 다운로드 링크는 Google 로그인 ID 토큰 검증/허용 이메일 검사를 통과해야만 조회 가능**.
- 오디오 생성/저장/삭제 HTTP API는 없음.
- 클라우드 계정의 **활성 이메일을 기본 허용 계정으로 설정**. 실제 학습노트에 로그인하는 Google 계정이 다르면 테스트 전에 조정해야 함.
- 나중에 실제 음성 파일이 준비되기 전에는 인증된 MP3 manifest 조회가 실패할 수 있으며 이는 정상적 준비 상태.

## 요금 주의
초기 가벼운 사용은 무료 제공량 범위에 들어갈 수 있어도 0원 보증 불가. Cloud Run 요청/CPU/RAM, Cloud Build 빌드 시간, Artifact Registry 저장 공간, GCS 저장/전송, Cloud Logging 등은 각기 별도로 청구될 수 있음. **예산 알림은 지출 자동 차단이 아님**.
- https://cloud.google.com/run/pricing
- https://cloud.google.com/build/pricing
- https://cloud.google.com/artifact-registry/pricing
- https://docs.cloud.google.com/run/docs/deploying-source-code

## 복원
- GitHub 운영 main은 기존 v4.6.3 그대로
- 복원 브랜치: backup/v4.6.3-before-ai-tts-20261009
- 앱 Google Sheets/Apps Script/필기 데이터는 변경 없음
