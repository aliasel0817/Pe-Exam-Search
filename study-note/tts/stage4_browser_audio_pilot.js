'use strict';
/*
 * Study Note Stage-4 authenticated MP3 browser pilot.
 * Isolated: no study-note/ main app, Sheets, PDF, writes or TTS synthesis.
 * Google ID token lives ONLY in this JavaScript closure, never logs or storage.
 * Does not run until published on the already-approved GitHub Pages origin.
 */
(function (root) {
  const ORIGIN = 'https://aliasel0817.github.io';
  const CLIENT_ID = '1054197140509-60r8da165v63qghfn6558o5d48crl02g.apps.googleusercontent.com';
  const GATEWAY = 'https://study-tts-audio-gateway-hgli3gua6q-uc.a.run.app';
  const BUCKET = 'study-note-tts-audio-558407087449';
  const VOICE = 'ko-KR-Chirp3-HD-Aoede';
  const ROOT = 'study-note/tts/audio/';
  const PILOTS = Object.freeze([
    { topic:'T0001', field:'concept', label:'T0001 · 개념', parts:1 },
    { topic:'T2176', field:'components', label:'T2176 · 기술요소', parts:2 },
    { topic:'T2354', field:'components', label:'T2354 · 기술요소', parts:4 }
  ]);
  const allowedAudio = new RegExp('^' + VOICE + '/T[0-9]{4,6}/(?:concept|components)-[a-f0-9]{12}(?:-p[0-9]{2})?\\.mp3$');
  const entryKey = p => p.topic + ':' + p.field + ':' + VOICE;

  function validateManifest(index) {
    if (!index || index.schemaVersion !== 1 || !index.entries ||
        Array.isArray(index.entries) || typeof index.entries !== 'object') {
      throw new Error('GCS 음성 목록 형식 오류');
    }
    if (Object.keys(index.entries).length !== PILOTS.length) {
      throw new Error('이번 검증은 승인된 음성 3개 항목만 허용합니다.');
    }
    const rows = new Map();
    const seen = new Set();
    for (const pilot of PILOTS) {
      const entry = index.entries[entryKey(pilot)];
      if (!entry || !/^[a-f0-9]{64}$/.test(String(entry.sha256 || ''))) {
        throw new Error('검증된 음성 항목 누락: ' + pilot.label);
      }
      const files = Array.isArray(entry.files) ? entry.files : [entry.file];
      if (files.length !== pilot.parts) {
        throw new Error('승인 범위를 벗어난 분할 MP3: ' + pilot.label);
      }
      for (const [i, file] of files.entries()) {
        if (typeof file !== 'string' || !allowedAudio.test(file) ||
            !file.startsWith(VOICE + '/' + pilot.topic + '/' + pilot.field + '-') ||
            (pilot.parts > 1 && !file.endsWith('-p' + String(i+1).padStart(2,'0') + '.mp3')) ||
            seen.has(file)) {
          throw new Error('음성 경로 또는 분할 순서 오류: ' + pilot.label);
        }
        seen.add(file);
      }
      rows.set(entryKey(pilot), files);
    }
    if (seen.size !== 7) throw new Error('승인된 MP3 7개 구성이 올바르지 않습니다.');
    return rows;
  }

  function verifySignedUrl(raw, file) {
    let url;
    try { url = new URL(raw); }
    catch (_) { throw new Error('서명 URL 형식 오류'); }
    const pathStyle = url.hostname === 'storage.googleapis.com' &&
      url.pathname === '/' + BUCKET + '/' + ROOT + file;
    const virtualStyle = url.hostname === BUCKET + '.storage.googleapis.com' &&
      url.pathname === '/' + ROOT + file;
    const expires = url.searchParams.get('X-Goog-Expires') || '';
    if (url.protocol !== 'https:' || url.port || url.username || url.password ||
        url.hash || !(pathStyle || virtualStyle) ||
        !/^[a-fA-F0-9]+$/.test(url.searchParams.get('X-Goog-Signature') || '') ||
        !/^[0-9]{1,3}$/.test(expires) ||
        Number(expires) < 1 || Number(expires) > 300) {
      throw new Error('승인된 GCS MP3 서명 주소가 아닙니다.');
    }
    return url.href;
  }

  async function fetchManifest(token, request) {
    if (typeof token !== 'string' || token.length < 80 || token.length > 6000) {
      throw new Error('Google ID 토큰이 없습니다.');
    }
    const response = await request(GATEWAY + '/v1/manifest', {
      method:'GET', mode:'cors', credentials:'omit', cache:'no-store',
      headers:{Authorization:'Bearer ' + token}
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('Google 계정 인증 또는 권한이 거절되었습니다(HTTP ' + response.status + ').');
    }
    if (!response.ok) throw new Error('비공개 MP3 목록 응답 HTTP ' + response.status);
    return validateManifest(await response.json());
  }

  function init(doc, origin, gis, request = (...args) => fetch(...args)) {
    const status = doc.getElementById('pilotStatus');
    const login = doc.getElementById('pilotLogin');
    const media = doc.getElementById('pilotAudio');
    const stop = doc.getElementById('pilotStop');
    const buttons = Array.from(doc.querySelectorAll('[data-pilot]'));
    let token = null;
    let files = null;
    let active = null;
    let sequence = 0;
    let objectUrl = null;
    const show = message => { status.textContent = message; };
    const setEnabled = enabled => {
      for (const button of buttons) button.disabled = !enabled;
    };
    function halt(message) {
      sequence++;
      active?.abort();
      active = null;
      media.onended = null;
      media.onerror = null;
      media.pause();
      media.removeAttribute('src');
      media.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      stop.disabled = true;
      setEnabled(!!token && !!files);
      show(message || '중지되었습니다.');
    }
    async function playPilot(pilot) {
      if (!token || !files) { show('먼저 Google 계정으로 로그인해 주세요.'); return; }
      const relpaths = files.get(entryKey(pilot));
      if (!relpaths) { show('해당 항목은 아직 준비되지 않았습니다.'); return; }
      halt('재생 준비 중...');
      const attempt = ++sequence;
      const controller = new AbortController();
      active = controller;
      setEnabled(false);
      stop.disabled = false;
      async function playPart(part) {
        if (attempt !== sequence) return;
        if (part === relpaths.length) {
          halt(pilot.label + ' · ' + relpaths.length + '개 MP3 재생 완료');
          return;
        }
        const relpath = relpaths[part];
        try {
          show(pilot.label + ' · ' + (part+1) + '/' + relpaths.length + ' 파일 확인 중...');
          const reply = await request(GATEWAY + '/v1/audio-url?file=' + encodeURIComponent(relpath), {
            method:'GET', mode:'cors', credentials:'omit', cache:'no-store',
            signal:controller.signal, headers:{Authorization:'Bearer ' + token}
          });
          if (!reply.ok) throw new Error('MP3 서명 요청 HTTP ' + reply.status);
          const signed = verifySignedUrl((await reply.json()).url, relpath);
          const response = await request(signed, {
            method:'GET', mode:'cors', credentials:'omit', cache:'no-store',
            signal:controller.signal
          });
          if (!response.ok) throw new Error('비공개 MP3 다운로드 HTTP ' + response.status);
          const blob = await response.blob();
          if (blob.size < 100 || (blob.type && !/audio|octet-stream/i.test(blob.type))) {
            throw new Error('MP3 데이터 형식 오류');
          }
          if (attempt !== sequence) return;
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = URL.createObjectURL(blob);
          media.src = objectUrl;
          media.onended = () => { void playPart(part+1); };
          media.onerror = () => halt('MP3 재생 오류가 발생했습니다.');
          show(pilot.label + ' · ' + (part+1) + '/' + relpaths.length + ' 재생 중');
          try { await media.play(); }
          catch (_) { show('음성 파일 준비 완료. 브라우저 재생 버튼을 직접 눌러 주세요.'); }
        } catch (err) {
          if (attempt !== sequence) return;
          halt('검증 중단: ' + (err?.message || '알 수 없는 오류'));
        }
      }
      await playPart(0);
    }
    setEnabled(false);
    stop.disabled = true;
    stop.addEventListener('click', () => halt('사용자가 재생을 중지했습니다.'));
    for (const button of buttons) {
      const pilot = PILOTS.find(p => entryKey(p) === button.dataset.pilot);
      button.disabled = true;
      button.addEventListener('click', () => {
        if (pilot) void playPilot(pilot);
      });
    }
    if (origin !== ORIGIN) {
      show('이 독립 시험 화면은 승인된 GitHub Pages 출처에서만 실행할 수 있습니다. 개발 브랜치만으로는 실행되지 않습니다.');
      return;
    }
    if (!gis?.initialize || !gis?.renderButton) {
      show('Google 로그인 라이브러리를 불러오지 못했습니다.');
      return;
    }
    gis.initialize({
      client_id:CLIENT_ID, auto_select:false,
      callback:async response => {
        halt('Google 로그인 확인 중...');
        token = null;
        files = null;
        try {
          const newToken = response?.credential;
          const approvedFiles = await fetchManifest(newToken, request);
          token = newToken;
          files = approvedFiles;
          setEnabled(true);
          show('인증된 MP3 목록 확인 완료(HTTP 200) · 3개 항목 / MP3 7개. 선택한 항목만 다운로드합니다.');
        } catch (err) {
          setEnabled(false);
          show('검증 중단: ' + (err?.message || '로그인 오류'));
        }
      }
    });
    gis.renderButton(login, {type:'standard',theme:'outline',size:'large',text:'signin_with'});
    show('Google 계정 로그인 후 아래 음성 항목 중 하나를 선택해 주세요.');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {ORIGIN, GATEWAY, BUCKET, VOICE, PILOTS, entryKey,
      validateManifest, verifySignedUrl, fetchManifest, init};
  } else {
    // Development-only injection into the existing login smoke page can call
    // this directly, without publishing or changing the live GitHub Pages repo.
    root.peStudyNoteStage4Pilot = Object.freeze({init, validateManifest, verifySignedUrl});
    // Only the standalone pilot.html auto-initializes. When this script
    // is injected into the auth smoke page, the launcher explicitly calls
    // init ONCE after loading. Double-init would duplicate GIS callbacks.
    const standalone = root.location?.pathname?.endsWith('/stage4_browser_audio_pilot.html');
    if (standalone && root.document?.readyState === 'complete') {
      init(root.document, root.location.origin, root.google?.accounts?.id);
    } else if (standalone) {
      root.addEventListener('load', () => init(root.document, root.location.origin,
        root.google?.accounts?.id), {once:true});
    }
  }
})(typeof window === 'undefined' ? {} : window);
