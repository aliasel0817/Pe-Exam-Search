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
  const MAX_CACHE_ITEMS = 120;
  const MANIFEST_URL = './tts/audio/index.json';
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
    async manifest() {
      if (this.cacheIndex) return this.cacheIndex;
      if (this.manifestPromise) return this.manifestPromise;
      this.manifestPromise = (async () => {
        const url = new URL(MANIFEST_URL, location.href);
        let response = null;
        try {
          response = await fetch(url.href, { cache: 'no-store' });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          if ('caches' in window) {
            try { (await caches.open(CACHE_NAME)).put(url.href, response.clone()); } catch (_) {}
          }
        } catch (error) {
          if ('caches' in window) {
            try { response = await (await caches.open(CACHE_NAME)).match(url.href); } catch (_) {}
          }
          if (!response) throw new Error('음성 목록 파일에 연결할 수 없습니다. 인터넷을 확인해 주세요.');
        }
        const index = await response.json();
        if (index.schemaVersion !== 1 || !index.entries || typeof index.entries !== 'object') {
          throw new Error('AI 음성 목록 파일 형식이 올바르지 않습니다.');
        }
        this.cacheIndex = index;
        return index;
      })();
      try { return await this.manifestPromise; } finally { this.manifestPromise = null; }
    }
    segmentKey(topicId, field) { return topicId + ':' + field + ':' + this.settings.voice; }
    async segmentUrl(topic, field) {
      const index = await this.manifest();
      const key = this.segmentKey(topic.topicId, field.key);
      const entry = index.entries[key];
      if (!entry || !entry.file || !entry.sha256) {
        throw new Error('미생성 AI MP3: ' + topic.topicId + ' / ' + field.label + ' / ' + this.settings.voice);
      }
      const original = textOf(topic[field.prop]);
      const hash = await sha256(original);
      if (entry.sha256 !== hash) {
        throw new Error('학습 내용이 수정되어 MP3 재생성이 필요합니다: ' + topic.topicId + ' / ' + field.label);
      }
      const path = String(entry.file);
      if (!/^[A-Za-z0-9_-]+\/T[0-9]+\/[a-z]+-[a-f0-9]{12}\.mp3$/.test(path)) {
        throw new Error('음성 파일 경로가 올바르지 않습니다.');
      }
      return new URL('./tts/audio/' + path, location.href).href;
    }
    async fetchAudio(url, seq) {
      let response = null;
      let cache = null;
      if ('caches' in window) {
        try {
          cache = await caches.open(CACHE_NAME);
          response = await cache.match(url);
        } catch (_) {}
      }
      if (!response) {
        response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) throw new Error('AI 음성 파일을 불러오지 못했습니다: HTTP ' + response.status);
        if (cache) {
          try {
            const keys = await cache.keys();
            const audioKeys = keys.filter(x => x.url.endsWith('.mp3'));
            if (audioKeys.length >= MAX_CACHE_ITEMS) await cache.delete(audioKeys[0]);
            await cache.put(url, response.clone());
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
      this.cancelSegment?.();
      this.cancelGap?.();
      this.activeAudio.pause();
      this.clearMark();
      this.updateUI(message || 'AI 음성 재생 중지');
    }
    async start() {
      const bridge = this.getBridge();
      const current = bridge?.currentTopic?.();
      if (!current) { this.updateUI('읽을 토픽을 선택해 주세요.'); return; }
      const selected = FIELDS.filter(f => f.fixed || this.settings.fields[f.key]);
      if (selected.length < 2) {
        this.updateUI('읽을 항목을 하나 이상 선택해 주세요.');
        return;
      }
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
          this.topicId = topic.topicId;
          if (bridge.currentTopic()?.topicId !== topic.topicId) {
            this.expectedTopic = topic.topicId;
            bridge.selectTopic(topic.topicId);
            if (this.expectedTopic === topic.topicId) this.expectedTopic = '';
          }
          for (let pass = 0; pass < this.settings.repeat; pass++) {
            for (const field of selected) {
              if (seq !== this.seq) throw stopped();
              if (!textOf(topic[field.prop])) continue;
              this.markField(field.key);
              this.updateUI(topic.topicName + ' · ' + field.label +
                (this.settings.repeat === 2 ? ' (' + (pass+1) + '/2)' : '') + ' 읽는 중');
              const audioUrl = await this.segmentUrl(topic, field);
              const objectUrl = await this.fetchAudio(audioUrl, seq);
              if (seq !== this.seq) { URL.revokeObjectURL(objectUrl); throw stopped(); }
              await this.playSegment(objectUrl, seq);
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