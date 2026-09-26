import { openDatabase, getAllTopics, replaceAllTopics, getAllMeta } from './db.js';
import {
  fetchHealth,
  fetchMasterDataset,
  validateAndNormalizeDataset,
  normalizeApiUrl,
  isLikelyAppsScriptUrl,
  compareTopics,
} from './api.js';

const APP_VERSION = '1.0.0-stage1';
const API_URL_KEY = 'peStudyNote.apiUrl';
const LAST_TOPIC_KEY = 'peStudyNote.lastTopicId';
const PAGE_SIZE = 120;

let db;
let allTopics = [];
let filteredTopics = [];
let visibleCount = PAGE_SIZE;
let currentTopicId = null;

const els = {};

window.addEventListener('DOMContentLoaded', init);

async function init() {
  bindElements();
  bindEvents();
  updateNetworkStatus();
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./study-note-sw.js').catch(error => console.warn('Service worker registration failed:', error));
  }

  db = await openDatabase();
  allTopics = await getAllTopics(db);
  allTopics.sort(compareTopics);
  await renderMeta();

  if (allTopics.length) {
    populateDomainFilter();
    applyFilters({ preserveCurrent: true });
    showTopicById(localStorage.getItem(LAST_TOPIC_KEY) || filteredTopics[0]?.topicId);
  } else {
    showEmptyState();
  }
}

function bindElements() {
  const ids = [
    'networkBadge','syncLabel','refreshBtn','settingsBtn','openSidebarBtn','closeSidebarBtn','sidebar','sidebarBackdrop',
    'searchInput','studyTargetFilter','importanceFilter','domainFilter','categoryFilter','resetBtn','resultCount','topicList',
    'loadMoreBtn','emptyState','topicDetail','emptySettingsBtn','emptyRefreshBtn','bottomNav','prevBtn','nextBtn','listBtn',
    'detailTopicId','detailDomain','detailCategoryCode','detailTopicOrder','detailImportance','detailStudyTarget','detailCounter',
    'detailCategory','detailTitle','detailDomainName','detailConcept','detailKeywords','detailMnemonic','detailRelated',
    'detailSubnotePages','detailTextbookPages','detailStatus','detailSourceDomain','detailExclusionReason','detailNotes',
    'settingsModal','closeSettingsBtn','apiUrlInput','settingsTopicCount','settingsLastSync','settingsAppVersion',
    'testApiBtn','saveSettingsBtn','loadingOverlay','loadingMessage','toast'
  ];
  for (const id of ids) els[id] = document.getElementById(id);
}

function bindEvents() {
  els.refreshBtn.addEventListener('click', refreshMaster);
  els.emptyRefreshBtn.addEventListener('click', refreshMaster);
  els.settingsBtn.addEventListener('click', openSettings);
  els.emptySettingsBtn.addEventListener('click', openSettings);
  els.closeSettingsBtn.addEventListener('click', closeSettings);
  els.settingsModal.addEventListener('click', event => { if (event.target === els.settingsModal) closeSettings(); });
  els.saveSettingsBtn.addEventListener('click', saveSettings);
  els.testApiBtn.addEventListener('click', testApiConnection);

  els.searchInput.addEventListener('input', () => applyFilters());
  els.studyTargetFilter.addEventListener('change', () => applyFilters());
  els.importanceFilter.addEventListener('change', () => applyFilters());
  els.domainFilter.addEventListener('change', () => {
    populateCategoryFilter();
    applyFilters();
  });
  els.categoryFilter.addEventListener('change', () => applyFilters());
  els.resetBtn.addEventListener('click', resetFilters);
  els.loadMoreBtn.addEventListener('click', () => {
    visibleCount += PAGE_SIZE;
    renderTopicList();
  });

  els.prevBtn.addEventListener('click', () => moveTopic(-1));
  els.nextBtn.addEventListener('click', () => moveTopic(1));
  els.listBtn.addEventListener('click', openSidebar);
  els.openSidebarBtn.addEventListener('click', openSidebar);
  els.closeSidebarBtn.addEventListener('click', closeSidebar);
  els.sidebarBackdrop.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || !currentTopicId) return;
    if (event.key === 'ArrowLeft') moveTopic(-1);
    if (event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      moveTopic(1);
    }
  });
}

async function renderMeta() {
  const meta = await getAllMeta(db);
  const last = meta.lastMasterSyncAt ? formatDateTime(meta.lastMasterSyncAt) : 'MASTER 미수신';
  els.syncLabel.textContent = meta.lastMasterSyncAt ? `갱신 ${last}` : 'MASTER 미수신';
  els.settingsTopicCount.textContent = Number(meta.topicCount || allTopics.length).toLocaleString();
  els.settingsLastSync.textContent = meta.lastMasterSyncAt ? last : '없음';
  els.settingsAppVersion.textContent = APP_VERSION;
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  els.networkBadge.textContent = online ? '온라인' : '오프라인';
  els.networkBadge.classList.toggle('online', online);
  els.networkBadge.classList.toggle('offline', !online);
}

function getApiUrl() {
  return normalizeApiUrl(localStorage.getItem(API_URL_KEY) || '');
}

function openSettings() {
  els.apiUrlInput.value = getApiUrl();
  els.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  els.settingsModal.classList.add('hidden');
}

function saveSettings() {
  const value = normalizeApiUrl(els.apiUrlInput.value);
  if (value && !isLikelyAppsScriptUrl(value)) {
    showToast('Apps Script Web App URL 형식을 확인해 주세요.');
    return;
  }
  if (value) localStorage.setItem(API_URL_KEY, value);
  else localStorage.removeItem(API_URL_KEY);
  closeSettings();
  showToast('설정을 저장했습니다.');
}

async function testApiConnection() {
  const value = normalizeApiUrl(els.apiUrlInput.value);
  if (!isLikelyAppsScriptUrl(value)) return showToast('Apps Script Web App URL을 먼저 확인해 주세요.');
  setLoading(true, 'Google Spreadsheet 연결 확인 중...');
  try {
    const result = await fetchHealth(value);
    showToast(`연결 성공 · ${result.spreadsheetName}/${result.sheetName} · ${Number(result.topicCount || 0).toLocaleString()}건`);
  } catch (error) {
    showToast(error.message || '연결 확인에 실패했습니다.');
  } finally {
    setLoading(false);
  }
}

async function refreshMaster() {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    openSettings();
    showToast('먼저 Apps Script Web App URL을 설정해 주세요.');
    return;
  }
  if (!navigator.onLine) return showToast('오프라인 상태에서는 MASTER를 갱신할 수 없습니다.');

  setLoading(true, 'Google Spreadsheet의 MASTER 텍스트를 받는 중...');
  try {
    const payload = await fetchMasterDataset(apiUrl);
    setLoading(true, '데이터 검증 및 로컬 저장 중...');
    const { topics, meta } = validateAndNormalizeDataset(payload);

    if (topics.length < 3000) {
      throw new Error(`수신 토픽 수가 비정상적으로 적습니다. (${topics.length.toLocaleString()}건) 기존 캐시를 유지합니다.`);
    }

    const lastMasterSyncAt = new Date().toISOString();
    await replaceAllTopics(db, topics, { ...meta, lastMasterSyncAt });
    allTopics = topics;
    populateDomainFilter();
    resetFilters({ render: false });
    applyFilters({ preserveCurrent: true });
    await renderMeta();

    const preferredId = currentTopicId && allTopics.some(t => t.topicId === currentTopicId)
      ? currentTopicId
      : (localStorage.getItem(LAST_TOPIC_KEY) || filteredTopics[0]?.topicId);
    showTopicById(preferredId);
    showToast(`MASTER 갱신 완료 · ${topics.length.toLocaleString()}개 토픽`);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'MASTER 갱신에 실패했습니다. 기존 캐시는 유지됩니다.');
  } finally {
    setLoading(false);
  }
}

function populateDomainFilter() {
  const current = els.domainFilter.value || 'ALL';
  const domains = [...new Map(allTopics.map(topic => [topic.domain, { code: topic.domain, name: topic.domainName, order: topic.domainOrder }])).values()]
    .sort((a, b) => a.order - b.order);
  els.domainFilter.innerHTML = '<option value="ALL">전체</option>' + domains.map(d => `<option value="${escapeHtml(d.code)}">${escapeHtml(d.code)} · ${escapeHtml(d.name)}</option>`).join('');
  els.domainFilter.value = domains.some(d => d.code === current) ? current : 'ALL';
  populateCategoryFilter();
}

function populateCategoryFilter() {
  const selectedDomain = els.domainFilter.value;
  const current = els.categoryFilter.value || 'ALL';
  const source = selectedDomain === 'ALL' ? allTopics : allTopics.filter(t => t.domain === selectedDomain);
  const categories = [...new Map(source.map(t => [t.categoryCode, { code: t.categoryCode, name: t.categoryName, order: t.categorySortOrder, domainOrder: t.domainOrder }])).values()]
    .sort((a, b) => a.domainOrder - b.domainOrder || a.order - b.order || a.code.localeCompare(b.code, 'ko', { numeric: true }));
  els.categoryFilter.innerHTML = '<option value="ALL">전체</option>' + categories.map(c => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.code)} · ${escapeHtml(c.name)}</option>`).join('');
  els.categoryFilter.value = categories.some(c => c.code === current) ? current : 'ALL';
}

function resetFilters({ render = true } = {}) {
  els.searchInput.value = '';
  els.studyTargetFilter.value = 'Y';
  els.importanceFilter.value = 'ALL';
  els.domainFilter.value = 'ALL';
  populateCategoryFilter();
  els.categoryFilter.value = 'ALL';
  if (render) applyFilters();
}

function applyFilters({ preserveCurrent = false } = {}) {
  const query = normalizeSearchText(els.searchInput.value);
  const target = els.studyTargetFilter.value;
  const importance = els.importanceFilter.value;
  const domain = els.domainFilter.value;
  const category = els.categoryFilter.value;

  filteredTopics = allTopics.filter(topic => {
    if (target !== 'ALL' && topic.studyTarget !== target) return false;
    if (importance !== 'ALL' && topic.importance !== importance) return false;
    if (domain !== 'ALL' && topic.domain !== domain) return false;
    if (category !== 'ALL' && topic.categoryCode !== category) return false;
    if (!query) return true;

    const haystack = normalizeSearchText([
      topic.topicName, topic.concept, topic.keywords, topic.mnemonic,
      topic.relatedTopics, topic.categoryName, topic.categoryCode,
      topic.subnotePages, topic.textbookPages
    ].join(' '));
    return haystack.includes(query);
  }).sort(compareTopics);

  visibleCount = PAGE_SIZE;
  renderTopicList();

  if (!filteredTopics.length) {
    clearDetailForNoResults();
    return;
  }

  if (preserveCurrent && currentTopicId && filteredTopics.some(t => t.topicId === currentTopicId)) {
    showTopicById(currentTopicId, { scrollList: false });
  } else if (!currentTopicId || !filteredTopics.some(t => t.topicId === currentTopicId)) {
    showTopicById(filteredTopics[0].topicId, { scrollList: false });
  } else {
    updateNavigation();
  }
}

function renderTopicList() {
  els.resultCount.textContent = `${filteredTopics.length.toLocaleString()}건`;
  const rows = filteredTopics.slice(0, visibleCount);
  els.topicList.innerHTML = rows.map(topic => {
    const active = topic.topicId === currentTopicId ? ' active' : '';
    const targetClass = topic.studyTarget === 'N' ? ' target-n' : '';
    return `<button class="topic-item${active}" type="button" role="option" data-topic-id="${escapeHtml(topic.topicId)}" aria-selected="${topic.topicId === currentTopicId}">
      <span class="topic-item-title">${escapeHtml(topic.topicName || '(토픽명 없음)')}</span>
      <span class="topic-item-meta">
        <span class="mini-badge">${escapeHtml(topic.topicId)}</span>
        <span class="mini-badge">${escapeHtml(topic.domain)}</span>
        <span class="mini-badge">${escapeHtml(topic.categoryCode)}</span>
        <span class="mini-badge">코드 ${escapeHtml(topic.topicOrder)}</span>
        <span class="mini-badge">${escapeHtml(topic.importance || '-')}</span>
        <span class="mini-badge${targetClass}">${escapeHtml(topic.studyTarget)}</span>
      </span>
    </button>`;
  }).join('');

  els.topicList.querySelectorAll('.topic-item').forEach(button => {
    button.addEventListener('click', () => {
      showTopicById(button.dataset.topicId);
      if (window.matchMedia('(max-width: 760px)').matches) closeSidebar();
    });
  });

  els.loadMoreBtn.classList.toggle('hidden', visibleCount >= filteredTopics.length);
}

function showTopicById(topicId, { scrollList = true } = {}) {
  const topic = filteredTopics.find(t => t.topicId === topicId);
  if (!topic) {
    if (filteredTopics.length) return showTopicById(filteredTopics[0].topicId, { scrollList });
    return clearDetailForNoResults();
  }

  const topicIndex = filteredTopics.findIndex(t => t.topicId === topic.topicId);
  if (topicIndex >= visibleCount) {
    visibleCount = Math.ceil((topicIndex + 1) / PAGE_SIZE) * PAGE_SIZE;
  }

  currentTopicId = topic.topicId;
  localStorage.setItem(LAST_TOPIC_KEY, topic.topicId);
  els.emptyState.classList.add('hidden');
  els.topicDetail.classList.remove('hidden');
  els.bottomNav.classList.remove('hidden');

  setText('detailTopicId', topic.topicId);
  setText('detailDomain', `${topic.domain} · ${topic.domainName}`);
  setText('detailCategoryCode', topic.categoryCode);
  setText('detailTopicOrder', `코드 ${topic.topicOrder}`);
  setText('detailImportance', `중요도 ${topic.importance || '-'}`);
  setText('detailStudyTarget', `학습대상 ${topic.studyTarget}`);
  els.detailStudyTarget.classList.toggle('target-n', topic.studyTarget === 'N');
  setText('detailCategory', `${topic.categoryCode} · ${topic.categoryName}`);
  setText('detailTitle', topic.topicName || '(토픽명 없음)');
  setText('detailDomainName', `${topic.domain} (${topic.domainName})`);
  setText('detailConcept', topic.concept || '-');
  setText('detailKeywords', topic.keywords || '-');
  setText('detailMnemonic', topic.mnemonic || '-');
  setText('detailRelated', topic.relatedTopics || '-');
  setText('detailSubnotePages', topic.subnotePages || '-');
  setText('detailTextbookPages', topic.textbookPages || '-');
  setText('detailStatus', topic.status || '-');
  setText('detailSourceDomain', topic.sourceDomain || '-');
  setText('detailExclusionReason', topic.studyExclusionReason || '-');
  setText('detailNotes', topic.notes || '-');

  updateNavigation();
  renderTopicList();
  if (scrollList) {
    requestAnimationFrame(() => els.topicList.querySelector(`[data-topic-id="${cssEscape(topic.topicId)}"]`)?.scrollIntoView({ block: 'nearest' }));
  }
}

function clearDetailForNoResults() {
  currentTopicId = null;
  els.emptyState.classList.remove('hidden');
  els.topicDetail.classList.add('hidden');
  els.bottomNav.classList.add('hidden');
  els.emptyState.querySelector('h2').textContent = allTopics.length ? '검색 결과가 없습니다.' : '학습 데이터를 준비해 주세요.';
  els.emptyState.querySelector('p').textContent = allTopics.length
    ? '검색조건을 변경하거나 초기화해 주세요.'
    : '처음 한 번만 Google Spreadsheet의 텍스트 데이터를 받아 기기에 저장합니다.';
}

function showEmptyState() {
  filteredTopics = [];
  els.topicList.innerHTML = '';
  els.resultCount.textContent = '0건';
  clearDetailForNoResults();
}

function moveTopic(direction) {
  if (!currentTopicId || !filteredTopics.length) return;
  const index = filteredTopics.findIndex(t => t.topicId === currentTopicId);
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= filteredTopics.length) return;
  showTopicById(filteredTopics[nextIndex].topicId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateNavigation() {
  const index = filteredTopics.findIndex(t => t.topicId === currentTopicId);
  els.prevBtn.disabled = index <= 0;
  els.nextBtn.disabled = index < 0 || index >= filteredTopics.length - 1;
  els.detailCounter.textContent = index >= 0 ? `${(index + 1).toLocaleString()} / ${filteredTopics.length.toLocaleString()}` : '-';
}

function openSidebar() {
  els.sidebar.classList.add('open');
  els.sidebarBackdrop.classList.add('open');
}
function closeSidebar() {
  els.sidebar.classList.remove('open');
  els.sidebarBackdrop.classList.remove('open');
}

function setLoading(show, message = '처리 중...') {
  els.loadingMessage.textContent = message;
  els.loadingOverlay.classList.toggle('hidden', !show);
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 3800);
}

function setText(id, value) {
  els[id].textContent = value ?? '';
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function normalizeSearchText(value) {
  return String(value || '').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
