'use strict';
/*
 * Development-only one-time browser launcher for Study Note TTS.
 * Injects the approved 7-MP3 test panel into the EXISTING login smoke page
 * IN MEMORY; no GitHub main, Apps Script, Cloud Run, or Google Sheets changes.
 * The test script has a fixed SHA-384 Subresource Integrity pin.
 *
 * Execute this JS only while viewing the approved GitHub Pages auth test
 * page. It is deliberately inert everywhere else.
 */
(() => {
  const VALID_ORIGIN = 'https://aliasel0817.github.io';
  const VALID_PATH = '/Pe-Exam-Search/tts-auth-check.html';
  const ID = 'study-tts-stage4-pilot';
  const sourceTag = document.currentScript;
  if (location.origin !== VALID_ORIGIN || location.pathname !== VALID_PATH) {
    console.warn('Stage4 TTS pilot: not an approved smoke-test URL.');
    return;
  }
  const previous = document.getElementById(ID);
  if (previous) {
    previous.scrollIntoView({block:'center',behavior:'smooth'});
    return;
  }
  const mount = document.querySelector('main');
  if (!mount || !sourceTag || !sourceTag.src) {
    console.warn('Stage4 TTS pilot: required smoke-page elements absent.');
    return;
  }
  const box = document.createElement('section');
  box.id = ID;
  const style = document.createElement('style');
  style.textContent = [
    '#'+ID+'{margin:28px 0;padding:16px;border:2px solid #6488bd;border-radius:12px;}',
    '#'+ID+' h2{font-size:1.15rem;margin:0 0 10px;}',
    '#'+ID+' button{display:inline-block;margin:5px 5px 5px 0;padding:10px 13px;',
      'border:1px solid #8888;border-radius:9px;background:ButtonFace;color:ButtonText;cursor:pointer;}',
    '#'+ID+' button:disabled{opacity:.5;cursor:default;}',
    '#'+ID+' #pilotStatus{padding:12px;border:1px solid #8886;border-radius:9px;}',
    '#'+ID+' #pilotAudio{display:block;width:100%;margin:14px 0;}',
    '#'+ID+' .pilot-note{opacity:.83;font-size:.9rem;line-height:1.55;}'
  ].join('');
  box.innerHTML = `
    <h2>Aoede 비공개 MP3 7개 — 격리 재생 검증</h2>
    <p class="pilot-note">기존 페이지에 임시로 표시한 시험 화면입니다.
    비공개 인증 조회·서명 URL·음성 다운로드(소액 클라우드 비용 가능)만 시험합니다.
    새 합성·GCS 업로드·Cloud Run 배포·운영 앱 변경은 없습니다.</p>
    <div id="pilotLogin" aria-label="Google 계정 로그인"></div>
    <p id="pilotStatus" role="status" aria-live="polite">재생기를 준비하고 있습니다.</p>
    <div aria-label="승인된 MP3 항목">
    <button type="button" disabled data-pilot="T0001:concept:ko-KR-Chirp3-HD-Aoede">T0001 · 개념 (1개)</button>
    <button type="button" disabled data-pilot="T2176:components:ko-KR-Chirp3-HD-Aoede">T2176 · 기술요소 (2개)</button>
    <button type="button" disabled data-pilot="T2354:components:ko-KR-Chirp3-HD-Aoede">T2354 · 기술요소 (4개)</button>
    </div>
    <audio id="pilotAudio" controls preload="none" playsinline></audio>
    <button id="pilotStop" type="button" disabled>■ 중지</button>
    <button id="pilotExit" type="button">시험 종료 · 원래 화면으로</button>
    <p class="pilot-note">토픽명 MP3는 아직 없으며 3개 본문 항목만 테스트합니다.
    로그인 토큰과 서명 URL은 화면·로그·로컬 저장소에 보관하지 않습니다.
    Google 로그인 버튼을 누른 뒤 음성 항목을 선택하세요.
    자동재생이 차단되면 오디오 플레이어의 재생 버튼을 한 번 누르세요.</p>
  `;
  document.head.appendChild(style);
  mount.appendChild(box);
  box.querySelector('#pilotExit').addEventListener('click',()=>location.reload());
  box.scrollIntoView({block:'center',behavior:'smooth'});

  // Reuse the exact same pinned development source revision via jsDelivr.
  // SRI blocks a changed or swapped script, including a compromised CDN.
  const js = document.createElement('script');
  js.src = new URL('./stage4_browser_audio_pilot.js', sourceTag.src).href;
  js.integrity = 'sha384-aJQQUfvvwH4xWo8wk161Ny1ai6vxVRqoCzpD/YtupM4YAfoFvW6u7gMQhiU84Q94';
  js.crossOrigin = 'anonymous';
  js.referrerPolicy = 'no-referrer';
  js.onload = () => {
    const pilot = window.peStudyNoteStage4Pilot;
    if (typeof pilot?.init !== 'function') {
      box.querySelector('#pilotStatus').textContent =
        '독립 재생기 함수가 없습니다. 새로고침 후 개발 브랜치 상태를 확인하세요.';
      return;
    }
    pilot.init(document, location.origin, window.google?.accounts?.id);
  };
  js.onerror = () => {
    box.querySelector('#pilotStatus').textContent =
      '검증된 JS 파일을 불러오지 못했습니다. CDN 접근 또는 SHA-384 일치 여부를 확인하세요.';
  };
  document.head.appendChild(js);
})();
