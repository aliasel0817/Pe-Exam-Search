/* Study Note AI TTS controller v1.0.
   No browser speechSynthesis, no credential, no paid API call.
   Audio must be generated externally and approved for its configured storage.
*/
(function () {
  'use strict';
  const FIELDS = [
    { key: 'topic', prop: 'topicName', label: '토픽명', fixed: true },
    { key: 'concept', prop: 'concept', label: '개념' },
    { key: 'background', prop: 'background', label: '등장배경' },
    { key: 'necessity', prop: 'necessity', label: '필요성' },
    { key: 'features', prop: 'features', label: '특징' },
    { key: 'components', prop: 'technicalComponents', label: '기술요소/구성요소' },
    { key: 'keywords', prop: 'keywords', label: '키워드' }
  ];
  const VOICES = [
    { id: 'ko-KR-Chirp3-HD-Aoede', label: '여성 · Aoede' },
    { id: 'ko-KR-Chirp3-HD-Kore', label: '여성 · Kore' },
    { id: 'ko-KR-Chirp3-HD-Charon', label: '남성 · Charon' }
  ];
  const SETTINGS_KEY = 'peStudyNote.aiTts.options.v1';
  const CACHE_NAME = 'pe-study-note-ai-tts-mp3-v1';
  const PRIVATE_AUDIO_BUCKET = 'study-note-tts-audio-558407087449';
  const PRIVATE_AUDIO_PREFIX = 'study-note/tts/audio/';
  const MAX_CACHE_ITEMS = 120;
  const SCRIPT_DIR = new URL('./', document.currentScript?.src || new URL('./tts/', location.href)).href;
  const MANIFEST_URL = new URL('./audio/index.json', SCRIPT_DIR).href;
  const AUDIO_BASE_URL = new URL('./audio/', SCRIPT_DIR).href;
  const CLOUD_CONFIG_URL = new URL('./cloud-config.json', SCRIPT_DIR).href;
  const $ = id => document.getElementById(id);
  const clamp = (n, low, high) => Math.min(Math.max(n, low), high);
  const defaultSettings = () => ({
    voice: VOICES[0].id, rate: 1, mode: 'continuous', repeat: 1, gap: 3,
    fields: { concept: true, background: true, necessity: true,
      features: true, components: true, keywords: true }
  });
  const textOf = value => String(value == null ? '' : value).trim();
  const isStop = error => error && error.name === 'AbortError';
  function stopped() {
    const error = new Error('중지');
    error.name = 'AbortError';
    return error;
  }
  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }
  function validateSignedPrivateAudioUrl(raw, relativePath) {
    let signed;
    try { signed = new URL(raw); }
    catch (_) { throw new Error('검증되지 않은 Google Cloud MP3 주소입니다.'); }
    const pathStyle = signed.hostname === 'storage.googleapis.com' &&
      signed.pathname === '/' + PRIVATE_AUDIO_BUCKET + '/' + PRIVATE_AUDIO_PREFIX + relativePath;
    const virtualStyle = signed.hostname === PRIVATE_AUDIO_BUCKET + '.storage.googleapis.com' &&
      signed.pathname === '/' + PRIVATE_AUDIO_PREFIX + relativePath;
    const expiry = signed.searchParams.get('X-Goog-Expires') || '';
    if (signed.protocol !== 'https:' || signed.port || signed.username ||
        signed.password || signed.hash || !(pathStyle || virtualStyle) ||
        !/^[a-f0-9]+$/i.test(signed.searchParams.get('X-Goog-Signature') || '') ||
        !/^[0-9]{1,3}$/.test(expiry) || Number(expiry) < 1 || Number(expiry) > 300) {
      throw new Error('검증되지 않은 Google Cloud MP3 주소는 사용하지 않습니다.');
    }
    return signed.href;
  }
  function loadSettings() {
    const defaults = defaultSettings();
    try {
      const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (!v || typeof v !== 'object') return defaults;
      return {
        voice: VOICES.some(x => x.id === v.voice) ? v.voice : defaults.voice,
        rate: [0.85, 1, 1.15, 1.25].includes(Number(v.rate)) ? Number(v.rate) : 1,
        mode: v.mode === 'one' ? 'one' : 'continuous',
        repeat: v.repeat === 2 ? 2 : 1,
        gap: [0, 3, 5].includes(Number(v.gap)) ? Number(v.gap) : 3,
        fields: Object.fromEntries(FIELDS.slice(1).map(f => [f.key, v.fields?.[f.key] !== false]))
      };
    } catch (_) { return defaults; }
  }
  class StudyTts {
    constructor() {
      this.settings = loadSettings();
      this.playing = false;
      this.seq = 0;
      this.topicId = '';
      this.expectedTopic = '';
      this.cacheIndex = null;
      this.manifestPromise = null;
      this.storageConfig = null;
      this.storageConfigPromise = null;
      this.idToken = null;
      this.loginButtonRendered = false;
      this.activeAudio = new Audio();
      this.activeAudio.preload = 'auto';
      this.activeAudio.setAttribute('playsinline', '');
      this.cancelSegment = null;
      this.cancelGap = null;
      this.currentObjectUrl = null;
      this.highlighted = null;
      this.initUi();
    }
    initUi() {
      this.toggleBtn = $('ttsToggleBtn');
      this.settingsBtn = $('ttsSettingsBtn');
      this.settingsPanel = $('ttsSettingsPanel');
      this.statusNode = $('ttsStatus');
      if (!this.toggleBtn || !this.settingsBtn || !this.settingsPanel) return;
      this.toggleBtn.addEventListener('click', () => this.playing ? this.stop('음성 재생을 중지했습니다.') : this.start());
      this.settingsBtn.addEventListener('click', () => {
        const hidden = this.settingsPanel.classList.toggle('hidden');
        this.settingsBtn.setAttribute('aria-expanded', String(!hidden));
        if (!hidden) this.renderCloudLogin();
      });
      for (const name of ['voice','rate','mode','repeat','gap']) {
        const input = $('ttsOption-' + name);
        if (!input) continue;
        input.value = String(this.settings[name]);
        input.addEventListener('change', () => {
          const value = ['rate','repeat','gap'].includes(name) ? Number(input.value) : input.value;
          this.settings[name] = value;
          this.saveSettings();
          if (this.playing) this.stop('설정이 변경되어 재생을 중지했습니다.');
        });
      }
      for (const field of FIELDS.slice(1)) {
        const input = $('ttsField-' + field.key);
        if (!input) continue;
        input.checked = !!this.settings.fields[field.key];
        input.addEventListener('change', () => {
          this.settings.fields[field.key] = input.checked;
          this.saveSettings();
          if (this.playing) this.stop('읽기 항목이 변경되어 재생을 중지했습니다.');
        });
      }
      $('ttsSelectAll')?.addEventListener('click', () => this.selectFields(true));
      $('ttsSelectNone')?.addEventListener('click', () => this.selectFields(false));
      $('ttsExportBtn')?.addEventListener('click', () => this.exportSampleTopics());
      $('ttsCloudCheckBtn')?.addEventListener('click', () => this.checkCloudReady());
      $('ttsAvailabilityBtn')?.addEventListener('click', () => this.checkCurrentTopicAvailability());
      this.updateUI('AI MP3 음성 대기 중');
    }
    selectFields(checked) {
      for (const field of FIELDS.slice(1)) {
        this.settings.fields[field.key] = checked;
        const element = $('ttsField-' + field.key);
        if (element) element.checked = checked;
      }
      this.saveSettings();
      if (this.playing) this.stop('읽기 항목이 변경되어 재생을 중지했습니다.');
    }
    saveSettings() {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (_) {}
    }
    updateUI(message) {
      if (this.toggleBtn) {
        this.toggleBtn.textContent = this.playing ? '■ 중지' : '🔊 듣기';
        this.toggleBtn.classList.toggle('tts-playing', this.playing);
        this.toggleBtn.setAttribute('aria-pressed', String(this.playing));
        this.toggleBtn.setAttribute('aria-label', this.playing ? 'AI 음성 중지' : 'AI 음성 듣기');
      }
      if (this.statusNode && message) this.statusNode.textContent = message;
    }
    markField(key) {
      const map = { topic:'detailTitle', concept:'detailConcept', background:'detailBackground',
        necessity:'detailNecessity', features:'detailFeatures',
        components:'detailTechnicalComponents', keywords:'detailKeywords' };
      if (this.highlighted) this.highlighted.classList.remove('tts-reading-highlight');
      const target = $(map[key]);
      this.highlighted = key === 'topic' ? target : target?.closest('.study-card');
      if (this.highlighted) {
        this.highlighted.classList.add('tts-reading-highlight');
        if (key !== 'topic' && document.visibilityState !== 'hidden') {
          this.highlighted.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }
    clearMark() {
      if (this.highlighted) this.highlighted.classList.remove('tts-reading-highlight');
      this.highlighted = null;
    }
    onTopicChanged(id) {
      const auto = this.expectedTopic === id;
      this.expectedTopic = '';
      if (this.playing && !auto && this.topicId && id !== this.topicId) {
        this.stop('다른 토픽을 선택하여 재생을 중지했습니다.');
      }
    }
    onFilterChanged() {
      if (this.playing) this.stop('검색 또는 필터가 변경되어 재생을 중지했습니다.');
    }
    getBridge() { return window.peStudyNoteTtsBridge || null; }
    canNavigateSafely() {
      // Keep annotation and management workflows untouched while a viewer/modal is open.
      return ['imageViewerModal','mediaViewerModal','referencePdfViewerModal','manageModal']
        .every(id => { const element = $(id); return !element || element.classList.contains('hidden'); });
    }
    exportSampleTopics() {
      const bridge = this.getBridge();
      const current = bridge?.currentTopic?.();
      const ids = bridge?.filteredTopicIds?.() || [];
      const position = current ? ids.indexOf(current.topicId) : -1;
      if (position < 0) {
        this.updateUI('샘플을 내보내려면 먼저 토픽을 선택해 주세요.');
        return;
      }
      const fields = ['topicId','studyTarget','topicName','concept','background',
        'necessity','features','technicalComponents','keywords'];
      const topics = ids.slice(position).map(id => bridge.getTopicById(id))
        .filter(t => t && t.studyTarget === 'Y').slice(0, 3)
        .map(t => Object.fromEntries(fields.map(field => [field, String(t[field] ?? '')])));
      if (!topics.length) {
        this.updateUI('내보낼 학습대상 토픽이 없습니다.');
        return;
      }
      const content = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), topics }, null, 2);
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'study-note-tts-sample-' + topics[0].topicId + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.updateUI(topics.length + '개 토픽을 기기에 JSON으로 저장했습니다. 파일은 외부로 전송하지 않았습니다.');
    }
    async loadStorageConfig() {
      if (this.storageConfig) return this.storageConfig;
      if (this.storageConfigPromise) return this.storageConfigPromise;
      this.storageConfigPromise = (async () => {
        // Local preview is an explicitly separate page; production never silently loads GitHub MP3.
        if (window.PE_TTS_LOCAL_PREVIEW === true &&
            new URL(location.href).pathname.endsWith('/tts/preview.html')) {
          return { mode: 'local-preview' };
        }
        let response;
        try { response = await fetch(CLOUD_CONFIG_URL, { cache: 'no-store' }); }
        catch (_) { throw new Error('AI 음성 클라우드 설정을 불러오지 못했습니다.'); }
        if (!response.ok) throw new Error('AI 음성 클라우드 설정을 찾지 못했습니다.');
        const config = await response.json();
        if (!config || config.schemaVersion !== 1) throw new Error('AI 음성 설정 파일이 올바르지 않습니다.');
        if (config.mode === 'disabled') return {mode:'disabled'};
        if (config.mode !== 'gcs-private' || !config.gatewayUrl || !config.oauthClientId) {
          throw new Error('GCS 음성 연결 설정이 아직 완료되지 않았습니다.');
        }
        let url;
        try { url = new URL(config.gatewayUrl); }
        catch (_) { throw new Error('Cloud Run 주소 형식이 올바르지 않습니다.'); }
        if (url.protocol !== 'https:' || !url.hostname.endsWith('.run.app') ||
            url.pathname !== '/' || url.search || url.hash ||
            !/^[0-9a-zA-Z._-]+\.apps\.googleusercontent\.com$/.test(config.oauthClientId)) {
          throw new Error('Cloud Run 또는 Google OAuth 클라이언트 설정이 올바르지 않습니다.');
        }
        return {
          mode:'gcs-private', gatewayUrl:url.origin, oauthClientId:config.oauthClientId
        };
      })();
      try { this.storageConfig = await this.storageConfigPromise; return this.storageConfig; }
      finally { this.storageConfigPromise = null; }
    }
    async checkCloudReady() {
      const status = $('ttsCloudStatus');
      if (status) status.textContent = '연결 설정 점검 중...';
      try {
        // This check only reads the static configuration. No Cloud Run, GCS,
        // synthesis, signing or other potentially billable API is called.
        const config = await this.loadStorageConfig();
        let message;
        if (config.mode === 'disabled') {
          message = '아직 Google Cloud Storage를 연결하지 않았습니다. 현재 클라우드 API 호출과 요금 발생은 없습니다.';
        } else if (config.mode === 'local-preview') {
          message = '로컬 테스트 모드입니다. 저장된 MP3 파일만 확인하며 Google Cloud로 접속하지 않습니다.';
        } else if (this.idToken) {
          message = 'Cloud Storage 주소와 로그인 설정이 준비되었습니다. 실제 서버·MP3 통신은 아직 점검하지 않았습니다.';
        } else {
          message = 'Cloud Storage 주소가 등록되었습니다. Google 계정 로그인 후 재생 테스트가 필요합니다.';
        }
        if (status) status.textContent = message;
        return message;
      } catch (error) {
        const message = '설정 점검 실패: ' + (error?.message || '알 수 없는 오류');
        if (status) status.textContent = message;
        return message;
      }
    }
    async checkCurrentTopicAvailability() {
      // Read-only, explicitly user-initiated diagnostics. No audio downloads,
      // signing, generation, cache mutations, or PWA data writes.
      const target = $('ttsAvailabilityStatus');
      const show = message => {
        if (target) target.textContent = message;
        return message;
      };
      const topic = this.getBridge()?.currentTopic?.();
      if (!topic) return show('현재 토픽을 선택한 후 확인해 주세요.');
      if (topic.studyTarget !== 'Y') return show('학습대상 Y 토픽만 AI 음성 준비 상태를 확인할 수 있습니다.');
      const fields = FIELDS.filter(f => f.fixed || this.settings.fields[f.key]);
      // The topic name remains playable even with all six optional fields off.
      try {
        const config = await this.loadStorageConfig();
        if (config.mode === 'disabled') {
          return show('현재 PWA의 클라우드 음성 연결이 비활성화되어 있습니다. API 요청 없이 중단했습니다.');
        }
        if (config.mode === 'gcs-private' && !this.idToken) {
          return show('먼저 Google 음성 계정으로 로그인해 주세요. 비인증 조회는 실행하지 않았습니다.');
        }
        const index = await this.manifest();
        const requested = fields.filter(f => textOf(topic[f.prop]));
        const ready = [];
        const missing = [];
        const changed = [];
        const invalid = [];
        let parts = 0;
        for (const field of requested) {
          const entry = index.entries[this.segmentKey(topic.topicId, field.key)];
          if (!entry) {
            missing.push(field.label);
          } else if (entry.sha256 !== await sha256(textOf(topic[field.prop]))) {
            changed.push(field.label);
          } else {
            try {
              const files = await this.segmentUrls(topic, field);
              parts += files.length;
              ready.push(field.label);
            } catch (_) {
              invalid.push(field.label);
            }
          }
        }
        const skipped = fields.length - requested.length;
        let message = '현재 토픽 ' + topic.topicId + ' · 음성 목록/원문 일치 ' +
          ready.length + '/' + requested.length + '항목 (' + parts + '개 MP3).';
        if (missing.length) message += ' 미생성: ' + missing.join(', ') + '.';
        if (changed.length) message += ' 원문 변경: ' + changed.join(', ') + '.';
        if (invalid.length) message += ' 경로 검증 실패: ' + invalid.join(', ') + '.';
        if (skipped) message += ' 원문 없는 항목 ' + skipped + '개 제외.';
        if (requested.some(f => f.key === 'topic') && !ready.includes('토픽명')) {
          message += ' 토픽명 MP3가 없어 토픽명 선행 읽기는 아직 불가합니다.';
        } else if (!missing.length && !changed.length && !invalid.length) {
          message += ' 목록 검사는 통과했으며 실제 MP3 재생은 별도 검증이 필요합니다.';
        }
        return show(message);
      } catch (error) {
        return show('MP3 준비 상태 확인 실패: ' + (error?.message || '알 수 없는 오류'));
      }
    }
    async renderCloudLogin() {
      const status = $('ttsCloudStatus');
      const host = $('ttsCloudLogin');
      if (!host) return;
      try {
        const config = await this.loadStorageConfig();
        if (config.mode === 'local-preview') {
          if (status) status.textContent = '로컬 음성 테스트 모드 (Cloud 인증 없음)';
          return;
        }
        if (config.mode === 'disabled') {
          if (status) status.textContent = 'Cloud Storage 연결 전입니다. 운영 TTS는 비활성화 상태입니다.';
          return;
        }
        if (this.idToken) {
          if (status) status.textContent = 'Google 음성 계정 인증 완료 (이 탭에서만 유지)';
          return;
        }
        const gis = window.google?.accounts?.id;
        if (!gis) {
          if (status) status.textContent = 'Google 로그인 화면을 불러올 수 없습니다. 네트워크를 확인해 주세요.';
          return;
        }
        if (this.loginButtonRendered) return;
        gis.initialize({
          client_id:config.oauthClientId,
          callback: response => {
            if (!response || typeof response.credential !== 'string' || !response.credential) return;
            // A Google ID token is temporary and exists only in memory.
            this.idToken = response.credential;
            this.cacheIndex = null;
            this.loginButtonRendered = true;
            if (status) status.textContent = 'Google 음성 계정 인증 완료 (서버에서 계정 권한 재확인)';
            this.updateUI('Google 인증 완료. 스피커를 눌러 MP3를 재생해 주세요.');
          }
        });
        gis.renderButton(host, {type:'standard',size:'medium',theme:'outline',text:'signin_with'});
        this.loginButtonRendered = true;
        if (status) status.textContent = '비공개 MP3를 이용하려면 Google 계정으로 로그인해 주세요.';
      } catch (error) {
        if (status) status.textContent = error.message || '음성 인증 설정 오류';
      }
    }
    async authenticatedGatewayFetch(path) {
      const config = await this.loadStorageConfig();
      if (config.mode !== 'gcs-private') throw new Error('비공개 GCS 연결이 아닙니다.');
      if (!this.idToken) throw new Error('음성 설정에서 Google 계정으로 로그인해 주세요.');
      const response = await fetch(config.gatewayUrl + path, {
        method:'GET', mode:'cors', cache:'no-store', credentials:'omit',
        headers:{Authorization:'Bearer ' + this.idToken}
      });
      if (response.status === 401 || response.status === 403) {
        this.idToken = null;
        this.loginButtonRendered = false;
        const host = $('ttsCloudLogin');
        if (host) host.textContent = '';
        throw new Error('Google 음성 계정 인증이 만료되었거나 접근 권한이 없습니다. 다시 로그인해 주세요.');
      }
      if (!response.ok) throw new Error('비공개 음성 서버 오류: HTTP ' + response.status);
      return response;
    }
    async manifest() {
      if (this.cacheIndex) return this.cacheIndex;
      if (this.manifestPromise) return this.manifestPromise;
      this.manifestPromise = (async () => {
        const config = await this.loadStorageConfig();
        if (config.mode === 'disabled') {
          throw new Error('Google Cloud Storage 연결 전입니다. 현재는 무료·안전 테스트 단계입니다.');
        }
        let response = null;
        if (config.mode === 'gcs-private') {
          response = await this.authenticatedGatewayFetch('/v1/manifest');
        } else {
          const url = new URL(MANIFEST_URL, location.href);
          try {
            response = await fetch(url.href, { cache: 'no-store' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            if ('caches' in window) {
              try { await (await caches.open(CACHE_NAME)).put(url.href, response.clone()); } catch (_) {}
            }
          } catch (_) {
            if ('caches' in window) {
              try { response = await (await caches.open(CACHE_NAME)).match(url.href); } catch (_) {}
            }
            if (!response) throw new Error('로컬 음성 목록을 찾지 못했습니다.');
          }
        }
        const index = await response.json();
        if (index.schemaVersion !== 1 || !index.entries || typeof index.entries !== 'object' ||
            Array.isArray(index.entries)) {
          throw new Error('AI 음성 목록 파일 형식이 올바르지 않습니다.');
        }
        this.cacheIndex = index;
        return index;
      })();
      try { return await this.manifestPromise; } finally { this.manifestPromise = null; }
    }
    segmentKey(topicId, field) { return topicId + ':' + field + ':' + this.settings.voice; }
    async segmentUrls(topic, field) {
      const index = await this.manifest();
      const key = this.segmentKey(topic.topicId, field.key);
      const entry = index.entries[key];
      if (!entry || !entry.sha256) {
        throw new Error('미생성 AI MP3: ' + topic.topicId + ' / ' + field.label +
          '. 음성 생성 전에는 무료 API도 자동 호출하지 않습니다.');
      }
      const original = textOf(topic[field.prop]);
      const hash = await sha256(original);
      if (entry.sha256 !== hash) {
        throw new Error('학습 내용이 수정되어 MP3 재생성이 필요합니다: ' + topic.topicId + ' / ' + field.label);
      }
      const paths = Array.isArray(entry.files) ? entry.files : [entry.file];
      if (!paths.length || paths.length > 100 || new Set(paths).size !== paths.length) {
        throw new Error('음성 파일 목록이 올바르지 않습니다.');
      }
      return paths.map((path, part) => {
        const prefix = this.settings.voice + '/' + topic.topicId + '/' + field.key + '-';
        if (typeof path !== 'string' ||
            !/^[A-Za-z0-9_-]+\/T[0-9]+\/[a-z]+-[a-f0-9]{12}(?:-p[0-9]{2})?\.mp3$/.test(path) ||
            !path.startsWith(prefix) ||
            (paths.length > 1 && !path.endsWith('-p' + String(part+1).padStart(2, '0') + '.mp3'))) {
          throw new Error('음성 파일 경로 또는 분할 순서가 올바르지 않습니다.');
        }
        return this.storageConfig?.mode === 'gcs-private' ? path : new URL(path, AUDIO_BASE_URL).href;
      });
    }
    async fetchAudio(urlOrPath, seq) {
      const config = await this.loadStorageConfig();
      const privateMode = config.mode === 'gcs-private';
      const cacheKey = privateMode
        ? new URL('./cached-mp3/' + urlOrPath, SCRIPT_DIR).href
        : urlOrPath;
      let response = null;
      let cache = null;
      if ('caches' in window) {
        try {
          cache = await caches.open(CACHE_NAME);
          response = await cache.match(cacheKey);
        } catch (_) {}
      }
      if (!response) {
        let downloadUrl = urlOrPath;
        if (privateMode) {
          const signedResponse = await this.authenticatedGatewayFetch(
            '/v1/audio-url?file=' + encodeURIComponent(urlOrPath));
          const ticket = await signedResponse.json();
          downloadUrl = validateSignedPrivateAudioUrl(ticket.url, urlOrPath);downloadUrl = signedUrl.href;
        }
        response = await fetch(downloadUrl, {
          mode:privateMode ? 'cors' : 'same-origin',
          cache:privateMode ? 'no-store' : 'force-cache',
          credentials:'omit'
        });
        if (!response.ok) {
          throw new Error('AI MP3 다운로드에 실패했습니다: HTTP ' + response.status);
        }
        if (cache) {
          try {
            const keys = await cache.keys();
            const audioKeys = keys.filter(x => x.url.endsWith('.mp3'));
            if (audioKeys.length >= MAX_CACHE_ITEMS) await cache.delete(audioKeys[0]);
            await cache.put(cacheKey, response.clone());
          } catch (_) {}
        }
      }
      const blob = await response.blob();
      if (seq !== this.seq) throw stopped();
      if (blob.size < 100 || !(/audio|octet-stream/i.test(blob.type) || blob.type === '')) {
        throw new Error('저장된 AI MP3 파일이 유효하지 않습니다.');
      }
      return URL.createObjectURL(blob);
    }
    playSegment(objectUrl, seq) {
      return new Promise((resolve, reject) => {
        const audio = this.activeAudio;
        let finished = false;
        const cleanup = () => {
          audio.removeEventListener('ended', done);
          audio.removeEventListener('error', fail);
          this.cancelSegment = null;
          if (this.currentObjectUrl === objectUrl) this.currentObjectUrl = null;
          URL.revokeObjectURL(objectUrl);
        };
        const finish = error => {
          if (finished) return;
          finished = true;
          cleanup();
          if (error) reject(error); else resolve();
        };
        const done = () => finish(null);
        const fail = () => finish(new Error('AI 음성 파일을 재생할 수 없습니다.'));
        this.cancelSegment = () => {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          finish(stopped());
        };
        audio.addEventListener('ended', done, { once: true });
        audio.addEventListener('error', fail, { once: true });
        this.currentObjectUrl = objectUrl;
        audio.src = objectUrl;
        audio.playbackRate = this.settings.rate;
        if (seq !== this.seq) { this.cancelSegment(); return; }
        audio.play().catch(e => {
          if (e && e.name === 'NotAllowedError') {
            finish(new Error('이 기기에서 음성 재생이 차단되었습니다. 재생 버튼을 다시 눌러 주세요.'));
          } else finish(new Error('AI MP3를 재생하지 못했습니다: ' + (e?.message || '알 수 없는 오류')));
        });
      });
    }
    gap(ms, seq) {
      if (!ms) return Promise.resolve();
      return new Promise(resolve => {
        const timer = setTimeout(() => { this.cancelGap = null; resolve(); }, ms);
        this.cancelGap = () => { clearTimeout(timer); this.cancelGap = null; resolve(); };
        if (seq !== this.seq) this.cancelGap();
      });
    }
    stop(message) {
      ++this.seq;
      this.playing = false;
      this.expectedTopic = '';
      this.topicId = '';
      this.cancelSegment?.();
      this.cancelGap?.();
      this.activeAudio.pause();
      this.clearMark();
      this.updateUI(message || 'AI 음성 재생 중지');
    }
    async resolveTopicSegments(topic, selected) {
      // Verify all selected nonempty fields before playback or topic navigation.
      const resolved = [];
      for (const field of selected) {
        if (!textOf(topic[field.prop])) {
          if (field.fixed) throw new Error('토픽명이 비어 있어 음성을 재생할 수 없습니다.');
          continue;
        }
        resolved.push({field, urls: await this.segmentUrls(topic, field)});
      }
      return resolved;
    }
    async start() {
      const bridge = this.getBridge();
      const current = bridge?.currentTopic?.();
      if (!current) { this.updateUI('읽을 토픽을 선택해 주세요.'); return; }
      const selected = FIELDS.filter(f => f.fixed || this.settings.fields[f.key]);
      // Fixed topic-name MP3 can play even when no optional body field is selected.
      const ids = bridge.filteredTopicIds?.() || [];
      const start = ids.indexOf(current.topicId);
      if (start < 0) { this.updateUI('현재 토픽이 목록에 없습니다.'); return; }
      const playlist = (this.settings.mode === 'one' ? ids.slice(start, start+1) : ids.slice(start))
        .filter(id => bridge.getTopicById(id)?.studyTarget === 'Y');
      if (!playlist.length) { this.updateUI('재생할 학습대상 토픽이 없습니다.'); return; }
      const seq = ++this.seq;
      this.playing = true;
      this.topicId = current.topicId;
      this.updateUI('AI 음성 목록 확인 중...');
      try {
        await this.manifest();
        for (let i = 0; i < playlist.length; i++) {
          if (seq !== this.seq) throw stopped();
          const topic = bridge.getTopicById(playlist[i]);
          if (!topic) continue;
          const resolved = await this.resolveTopicSegments(topic, selected);
          if (seq !== this.seq) throw stopped();
          this.topicId = topic.topicId;
          if (bridge.currentTopic()?.topicId !== topic.topicId) {
            if (!this.canNavigateSafely()) {
              throw new Error('첨부자료 뷰어 또는 관리 화면이 열려 있어 자동 토픽 이동을 중지했습니다.');
            }
            this.expectedTopic = topic.topicId;
            bridge.selectTopic(topic.topicId);
            if (this.expectedTopic === topic.topicId) this.expectedTopic = '';
          }
          for (let pass = 0; pass < this.settings.repeat; pass++) {
            for (const {field, urls} of resolved) {
              if (seq !== this.seq) throw stopped();
              this.markField(field.key);
              this.updateUI(topic.topicName + ' · ' + field.label +
                (this.settings.repeat === 2 ? ' (' + (pass+1) + '/2)' : '') + ' 읽는 중');
              for (const audioUrl of urls) {
                if (seq !== this.seq) throw stopped();
                const objectUrl = await this.fetchAudio(audioUrl, seq);
                if (seq !== this.seq) { URL.revokeObjectURL(objectUrl); throw stopped(); }
                await this.playSegment(objectUrl, seq);
              }
            }
          }
          this.clearMark();
          if (i < playlist.length - 1) {
            this.updateUI('다음 토픽으로 이동합니다...');
            await this.gap(this.settings.gap * 1000, seq);
          }
        }
        if (seq === this.seq) this.stop('마지막 토픽까지 읽었습니다.');
      } catch (error) {
        if (seq === this.seq && !isStop(error)) this.stop(error.message || 'AI 음성 재생 오류');
      }
    }
  }
  function initialize() {
    if (window.peStudyNoteTTS || !$('ttsToggleBtn')) return;
    window.peStudyNoteTTS = new StudyTts();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();