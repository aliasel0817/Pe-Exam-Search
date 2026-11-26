(function (global) {
  'use strict';

  // Offsets use UTF-16 code units, like DOM Range and JavaScript string.slice.
  // This module only reads the study text; it never wraps or replaces its nodes.
  const MAX_QUOTE_LENGTH = 12000;
  const CONTEXT_LENGTH = 48;
  const MAX_FIELDS = 8;
  const EXCLUDED = '.text-highlight-ui, input, textarea, select, button, script, style, template, noscript, [contenteditable]:not([contenteditable="false"])';

  function hashText(value) {
    const text = String(value == null ? '' : value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return 'fnv1a:' + text.length + ':' + (hash >>> 0).toString(16).padStart(8, '0');
  }

  function elementFor(node) {
    return node && (node.nodeType === 1 ? node : node.parentElement);
  }

  function isExcluded(node) {
    const element = elementFor(node);
    return Boolean(element && element.closest && element.closest(EXCLUDED));
  }

  function isHidden(element, view) {
    if (!element || element.nodeType !== 1) return false;
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return true;
    if (!view || !view.getComputedStyle) return false;
    const style = view.getComputedStyle(element);
    return style.display === 'none' || style.visibility === 'hidden' ||
      style.visibility === 'collapse' || style.contentVisibility === 'hidden';
  }

  function fieldText(element) {
    const empty = { text: '', nodes: [] };
    try {
      if (!element || !element.matches || !element.matches('.study-text') || isExcluded(element)) return empty;
      const doc = element.ownerDocument;
      const view = doc.defaultView;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        if (isHidden(ancestor, view)) return empty;
      }
      const hiddenCache = new WeakMap();
      function canRead(parent) {
        if (!parent || parent === element) return true;
        if (hiddenCache.has(parent)) return hiddenCache.get(parent);
        const readable = !parent.matches(EXCLUDED) && !isHidden(parent, view) && canRead(parent.parentElement);
        hiddenCache.set(parent, readable);
        return readable;
      }
      const walker = doc.createTreeWalker(element, 4, {
        acceptNode(node) {
          return node.nodeValue && canRead(node.parentElement) ? 1 : 2;
        }
      });
      const pieces = [];
      const nodes = [];
      let length = 0;
      let node;
      while ((node = walker.nextNode())) {
        const value = node.nodeValue || '';
        nodes.push({ node: node, start: length, end: length + value.length });
        pieces.push(value);
        length += value.length;
      }
      return { text: pieces.join(''), nodes: nodes };
    } catch (_) {
      return empty;
    }
  }

  function anchorFromText(text, start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) return null;
    if (end - start > MAX_QUOTE_LENGTH) return null;
    const quote = text.slice(start, end);
    if (!quote.trim()) return null;
    return {
      start: start,
      end: end,
      quote: quote,
      prefix: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
      suffix: text.slice(end, end + CONTEXT_LENGTH),
      fingerprint: hashText(text)
    };
  }

  function createAnchor(element, start, end) {
    try {
      return anchorFromText(fieldText(element).text, start, end);
    } catch (_) {
      return null;
    }
  }

  function selectionAnchors(selection, fields) {
    const anchors = [];
    try {
      if (!selection || selection.isCollapsed || !selection.rangeCount || !Array.isArray(fields)) return anchors;
      if (isExcluded(selection.anchorNode) || isExcluded(selection.focusNode)) return anchors;
      const doc = selection.anchorNode && selection.anchorNode.ownerDocument;
      // Textareas keep a separate native selection; do not reuse an old page range.
      if (doc && doc.activeElement && doc.activeElement.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return anchors;
      const seen = new Set();
      const eligible = fields.slice(0, MAX_FIELDS).map(function (field) {
        return field && { id: field.id, element: field.element, map: fieldText(field.element) };
      }).filter(function (field) {
        return field && typeof field.id === 'string' && field.id && field.map.nodes.length;
      });
      for (let r = 0; r < Math.min(selection.rangeCount, 32); r += 1) {
        const selected = selection.getRangeAt(r);
        if (selected.collapsed) continue;
        for (const field of eligible) {
          if (selected.startContainer.ownerDocument !== field.element.ownerDocument || !selected.intersectsNode(field.element)) continue;
          let start = null;
          let end = null;
          for (const entry of field.map.nodes) {
            const node = entry.node;
            const length = entry.end - entry.start;
            if (!selected.intersectsNode(node) || selected.comparePoint(node, length) === -1 || selected.comparePoint(node, 0) === 1) continue;
            const localStart = selected.startContainer === node ? selected.startOffset : 0;
            const localEnd = selected.endContainer === node ? selected.endOffset : length;
            if (localEnd <= localStart) continue;
            if (start === null) start = entry.start + localStart;
            end = entry.start + localEnd;
          }
          if (start === null || end === null) continue;
          const anchor = anchorFromText(field.map.text, start, end);
          if (!anchor) continue;
          const key = field.id + ':' + start + ':' + end;
          if (seen.has(key)) continue;
          seen.add(key);
          anchors.push(Object.assign({ field: field.id }, anchor));
        }
      }
    } catch (_) {
      // A topic can rerender while the browser dispatches selectionchange.
      return [];
    }
    return anchors;
  }

  function rangeFromOffsets(element, map, start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > map.text.length) return null;
    const first = map.nodes.find(function (entry) { return entry.start <= start && start < entry.end; });
    const last = map.nodes.find(function (entry) { return entry.start < end && end <= entry.end; });
    if (!first || !last) return null;
    const range = element.ownerDocument.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    return range;
  }

  function resolveAnchor(element, anchor) {
    try {
      if (!anchor || typeof anchor.quote !== 'string' || !anchor.quote.trim() || anchor.quote.length > MAX_QUOTE_LENGTH) return null;
      const map = fieldText(element);
      const text = map.text;
      if (!map.nodes.length) return null;
      const quote = anchor.quote;
      if (anchor.fingerprint === hashText(text) && Number.isInteger(anchor.start) && Number.isInteger(anchor.end) &&
          anchor.start >= 0 && anchor.end - anchor.start === quote.length && text.slice(anchor.start, anchor.end) === quote) {
        return rangeFromOffsets(element, map, anchor.start, anchor.end);
      }
      const prefix = typeof anchor.prefix === 'string' ? anchor.prefix.slice(-CONTEXT_LENGTH) : '';
      const suffix = typeof anchor.suffix === 'string' ? anchor.suffix.slice(0, CONTEXT_LENGTH) : '';
      // With no surrounding text, only an exact whole-field match is safe.
      if (!prefix && !suffix) return text === quote ? rangeFromOffsets(element, map, 0, text.length) : null;
      let match = null;
      let offset = 0;
      let occurrences = 0;
      while (offset <= text.length - quote.length) {
        const start = text.indexOf(quote, offset);
        if (start === -1) break;
        const end = start + quote.length;
        occurrences += 1;
        if (occurrences > 512) return null;
        const prefixMatches = !prefix || (start >= prefix.length && text.slice(start - prefix.length, start) === prefix);
        const suffixMatches = !suffix || text.slice(end, end + suffix.length) === suffix;
        if (prefixMatches && suffixMatches) {
          // Never attach a saved mark when multiple locations fit its context.
          if (match !== null) return null;
          match = { start: start, end: end };
        }
        offset = start + 1;
      }
      return match ? rangeFromOffsets(element, map, match.start, match.end) : null;
    } catch (_) {
      return null;
    }
  }

  function rangesToRects(range) {
    try {
      if (!range || range.collapsed || !range.getClientRects) return [];
      return Array.from(range.getClientRects()).filter(function (rect) {
        return Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0;
      }).map(function (rect) {
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
    } catch (_) {
      return [];
    }
  }

  global.StudyTextHighlightCore = Object.freeze({
    fieldText: fieldText,
    selectionAnchors: selectionAnchors,
    createAnchor: createAnchor,
    resolveAnchor: resolveAnchor,
    rangesToRects: rangesToRects,
    hashText: hashText,
    MAX_QUOTE_LENGTH: MAX_QUOTE_LENGTH
  });
})(window);
