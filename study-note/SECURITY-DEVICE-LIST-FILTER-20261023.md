# 등록 기기: REVOKED 표시 필터 (2026-10-23)

## 변경 목적

REVOKED 기기는 화면에서 기본적으로 숨기되, 실제 인증 차단 및 감사 이력을 보호합니다. 기기/세션 DB를 삭제하거나 Apps Script의 인증 로직을 변경하지 않습니다.

## 실제 GitHub 소스 확인 사항

- ACTIVE 기기는 signed GET action `securityDevices`를 통해 서버에서 등록 기기를 조회합니다.
- 기존 '접속 차단'은 signed POST `revokeDevice` 요청을 서버에 전송하고, 다시 `securityDevices` 결과를 조회해 표시합니다. 단순 CSS 표시 변경이 아닙니다.
- Apps Script 서버의 내부 데이터 저장/감사 세부 구현은 이 저장소에 공개되어 있지 않아 직접 검증하지 않았습니다. 따라서 영구삭제 기능 추가는 권장하지 않습니다.

## 사용자 화면

- **활성·승인 대기 (기본)**: `status !== 'REVOKED'` 항목만 표시합니다. ACTIVE, PENDING 기기와 예상치 못한 다른 상태를 기본 화면에서 누락하지 않습니다.
- **차단된 기기**: REVOKED 상태만 표시합니다.
- **전체 기기**: 서버에서 전달된 모든 기기를 표시합니다.
- 각 옵션에 전체 목록의 개수를 표기하며, 필터 변경은 로컬 렌더링만 수행합니다(서버 요청/인증상태 변경 없음).
- 기존 승인/PENDING, 이름 변경, 접속 차단 버튼 및 재조회 동작을 유지합니다.
- 대소문자 상관없이 REVOKED를 인식하고, 기기명·플랫폼 출력은 기존 XSS escape 로직을 유지합니다.
- 차단된 기기를 다시 보고 싶을 때는 '차단된 기기' 또는 '전체 기기'를 선택한 뒤 새로고침할 수 있습니다.

## 검증

- 독립 개발 폴더: `Pe-Exam-Search_device_filter_20261023`, 별도 feature branch
- Chromium 브라우저: ACTIVE 2 / PENDING 1 / REVOKED 2 합성기기, 3가지 필터, 개수 및 승인/차단 버튼 표시, 상태 변경 후 새로고침 시 화면 갱신, 악성 HTML 이름 이스케이프
- 320/390/820/1280px 화면의 수평 넘침 없음
- 기존 Windows cache QA, browser 56 viewport scenarios, bottom navigation, study planner, annotation pointer, image viewer, technical readability regression 성공
- iPhone WebKit 검수는 `test_security_device_filter_webkit.cjs` 및 CI에서 수행
- 실제 등록 기기의 접근 권한을 변경하는 라이브 보안 테스트는 하지 않았습니다.

## 보존·롤백

MASTER 원문, Google Sheets `학습정보`, Apps Script, 인증 서버 정보, 기기 레코드, 기존 등록기기와 세션 토큰을 변경하지 않습니다. 프런트엔드 렌더와 UI 선택만 변경하고 PWA cache name을 갱신합니다. 회귀 발생 시 프런트엔드 PR을 되돌릴 수 있습니다.
