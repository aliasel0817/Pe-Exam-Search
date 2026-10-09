# 정보관리기술사 학습노트 AI 자연음성 TTS — 잔여 작업 로드맵

작성·확인 기준: 2026-10-09 15:40 KST
운영 PWA: `https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html`
독립 로그인 시험: `https://aliasel0817.github.io/Pe-Exam-Search/tts-auth-check.html`
Cloud Run 테스트 서비스: `study-tts-audio-gateway`, 프로젝트 `study-note-tts` (`us-central1`)
저장소: 비공개 Google Cloud Storage 버킷 `study-note-tts-audio-558407087449`
개발 브랜치: `feature/ai-natural-tts-20261009`
복원 기준: `backup/v4.6.3-before-ai-tts-20261009` (`d062ced02be599d93487c6ba1785b65af1edc071`)

## 준비 완료 — 그러나 TTS 기능 완성은 아님

- [x] 결제 계정 및 예산 알림 사용자 설정
- [x] 비공개 Cloud Storage 버킷, 공개 액세스 방지·CORS
- [x] Cloud Run 런타임 계정·전용 빌드 계정 및 최소 필요한 IAM
- [x] IAM Credentials / Text-to-Speech / Cloud Run / Cloud Build / Artifact Registry API 활성화
- [x] Cloud Run Gateway 최초 배포
- [x] Cloud Run 무인증 MP3 목록 요청 차단 HTTP 401, GitHub Pages CORS, OPTIONS HTTP 204 실환경 검증
- [x] GitHub 개발 브랜치에 TTS 재생 UI·선택 필드·반복·회상 간격·배속·연속 재생·MP3 생성기·GCS 업로더·인덱스·게이트웨이 코드 및 테스트 작성
- [x] GitHub main에 **로그인 시험용 `tts-auth-check.html` 파일 한 개만 추가** (`55052c05c2b4330fe9798161b2ab4565076a852d`); Pages 빌드/배포 작업 `37894854490` 성공. **실제 Google 로그인은 아직 미검증**.

**유의:** main 브랜치 커밋은 테스트 파일 한 개 추가로 변경되었음. 기존 `study-note/study-note.html` 운영 앱은 v4.6.3 그대로이고, 데이터·Apps Script·필기·백업은 미변경.

## 기능 완성까지 남은 8단계 (계획치, 오류에 따라 세분화 가능)

### 1. 실제 Google 계정 로그인·인증 검증 — 현재 진행 중
- [x] GitHub Pages 배포 작업 성공 확인; 사용자 브라우저에서 페이지 열기/로그인 버튼 실제 접근은 아래 단계에서 확인
- [ ] Google Sign-In 실행 → 허용된 계정 ID 토큰을 Cloud Run에서 검증
- [ ] **정상 시** MP3 목록이 아직 없어서 API가 503 `Audio manifest unavailable`이라고 응답할 수 있음. 이는 서버가 로그인 검증을 통과한 다음 GCS를 조회했을 경우의 정상적인 준비 상태
- [ ] 로그인/출처/허용 계정 오류를 분리 진단; 토큰·헤더·계정 이메일을 채팅에 요청하지 않음

### 2. 음성 품질·소스 데이터·비용 검토
- [ ] 실제 토픽의 7개 구간(토픽명 + 선택 가능 6항목) 데이터 필드 매핑과 최신 Google Sheets 소스 확인
- [ ] 한글 남/녀 목소리 후보, 발음 사전(SQL, LSM-Tree 등), 비용/무료 할당량/사용 약관 재검토
- [ ] 소량 합성만 별도로 사용자 승인 후 진행하도록 테스트 샘플·월 상한 확정

### 3. 소량 샘플 AI MP3 실제 생성
- [ ] 2~5개 대표 토픽에 대해 7개 구간 MP3 파일 생성
- [ ] 목소리, 발음, 말속도, 문장 분리, 자연스러움 평가
- [ ] 사용량·실제 합성 비용 확인 및 문제가 있으면 샘플만 재생성
- **현재 잠금:** `ttsGenerationApproved=false`; 승인 전 실제 합성 금지

### 4. 비공개 GCS MP3 업로드·서명 URL·재생 검증
- [ ] 검수한 MP3만 GCS에 소량 업로드, `index.json` 최신화, 콘텐츠 해시 검증
- [ ] 로그인 후 Cloud Run `/v1/manifest` 조회 및 `/v1/audio-url`을 통해 5분짜리 임시 링크 발급
- [ ] 브라우저에서 실제 파일 재생, 빈 항목·갱신·만료 시 동작 확인
- **현재 잠금:** `gcsUploadApproved=false`; 승인 전 업로드 금지

### 5. 학습노트 실제 앱 재생 UI 통합
- [ ] 개발 브랜치의 TTS 토글, 6개 항목 선택, 토픽명 선행, 정해진 읽기 순서 확인
- [ ] 단일/연속 재생, 반복, 회상 간격, 재생속도, 필드 강조
- [ ] Google 로그인 상태·오류 메시지·검색 필터·수동 토픽 선택 시 정지·캐시 검증
- [ ] PDF·이미지·펜 주석·문제검색·관리창과 충돌 회귀 테스트

### 6. PC·태블릿·iPhone 실기기 QA
- [ ] Windows PC, Galaxy Tab, iPhone에서 Google 로그인·재생·연속 읽기 테스트
- [ ] iOS 사용자 제스처 제한·잠금 화면·브라우저 백그라운드 문제 확인
- [ ] 오프라인 재생은 **이전에 캐시된 MP3 한정**으로 검증; 오디오 미보유 상태에서 오프라인 재생 보장하지 않음
- [ ] 신뢰 기기·캐시 용량·비공개 링크 보호·로그에 개인정보 노출 여부 확인

### 7. 학습대상 전체 토픽의 단계별 MP3 구축·유지보수
- [ ] 합성 비용과 저장·전송 비용 검토 후 사용자 승인 범위 내 소량 묶음 생성
- [ ] 약 3,800개 학습 토픽의 변경분만 재생성, 항목·음성별 해시 추적
- [ ] 샘플 성능·예산·정확성 확인 후 반복적으로 범위 확대; 한 번에 전수 합성하지 않음
- [ ] 향후 신규 토픽·필드 수정 시 대상 MP3만 안전하게 재생성

### 8. 정식 운영 반영·백업·안정화
- [ ] 버전·변경 파일·GitHub main 차이 및 롤백 기준 최종 점검
- [ ] 사용자 최종 승인 후 학습노트 정식 TTS 활성화
- [ ] 실기기 회귀 QA / 운영 데이터·Apps Script·주석 손상 여부 확인
- [ ] 비용 모니터링/월 상한/오류 복구/사용 매뉴얼·백업 최신화

## 현재 승인 경계
- `cloudRunDeploymentUserConfirmed=true`: 테스트 서버 첫 배포 완료
- `cloudRunRevisionUpdateUserApproved=false`: Cloud Run 추가 빌드·재배포 미승인
- `ttsGenerationApproved=false`: 실제 AI 음성 합성 미승인
- `gcsUploadApproved=false`: GCS MP3 업로드 미승인
- `cloud-config.json.mode=disabled`: 학습노트 운영 앱의 실제 TTS 클라우드 모드 비활성화
- 단, **main의 로그인 시험 HTML 파일만 사용자 '계속 진행' 요청을 근거로 추가 승인/반영함**
- Apps Script 저장·함수 실행·재배포 현재 필요 없음

## 이번 사용자 확인
GitHub Pages의 시험 페이지가 열리면 Google 계정을 선택한 후 다음 중 **화면 메시지만** 알려주면 됨:
- `Google ID 토큰·허용 계정 검증 통과`(HTTP 503 메시지)
- `Google 계정 인증 및 MP3 목록 접근 확인`(HTTP 200)
- HTTP 401/403 또는 로그인 버튼 실패/네트워크 오류

이후 단계 2~3은 음성 합성의 실제 클라우드 요금이 발생할 수 있으므로 별도 비용 확인 및 사용자 동의 후 실행.
