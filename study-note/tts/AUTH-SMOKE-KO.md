# 학습노트 TTS — 실제 Google 로그인 실검증 계획

2026-10-09 현재: Cloud Run 게이트웨이 배포 및 실제 무인증 HTTP 401 / CORS HTTP 204 통과.
음성 생성(`ttsGenerationApproved=false`) 및 GCS 업로드(`gcsUploadApproved=false`)는 여전히 금지.

## 검증 화면 준비 상태
- 테스트용 단일 HTML 파일: GitHub 개발 브랜치 루트 `tts-auth-check.html`.
- URL 게시 예정 위치: `https://aliasel0817.github.io/Pe-Exam-Search/tts-auth-check.html`.
- **아직 운영 main에 게시하지 않았음. 현재 위 URL이 동작한다고 주장하지 말 것.**
- PWA 서비스 워커의 `/Pe-Exam-Search/study-note/` 범위 밖에 있는 루트 파일 1개로만 공개할 수 있게 설계.
- 테스트 HTML은 Google Identity Services의 버튼으로 명시적으로 로그인하여 Google ID 토큰을 획득하고, 클라우드에 GET /v1/manifest 1회만 요청.
- Google 클라이언트 ID는 기존 학습노트에서 사용하는 공개 웹 클라이언트 ID.
- 토큰은 해당 네트워크 요청에만 일시적으로 사용하고, 로컬 스토리지/URL/로그/HTML/채팅에 출력하거나 저장하지 않음.
- 반환 목록 본문도 화면에 표시하지 않고 HTTP 상태에 따라 성공 여부만 보여줌.
- 테스트 페이지는 공개 URL로 접근 가능한 정적 HTML이나, 로그인·이메일 허용 목록은 **Cloud Run 백엔드에서 검증**.
- 서비스가 허용한 계정은 최초 배포 명령을 실행한 Cloud Shell 활성 Google 계정. 브라우저에서 다른 Google 계정을 선택하면 HTTP 403이 정상일 수 있음.
- Google OAuth authorized JavaScript origins에 `https://aliasel0817.github.io`가 등록되어 있어야 GIS 버튼 동작. 기존 OAuth code flow에서 이 Origin을 사용하는 것으로 확인했지만, Google Sign-In ID 토큰 방식의 실제 동작은 미검증.

## 결과 판별
- `200` + schemaVersion 1: Google 인증 통과, MP3 인덱스도 조회 성공.
- `503` + 서버 JSON `Audio manifest unavailable` 또는 `Invalid audio manifest`: **토큰 검증과 이메일 검사 통과**, 인덱스가 없거나 유효하지 않아 MP3 목록 단계에서 차단. 아직 MP3 업로드 금지 상태이므로 가능성 높음.
- `401`: 서버에서 해당 요청의 인증 정보를 사용하지 못함.
- `403`: 유효하지 않은 Google ID 토큰, 허용되지 않은 Google 계정 또는 Origin 차단.
- 그 외 코드 및 네트워크 오류: 로그인 검증 완료로 간주하지 않음.

## 사용자 사전 동의가 필요한 변경
이 테스트 페이지를 실제 원본 Github Pages 출처에서 확인하려면, **운영 main 브랜치에 테스트 전용 `tts-auth-check.html` 한 파일을 신규로 추가**해야 함.
별도 HTML 파일 추가라도 main의 Git 커밋이 변경되는 일이므로 별도 사용자 승인을 받기 전에는 **main을 변경하지 않음**.

승인 시:
1. 개발 브랜치에서 자동 검증된 `tts-auth-check.html` 단일 파일만 main의 저장소 루트에 작성.
2. `study-note/study-note.html`, 서비스 워커, manifest, Apps Script, Google Sheets, 필기 데이터, 기기 인증 설정은 수정하지 않음.
3. 사용자에게 GitHub Pages 정적 URL을 전달하고, PC/태블릿 등에서 기존 Google 계정으로 로그인 테스트를 수행.
4. 로그인 결과 상태만 화면 캡처해 공유. **ID 토큰, 네트워크 헤더, Google 이메일, 인증 쿠키를 채팅으로 제출하지 않도록 안내**.
5. 테스트가 끝나면 원하면 main의 독립 테스트 HTML 파일만 삭제하여 흔적을 제거. 기존 학습노트 운영판 변경 없음.

이 테스트 화면 하나를 게시하기 위한 main 변경 외에, Cloud Run 새 리비전 배포, 실제 음성 합성, GCS MP3 업로드에 대한 승인은 포함되지 않음.

보호 플래그: `cloudRunRevisionUpdateUserApproved=false`, `ttsGenerationApproved=false`, `gcsUploadApproved=false`, `cloud-config.json.mode=disabled`.
