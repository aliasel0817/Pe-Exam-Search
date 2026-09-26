const REQUIRED_HEADERS = [
  '통합ID', '구분', '도메인', '도메인명', '대분류', '대분류코드', '코드',
  '중요도', '통합토픽', '개념', '키워드', '암기법', '관련토픽', '이미지',
  '상태', '원본도메인', '서브노트페이지', '교재페이지', '원본/연결행수',
  '다중도메인', '비고', '학습대상', '학습제외사유'
];

const FIELD_MAP = {
  '통합ID': 'topicId',
  '구분': 'domainOrder',
  '도메인': 'domain',
  '도메인명': 'domainName',
  '대분류': 'categoryName',
  '대분류코드': 'categoryCode',
  '코드': 'topicOrder',
  '중요도': 'importance',
  '통합토픽': 'topicName',
  '개념': 'concept',
  '키워드': 'keywords',
  '암기법': 'mnemonic',
  '관련토픽': 'relatedTopics',
  '이미지': 'imageRefs',
  '상태': 'status',
  '원본도메인': 'sourceDomain',
  '서브노트페이지': 'subnotePages',
  '교재페이지': 'textbookPages',
  '원본/연결행수': 'sourceLinkCount',
  '다중도메인': 'multiDomain',
  '비고': 'notes',
  '학습대상': 'studyTarget',
  '학습제외사유': 'studyExclusionReason'
};

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function categorySortNumber(code) {
  const match = clean(code).match(/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function normalizeApiUrl(value) {
  return clean(value).replace(/\/+$/, '');
}

export function isLikelyAppsScriptUrl(value) {
  const url = normalizeApiUrl(value);
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/i.test(url);
}

export async function fetchHealth(apiUrl) {
  const url = `${normalizeApiUrl(apiUrl)}?action=health&_=${Date.now()}`;
  const response = await fetch(url, { method: 'GET', cache: 'no-store', redirect: 'follow' });
  if (!response.ok) throw new Error(`연결 실패: HTTP ${response.status}`);
  const json = await response.json();
  if (!json || json.ok !== true) throw new Error(json?.message || 'Apps Script 응답이 올바르지 않습니다.');
  return json;
}

export async function fetchMasterDataset(apiUrl) {
  const url = `${normalizeApiUrl(apiUrl)}?action=topics&_=${Date.now()}`;
  const response = await fetch(url, { method: 'GET', cache: 'no-store', redirect: 'follow' });
  if (!response.ok) throw new Error(`MASTER 다운로드 실패: HTTP ${response.status}`);
  const json = await response.json();
  if (!json || json.ok !== true) throw new Error(json?.message || 'MASTER 응답이 올바르지 않습니다.');
  return json;
}

export function validateAndNormalizeDataset(payload) {
  const headers = Array.isArray(payload.headers) ? payload.headers.map(clean) : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  const missing = REQUIRED_HEADERS.filter(header => !headers.includes(header));
  if (missing.length) throw new Error(`필수 컬럼 누락: ${missing.join(', ')}`);
  if (rows.length === 0) throw new Error('암기장 데이터가 비어 있습니다.');

  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const topicIds = new Set();
  const topics = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!Array.isArray(row)) throw new Error(`${rowIndex + 2}행 데이터 형식이 올바르지 않습니다.`);

    const topic = {};
    for (const [header, fieldName] of Object.entries(FIELD_MAP)) {
      topic[fieldName] = clean(row[headerIndex[header]]);
    }

    if (!topic.topicId) throw new Error(`${rowIndex + 2}행의 통합ID가 비어 있습니다.`);
    if (topicIds.has(topic.topicId)) throw new Error(`중복 통합ID: ${topic.topicId}`);
    topicIds.add(topic.topicId);

    topic.domainOrder = toNumber(topic.domainOrder, 9999);
    topic.topicOrder = toNumber(topic.topicOrder, 9999);
    topic.categorySortOrder = categorySortNumber(topic.categoryCode);
    topic.sourceLinkCount = toNumber(topic.sourceLinkCount, 0);
    topic.studyTarget = topic.studyTarget.toUpperCase() || 'Y';

    topics.push(topic);
  }

  topics.sort(compareTopics);

  return {
    topics,
    meta: {
      schemaVersion: Number(payload.schemaVersion || 1),
      serverGeneratedAt: clean(payload.generatedAt),
      spreadsheetName: clean(payload.spreadsheetName),
      sheetName: clean(payload.sheetName),
    }
  };
}

export function compareTopics(a, b) {
  return (
    a.domainOrder - b.domainOrder ||
    a.categorySortOrder - b.categorySortOrder ||
    a.categoryCode.localeCompare(b.categoryCode, 'ko', { numeric: true }) ||
    a.topicOrder - b.topicOrder ||
    a.topicId.localeCompare(b.topicId, 'en', { numeric: true })
  );
}
