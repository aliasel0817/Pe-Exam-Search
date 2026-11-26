/* Personal main-view text highlights. Uses the existing signed annotation store. */
(function (global) {
  'use strict';

  const FORMAT = 'pe-study-text-highlight';
  const KIND = 'text-highlight';
  const PREFIX = KIND + ':';
  const VERSION = 1;
  const OPACITY = 0.38;
  const MAX_HISTORY = 30;
  const MAX_QUOTE = 12000;
  const MAX_CONTEXT = 48;
  const FIELDS = new Set([
    'concept', 'background', 'necessity', 'features', 'technicalComponents',
    'keywords', 'mnemonic', 'relatedTopics',
  ]);
  const TOPIC_PATTERN = /^[A-Za-z0-9가-힣_.-]{1,120}$/;
  const ID_PATTERN = /^hl-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

  function fail(message) {
    throw new Error(message);
  }

  function validTopic(value) {
    return typeof value === 'string' && TOPIC_PATTERN.test(value);
  }

  function requireTopic(value) {
    if (!validTopic(value)) fail('형광펜을 저장할 토픽을 먼저 선택해 주세요.');
    return value;
  }

  function colorValue(value) {
    const color = value === undefined ? '#ffeb3b' : value;
    if (typeof color !== 'string' || !COLOR_PATTERN.test(color)) {
      fail('형광펜 색상 형식이 올바르지 않습니다.');
    }
    return color.toLowerCase();
  }

  function keyFor(topicId, id) {
    return PREFIX + topicId + ':' + id;
  }

  function parseKey(key) {
    if (typeof key !== 'string' || key.length > 300 || !key.startsWith(PREFIX)) return null;
    const parts = key.slice(PREFIX.length).split(':');
    if (parts.length !== 2 || !validTopic(parts[0]) || !ID_PATTERN.test(parts[1])) return null;
    return { topicId: parts[0], id: parts[1] };
  }

  function stringContext(value) {
    if (value === undefined) return '';
    if (typeof value !== 'string' || value.length > MAX_CONTEXT) {
      fail('선택한 글자의 앞뒤 문맥이 올바르지 않습니다.');
    }
    return value;
  }

  function anchorValue(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !FIELDS.has(value.field)) {
      fail('형광펜을 표시할 본문 영역이 올바르지 않습니다.');
    }
    const start = value.start;
    const end = value.end;
    const quote = value.quote;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start
        || typeof quote !== 'string' || !quote.trim() || quote.length > MAX_QUOTE
        || end - start !== quote.length) {
      fail('선택한 글자 범위가 올바르지 않습니다. 본문에서 다시 선택해 주세요.');
    }
    if (typeof value.fingerprint !== 'string' || !value.fingerprint
        || value.fingerprint.length > 256) {
      fail('본문의 변경 확인 정보가 없습니다. 글자를 다시 선택해 주세요.');
    }
    return {
      field: value.field,
      start,
      end,
      quote,
      prefix: stringContext(value.prefix),
      suffix: stringContext(value.suffix),
      fingerprint: value.fingerprint,
    };
  }

  // Build a canonical, bounded packet; never trust arbitrary note JSON or HTML.
  function packetValue(value, expectedKey) {
    if (!value || value.format !== FORMAT || value.version !== VERSION
        || !validTopic(value.topicId) || typeof value.id !== 'string' || !ID_PATTERN.test(value.id)
        || keyFor(value.topicId, value.id) !== expectedKey
        || typeof value.color !== 'string' || !COLOR_PATTERN.test(value.color)
        || value.opacity !== OPACITY || typeof value.modifiedAt !== 'string'
        || !Number.isFinite(Date.parse(value.modifiedAt))) return null;
    try {
      return {
        format: FORMAT,
        version: VERSION,
        id: value.id,
        topicId: value.topicId,
        ...anchorValue(value),
        color: colorValue(value.color),
        opacity: OPACITY,
        modifiedAt: value.modifiedAt,
      };
    } catch (_) {
      return null;
    }
  }

  function readState(documentData, key) {
    if (!documentData || documentData.key !== key || !parseKey(key)
        || documentData.kind !== KIND || !Array.isArray(documentData.objects)) return null;
    const updatedAt = typeof documentData.updatedAt === 'string' ? documentData.updatedAt : '';
    if (documentData.objects.length === 0) {
      return { packet: null, updatedAt, createdAt: '' };
    }
    if (documentData.objects.length !== 1) return null;
    const object = documentData.objects[0];
    if (!object || object.type !== 'note' || typeof object.text !== 'string'
        || object.text.length > 90000) return null;
    let parsed;
    try { parsed = JSON.parse(object.text); } catch (_) { return null; }
    const packet = packetValue(parsed, key);
    if (!packet || object.id !== packet.id) return null;
    return {
      packet,
      updatedAt,
      createdAt: typeof object.createdAt === 'string' ? object.createdAt : packet.modifiedAt,
    };
  }

  function stateSignature(state) {
    return state ? JSON.stringify({ packet: state.packet, updatedAt: state.updatedAt }) : '';
  }

  function sameContent(left, right) {
    if (!left || !right) return false;
    const a = left.packet ? { ...left.packet, modifiedAt: '' } : null;
    const b = right.packet ? { ...right.packet, modifiedAt: '' } : null;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function makeId() {
    const cryptoApi = global.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
      return 'hl-' + cryptoApi.randomUUID();
    }
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
      fail('이 브라우저에서는 안전한 형광펜 식별자를 만들 수 없습니다.');
    }
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return 'hl-' + [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }

  function create(host) {
    const required = ['documents', 'getDocument', 'persist', 'ready', 'cloudState', 'conflicts', 'requestSync'];
    if (!host || required.some(name => typeof host[name] !== 'function')) {
      fail('본문 형광펜 저장 연결이 준비되지 않았습니다.');
    }
    const histories = new Map();
    const pendingKeys = new Set();
    const localErrors = new Map();
    let queue = Promise.resolve();
    let lastTimestamp = 0;
    let syncScheduleError = '';

    function documentMap() {
      const result = host.documents();
      return result instanceof Map ? result : new Map();
    }

    function ready() {
      return Boolean(host.ready());
    }

    function requireReady() {
      if (!ready()) fail('형광펜 저장소를 준비 중입니다. 잠시 후 다시 시도해 주세요.');
    }

    function timestamp() {
      lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
      return new Date(lastTimestamp).toISOString();
    }

    function enqueue(operation) {
      const result = queue.then(() => {
        requireReady();
        return operation();
      });
      queue = result.catch(() => undefined);
      return result;
    }

    function topicDocuments(topicId) {
      if (!validTopic(topicId)) return [];
      return Array.from(documentMap().entries()).filter(([key]) => parseKey(key)?.topicId === topicId);
    }

    function list(topicId) {
      return topicDocuments(topicId)
        .map(([key, documentData]) => {
          const state = readState(documentData, key);
          return state?.packet ? { key, ...state.packet } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.field.localeCompare(b.field) || a.start - b.start
          || a.end - b.end || a.id.localeCompare(b.id));
    }

    function selected(keys) {
      if (!Array.isArray(keys)) fail('형광펜 선택 목록이 올바르지 않습니다.');
      const uniqueKeys = [...new Set(keys)];
      const documents = documentMap();
      let topicId = '';
      const entries = uniqueKeys.map(key => {
        const parsed = parseKey(key);
        if (!parsed || (topicId && parsed.topicId !== topicId)) {
          fail('한 토픽의 형광펜만 함께 변경할 수 있습니다.');
        }
        topicId = parsed.topicId;
        const documentData = documents.get(key);
        const state = readState(documentData, key);
        if (!state) fail('형광펜 표시가 변경되었습니다. 본문에서 다시 선택해 주세요.');
        return { key, documentData, state };
      });
      return { topicId, entries };
    }

    function writeState(documentData, state) {
      documentData.kind = KIND;
      documentData.schemaVersion = 3;
      documentData.coordinateSpace = 'normalized-0-1';
      documentData.updatedAt = state.updatedAt;
      const packet = state.packet;
      documentData.objects = packet ? [{
        id: packet.id,
        type: 'note',
        position: { x: 0, y: 0 },
        sizeN: 0.03,
        color: packet.color,
        opacity: OPACITY,
        createdAt: state.createdAt || packet.modifiedAt,
        text: JSON.stringify(packet),
      }] : [];
      // Block a clean-document cloud pull while the host starts local persistence.
      // The host owns mutation serials, revision checks, retry and actual sync.
      documentData.cloudDirty = true;
      documentData.saveState = 'dirty';
      documentData.saveError = '';
    }

    function remember(topicId, changes) {
      let history = histories.get(topicId);
      if (!history) histories.set(topicId, history = []);
      history.push({ changes });
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    }

    async function saveChanges(changes) {
      // Stage the full selection in one synchronous turn. All host persist calls
      // start before awaiting, so each document is protected as locally dirty.
      const staged = changes.map(change => {
        const documentData = host.getDocument(change.key);
        if (!documentData || documentData.key !== change.key) {
          fail('형광펜 저장 문서를 준비하지 못했습니다.');
        }
        return { change, documentData };
      });
      for (const { change, documentData } of staged) {
        writeState(documentData, change.after);
        pendingKeys.add(change.key);
        localErrors.delete(change.key);
      }
      const jobs = staged.map(({ documentData }) => {
        try { return Promise.resolve(host.persist(documentData)); }
        catch (error) { return Promise.reject(error); }
      });
      const results = await Promise.allSettled(jobs);
      const failures = [];
      results.forEach((result, index) => {
        const { change, documentData } = staged[index];
        pendingKeys.delete(change.key);
        if (result.status === 'rejected') {
          const message = result.reason?.message || String(result.reason || '로컬 저장 실패');
          localErrors.set(change.key, { documentData, message });
          documentData.cloudDirty = true;
          failures.push(message);
        } else {
          localErrors.delete(change.key);
        }
      });
      if (failures.length) {
        const error = new Error('형광펜 로컬 저장을 완료하지 못했습니다. 화면의 변경은 유지되며 저장 상태를 확인해 주세요. ' + failures[0]);
        error.name = 'TextHighlightSaveError';
        error.keys = staged.map(({ change }) => change.key);
        throw error;
      }
      try {
        host.requestSync();
        syncScheduleError = '';
      } catch (error) {
        syncScheduleError = error?.message || String(error);
      }
      return changes.filter(change => change.after.packet)
        .map(change => ({ key: change.key, ...change.after.packet }));
    }

    function add(topicId, anchors, color) {
      return enqueue(async () => {
        requireTopic(topicId);
        if (!Array.isArray(anchors) || !anchors.length) fail('먼저 형광펜으로 표시할 글자를 선택해 주세요.');
        const normalized = anchors.map(anchorValue);
        const selectedColor = colorValue(color);
        const modifiedAt = timestamp();
        const used = new Set(documentMap().keys());
        const changes = normalized.map(anchor => {
          let id;
          let key;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            id = makeId();
            key = keyFor(topicId, id);
            if (!used.has(key)) break;
          }
          if (used.has(key)) fail('형광펜 식별자를 준비하지 못했습니다. 다시 시도해 주세요.');
          used.add(key);
          const packet = {
            format: FORMAT, version: VERSION, id, topicId, ...anchor,
            color: selectedColor, opacity: OPACITY, modifiedAt,
          };
          return {
            key,
            before: { packet: null, updatedAt: '', createdAt: '' },
            after: { packet, updatedAt: modifiedAt, createdAt: modifiedAt },
          };
        });
        remember(topicId, changes);
        return saveChanges(changes);
      });
    }

    function recolor(keys, color) {
      return enqueue(async () => {
        const selectedColor = colorValue(color);
        const selection = selected(keys);
        const modifiedAt = timestamp();
        const changes = selection.entries.filter(entry => entry.state.packet
          && entry.state.packet.color !== selectedColor).map(entry => ({
          key: entry.key,
          before: entry.state,
          after: {
            packet: { ...entry.state.packet, color: selectedColor, modifiedAt },
            updatedAt: modifiedAt,
            createdAt: entry.state.createdAt,
          },
        }));
        if (!changes.length) return [];
        remember(selection.topicId, changes);
        return saveChanges(changes);
      });
    }

    function remove(keys) {
      return enqueue(async () => {
        const selection = selected(keys);
        const modifiedAt = timestamp();
        const changes = selection.entries.filter(entry => entry.state.packet).map(entry => ({
          key: entry.key,
          before: entry.state,
          after: { packet: null, updatedAt: modifiedAt, createdAt: '' },
        }));
        if (!changes.length) return [];
        remember(selection.topicId, changes);
        await saveChanges(changes);
        return changes.map(change => change.key);
      });
    }

    function undo(topicId) {
      return enqueue(async () => {
        requireTopic(topicId);
        const history = histories.get(topicId);
        const action = history?.[history.length - 1];
        if (!action) return [];
        const documents = documentMap();
        for (const change of action.changes) {
          const current = readState(documents.get(change.key), change.key);
          if (stateSignature(current) !== stateSignature(change.after)) {
            fail('다른 기기에서 변경된 형광펜이 있어 실행 취소하지 않았습니다. 현재 표시를 확인해 주세요.');
          }
        }
        const modifiedAt = timestamp();
        const inverse = action.changes.map(change => ({
          key: change.key,
          before: change.after,
          after: {
            packet: change.before.packet ? { ...change.before.packet, modifiedAt } : null,
            updatedAt: modifiedAt,
            createdAt: change.before.createdAt,
          },
        }));
        history.pop();
        // Rebase only the nearest matching older action, so repeated undo works
        // after our own fresh timestamp without accepting intervening remote edits.
        for (const change of inverse) {
          for (let index = history.length - 1; index >= 0; index -= 1) {
            const prior = history[index].changes.find(item => item.key === change.key);
            if (!prior) continue;
            if (sameContent(prior.after, change.after)) prior.after = change.after;
            break;
          }
        }
        return saveChanges(inverse);
      });
    }

    function canUndo(topicId) {
      return ready() && validTopic(topicId) && Boolean(histories.get(topicId)?.length);
    }

    function status(topicId) {
      const entries = topicDocuments(topicId);
      const conflictMap = host.conflicts();
      const cloud = host.cloudState() || {};
      let localPending = 0;
      let cloudPending = 0;
      let conflicts = 0;
      let saveError = '';
      let count = 0;
      for (const [key, documentData] of entries) {
        const state = readState(documentData, key);
        if (state?.packet) count += 1;
        if (pendingKeys.has(key) || ['dirty', 'saving', 'retry'].includes(documentData.saveState)) localPending += 1;
        if (documentData.cloudDirty) cloudPending += 1;
        if (conflictMap?.has(key)) conflicts += 1;
        const error = localErrors.get(key);
        if (error && (error.documentData !== documentData
            || ['saved', 'clean'].includes(documentData.saveState))) localErrors.delete(key);
        const ownError = localErrors.get(key)?.message || '';
        if (!saveError) saveError = ownError || documentData.saveError || '';
      }
      if (!saveError && cloudPending) saveError = syncScheduleError || cloud.lastError || '';
      return { localPending, cloudPending, conflicts, saveError, count, ready: ready() };
    }

    return Object.freeze({ list, add, recolor, remove, undo, canUndo, status });
  }

  global.StudyTextHighlightStorage = Object.freeze({ create });
})(window);
