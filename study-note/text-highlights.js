(function (global) {
  'use strict';

  const FIELD_IDS = {
    concept: 'detailConcept', background: 'detailBackground', necessity: 'detailNecessity',
    features: 'detailFeatures', technicalComponents: 'detailTechnicalComponents',
    keywords: 'detailKeywords', mnemonic: 'detailMnemonic', relatedTopics: 'detailRelated'
  };
  const PALETTE = [
    ['#ffeb3b', '노랑'], ['#a5d6a7', '초록'], ['#81d4fa', '파랑'],
    ['#f8bbd0', '분홍'], ['#ffcc80', '주황']
  ];
  const PREF_KEY = 'peStudyNote.textHighlight.color.v1';
  let api = null;

  function mount(host) {
    if (api) return api;
    const core = global.StudyTextHighlightCore;
    if (!core || !global.StudyTextHighlightStorage || !host) return null;
    const store = global.StudyTextHighlightStorage.create(host);
    const fields = Object.entries(FIELD_IDS).map(([id, domId]) => ({ id, element: document.getElementById(domId) }))
      .filter(field => field.element);
    const actionBar = document.querySelector('.learning-action-bar');
    if (!actionBar || !fields.length) return null;
    for (const field of fields) field.element.dataset.textHighlightField = field.id;
    const fieldMap = new Map(fields.map(field => [field.id, field.element]));
    let savedColor = PALETTE[0][0];
    try { savedColor = localStorage.getItem(PREF_KEY) || savedColor; } catch (_) {}
    const state = {
      topicId: '', color: /^#[0-9a-f]{6}$/i.test(savedColor) ? savedColor.toLowerCase() : PALETTE[0][0],
      penMode: false, visible: true, busy: false, pending: null, resolved: [], records: [],
      unresolved: [], frame: 0, selectionTimer: 0, suppressSelectionUntil: 0,
      pen: null, tap: null, renderKeys: new Set(), nativeHighlights: !!(global.CSS?.highlights && global.Highlight)
    };
    const bar = document.createElement('section');
    bar.id = 'textHighlightBar';
    bar.className = 'text-highlight-bar text-highlight-ui';
    bar.setAttribute('aria-label', '본문 형광펜');
    const row = document.createElement('div');
    row.className = 'text-highlight-row';
    const label = document.createElement('strong');
    label.className = 'text-highlight-label';
    label.textContent = '본문 형광펜';
    row.append(label);
    const penButton = button('S펜 OFF', 'text-highlight-mode', () => {
      state.penMode = !state.penMode;
      updateControls();
      host.toast(state.penMode ? 'S펜으로 글자를 드래그하면 선택한 색으로 표시합니다. 손가락은 화면 이동에 사용하세요.' : '글자를 선택한 뒤 형광펜 색상을 눌러 주세요.');
    });
    penButton.title = 'S펜으로 글자 범위를 드래그해 바로 표시';
    row.append(penButton);
    const palette = makePalette();
    row.append(palette);
    const custom = document.createElement('input');
    custom.type = 'color';
    custom.className = 'text-highlight-color';
    custom.value = state.color;
    custom.setAttribute('aria-label', '형광펜 사용자 지정 색상');
    custom.title = '사용자 지정 색상';
    custom.addEventListener('pointerdown', captureBeforeUi);
    custom.addEventListener('input', () => setColor(custom.value));
    custom.addEventListener('change', () => applyColor(custom.value));
    row.append(custom);
    const removeButton = button('지우기', 'text-highlight-action', removeSelected);
    const undoButton = button('↶ 실행 취소', 'text-highlight-action', undo);
    const visibilityButton = button('표시 ON', 'text-highlight-action', () => {
      state.visible = !state.visible;
      clearPending();
      refresh();
    });
    const syncButton = button('☁ 동기화', 'text-highlight-action', async () => {
      if (state.busy) return;
      await host.sync();
      refresh();
    });
    const conflictButton = button('충돌 확인', 'text-highlight-action', () => host.openConflicts());
    conflictButton.hidden = true;
    const unresolvedButton = button('위치 확인', 'text-highlight-action', showUnresolved);
    unresolvedButton.hidden = true;
    row.append(removeButton, undoButton, visibilityButton, syncButton, conflictButton, unresolvedButton);
    const status = document.createElement('span');
    status.className = 'text-highlight-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const help = document.createElement('p');
    help.className = 'text-highlight-help';
    help.textContent = '글자를 드래그하거나 길게 눌러 선택한 뒤 색상을 누르세요. 표시한 글자를 누르면 색상 변경·지우기가 가능합니다.';
    bar.append(row, status, help);
    actionBar.after(bar);

    const popover = document.createElement('div');
    popover.id = 'textHighlightPopover';
    popover.className = 'text-highlight-popover text-highlight-ui';
    popover.setAttribute('role', 'toolbar');
    popover.setAttribute('aria-label', '선택한 글자 형광펜');
    popover.hidden = true;
    const popRow = document.createElement('div');
    popRow.className = 'text-highlight-row';
    popRow.append(makePalette());
    const popRemove = button('지우기', 'text-highlight-action', removeSelected);
    popRow.append(popRemove, button('닫기', 'text-highlight-action', () => clearPending()));
    popover.append(popRow);
    document.body.append(popover);
    const dynamicStyle = document.createElement('style');
    dynamicStyle.dataset.textHighlightStyles = '1';
    document.head.append(dynamicStyle);
    const fallbackLayer = document.createElement('div');
    fallbackLayer.className = 'text-highlight-fallback-layer';
    fallbackLayer.setAttribute('aria-hidden', 'true');
    fallbackLayer.hidden = true;
    document.body.append(fallbackLayer);

    function button(text, className, handler) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = className;
      element.textContent = text;
      element.addEventListener('pointerdown', event => {
        captureBeforeUi();
        // Keep the browser selection intact until the color/action is applied.
        if (event.pointerType !== 'touch') event.preventDefault();
      });
      element.addEventListener('click', event => {
        event.preventDefault();
        Promise.resolve(handler(event)).catch(error => {
          host.toast(error?.message || '형광펜 작업을 완료하지 못했습니다.');
          refresh();
        });
      });
      return element;
    }

    function makePalette() {
      const group = document.createElement('div');
      group.className = 'text-highlight-palette';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', '형광펜 색상');
      for (const [color, name] of PALETTE) {
        const swatch = button('', 'text-highlight-swatch', () => applyColor(color));
        swatch.dataset.color = color;
        swatch.style.setProperty('--highlight-color', color);
        swatch.setAttribute('aria-label', name + ' 형광펜');
        swatch.title = name + ' 형광펜';
        group.append(swatch);
      }
      return group;
    }

    function setColor(color) {
      if (!/^#[0-9a-f]{6}$/i.test(color)) return;
      state.color = color.toLowerCase();
      try { localStorage.setItem(PREF_KEY, state.color); } catch (_) {}
      custom.value = state.color;
      updateControls();
    }

    function activeTopic() { return String(host.topicId() || ''); }
    function canEdit() { return !!activeTopic() && host.ready() && !state.busy; }
    function fieldVisible(element) {
      if (!element || !element.isConnected || !element.getClientRects().length) return false;
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('[hidden], .hidden');
    }

    function captureBeforeUi() {
      if (state.pending?.keys?.length) return;
      captureSelection(false);
    }

    function captureSelection(show = true) {
      if (state.busy || state.pen || Date.now() < state.suppressSelectionUntil) return false;
      const topicId = activeTopic();
      if (!topicId) return false;
      const selection = global.getSelection();
      const anchors = core.selectionAnchors(selection, fields);
      if (!anchors.length) return false;
      state.pending = { topicId, anchors, keys: [] };
      if (show && canEdit()) positionPopover();
      updateControls();
      return true;
    }

    function clearPending(clearSelection = false) {
      state.pending = null;
      popover.hidden = true;
      if (clearSelection) {
        state.suppressSelectionUntil = Date.now() + 150;
        global.getSelection()?.removeAllRanges();
      }
      updateControls();
    }

    function selectionRanges() {
      if (!state.pending || state.pending.topicId !== activeTopic()) return [];
      return (state.pending.anchors || []).map(anchor => {
        const range = core.resolveAnchor(fieldMap.get(anchor.field), anchor);
        return range ? { field: anchor.field, range } : null;
      }).filter(Boolean);
    }

    function rangesOverlap(a, b) {
      const aStart = a.cloneRange(); aStart.collapse(true);
      const aEnd = a.cloneRange(); aEnd.collapse(false);
      const bStart = b.cloneRange(); bStart.collapse(true);
      const bEnd = b.cloneRange(); bEnd.collapse(false);
      return aStart.compareBoundaryPoints(0, bEnd) < 0 && aEnd.compareBoundaryPoints(0, bStart) > 0;
    }

    function selectedKeys(exact = false) {
      if (!state.pending || state.pending.topicId !== activeTopic()) return [];
      if (state.pending.keys?.length) return state.pending.keys.filter(key => state.records.some(record => record.key === key));
      const ranges = selectionRanges();
      return state.resolved.filter(item => ranges.some(selected => selected.field === item.record.field && (exact
        ? selected.range.compareBoundaryPoints(0, item.range) === 0 && selected.range.compareBoundaryPoints(2, item.range) === 0
        : rangesOverlap(selected.range, item.range)))).map(item => item.record.key);
    }

    async function mutate(work, message) {
      if (!canEdit()) return;
      state.busy = true;
      updateControls();
      try {
        await work();
        clearPending(true);
        if (message) host.toast(message);
      } catch (error) {
        host.toast(error?.message || '형광펜 저장을 완료하지 못했습니다. 저장 상태를 확인해 주세요.');
      } finally {
        state.busy = false;
        refresh();
      }
    }

    async function applyColor(color) {
      setColor(color);
      if (!canEdit()) return;
      if (!state.pending || state.pending.topicId !== activeTopic()) {
        host.toast('선택한 색상을 사용합니다. 표시할 글자를 먼저 선택해 주세요.');
        return;
      }
      const pending = state.pending;
      const exactKeys = selectedKeys(true);
      if (pending.keys.length || (exactKeys.length && exactKeys.length === pending.anchors.length)) {
        await mutate(() => store.recolor(exactKeys, state.color), '형광펜 색상을 변경했습니다.');
        return;
      }
      const anchors = [];
      for (const anchor of pending.anchors) {
        const range = core.resolveAnchor(fieldMap.get(anchor.field), anchor);
        if (!range) { host.toast('본문이 바뀌었습니다. 글자를 다시 선택해 주세요.'); clearPending(); return; }
        anchors.push(anchor);
      }
      if (!anchors.length) return;
      await mutate(() => store.add(pending.topicId, anchors, state.color), '형광펜을 표시했습니다.');
    }

    async function removeSelected() {
      const keys = selectedKeys();
      if (!keys.length) return host.toast('지울 형광펜 표시를 누르거나 해당 글자를 선택해 주세요.');
      await mutate(() => store.remove(keys), '선택한 형광펜 표시를 지웠습니다.');
    }

    async function undo() {
      const topicId = activeTopic();
      if (!store.canUndo(topicId)) return;
      await mutate(() => store.undo(topicId), '마지막 형광펜 작업을 취소했습니다.');
    }

    function updateControls() {
      const topicId = activeTopic();
      const ready = !!topicId && host.ready();
      const canUse = ready && !state.busy;
      penButton.textContent = state.penMode ? 'S펜 ON' : 'S펜 OFF';
      penButton.setAttribute('aria-pressed', String(state.penMode));
      penButton.disabled = !canUse;
      visibilityButton.textContent = state.visible ? '표시 ON' : '표시 OFF';
      visibilityButton.setAttribute('aria-pressed', String(state.visible));
      visibilityButton.disabled = !ready;
      for (const swatch of document.querySelectorAll('#textHighlightBar [data-color], #textHighlightPopover [data-color]')) {
        swatch.setAttribute('aria-pressed', String(swatch.dataset.color === state.color));
        swatch.disabled = !canUse;
      }
      custom.disabled = !canUse;
      undoButton.disabled = !canUse || !store.canUndo(topicId);
      const removable = canUse && selectedKeys().length > 0;
      removeButton.disabled = !removable;
      popRemove.disabled = !removable;
      const local = store.status(topicId);
      const cloud = host.cloudState();
      syncButton.disabled = !ready || state.busy || cloud.syncing;
      syncButton.textContent = cloud.syncing ? '☁ 동기화 중' : '☁ 동기화';
      conflictButton.hidden = !local.conflicts;
      conflictButton.textContent = '충돌 확인 ' + local.conflicts;
      unresolvedButton.hidden = !state.unresolved.length;
      unresolvedButton.textContent = '위치 확인 ' + state.unresolved.length;
      status.classList.toggle('text-highlight-unresolved', !!(local.conflicts || local.saveError || state.unresolved.length));
      let text = '표시 ' + local.count + '개';
      if (!ready) text = '학습 데이터와 저장소를 불러오는 중';
      else if (local.saveError) text += ' · 저장 오류: ' + local.saveError;
      else if (local.conflicts) text += ' · 다른 기기 변경과 충돌 — 충돌 확인을 눌러 주세요';
      else if (state.busy || local.localPending) text += ' · 기기에 저장 중';
      else if (!navigator.onLine && local.cloudPending) text += ' · 기기 저장됨 · 온라인 연결 후 Google 동기화';
      else if (cloud.syncing) text += ' · Google 동기화 중';
      else if (local.cloudPending) text += cloud.ready ? ' · 기기 저장됨 · Google 동기화 대기' : ' · 기기 저장됨 · Google 연결 확인 필요';
      else if (local.count) text += ' · Google 저장됨';
      else text += ' · 글자를 선택해 시작하세요';
      if (state.unresolved.length) text += ' · 본문 변경으로 위치 확인 ' + state.unresolved.length + '개';
      status.textContent = text;
      status.title = text;
    }

    function viewport() {
      const vv = global.visualViewport;
      return { left: vv?.offsetLeft || 0, top: vv?.offsetTop || 0,
        width: vv?.width || document.documentElement.clientWidth, height: vv?.height || global.innerHeight };
    }

    function positionPopover() {
      if (!state.pending || state.pending.topicId !== activeTopic() || !canEdit()) { popover.hidden = true; return; }
      const ranges = state.pending.keys.length
        ? state.resolved.filter(item => state.pending.keys.includes(item.record.key)).map(item => item.range)
        : selectionRanges().map(item => item.range);
      const rects = ranges.flatMap(range => core.rangesToRects(range));
      const vp = viewport();
      const visibleRects = rects.filter(rect => rect.bottom > vp.top + 5 && rect.top < vp.top + vp.height - 5 && rect.right > vp.left && rect.left < vp.left + vp.width);
      if (!visibleRects.length) { popover.hidden = true; return; }
      popover.hidden = false;
      const box = popover.getBoundingClientRect();
      const anchor = visibleRects[visibleRects.length - 1];
      const left = Math.max(vp.left + 8, Math.min(anchor.left, vp.left + vp.width - box.width - 8));
      const below = anchor.bottom + 10;
      const top = below + box.height <= vp.top + vp.height - 12 ? below : Math.max(vp.top + 8, visibleRects[0].top - box.height - 10);
      popover.style.left = left + 'px';
      popover.style.top = top + 'px';
    }

    function clearPaint() {
      if (global.CSS?.highlights) for (const key of state.renderKeys) global.CSS.highlights.delete(key);
      state.renderKeys.clear();
      dynamicStyle.textContent = '';
      fallbackLayer.replaceChildren();
      fallbackLayer.hidden = true;
    }

    function paint() {
      clearPaint();
      if (!state.visible || !state.resolved.length) return;
      if (state.nativeHighlights) {
        try {
          const rules = [];
          state.resolved.forEach((item, index) => {
            const name = 'pe-text-highlight-' + index;
            const highlight = new global.Highlight(item.range);
            if ('priority' in highlight) highlight.priority = index;
            global.CSS.highlights.set(name, highlight);
            state.renderKeys.add(name);
            const color = item.record.color;
            const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
            rules.push('::highlight(' + name + '){background-color:rgba(' + rgb.join(',') + ',0.38);}');
          });
          dynamicStyle.textContent = rules.join('\n');
          return;
        } catch (_) { state.nativeHighlights = false; clearPaint(); }
      }
      fallbackLayer.hidden = false;
      const fragment = document.createDocumentFragment();
      const vp = viewport();
      for (const item of state.resolved) {
        for (const rect of core.rangesToRects(item.range)) {
          const top = Math.max(rect.top, vp.top), left = Math.max(rect.left, vp.left);
          const right = Math.min(rect.right, vp.left + vp.width), bottom = Math.min(rect.bottom, vp.top + vp.height);
          if (right <= left || bottom <= top) continue;
          const mark = document.createElement('span');
          mark.className = 'text-highlight-fallback-rect';
          Object.assign(mark.style, { left: left + 'px', top: top + 'px', width: (right - left) + 'px', height: (bottom - top) + 'px', backgroundColor: item.record.color });
          fragment.append(mark);
        }
      }
      fallbackLayer.append(fragment);
    }

    function render() {
      state.frame = 0;
      const topicId = activeTopic();
      if (state.topicId !== topicId) {
        state.topicId = topicId;
        state.pending = null;
        state.pen = null;
        popover.hidden = true;
      }
      state.records = topicId && host.ready() ? store.list(topicId) : [];
      state.resolved = [];
      state.unresolved = [];
      for (const record of state.records) {
        const element = fieldMap.get(record.field);
        if (!fieldVisible(element)) continue;
        const range = core.resolveAnchor(element, record);
        if (range) state.resolved.push({ record, range });
        else state.unresolved.push(record);
      }
      state.resolved.sort((a, b) => String(a.record.modifiedAt).localeCompare(String(b.record.modifiedAt)));
      paint();
      if (state.pending && selectionRanges().length === 0 && !state.pending.keys.length) state.pending = null;
      updateControls();
      positionPopover();
    }

    function refresh() {
      if (!state.frame) state.frame = requestAnimationFrame(render);
    }

    function showUnresolved() {
      const existing = document.getElementById('textHighlightUnresolved');
      if (existing) existing.remove();
      const dialog = document.createElement('dialog');
      dialog.id = 'textHighlightUnresolved';
      dialog.className = 'text-highlight-ui text-highlight-unresolved-dialog';
      const title = document.createElement('h3'); title.textContent = '본문이 바뀌어 위치를 확인할 표시';
      const description = document.createElement('p');
      description.textContent = '저장된 문구와 현재 본문이 일치하지 않는 표시입니다. 필요한 글자를 다시 선택해 표시하거나 아래에서 이전 표시를 지울 수 있습니다.';
      dialog.append(title, description);
      for (const record of state.unresolved) {
        const line = document.createElement('div'); line.className = 'text-highlight-unresolved-row';
        const quote = document.createElement('p'); quote.textContent = record.quote.slice(0, 240);
        const remove = button('이 표시 지우기', 'text-highlight-action', async () => {
          await mutate(() => store.remove([record.key]), '이전 형광펜 표시를 지웠습니다.');
          line.remove();
        });
        line.append(quote, remove); dialog.append(line);
      }
      const close = button('닫기', 'text-highlight-action', () => { dialog.close(); dialog.remove(); });
      dialog.append(close); document.body.append(dialog);
      dialog.addEventListener('close', () => dialog.remove(), { once: true });
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else { dialog.setAttribute('open', ''); dialog.style.position = 'fixed'; }
    }

    function pointInField(event) {
      const element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
      const field = element?.closest?.('.study-text[data-text-highlight-field]');
      return field && fieldMap.get(field.dataset.textHighlightField) === field && fieldVisible(field) ? field : null;
    }

    function caretAt(x, y, field) {
      let node, offset;
      if (document.caretPositionFromPoint) {
        const caret = document.caretPositionFromPoint(x, y);
        node = caret?.offsetNode; offset = caret?.offset;
      } else if (document.caretRangeFromPoint) {
        const caret = document.caretRangeFromPoint(x, y);
        node = caret?.startContainer; offset = caret?.startOffset;
      }
      if (!node || !field.contains(node) || node.nodeType !== 3) return null;
      return { node, offset };
    }

    function updatePenSelection(event) {
      const pen = state.pen;
      if (!pen || pen.pointerId !== event.pointerId || pen.topicId !== activeTopic()) return;
      const caret = caretAt(event.clientX, event.clientY, pen.field);
      if (!caret) return;
      try {
        const first = document.createRange(); first.setStart(pen.start.node, pen.start.offset); first.collapse(true);
        const last = document.createRange(); last.setStart(caret.node, caret.offset); last.collapse(true);
        const reverse = first.compareBoundaryPoints(0, last) > 0;
        const range = document.createRange();
        range.setStart(reverse ? caret.node : pen.start.node, reverse ? caret.offset : pen.start.offset);
        range.setEnd(reverse ? pen.start.node : caret.node, reverse ? pen.start.offset : caret.offset);
        const selection = global.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        pen.moved = pen.moved || Math.hypot(event.clientX - pen.x, event.clientY - pen.y) > 4;
      } catch (_) {}
    }

    function findMark(x, y, field) {
      return [...state.resolved].reverse().find(item => fieldMap.get(item.record.field) === field && core.rangesToRects(item.range)
        .some(rect => x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2));
    }

    document.addEventListener('pointerdown', event => {
      if (event.target?.closest?.('.text-highlight-ui')) return;
      if (state.pen && event.pointerType === 'touch') { event.preventDefault(); return; }
      const field = pointInField(event);
      state.tap = field ? { x: event.clientX, y: event.clientY, field, pointerId: event.pointerId } : null;
      clearPending();
      if (!field || event.pointerType !== 'pen' || !state.penMode || !canEdit()) return;
      const start = caretAt(event.clientX, event.clientY, field);
      if (!start) return;
      state.pen = { field, start, pointerId: event.pointerId, topicId: activeTopic(), x: event.clientX, y: event.clientY, moved: false };
      event.preventDefault();
      try { field.setPointerCapture(event.pointerId); } catch (_) {}
    }, { passive: false });
    document.addEventListener('pointermove', event => {
      if (!state.pen || state.pen.pointerId !== event.pointerId) return;
      event.preventDefault(); updatePenSelection(event);
    }, { passive: false });
    document.addEventListener('pointerup', event => {
      if (event.target?.closest?.('.text-highlight-ui') || (state.pen && state.pen.pointerId !== event.pointerId)) return;
      const pen = state.pen;
      if (pen && pen.pointerId === event.pointerId) {
        updatePenSelection(event);
        state.pen = null;
        try { pen.field.releasePointerCapture(event.pointerId); } catch (_) {}
        if (pen.moved && captureSelection(false)) { applyColor(state.color); return; }
      }
      const tap = state.tap; state.tap = null;
      if (captureSelection()) return;
      if (!tap || tap.pointerId !== event.pointerId || !state.visible || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) return;
      const found = findMark(event.clientX, event.clientY, tap.field);
      if (!found) return;
      state.suppressSelectionUntil = Date.now() + 180;
      global.getSelection()?.removeAllRanges();
      state.pending = { topicId: activeTopic(), anchors: [], keys: [found.record.key] };
      setColor(found.record.color); updateControls(); positionPopover();
    });
    document.addEventListener('pointercancel', event => {
      if (state.pen?.pointerId === event.pointerId) { state.pen = null; clearPending(true); }
      state.tap = null;
    });
    // Touch-compatible stylus events must not start a native page pan mid-mark.
    document.addEventListener('touchstart', event => { if (state.pen) event.preventDefault(); }, { passive: false });
    document.addEventListener('touchmove', event => { if (state.pen) event.preventDefault(); }, { passive: false });
    document.addEventListener('selectionchange', () => {
      clearTimeout(state.selectionTimer);
      state.selectionTimer = setTimeout(() => {
        if (state.busy || state.pen || Date.now() < state.suppressSelectionUntil || document.activeElement?.closest?.('.text-highlight-ui')) return;
        if (!captureSelection() && !state.pending?.keys?.length) clearPending();
      }, 90);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') clearPending();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey &&
          document.activeElement?.closest?.('#textHighlightBar, #textHighlightPopover')) {
        event.preventDefault(); undo();
      }
    });
    const observer = new MutationObserver(refresh);
    for (const field of fields) observer.observe(field.element, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    const detail = document.getElementById('topicDetail');
    if (detail) observer.observe(detail, { attributes: true, attributeFilter: ['class', 'hidden'] });
    const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null;
    for (const field of fields) resized?.observe(field.element);
    global.addEventListener('resize', refresh, { passive: true });
    global.addEventListener('orientationchange', refresh, { passive: true });
    global.visualViewport?.addEventListener('resize', refresh, { passive: true });
    global.visualViewport?.addEventListener('scroll', refresh, { passive: true });
    document.addEventListener('scroll', () => {
      popover.hidden = true;
      if (!state.nativeHighlights) refresh();
    }, { passive: true, capture: true });
    global.addEventListener('online', refresh);
    global.addEventListener('offline', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    global.addEventListener('study-text-highlights-change', refresh);
    document.fonts?.ready.then(refresh).catch(() => {});
    api = Object.freeze({ refresh, store });
    global.StudyTextHighlights = api;
    refresh();
    return api;
  }

  global.StudyTextHighlights = { mount, refresh: function () { api?.refresh(); } };
})(window);
