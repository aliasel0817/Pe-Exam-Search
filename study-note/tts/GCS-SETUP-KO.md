# 학습노트 TTS — 체크포인트: 필수 API 3개와 버킷 CORS 확인 완료

## 결과 확인
- 사용자 Cloud Shell 화면에서 iamcredentials.googleapis.com, texttospeech.googleapis.com, run.googleapis.com 3개 모두 활성화 성공
- 서비스 계정 자신에게 roles/iam.serviceAccountTokenCreator 확인
- Cloud Storage CORS: GitHub Pages/localhost(8765), GET/HEAD, maxAgeSeconds 3600 실제 설정 확인
- 스크린샷 상단의 404는 이전 출력. 이번 작업은 Operation finished successfully 및 마지막 CORS 설정 출력으로 종료됨.
- 운영 main과 복원 브랜치 그대로. TTS 합성·Cloud Run 배포·GCS MP3 업로드 잠금 유지.

## 기존 Google OAuth 웹 클라이언트 재사용
기존 PWA에서 사용하던 공개 ID:
`1054197140509-60r8da165v63qghfn6558o5d48crl02g.apps.googleusercontent.com`
새 Google 로그인 클라이언트를 만들지 않고 재사용하도록 `tts/cloud-config.json`에 준비함. TTS 서비스 모드는 여전히 disabled.
기존 앱 기기 인증은 google.accounts.oauth2.initCodeClient, 새 TTS 화면은 google.accounts.id.initialize로 서로 다른 API를 사용. **실제 Google ID 토큰 로그인 및 백엔드 audience 검증은 아직 미검증**.

## 다음 사용자 Cloud Shell 묶음 작업: Cloud Run 빌드 전 API 준비와 읽기 전용 확인
```bash
(
  PROJECT=study-note-tts
  set -e
  echo "=== ENABLE BUILD PREPARATION APIS ==="
  gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com --project="$PROJECT"
  echo "=== 5 REQUIRED APIS ==="
  for api in iamcredentials.googleapis.com texttospeech.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com; do
    state=$(gcloud services describe "$api" --project="$PROJECT" --format="value(state)")
    echo "$api : $state"
    test "$state" = "ENABLED"
  done
  echo "=== CLOUD RUN SERVICES (READ ONLY) ==="
  gcloud run services list --region=us-central1 --project="$PROJECT"
  echo "=== FINISHED; NO DEPLOY, NO TTS REQUEST ==="
)
```
- Cloud Build / Artifact Registry API 두 개를 **활성화만** 하고 기존 3개를 포함해 상태를 검증.
- Cloud Run 서비스 목록을 조회할 뿐 실제 서비스, 이미지 저장소, 서버를 만들지 않음.
- 실행 명령에 `set -e` 포함: 오류 시 다음 명령 실행 차단. 메인 Cloud Shell은 괄호 서브셸이므로 유지.
- 오류가 나면 반복 실행하지 말고 출력 내용을 공유.

이 단계는 Service Usage 설정이며 빌드 실행, 리포지토리 생성, 배포는 수행하지 않음. **Cloud Build/Artifact Registry/Cloud Run을 실제 사용할 때 비용 가능**.
사용자께서는 전체 결과를 한 번만 캡처해 알려주면 됨. 다음 배포는 별도의 예상 비용 및 실행 권한 확인 후 진행.

공식 안내:
https://docs.cloud.google.com/run/docs/deploying-source-code
https://docs.cloud.google.com/service-usage/docs/enable-disable

---

# 학습노트 TTS — 비공개 Google Cloud Storage 설치 안내

**운영 main v4.6.3은 그대로입니다.** 이 문서는 개발 브랜치의 GCS 연동 절차입니다. 이 작업에서 실제 Cloud 자원을 생성하거나 음성 API를 호출한 적은 없습니다.

## 구성

1. AI 음성 생성기는 로컬에서 토픽명, 개념, 등장배경, 필요성, 특징, 기술요소/구성요소, 키워드 MP3를 항목별로 생성합니다.
2. upload_gcs.py가 비공개 Google Cloud Storage 버킷에 MP3를 업로드한 뒤 index.json을 마지막에 갱신합니다.
3. Google 계정으로 로그인한 사용자만 Cloud Run 게이트웨이에서 MP3 접근용 5분짜리 읽기 전용 Signed URL을 받습니다.
4. PWA가 해당 MP3를 내려받아 재생하고 기기 캐시에 보관하므로 합성 API를 반복 호출하지 않습니다.
5. GitHub에는 생성한 MP3 및 인증 비밀키를 올리지 않습니다.

## 무료·과금에 대한 주의

Cloud Storage Always Free는 us-central1, us-east1, us-west1 리전의 Standard Storage 월 5GB-months, Class A 5,000회, Class B 50,000회 등으로 제한됩니다. 사용량은 해당 3개 미국 리전에서 합산되고, 실제 전송 무료 조건에는 목적지 제한이 있습니다. 서울 리전은 위 Always Free 저장량 대상이 아닙니다.

Cloud TTS Chirp 3: HD는 월 100만 자 무료 구간이 있으나 초과 시 과금될 수 있습니다. Cloud Run 빌드, Artifact Registry, 다운로드 네트워크, 로깅 등의 비용은 별도로 판단해야 합니다. 일반 Google Cloud 예산 알림은 자동 과금 중지가 아닙니다. 소유자의 비용 관련 설정을 확인하고 승인받기 전에는 실행하지 않습니다.

관련 공식 사이트:
- https://docs.cloud.google.com/free/docs/free-cloud-features
- https://cloud.google.com/storage/pricing?hl=ko
- https://cloud.google.com/text-to-speech/pricing?hl=ko
- https://docs.cloud.google.com/storage/docs/access-control/signed-urls

## Google Cloud에서 사용자가 직접 준비하는 항목 (아직 미실행)

1. Google Cloud Console에서 프로젝트를 만들고 예상 결제·무료 사용량 조건 확인: https://console.cloud.google.com/
2. Cloud Storage에서 유일한 이름의 버킷 생성: 위치 us-central1, 클래스 STANDARD, Uniform bucket-level access 켜기, Public access prevention 강제. Soft delete, 버전 관리에 따른 추가 저장 비용도 확인.
3. 버킷 CORS: cloud-gateway/gcs-cors.json을 사용. 허용 origin은 https://aliasel0817.github.io (사이트의 실제 웹 origin).
4. Cloud Run 런타임 전용 서비스 계정을 만들고 이 버킷에만 Storage Object Viewer 권한을 부여.
5. 서비스 계정 자신이 Signed URL 서명을 할 수 있도록 필요한 iam.serviceAccounts.signBlob 권한을 부여. 서비스 계정 JSON 비밀키를 만들거나 Github에 올리지 않습니다.
6. Google Identity Services Web OAuth Client ID 생성. 승인 JavaScript origin: https://aliasel0817.github.io. 허용 로그인 이메일은 Cloud Run 환경변수에만 기재.
7. Cloud Run 배포 전에 환경변수 TTS_BUCKET, GOOGLE_WEB_CLIENT_ID, ALLOWED_GOOGLE_EMAILS, TTS_ALLOWED_ORIGIN을 설정하고 최소 인스턴스 0, 최대 인스턴스 1 등 제한을 구성. 배포·빌드 작업도 요금 가능성이 있어 별도 승인을 받아 실행.
8. Cloud Run HTTP 엔드포인트는 Google ID 토큰의 audience/허용 계정을 검증합니다. 인프라 차원에서 HTTP 호출 허용이 필요할 수 있으나 애플리케이션 인증을 반드시 유지합니다.
9. 개발 브랜치의 cloud-config.json을 실제 게이트웨이/클라이언트 ID로 바꾸고, PC·Galaxy Tab·iPhone에서 샘플 재생을 검증한 뒤에만 main 운영판 적용.

## 초기 버킷 생성용 명령 예시 (실행 금지: 먼저 Google Cloud 사용자 승인)

    gcloud config set project YOUR_PROJECT_ID
    gcloud storage buckets create gs://YOUR_UNIQUE_BUCKET --project=YOUR_PROJECT_ID --location=us-central1 --default-storage-class=STANDARD --uniform-bucket-level-access --public-access-prevention --soft-delete-duration=0

브라우저가 비공개 MP3 다운로드 서명 URL을 직접 요청할 때 사용하는 CORS 설정:

    gcloud storage buckets update gs://YOUR_UNIQUE_BUCKET --cors-file=study-note/tts/cloud-gateway/gcs-cors.json

GCS 버킷은 비공개입니다. 브라우저 CORS 허용은 객체 공개 설정이 아니며 접근을 위해서는 로그인 검증 및 짧은 유효기간의 URL 서명이 모두 필요합니다.

## AI 음성 생성과 비공개 클라우드 업로드

먼저 토픽 1~3개를 내보낸 뒤, Google Cloud 요청이 없는 테스트 모드에서 예상 생성량을 확인:

    py study-note/tts/generate_mp3.py --input topic-sample.json --max-topics 3

실제 생성은 다음 플래그 2개를 함께 사용해야만 작동하며, 프로젝트와 요금 정보를 확인하고 별도 승인한 뒤 실행:

    py study-note/tts/generate_mp3.py --input topic-sample.json --project YOUR_PROJECT_ID --max-topics 3 --execute --accept-possible-charges

업로드 준비 확인(실제 버킷 접근 없음):

    py study-note/tts/upload_gcs.py --audio-dir study-note/tts/audio --bucket YOUR_UNIQUE_BUCKET

실제 업로드 역시 별도 승인 후 아래 두 실행 동의 플래그를 모두 넣어야 실행:

    py study-note/tts/upload_gcs.py --audio-dir study-note/tts/audio --bucket YOUR_UNIQUE_BUCKET --execute --accept-possible-cloud-charges

업로드 프로그램은 기존 객체를 삭제하지 않으며, 생성된 MP3를 덮어쓰지 않고 매니페스트를 원자적으로 합칩니다. 클라우드 저장 위치는 gs://BUCKET/study-note/tts/audio/ 입니다.

## PWA 개발 브랜치의 Cloud 연결 설정

처음에는 cloud-config.json 이 mode disabled 입니다. 실제 프로젝트 설정·배포·비용 확인 후 개발 브랜치에서만 아래처럼 변경합니다.

    {
      "schemaVersion": 1,
      "mode": "gcs-private",
      "gatewayUrl": "https://YOUR_SERVICE.a.run.app",
      "oauthClientId": "YOUR_GOOGLE_WEB_CLIENT_ID"
    }

OAuth 클라이언트 ID 자체는 비밀번호가 아닙니다. Client Secret, Google ID token, 서비스 계정 JSON 등은 공개 저장소/채팅에 절대 올리지 않습니다.

## 검증 및 롤백

- TTS Actions 검사: JS/Python 정적 검사, 가짜 브라우저 MP3 플레이어 재생/중지/연속 이동, Cloud Run 게이트웨이 인증·서명 URL, GCS 업로더 dry-run.
- 한국어 AI 목소리 품질과 모바일 기기 실제 동작은 Cloud 계정 승인 후 샘플 MP3가 생성되면 검증.
- 서비스 연결이 실패해도 브라우저 내장 TTS로 자동 전환하지 않습니다.
- 운영 소스 보호 SHA: d062ced02be599d93487c6ba1785b65af1edc071
- 롤백 브랜치: backup/v4.6.3-before-ai-tts-20261009
- 개발 브랜치: feature/ai-natural-tts-20261009
- 기존 필기 데이터, Google Sheets, Apps Script는 이 개발에서 수정하지 않았습니다.
