# 학습노트 AI 자연음성 TTS — 개발용

**운영 main은 v4.6.3 그대로입니다.** 소스는 feature/ai-natural-tts-20261009 에서만 수정했습니다.

## 음성 저장 방식 (2026-10-09 확정)
- Google Cloud Storage의 비공개 버킷에 AI 자연음성 MP3를 토픽/항목/목소리별 저장.
- Cloud Run cloud-gateway는 별도 Google 계정 ID 토큰 검증 후 5분짜리 읽기 전용 서명 URL을 발급.
- 모든 기기는 같은 MP3를 재생하고 각 기기에서는 제한된 Cache Storage에 저장.
- 브라우저 내장 음성 합성은 사용하지 않으며, 재생 시 새로운 음성 생성 API를 호출하지 않음.
- 저장소가 아직 없으므로 cloud-config.json은 mode disabled. 실제 클라우드 사용 및 요금 없음.
- Google Cloud 프로젝트 연결 이후에도 운영 main으로 반영하기 전에 사용자가 직접 기기별 품질 검증 필요.

## 읽기 항목
토픽명은 항상 첫 번째. 개념 → 등장배경 → 필요성 → 특징 → 기술요소/구성요소 → 키워드 순서이며 본문 여섯 항목 개별 선택, 단일/연속 재생, 반복, 회상 간격, 속도, 읽는 위치 강조 지원.

## 개발 파일
- natural-tts.js : MP3 재생/음성 캐시/목소리 설정/Google Sign-In/서명 URL 사용.
- generate_mp3.py : 한국어 AI 음성 생성 프로그램. 기본 dry-run, 요금 승인 플래그 없이는 실행 차단.
- upload_gcs.py : 비공개 GCS 버킷으로 MP3 업로드. 기본 dry-run, Cloud 승인 플래그 필수.
- audio/index.json : 클라우드 저장소로 올릴 음성 목록의 빈 예시. MP3는 GitHub에 업로드하지 않음.
- cloud-config.json : 현재 disabled. Cloud Run 인증 연동 완료 전에는 GCS 요청 없음.
- cloud-project.json : 확정된 프로젝트 ID·프로젝트 번호 및 TTS 생성·GCS 업로드의 **개별 승인 잠금값(false)**. 실행 옵션을 넣더라도 이 잠금이 유지되면 클라우드 호출 차단.
- cloud-gateway/server.cjs : 토큰 검증, GCS 서명 URL 발급 서버. TTS API 호출 기능 없음.
- cloud-gateway/gcs-cors.json : GitHub Pages origin만 GCS GET 허용.
- preview.html : 로컬 격리 MP3 테스트용. 운영 PWA·Google Sheets·필기 데이터 미접근.
- GCS-SETUP-KO.md : 클라우드 계정 설정 및 유료 가능 작업 승인 절차.
- test_*.py / test_player.cjs / cloud-gateway/test_gateway.cjs : 클라우드 호출 없이 CI 자동 검사.

## 중요한 제한
- 초기 버전은 사용자의 Google 계정이 별도로 Cloud 게이트웨이에 로그인해야 합니다. 기존 신뢰기기 승인과 완전히 동일한 인증체계는 아닙니다.
- Cloud 서비스 개통 및 진짜 한국어 MP3 생성은 계정/결제 정보 확인 후에만 가능.
- Cloud TTS 로컬 월 50,000 UTF-8 바이트 사용 제한은 컴퓨터 단위이며 Google Cloud 전체 지출의 절대 상한이 아닙니다.
- GitHub public repo에 개인 학습 음성 MP3 또는 Google OAuth 비밀키를 올리지 않음.
- iPhone 화면잠금/백그라운드 자동재생은 실기기 검증 전 미보증.

## 롤백
기준 SHA d062ced02be599d93487c6ba1785b65af1edc071
복원 브랜치 backup/v4.6.3-before-ai-tts-20261009
개발 브랜치 feature/ai-natural-tts-20261009


### 현재 인프라 체크포인트 (2026-10-09)
- 프로젝트와 비공개 버킷, 서비스 계정, 버킷 objectViewer 및 self-only Token Creator 완료.
- API 5개 `ENABLED`, Cloud Run 서비스 0개: 사용자 스크린샷 확인.
- Cloud Run은 **미배포**, TTS MP3 미생성, 업로드 미실시.
- `cloud-project.json`의 `cloudRunDeploymentUserApproved`, `cloudProvisioningApproved`,
  `ttsGenerationApproved`, `gcsUploadApproved` 모두 false.
- Cloud Run 배포 미리보기 스크립트: `cloud-gateway/deploy_pilot.sh`
  (기본 dry-run, 승인 잠금 해제 전 실제 배포 원천 차단).
- 쉬운 Cloud Shell 실행 안내: `CLOUD-RUN-PILOT-KO.md`.

- 기본 Compute Cloud Build 계정에 직접 Builder 역할 없음 확인. 프로젝트 TTS 전용 `study-tts-build@study-note-tts.iam.gserviceaccount.com`을 만드는 절차로 전환하여 `--build-service-account`으로 명시; `setup_build_identity.sh` 기본값은 dry-run, Cloud Run 배포는 여전히 별도 승인 잠금.
