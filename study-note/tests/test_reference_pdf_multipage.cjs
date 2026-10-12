'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../study-note.html'), 'utf8');
const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).filter(code => code.trim());
assert(inlineScripts.length > 0, 'No inline application scripts');
for (const code of inlineScripts) new vm.Script(code, { filename: 'study-note-inline.js' });

const source = inlineScripts.join('\n');
function functionSource(name) {
  const prefix = new RegExp('^(?:async )?function ' + name + '\\(', 'm');
  const match = prefix.exec(source);
  assert(match, 'Missing function ' + name);
  const end = source.indexOf('\n}\n', match.index);
  assert(end > match.index, 'Cannot find end of ' + name);
  return source.slice(match.index, end + 2);
}
function createHarness(names, env) {
  const sandbox = { ...env };
  vm.createContext(sandbox);
  vm.runInContext(names.map(functionSource).join('\n\n'), sandbox);
  return sandbox;
}
function clean(value) { return String(value == null ? '' : value).trim(); }
function key(sourceType, token) { return sourceType + '\u0001' + token; }

async function testRealPdfSplit() {
  const { PDFDocument } = require('pdf-lib');
  const sourcePdf = await PDFDocument.create();
  sourcePdf.addPage([200, 300]).drawText('FIRST PAGE');
  sourcePdf.addPage([321, 433]).drawText('SECOND PAGE');
  const input = new File([await sourcePdf.save()], 'two-pages.pdf', { type: 'application/pdf' });
  const h = createHarness(['splitNewOriginalReferencePdf'], {
    File, Uint8Array,
    MAX_REFERENCE_PAGE_BYTES: 8 * 1024 * 1024,
    MAX_NEW_REFERENCE_DOCUMENT_PAGES: 200,
    ensurePdfLibLoaded: async () => ({ PDFDocument }),
  });
  const events = [];
  const pages = await h.splitNewOriginalReferencePdf(input, (i, n) => events.push([i, n]));
  assert.equal(pages.length, 2);
  assert.deepEqual(events, [[1, 2], [2, 2]]);
  for (const pdf of pages) {
    assert(pdf.name.endsWith('.pdf'));
    assert.equal(pdf.type, 'application/pdf');
    const loaded = await PDFDocument.load(await pdf.arrayBuffer());
    assert.equal(loaded.getPageCount(), 1);
  }
  const p1 = await PDFDocument.load(await pages[0].arrayBuffer());
  const p2 = await PDFDocument.load(await pages[1].arrayBuffer());
  assert.equal(p1.getPage(0).getWidth(), 200);
  assert.equal(p2.getPage(0).getWidth(), 321);
  assert.equal(p2.getPage(0).getHeight(), 433);
  await assert.rejects(
    () => h.splitNewOriginalReferencePdf(new File(['bad'], 'broken.pdf', { type: 'application/pdf' })),
    /PDF 헤더/
  );
  const tooMany = createHarness(['splitNewOriginalReferencePdf'], {
    File, Uint8Array, MAX_REFERENCE_PAGE_BYTES: 8 * 1024 * 1024,
    MAX_NEW_REFERENCE_DOCUMENT_PAGES: 200,
    ensurePdfLibLoaded: async () => ({ PDFDocument: { load: async () => ({ getPageCount: () => 201 }) } }),
  });
  await assert.rejects(
    () => tooMany.splitNewOriginalReferencePdf(new File(['%PDF-'], 'huge.pdf', { type: 'application/pdf' })),
    /최대 200페이지/
  );
}
function testLegacyFileLimit() {
  const h = createHarness(['validatePendingReferencePdfFile'], {
    clean,
    MAX_REFERENCE_PAGE_BYTES: 8 * 1024 * 1024,
    MAX_NEW_REFERENCE_DOCUMENT_BYTES: 64 * 1024 * 1024,
  });
  const nineMb = { name: 'doc.pdf', type: 'application/pdf', size: 9 * 1024 * 1024 };
  assert.throws(() => h.validatePendingReferencePdfFile(nineMb), /8MB/);
  assert.doesNotThrow(() => h.validatePendingReferencePdfFile(nineMb, { allowMultiPage: true }));
  assert.throws(() => h.validatePendingReferencePdfFile({ ...nineMb, size: 65 * 1024 * 1024 }, { allowMultiPage: true }), /64MB/);
  assert.throws(() => h.validatePendingReferencePdfFile({ name: 'doc.png', type: 'image/png', size: 10 }), /PDF 파일/);
}
function testBatchStagingAndResume() {
  const pending = new Map();
  const uploaded = new Map();
  const first = 'SE-42:1';
  for (let i = 1; i <= 2; i++) {
    pending.set(key('교재', 'SE-42:' + i), {
      batchFirstToken: first, batchPageCount: 2, batchIndex: i - 1,
      uploadedDriveFileId: '',
      file: { name: 'part' + i + '.pdf' },
      plan: { pageToken: 'SE-42:' + i, rawMaterialType: 'new-original', allowCreatePageKey: i === 1 },
    });
  }
  const h = createHarness([
    'collectPendingNewOriginalBatchPages', 'collectPendingManageReferenceUploads',
    'validateManageReferencePages'
  ], {
    pendingReferencePdfFiles: pending,
    splitPageTokens: value => clean(value).split(/[,\n;]/).filter(Boolean),
    pageTokenParts: token => {
      const m = token.match(/^([A-Z0-9_-]+):(\d+)$/);
      return m && { pageKey: m[1], pageNumber: Number(m[2]) };
    },
    getReferencePdfPage: (sourceType, token) => uploaded.get(key(sourceType, token)),
    collectMissingManageReferencePages: fields =>
      clean(fields.textbookPages).split(',').filter(Boolean).filter(t => !uploaded.has(key('교재', t)))
      .map(t => ({ sourceType: '교재', pageToken: t, pageKey: t.split(':')[0], pageNumber: Number(t.split(':')[1]) })),
  });
  const fields = { subnotePages: '', textbookPages: first };
  assert.deepEqual(Array.from(h.collectPendingManageReferenceUploads(fields), v => v.pageToken), ['SE-42:1', 'SE-42:2']);
  assert.deepEqual(Array.from(h.validateManageReferencePages(fields).missing), ['교재 SE-42:1', '교재 SE-42:2']);
  // After first page upload, the second page stays queued even though it is not a topic link.
  uploaded.set(key('교재', first), { driveFileId: 'new-original-1' });
  pending.get(key('교재', first)).uploadedDriveFileId = 'new-original-1';
  assert.deepEqual(Array.from(h.collectPendingManageReferenceUploads(fields), v => v.pageToken), ['SE-42:2']);
  uploaded.set(key('교재', 'SE-42:2'), { driveFileId: 'new-original-2' });
  pending.get(key('교재', 'SE-42:2')).uploadedDriveFileId = 'new-original-2';
  assert.equal(h.validateManageReferencePages(fields).ok, true);
  // Never substitute an independently uploaded document with the same page token.
  uploaded.set(key('교재', 'SE-42:2'), { driveFileId: 'someone-else' });
  assert.throws(() => h.collectPendingManageReferenceUploads(fields), /페이지키 충돌/);
  assert.equal(h.collectPendingManageReferenceUploads({ subnotePages: '', textbookPages: '' }).length, 0);
}
function testSequentialOriginalNavigation() {
  const h = createHarness([
    'referencePdfPageFromUploadStatus',
    'referencePdfRootPageKey', 'referencePdfBaseSequenceKeys',
    'buildReferencePdfLogicalSequence', 'findReferencePdfSequentialPage',
  ], {
    clean, referencePdfPageId: key,
    REFERENCE_PDF_PAGE_KEY_SEQUENCES: [['SW-1', 'SW-2', 'SW-3']],
    allReferencePdfPages: [],
    referencePdfActiveRevisionFor: () => null,
    resolveReferencePdfEffectivePage: page => page,
    sortReferencePdfSupplements: () => 0,
  });
  const one = h.referencePdfPageFromUploadStatus({
    sourceType: '교재', pageKey: 'SE-42', pageNumber: 1,
    pageToken: 'SE-42:1', driveFileId: 'file1', materialType: '원본', basePageKey: 'SE',
  });
  const two = h.referencePdfPageFromUploadStatus({
    sourceType: '교재', pageKey: 'SE-42', pageNumber: 2,
    pageToken: 'SE-42:2', driveFileId: 'file2', materialType: '원본', basePageKey: 'SE',
  });
  assert.equal(one.basePageKey, 'SE-42', 'new original should not navigate within legacy SE');
  h.allReferencePdfPages.push(one, two);
  assert.equal(h.findReferencePdfSequentialPage(one, 1).pageToken, 'SE-42:2');
  assert.equal(h.findReferencePdfSequentialPage(two, -1).pageToken, 'SE-42:1');
  assert.equal(h.findReferencePdfSequentialPage(two, 1), null);
}
(async () => {
  await testRealPdfSplit();
  testLegacyFileLimit();
  testBatchStagingAndResume();
  testSequentialOriginalNavigation();
  console.log('PASS: HTML scripts parse, real 2-page split, legacy limits, staged retry, collision checks, and sequential navigation');
})().catch(error => { console.error(error); process.exitCode = 1; });
