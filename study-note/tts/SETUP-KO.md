# 학습노트 AI 자연음성 TTS — 안전한 시험 절차

> **운영 v4.6.3(main)은 변경하지 않았습니다.** 현재 개발 브랜치에서 UI/MP3 재생기와 생성 도구만 준비된 상태이며, 실제 AI 음성 MP3는 아직 없습니다.

## 1. 대상 요구사항
- 토픽명은 항상 먼저 읽음
- 선택 가능: 개념 → 등장배경 → 필요성 → 특징 → 기술요소/구성요소 → 키워드
- 연속/단일 읽기, 자동 다음 토픽 이동, 읽는 항목 강조, 반복/회상 간격/속도
- AI 자연음성 MP3만 재생 (브라우저 내장 TTS 사용 안 함)
- 같은 원문/발음 사전/음성 모델로 생성한 MP3를 반복 재사용
- 기존 학습정보, 첨부자료 및 필기 동기화 저장소 변경 없음

## 2. 먼저 비용이 없는 오프라인 검증

1. GitHub 개발 브랜치 **feature/ai-natural-tts-20261009**에서 ZIP 다운로드 후 압축을 풉니다.
2. 테스트용 실제 토픽 3건 JSON을 로컬에 준비합니다. 운영 시트는 조회만 하였고 변경하지 않았습니다.
3. Windows 명령 프롬프트 또는 PowerShell에서 저장소 최상위 폴더로 이동한 다음 실행합니다.

   py -m http.server 8765

4. 브라우저에서 **http://localhost:8765/study-note/tts/preview.html** 을 엽니다.
5. 토픽 JSON을 선택합니다. 화면과 설정/토픽 이동/항목 선택을 확인합니다.
6. MP3가 아직 없으므로 듣기 버튼을 누르면 '미생성 AI MP3' 안내가 뜹니다. **정상입니다.**
7. 음성 생성 전 예상 요청량을 확인하려면 아래 명령을 실행합니다.

   py study-note/tts/generate_mp3.py --input topic-sample.json --max-topics 3

기본 명령은 DRY RUN이며 네트워크/API 호출이 없습니다. 3개 토픽과 7개 항목의 음성 생성 요구량을 로컬에서 계산합니다.

Python이 없다면 개발 코드의 문법 및 자동 테스트 결과는 GitHub Actions의 'TTS development checks' 에서 확인할 수 있습니다.

## 3. 실제 자연음성 MP3 생성 시 추가로 필요한 사용자 작업

Google Cloud 프로젝트는 사용자가 소유/승인해야 합니다. 결제 계정을 연결해야 할 수 있고, 실제 요청은 무료 제공량을 넘기면 요금이 발생할 수 있습니다.

- Google Cloud에서 개인 테스트용 프로젝트를 만듭니다.
- Cloud Text-to-Speech API를 사용하도록 설정합니다.
- 현재 Google Cloud 요금표를 확인하고 프로젝트의 사용량, 예산 알림, 서비스 할당량을 확인합니다.
- **Cloud Billing의 일반 예산 알림은 과금을 자동 중지하지 않습니다.** Cloud TTS는 2026-10 공식 spend-cap 적용 서비스 목록에 표시되지 않으므로, 별도 완전 무과금 보증은 할 수 없습니다.
- Google Cloud CLI를 설치한 후 자신의 컴퓨터에서 'gcloud auth login'을 수행합니다.
- API 인증키/토큰/서비스 계정 JSON을 GitHub·채팅·음성 샘플 JSON에 저장하지 않습니다.

**실제 유료 가능 API 실행은 아래 두 플래그를 함께 넣었을 때만 가능합니다.**

   py study-note/tts/generate_mp3.py --input topic-sample.json --project PROJECT_ID --max-topics 3 --execute --accept-possible-charges

이는 **설명용 명령**이며, 사용자가 결제 설정·사용량을 확인하고 비용 가능성을 승인하기 전에는 실행하지 않습니다.

생성 도구는 한 실행당 최대 50개 토픽, 최대 200개 TTS 요청, 월 50,000 UTF-8 바이트의 로컬 안전 한도를 둡니다. API 요청 직전 사용량 장부를 먼저 반영합니다. 한도가 초과되면 새 요청은 차단합니다. **이 한도는 한 PC·한 장부 기준이며, Google Cloud 프로젝트 전체의 청구를 막는 절대적 보증은 아닙니다.**

## 4. 생성한 MP3로 재생 시험

- 생성한 음성 파일은 기본값으로 study-note/tts/audio/ 아래에 보관됩니다.
- audio/index.json에 저장된 원문 해시와 현재 JSON 원문이 일치하는 MP3만 재생합니다.
- 매우 긴 항목은 5,000바이트 API 한도를 피하려고 여러 MP3로 나누어 기록하고 연속 재생합니다.
- 선택한 항목에 MP3가 없으면 재생은 멈추며 브라우저 TTS로 대체하지 않습니다.
- 같은 이름의 MP3가 아니라 **원문·실제로 읽는 텍스트의 해시**가 달라지면 새 파일 경로를 사용하므로, 전문용어 발음을 바꿔도 구 캐시가 잘못 사용되지 않습니다.

**출판 주의:** GitHub Pages에 MP3 파일을 커밋하면 공개 파일이 됩니다. 개인 학습 데이터/상용 음성을 공용 저장소에 올리기 전에 공개 허용 여부 및 음성 라이선스를 별도로 확인해야 합니다. 대규모 MP3 전체를 GitHub Pages에 보관하지 않는 것이 권장됩니다.

## 5. 다음 연동 작업 전 확인사항
- 실제 Cloud 프로젝트와 사용자 승인
- 여성 Aoede/Kore 및 남성 Charon 샘플 청취 평가
- 전체 토픽 공통 MP3를 보관할 **비공개 저장소** 선정
- 기기 인증을 사용하는 서버 측 MP3 생성·저장·검색 요청 통합
- iPhone(화면 잠금/백그라운드), Galaxy Tab, Windows PC 실기기 검증
- 성공 후에만 운영 main 배포

## 6. 복원 지점
- 운영 기준 커밋: d062ced02be599d93487c6ba1785b65af1edc071
- 보호된 복원 브랜치: backup/v4.6.3-before-ai-tts-20261009
- 개발 브랜치: feature/ai-natural-tts-20261009

GitHub에서 개발 브랜치를 폐기하면 운영 브랜치에는 영향이 없습니다. 아직 Apps Script·Google Sheets·필기 데이터에 변경을 가하지 않았습니다.

참고:
- https://cloud.google.com/text-to-speech/pricing
- https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
- https://docs.cloud.google.com/text-to-speech/quotas
- https://docs.cloud.google.com/billing/docs/how-to/budgets
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
