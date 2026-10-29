# 학습노트 원본 PDF 고선명 표시 — Apps Script 서버 연동 (배포 전용)

## 목적과 현재 상태

- 원본 페이지를 **기존 학습노트 PDF 뷰어의 PDF.js Canvas**로 렌더링합니다.
- Google Drive 외부/내장 iframe 뷰어를 다시 사용하지 않습니다.
- 기존 기기 인증(ACTIVE), HMAC 서명, TTL, nonce, 원본 페이지 MASTER를 그대로 사용합니다.
- **이 폴더의 `.gs` 파일은 아직 운영 Apps Script에 적용되지 않았습니다.** 파일만 GitHub에 추가해도 서버는 바뀌지 않습니다.
- 현재 운영 Apps Script의 최신 `Code.gs`가 확보되지 않아, 기존 라우팅/보안 구현을 추측해서 전체 파일을 덮어쓰지 않습니다.

## 운영 서버 패치: 기존 Code.gs를 먼저 확보하세요

1. 배포 중인 Apps Script 프로젝트의 **현재 운영 버전**을 백업하고, 편집 중인 코드/배포 버전이 일치하는지 확인합니다.
2. `referencePdfContent.addon.gs` 내용을 같은 Apps Script 프로젝트에 별도 `.gs` 파일로 추가합니다. 이 함수는 독립 웹앱이 아니며 `doGet`을 추가하지 않습니다.
3. 기존 **signed GET 디스패처**에 `action=referencePdfContent` 라우트를 추가합니다. 일반 `pdfPageFiles`처럼 공개 GET으로 열지 마세요.
4. 기존 `referencePdfPageCatalog` 등과 동일한 HMAC, timestamp, nonce, ACTIVE 기기, 세션 만료/해지 검증을 **먼저** 실행하고, 서버가 검증한 `authPayload`의 `sourceType`·`pageToken`만 읽습니다. 브라우저가 보낸 `driveFileId`는 사용하지 않습니다.
5. 기존 스프레드시트의 `PDF페이지파일_20260928` 시트를 확보해 `readReferencePdfPageForSignedGet_(validatedSession, pageSheet, input)`에 전달합니다. `validatedSession.authenticated === true`이고 `status === 'ACTIVE'`인 경우만 허용합니다. 클라이언트 요청값을 `validatedSession`으로 사용하면 안 됩니다.
6. 기존 JSON 응답 함수를 통해 결과를 반환합니다. 백엔드 DriveApp 파일 읽기 권한을 유지하며, 데이터를 별도 공개 호스팅에 복사하지 않습니다.
7. 기존 health 응답에 **서버 기능이 실제로 배포된 경우에만** `referencePdfContentReady: true`를 추가합니다. 미지원 시 필드를 제거하거나 false로 둡니다.
8. 서버를 새 버전으로 배포한 뒤 기존 운영 `/exec?action=health`의 스키마 및 기능값을 확인하고, 서명된 페이지 요청이 성공하는지 확인합니다.

## 서명 요청/응답 계약

Frontend는 기존 `buildSignedGetUrl(getApiUrl(), 'referencePdfContent', { sourceType, pageToken })`을 재사용합니다.

요청:
- `sourceType`: `서브노트` 또는 `교재`
- `pageToken`: 예 `MG:187`
- 서명/기기/nonce 등은 현재 PWA signed GET 규칙 그대로 전송

응답:
```json
{
  "ok": true,
  "sourceType": "교재",
  "pageToken": "MG:187",
  "mime": "application/pdf",
  "size": 139117,
  "base64": "<the server-encoded one-page PDF bytes>"
}
```

실제 응답의 base64 값은 PDF 원문 자체이므로 브라우저 콘솔/서버 로그/PR/스크린샷에 게시하지 마세요.

## 보안 체크

- 인증 없는 GET, 서명 위변조, PENDING/REVOKED, 만료 세션, nonce 재사용 → 반드시 기존 검증 함수에서 거부.
- 클라이언트 `driveFileId` 무시, 시트 등록값으로만 Drive 파일 결정.
- `출처유형+페이지토큰`이 존재하지 않거나 중복이면 거부.
- Drive MIME `application/pdf`, 파일 크기 8MiB 이하, `%PDF-` 헤더 검증.
- 파일 전체/다른 문서 요청·Drive 공유 권한 변경·미승인 서버 원문 요청을 허용하지 않음.
- 인증된 사용자에게만 이 API 원문을 제공하므로, Apps Script 공개 배포의 누구나 호출 가능 여부와 관계없이 서버 라우트에서 ACTIVE/HMAC 검증 필수.

## Frontend 동작/안전

- 서버 health가 `referencePdfContentReady === true`인 경우에만 새 API를 사용합니다.
- 사용자가 별도 Drive OAuth 권한을 승인하지 않아도 인증된 ACTIVE 기기에서는 고선명 PDF가 표시됩니다.
- 기존 원본 이미지가 먼저 뜨고, 서버 원본 PDF.js 첫 프레임이 준비되면 같은 뷰어의 Canvas로 교체합니다.
- 확대(+/−/제스처), 가로 맞춤, 기존 주석 좌표·저장키는 변경하지 않습니다.
- 서명 인증 또는 서버 읽기 실패 시 이미지 미리보기를 유지하고 다음 페이지 자동 재시도를 중지합니다.
- 미지원 서버는 기존 OAuth 수동 '고화질' 버튼 경로를 유지합니다. 고화질 실패가 계속되면 원인을 추적해야 하며 정상 동작을 보장하지 않습니다.

## 단계별 검수

1. CI의 PDF 원본/첨부 테스트, signed GET 계약 테스트, Chrome/WebKit 화면 테스트 통과 확인.
2. 스테이징 Apps Script에 새 함수와 보안 라우트/health flag 반영.
3. 실제 MG:187 원본을 `ACTIVE` 기기에서 열고 100%/275%에서 Adobe Reader와 비교.
4. PENDING/REVOKED 기기에서 signed GET 직접 호출이 거부되는지 확인.
5. 서브노트/교재/보강/개정 각 1페이지, 페이지 전환과 S Pen 주석 및 스마트폰 제스처를 표본 검증.
6. 그 후 운영 Apps Script 새 배포 및 GitHub Pages 프런트엔드 병합을 확정합니다.

> **주의:** 기존 Apps Script의 전체 `Code.gs`를 오래된 백업으로 교체하지 마세요. 새 함수만 추가하고 현재 운영 보안 경로에 연결해야 합니다.
