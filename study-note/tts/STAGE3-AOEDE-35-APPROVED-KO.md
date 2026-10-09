# 3단계 승인형 Aoede 파일럿 5건 — 실행 및 복구 지침 (2026-10-09)

## 승인 범위
- 사용자가 실제 학습 토픽 `T0001,T1961,T2238,T2176,T2354`, `ko-KR-Chirp3-HD-Aoede`, 일곱 필드 총 **최대 35 API POST / 4,577자(8,674 UTF-8바이트)**를 추가 합성 승인. 합성 API 비용 발생 가능성을 이해함.
- **승인하지 않은 작업**: GCS 업로드, Cloud Run 리비전 재배포, GitHub `main` 수정, Sheet/Apps Script 수정, 기타 토픽/음성 생성.
- 실제 합성의 프로젝트: `study-note-tts`. 월별 사용량 알림은 전체 청구 한도가 아님.
- 입력 파일: Cloud Shell 홈 디렉터리 `~/study-note-tts-real-5.json`. 정확한 입력 SHA-256을 한정해 다른 데이터로의 승인 전용을 방지.
- 본 실행기 `run_approved_stage3_aoede.py`는 기존 `cloud-project.json`을 건드리지 않고, **일회성 CLI 승인 옵션 2개 + 실행 플래그 1개**를 검증. 기존 전역 3개 승인 잠금값은 모두 `false` 유지.

## Cloud Shell 단계

### 1) 개발 브랜치 최신화 / Cloud Shell 프로젝트 지정 (무료)
```bash
cd "$HOME/pe-tts-dev" &&
git switch feature/ai-natural-tts-20261009 &&
git pull --ff-only &&
gcloud config set project study-note-tts &&
gcloud config get-value project
```
마지막 출력에 `study-note-tts`가 있어야 함. `git pull`이 로컬 변경 때문에 실패하면 어떤 파일도 강제 삭제/reset하지 말고 중단.

### 2) 오프라인 단위 테스트 + 승인 범위 DRY RUN (Google TTS 호출 없음)
```bash
cd "$HOME/pe-tts-dev" &&
python3 -m unittest discover -s study-note/tts -p "test_*.py" -q &&
python3 study-note/tts/run_approved_stage3_aoede.py
```
예상: 기존 90 + 신규 9 = **99개 OK**. 그다음 `PREFLIGHT PASSED`, `Requests: 35 | Characters: 4577 | UTF-8 bytes: 8674`, `DRY RUN - NO API CALLS`.

### 3) 실제 합성 1회 실행 — 비용 발생 가능, 사용자 승인 범위만
```bash
cd "$HOME/pe-tts-dev" &&
python3 study-note/tts/run_approved_stage3_aoede.py \
  --execute --accept-possible-charges --approve-exact-35x4577
```
이 단계는 **한 번만 실행**. 성공 시 `STAGE3 AOEDE PILOT COMPLETE`, `API attempts: 35`, `Characters attempted: 4577`, `MP3 files: 35` 표시.

### 4) Windows PC로 ZIP 다운로드
Cloud Shell 터미널 상단 **점 세 개(⋮) → Download file/파일 다운로드**에 입력:
```text
/home/aliasel840817/study-tts-stage3-aoede-5.zip
```
Windows `다운로드` 폴더에서 ZIP의 **모두 압축 풀기**를 사용. ZIP은 토픽별 5폴더(`T0001` 등), 각 7개 MP3만 포함.

## 산출물 및 실패 처리
- 로컬 MP3와 업로드 호환 `index.json`: `~/study-tts-stage3-aoede-5/`.
- 요청 직전 기록을 영속 저장하는 `attempts.json`과 `local-charge-guard.json`도 위 폴더. 토픽명·본문 원문과 OAuth 토큰은 기록하지 않음.
- ZIP: `~/study-tts-stage3-aoede-5.zip`, 35 MP3만 포함.
- **중간 오류·중단 발생 시 절대로 재실행·폴더 삭제·압축 재생성하지 말 것.** API 요청이 이미 일부 청구됐을 수 있음. `attempts.json`의 `attempted` / `saved` 상태를 보고 사용자와 남은 승인을 별도 확인한 후 복구 결정.
- 실제 Cloud TTS API 요청 실패나 과금 상태는 이 스크립트만으로 확정할 수 없음. 요청 기록은 보수적으로 POST 직전에 반영.
- 테스트/실행에서 공개 GitHub에 개인 데이터 업로드하지 않음. 이 작업은 GCS/Cloud Run/Apps Script/Google Sheets/운영 `main`에 쓰기 동작을 하지 않음.
