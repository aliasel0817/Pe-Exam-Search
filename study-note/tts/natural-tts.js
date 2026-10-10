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
  // Only Aoede audio exists in the approved GCS pilot; unsupported selections
  // must not persist from older local settings or imply available audio.
  const VOICES = [
    { id: 'ko-KR-Chirp3-HD-Aoede', label: '여성 · Aoede' }
  ];
  // Isolated 12-MP3 staging shell shares github.io origin with production.
  // Require BOTH an opt-in marker and a pinned pathname for isolation.
  const STAGE5_TRIAL = window.PE_TTS_STAGE5_TRIAL === true &&
    location.pathname === '/Pe-Exam-Search/study-note/tts/stage5_pwa_trial.html';
  const SETTINGS_KEY = STAGE5_TRIAL ? 'peStudyNote.aiTts.stage5Trial.options.v1'
    : 'peStudyNote.aiTts.options.v1';
  const CACHE_NAME = 'pe-study-note-ai-tts-mp3-v1';
  // Non-secret preference only. Never store Google ID tokens or device sessions.
  // A returning voice user can ask Google One Tap for a fresh ID token; the
  // Cloud Run gateway STILL validates every authenticated audio request.
  const AUTO_SIGNIN_KEY = 'peStudyNote.aiTts.googleVoiceOneTapOptIn.v1';
  const PRIVATE_AUDIO_BUCKET = 'study-note-tts-audio-558407087449';
  const PRIVATE_AUDIO_PREFIX = 'study-note/tts/audio/';
  const MAX_CACHE_ITEMS = 120;
  const SCRIPT_DIR = new URL('./', document.currentScript?.src || new URL('./tts/', location.href)).href;
  const MANIFEST_URL = new URL('./audio/index.json', SCRIPT_DIR).href;
  const AUDIO_BASE_URL = new URL('./audio/', SCRIPT_DIR).href;
  const CLOUD_CONFIG_URL = new URL('./cloud-config.json', SCRIPT_DIR).href;
  const $ = id => document.getElementById(id);
  const clamp = (n, low, high) => Math.min(Math.max(n, low), high);
  // Pilot contains only five topic-intro MP3s and three partial body fields.
  // Begin safely with title-only, current topic. User may explicitly opt into
  // more fields and a continuous playlist after checking availability.
  const defaultSettings = () => ({
    voice: VOICES[0].id, rate: 1, mode: 'one',
    repeat: 1, gap: 3,
    fields: { concept: false, background: false, necessity: false,
      features: false, components: false, keywords: false }
  });
  const textOf = value => String(value == null ? '' : value).trim();
  // Deliberately narrow source-name compatibility list. Never normalize
  // arbitrary learning text or silently bypass changed concept/body hashes.
  // Each approved old title must also match the manifest's SHA-256 exactly.
  const APPROVED_TITLE_VARIANTS = Object.freeze({
    T1961: Object.freeze({
      current: '몬테카를로 트리검색 (MCTS)',
      recorded: '몬테카를로 트리검색(MCTS)',
      note: '합성 당시 괄호 앞 공백이 없는 토픽명'
    }),
    T2354: Object.freeze({
      current: 'SQL (Structured Query Language)',
      recorded: 'SQL',
      note: '합성 당시 SQL 약칭 토픽명'
    })
  });
  async function verifyAudioSource(topic, field, entry) {
    if (!entry || !/^[a-f0-9]{64}$/.test(String(entry.sha256 || ''))) {
      return {valid:false, note:''};
    }
    const displayText = textOf(topic[field.prop]);
    if (entry.sha256 === await sha256(displayText)) return {valid:true, note:''};
    if (field.key !== 'topic') return {valid:false, note:''};
    const alias = APPROVED_TITLE_VARIANTS[topic.topicId];
    if (!alias || displayText !== alias.current ||
        entry.sha256 !== await sha256(alias.recorded)) {
      return {valid:false, note:''};
    }
    return {valid:true, note:alias.note};
  }
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
        mode: v.mode === 'one' || v.mode === 'continuous' ? v.mode : defaults.mode,
        repeat: v.repeat === 2 ? 2 : 1,
        gap: [0, 3, 5].includes(Number(v.gap)) ? Number(v.gap) : 3,
        fields: Object.fromEntries(FIELDS.slice(1).map(f =>
          [f.key, v.fields?.[f.key] == null ? defaults.fields[f.key] : v.fields[f.key] !== false]))
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
      this.googleIdentityInitialized = false;
      this.returningSignInAttempted = false;
      this.authPromptPending = false;
      this.activeAudio = new Audio();
      this.activeAudio.preload = 'auto';
      this.activeAudio.setAttribute('playsinline', '');
      this.cancelSegment = null;
      this.cancelGap = null;
      this.activeDownloadController = null;
      this.currentObjectUrl = null;
      this.highlighted = null;
      this.initUi();
    }
    initUi() {
      this.toggleBtn = $('ttsToggleBtn');
      this.repeatBtn = $('ttsRepeatBtn');
      this.settingsPanel = $('ttsSettingsPanel');
      this.settingsCloseBtn = $('ttsSettingsCloseBtn');
      this.statusNode = $('ttsStatus');
      if (!this.toggleBtn || !this.repeatBtn || !this.settingsPanel) return;
      // Fixed-position popup belongs to document.body: no clipped cards or
      // PWA viewer stacking contexts, including iOS visualViewport changes.
      document.body.appendChild(this.settingsPanel);
      this.bindListenGesture();
      this.repeatBtn.addEventListener('click', () => this.toggleTopicRepeat());
      this.settingsCloseBtn?.addEventListener('click', () => this.closeOptions(true));
      document.addEventListener?.('pointerdown', event => {
        if (this.settingsPanel.classList.contains('hidden')) return;
        if (!this.settingsPanel.contains(event.target) && !this.toggleBtn.contains(event.target)) {
          this.closeOptions();
        }
      }, true);
      document.addEventListener?.('keydown', event => {
        if (event.key === 'Escape' && !this.settingsPanel.classList.contains('hidden')) {
          event.preventDefault();
          this.closeOptions(true);
        }
      });
      window.addEventListener?.('resize', () => this.positionOptions());
      window.visualViewport?.addEventListener?.('resize', () => this.positionOptions());
      window.visualViewport?.addEventListener?.('scroll', () => this.positionOptions());
      for (const name of ['voice','rate','mode','gap']) {
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
      this.updateUI('AI MP3 대기 중 · 듣기 버튼을 길게 누르면 옵션');
      this.syncTopicControls(this.getBridge()?.currentTopic?.());
      // One Tap is offered only on a returning visit after the user already
      // authorized voice Google login here. Never show unsolicited first-use
      // prompts or ask the speech gateway to read audio during page load.
      if (document.readyState === 'complete') {
        void Promise.resolve().then(() => this.offerReturningGoogleSignIn());
      } else {
        window.addEventListener?.('load',
          () => void this.offerReturningGoogleSignIn(), {once:true});
      }
    }
    isEligibleTopic(topic) {
      // T0000 is the PWA home page even though the sheet marks it Y.
      // Study-target N rows are likewise excluded; no remote reads needed.
      return Boolean(topic && topic.studyTarget === 'Y' && topic.topicId !== 'T0000');
    }
    syncTopicControls(topic, suppressHint = false) {
      const visible = this.isEligibleTopic(topic);
      for (const control of [this.toggleBtn, this.repeatBtn, this.statusNode]) {
        if (control) control.classList[visible ? 'remove' : 'add']('hidden');
      }
      if (!visible) this.closeOptions();
      // Read-only, local SHA-256 check against an ALREADY loaded private
      // manifest. Never contact Cloud Run/GCS just because a topic changed.
      if (visible && !suppressHint && !this.playing && this.cacheIndex) {
        void this.showCachedAudioHint(topic);
      }
    }
    async showCachedAudioHint(topic) {
      if (!topic || !this.cacheIndex || this.playing) return;
      const id = topic.topicId;
      let message = '';
      if (!this.cacheIndex.entries?.[this.segmentKey(id, 'topic')]) {
        message = '토픽명 MP3 미생성 · 다른 토픽을 선택하거나 음성 제작 후 이용해 주세요.';
      } else {
        try {
          await this.segmentUrls(topic, FIELDS[0]); // cacheIndex; no HTTP
          message = '토픽명 MP3 준비됨 · 🔊 듣기를 누르면 재생합니다.';
        } catch (error) {
          message = /재생성이 필요/.test(error?.message || '')
            ? '토픽명 원문 변경 · 기존 MP3와 일치하지 않습니다.'
            : '토픽명 MP3 경로 검증 실패 · 음성 진단에서 확인해 주세요.';
        }
      }
      // showTopicById notifies us just BEFORE its currentTopicId changes.
      // Await the microtask so a rapid topic switch cannot show stale status.
      await Promise.resolve();
      if (this.playing || this.getBridge()?.currentTopic?.()?.topicId !== id) return;
      this.updateUI(message);
    }
    bindListenGesture() {
      // Match the annotation pen: 550ms long press, 12px move tolerance.
      // A real click still handles keyboard Enter/Space for accessibility.
      let timer = 0;
      let pointerId = null;
      let startX = 0;
      let startY = 0;
      let suppressClick = false;
      const cancelTimer = () => {
        if (timer) clearTimeout(timer);
        timer = 0;
      };
      this.toggleBtn.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        cancelTimer();
        suppressClick = false;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        timer = setTimeout(() => {
          timer = 0;
          if (pointerId !== event.pointerId) return;
          suppressClick = true;
          this.openOptions();
        }, 550);
      });
      this.toggleBtn.addEventListener('pointermove', event => {
        if (pointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) {
          suppressClick = true;
          cancelTimer();
        }
      });
      for (const name of ['pointerup','pointercancel','pointerleave']) {
        this.toggleBtn.addEventListener(name, () => {
          cancelTimer();
          pointerId = null;
        });
      }
      this.toggleBtn.addEventListener('click', event => {
        if (suppressClick) {
          suppressClick = false;
          event.preventDefault();
          event.stopImmediatePropagation?.();
          return;
        }
        this.closeOptions();
        if (this.playing) this.stop('음성 재생을 중지했습니다.');
        else void this.start();
      });
      this.toggleBtn.addEventListener('contextmenu', event => {
        event.preventDefault();
        this.openOptions();
      });
      this.toggleBtn.addEventListener('keydown', event => {
        if (event.altKey && event.key === 'ArrowDown') {
          event.preventDefault();
          this.openOptions(true);
        }
      });
    }
    toggleTopicRepeat() {
      const wasPlaying = this.playing;
      this.settings.repeat = this.settings.repeat === 1 ? 2 : 1;
      this.saveSettings();
      if (wasPlaying) this.stop('반복 횟수가 변경되어 재생을 중지했습니다.');
      this.updateUI('토픽당 ' + this.settings.repeat + '회로 설정했습니다.' +
        (wasPlaying ? ' 재생은 안전하게 중지했습니다.' : ''));
    }
    openOptions(focusClose = false) {
      if (this.settingsPanel.classList.contains('hidden')) {
        this.settingsPanel.classList.remove('hidden');
        this.toggleBtn.setAttribute('aria-expanded', 'true');
        void this.renderCloudLogin();
      }
      this.positionOptions();
      if (focusClose) this.settingsCloseBtn?.focus?.();
    }
    closeOptions(focusToggle = false) {
      if (this.settingsPanel.classList.contains('hidden')) return;
      this.settingsPanel.classList.add('hidden');
      this.toggleBtn.setAttribute('aria-expanded', 'false');
      if (focusToggle) this.toggleBtn.focus?.();
    }
    positionOptions() {
      if (this.settingsPanel.classList.contains('hidden')) return;
      const vp = window.visualViewport;
      const visibleLeft = vp?.offsetLeft ?? 0;
      const visibleTop = vp?.offsetTop ?? 0;
      const visibleWidth = vp?.width ?? window.innerWidth;
      const visibleHeight = vp?.height ?? window.innerHeight;
      if (!(visibleWidth > 0 && visibleHeight > 0)) return;
      const margin = 8;
      const width = Math.min(430, Math.max(120, visibleWidth - margin * 2));
      const height = Math.max(48, visibleHeight - margin * 2);
      this.settingsPanel.style.width = width + 'px';
      this.settingsPanel.style.maxHeight = height + 'px';
      const rect = this.toggleBtn.getBoundingClientRect();
      const left = Math.max(visibleLeft + margin,
        Math.min(visibleLeft + visibleWidth - width - margin, rect.right - width));
      const popupHeight = Math.min(this.settingsPanel.scrollHeight, height);
      const below = rect.bottom + margin;
      const above = rect.top - popupHeight - margin;
      const top = below + popupHeight <= visibleTop + visibleHeight - margin
        ? below
        : above >= visibleTop + margin
          ? above
          : Math.max(visibleTop + margin, visibleTop + visibleHeight - popupHeight - margin);
      this.settingsPanel.style.left = left + 'px';
      this.settingsPanel.style.top = top + 'px';
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
        this.toggleBtn.setAttribute('aria-label',
          (this.playing ? 'AI 음성 중지' : 'AI 음성 듣기') + ', 길게 누르면 옵션');
      }
      if (this.repeatBtn) {
        const repeated = this.settings.repeat === 2;
        this.repeatBtn.textContent = repeated ? '↻ 2회' : '↻ 1회';
        this.repeatBtn.setAttribute('aria-pressed', String(repeated));
        this.repeatBtn.setAttribute('aria-label', '토픽당 ' + this.settings.repeat +
          '회 읽기, 누르면 ' + (repeated ? '1회' : '2회') + ' 반복');
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
      const wasPlaying = this.playing;
      if (this.playing && !auto && this.topicId && id !== this.topicId) {
        this.stop('다른 토픽을 선택하여 재생을 중지했습니다.');
      }
      this.syncTopicControls(this.getBridge()?.getTopicById?.(id), wasPlaying);
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
      if (topic.topicId === 'T0000') {
        return show('학습노트 홈 화면은 AI 음성 합성 대상에서 제외합니다.');
      }
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
        const approvedNameDifferences = [];
        let parts = 0;
        for (const field of requested) {
          const entry = index.entries[this.segmentKey(topic.topicId, field.key)];
          if (!entry) {
            missing.push(field.label);
          } else {
            const source = await verifyAudioSource(topic, field, entry);
            if (!source.valid) {
              changed.push(field.label);
              continue;
            }
            try {
              const files = await this.segmentUrls(topic, field);
              parts += files.length;
              ready.push(field.label);
              if (source.note) approvedNameDifferences.push(source.note);
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
        if (approvedNameDifferences.length) {
          message += ' 기존 MP3 명칭 차이(정확한 원본 해시 검증): ' +
            approvedNameDifferences.join(', ') + '.';
        }
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
    hasReturningGoogleConsent() {
      if (STAGE5_TRIAL) return false;
      try { return localStorage.getItem(AUTO_SIGNIN_KEY) === '1'; }
      catch (_) { return false; }
    }
    syncGoogleAuthUi(statusMessage = '') {
      const host = $('ttsCloudLogin');
      const status = $('ttsCloudStatus');
      if (host) host.classList[this.idToken ? 'add' : 'remove']('hidden');
      if (status) {
        status.textContent = statusMessage || (this.idToken
          ? 'Google 음성 인증 완료 · 이 탭에서는 토픽 이동마다 로그인할 필요가 없습니다.'
          : '음성 로그인은 처음 한 번만 필요합니다. 인증 후 듣기 버튼이 MP3를 자동 검사합니다.');
      }
    }
    onGoogleCredential(response) {
      if (!response || typeof response.credential !== 'string' || !response.credential) return;
      // Temporary Google ID token is kept ONLY in JS memory, never storage.
      this.idToken = response.credential;
      this.cacheIndex = null;
      if (!STAGE5_TRIAL) {
        try { localStorage.setItem(AUTO_SIGNIN_KEY, '1'); } catch (_) {}
      }
      this.syncGoogleAuthUi();
      this.updateUI('음성 인증 완료. 이제 토픽을 바꿔도 듣기만 누르면 됩니다.');
    }
    async initializeGoogleIdentity() {
      const config = await this.loadStorageConfig();
      if (config.mode !== 'gcs-private') return null;
      const gis = window.google?.accounts?.id;
      if (!gis || typeof gis.initialize !== 'function') return null;
      if (!this.googleIdentityInitialized) {
        gis.initialize({
          client_id: config.oauthClientId,
          // Browser/Google may still require a confirmation, especially on iOS.
          auto_select: !STAGE5_TRIAL && this.hasReturningGoogleConsent(),
          itp_support: true,
          callback: response => this.onGoogleCredential(response)
        });
        this.googleIdentityInitialized = true;
      }
      return gis;
    }
    async offerReturningGoogleSignIn() {
      if (!this.hasReturningGoogleConsent() || this.idToken ||
          this.returningSignInAttempted) return;
      this.returningSignInAttempted = true; // at most once per page load
      try {
        const gis = await this.initializeGoogleIdentity();
        if (!this.idToken) gis?.prompt?.();
      } catch (_) {
        // Google One Tap can be suppressed by browser privacy controls; the
        // visible Google button remains a normal, reliable fallback.
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
          this.syncGoogleAuthUi();
          return;
        }
        this.syncGoogleAuthUi();
        const gis = await this.initializeGoogleIdentity();
        if (!gis || typeof gis.renderButton !== 'function') {
          if (status) status.textContent = 'Google 로그인 화면을 불러올 수 없습니다. 네트워크를 확인해 주세요.';
          return;
        }
        if (this.loginButtonRendered) return;
        gis.renderButton(host, {type:'standard',size:'medium',theme:'outline',text:'signin_with'});
        this.loginButtonRendered = true;
      } catch (error) {
        if (status) status.textContent = error.message || '음성 인증 설정 오류';
      }
    }
    async authenticatedGatewayFetch(path, signal = null) {
      const config = await this.loadStorageConfig();
      if (config.mode !== 'gcs-private') throw new Error('비공개 GCS 연결이 아닙니다.');
      if (!this.idToken) throw new Error('음성 설정에서 Google 계정으로 로그인해 주세요.');
      const response = await fetch(config.gatewayUrl + path, {
        method:'GET', mode:'cors', cache:'no-store', credentials:'omit',
        signal:signal || undefined,
        headers:{Authorization:'Bearer ' + this.idToken}
      });
      if (response.status === 401 || response.status === 403) {
        this.idToken = null;
        this.cacheIndex = null;
        this.loginButtonRendered = false;
        // A rejected account should never get an automatic credential loop.
        try { localStorage.removeItem(AUTO_SIGNIN_KEY); } catch (_) {}
        const host = $('ttsCloudLogin');
        if (host) host.textContent = '';
        this.syncGoogleAuthUi('음성 인증이 만료되었거나 계정 권한이 없습니다. Google 계정으로 다시 로그인해 주세요.');
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
      const source = await verifyAudioSource(topic, field, entry);
      if (!source.valid) {
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
      const controller = new AbortController();
      this.activeDownloadController = controller;
      const assertActive = () => {
        if (seq !== this.seq || controller.signal.aborted) throw stopped();
      };
      try {
        const config = await this.loadStorageConfig();
        assertActive();
        const privateMode = config.mode === 'gcs-private';
        const cacheKey = privateMode
          ? new URL('./cached-mp3/' + urlOrPath, SCRIPT_DIR).href
          : urlOrPath;
        let response = null;
        let cache = null;
        if (!STAGE5_TRIAL && 'caches' in window) {
          try {
            cache = await caches.open(CACHE_NAME);
            response = await cache.match(cacheKey);
          } catch (_) {}
          assertActive();
        }
        if (!response) {
          let downloadUrl = urlOrPath;
          if (privateMode) {
            const signedResponse = await this.authenticatedGatewayFetch(
              '/v1/audio-url?file=' + encodeURIComponent(urlOrPath), controller.signal);
            assertActive();
            const ticket = await signedResponse.json();
            assertActive();
            downloadUrl = validateSignedPrivateAudioUrl(ticket.url, urlOrPath);
          }
          assertActive();
          response = await fetch(downloadUrl, {
            mode:privateMode ? 'cors' : 'same-origin',
            cache:privateMode ? 'no-store' : 'force-cache',
            credentials:'omit', signal:controller.signal
          });
          assertActive();
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
            assertActive();
          }
        }
        const blob = await response.blob();
        assertActive();
        if (blob.size < 100 || !(/audio|octet-stream/i.test(blob.type) || blob.type === '')) {
          throw new Error('저장된 AI MP3 파일이 유효하지 않습니다.');
        }
        return URL.createObjectURL(blob);
      } finally {
        if (this.activeDownloadController === controller) this.activeDownloadController = null;
      }
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
      this.activeDownloadController?.abort();
      this.activeDownloadController = null;
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
    planContinuousPlaylist(ids, selected, bridge, index) {
      const playable = [];
      let skippedMissing = 0;
      const examples = [];
      for (const id of ids) {
        const topic = bridge.getTopicById(id);
        if (!this.isEligibleTopic(topic)) continue;
        // Missing entries only. Changed text, invalid hashes/paths and
        // network/auth errors remain hard stops, never silently skipped.
        const missing = selected.filter(field =>
          textOf(topic[field.prop]) && !index.entries[this.segmentKey(id, field.key)]);
        if (!textOf(topic.topicName) || missing.length) {
          skippedMissing++;
          if (examples.length < 3) examples.push(id);
          continue;
        }
        playable.push(id);
      }
      return {playable, skippedMissing, examples};
    }
    async start() {
      if (this.playing || this.authPromptPending) return;
      const bridge = this.getBridge();
      const current = bridge?.currentTopic?.();
      if (!current) { this.updateUI('읽을 토픽을 선택해 주세요.'); return; }
      if (!this.isEligibleTopic(current)) {
        this.updateUI('홈 화면 및 학습제외 토픽은 AI 음성 재생 대상이 아닙니다.');
        return;
      }
      // The first short tap opens the Google sign-in fallback when needed.
      // Checking the static JSON is not an audio/GCS request; no signed MP3
      // requests are sent until a valid Google ID token exists in memory.
      if (!this.idToken) {
        this.authPromptPending = true;
        try {
          const config = await this.loadStorageConfig();
          if (config.mode === 'gcs-private' && !this.idToken) {
            this.openOptions();
            this.updateUI('음성 로그인은 처음 한 번만 필요합니다. 옵션에서 Google 계정으로 로그인해 주세요.');
            return;
          }
        } catch (error) {
          this.updateUI('음성 연결 설정 확인 실패: ' + (error?.message || '알 수 없는 오류'));
          return;
        } finally {
          this.authPromptPending = false;
        }
      }
      const selected = FIELDS.filter(f => f.fixed || this.settings.fields[f.key]);
      // Fixed topic-name MP3 can play even when no optional body field is selected.
      const ids = bridge.filteredTopicIds?.() || [];
      const start = ids.indexOf(current.topicId);
      if (start < 0) { this.updateUI('현재 토픽이 목록에 없습니다.'); return; }
      const playlist = (this.settings.mode === 'one' ? ids.slice(start, start+1) : ids.slice(start))
        .filter(id => this.isEligibleTopic(bridge.getTopicById(id)));
      if (!playlist.length) { this.updateUI('재생할 학습대상 토픽이 없습니다.'); return; }
      const seq = ++this.seq;
      this.playing = true;
      this.topicId = current.topicId;
      this.updateUI('AI 음성 목록 확인 중...');
      try {
        const index = await this.manifest();
        if (seq !== this.seq) throw stopped();
        const continuous = this.settings.mode === 'continuous';
        const plan = continuous
          ? this.planContinuousPlaylist(playlist, selected, bridge, index)
          : {playable:playlist, skippedMissing:0, examples:[]};
        const playable = plan.playable;
        if (!playable.length) {
          throw new Error('연속 읽기: 선택한 목록의 ' + plan.skippedMissing +
            '개 토픽 모두 MP3가 미생성입니다. 음성 합성 없이 중지했습니다.');
        }
        for (let i = 0; i < playable.length; i++) {
          if (seq !== this.seq) throw stopped();
          if (i > 0 && i % 64 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
            if (seq !== this.seq) throw stopped();
          }
          const topic = bridge.getTopicById(playable[i]);
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
          if (i < playable.length - 1) {
            this.updateUI('다음 MP3 준비 토픽으로 이동합니다...');
            await this.gap(this.settings.gap * 1000, seq);
          }
        }
        if (seq === this.seq) {
          const summary = plan.skippedMissing
            ? ' · MP3 미생성 ' + plan.skippedMissing + '개 건너뜀' : '';
          this.stop('마지막 토픽까지 읽었습니다. 재생 ' + playable.length + '개' + summary + '.');
        }
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