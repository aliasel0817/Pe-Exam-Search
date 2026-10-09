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

## 이번 사용자의 안전한 Cloud Shell 작업: 배포 미리보기만
다음 명령을 통째로 한 번 붙여넣기. **실제 클라우드 배포는 발생하지 않음.**

```bash
(
  set -e
  if [ ! -d "$HOME/pe-tts-dev/.git" ]; then
    git clone --depth=1 --filter=blob:none --sparse \
      --branch feature/ai-natural-tts-20261009 \
      https://github.com/aliasel0817/Pe-Exam-Search.git \
      "$HOME/pe-tts-dev"
  fi
  git -C "$HOME/pe-tts-dev" sparse-checkout set study-note/tts
  bash "$HOME/pe-tts-dev/study-note/tts/cloud-gateway/deploy_pilot.sh" --dry-run
)
```

1. GitHub 공개 저장소의 **TTS 개발 브랜치 소스만** Cloud Shell 홈에 준비.
2. Node Cloud Run 서버의 예상 배포 구성/권한/비용 위험을 읽기만.
3. Google Cloud API 호출, 이미지 빌드, Cloud Run 서비스 생성, TTS 음성 생성 및 GCS 업로드는 수행하지 않음.
4. 결과를 캡처해 공유. 오류가 나면 그대로 알려주고 불필요한 재시도 금지.

## 실제 배포는 별도 승인 필수
`deploy_pilot.sh`는 기본 dry-run. 다음 두 잠금값을 승인 전까지 false로 유지:
- `cloudRunDeploymentUserApproved=false`
- `cloudProvisioningApproved=false`

이것을 변경하려면 사용자가 **Cloud Run 배포의 과금 가능성과 공개 HTTP 도달성(백엔드의 JWT 인증 적용)을 확인하고 명시적으로 동의**해야 함. `--execute --accept-possible-charges` 플래그만 추가해도 잠금이 유지되면 실행되지 않음.

승인 후 서버 계획:
- 서비스명 study-tts-audio-gateway / 지역 us-central1
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
