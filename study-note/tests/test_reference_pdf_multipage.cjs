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
    // The application and pdf-lib share a JavaScript realm in browsers. In this
    // Node VM harness, convert the VM index array to the Node library's realm.
    ensurePdfLibLoaded: async () => ({
      PDFDocument: {
        load: (...args) => PDFDocument.load(...args),
        create: async () => {
          const result = await PDFDocument.create();
          return {
            copyPages: (source, indices) => result.copyPages(source, Array.from(indices)),
            addPage: (...args) => result.addPage(...args),
            save: (...args) => result.save(...args),
          };
        },
      },
    }),
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


async function testManagePrepareLinksOnlyFirstPage() {
  for (const sourceType of ['서브노트', '교재']) {
    const pending = new Map();
    const field = { value: '' };
    const input = { files: [{ name: 'new-two-page.pdf', type: 'application/pdf', size: 1500 }], value: 'dummy' };
    const cfg = {
      file: input, type: { value: 'new-original' }, baseKey: { value: 'SE' },
      pageNumber: { value: '' }, position: { value: '뒤' },
      keyOverride: { value: '' }, plan: { className: '', textContent: '' },
    };
    const button = { disabled: false };
    const h = createHarness(['buildReferencePdfBatchEntries', 'stageReferencePdfBatch', 'prepareManageReferenceMaterial'], {
      navigator: { onLine: true },
      manageReferenceMaterialConfig: () => cfg,
      els: { manageSubnoteMaterialPrepareBtn: button, manageTextbookMaterialPrepareBtn: button },
      referencePdfPreparationCount: 0,
      referencePdfPreparationGeneration: 0,
      pendingReferencePdfFiles: pending,
      clean,
      validatePendingReferencePdfFile: (_file, options) => assert.equal(options.allowMultiPage, true),
      splitNewOriginalReferencePdf: async () => [
        new File(['%PDF-page-1'], 'part1.pdf', { type: 'application/pdf' }),
        new File(['%PDF-page-2'], 'part2.pdf', { type: 'application/pdf' }),
      ],
      detectPdfPageCount: async () => { throw new Error('should use PDF-Lib splitter instead'); },
      fetchReferencePdfRegistrationPlan: async (_url, data) => {
        assert.equal(data.materialType, 'new-original');
        assert.equal(data.sourceType, sourceType);
        return { pageKey: 'SE-42', pageNumber: 1, pageToken: 'SE-42:1',
          storedFileName: 'SE-42_0001.pdf', materialType: '원본',
          rawMaterialType: 'new-original', basePageKey: 'SE',
          allowCreatePageKey: true, exists: false };
      },
      getApiUrl: () => 'https://example.invalid',
      getManageDomainPrefix: () => 'SE',
      getReferencePdfPage: () => null,
      referencePdfCatalogHasPage: () => false,
      manageReferenceEditorConfig: () => ({ hidden: field }),
      splitPageTokens: s => clean(s).split(',').filter(Boolean),
      setManageReferenceTokens: (_type, tokens) => { field.value = tokens.join(','); },
      expectedReferencePdfFileName: (k, n) => k + '_' + String(n).padStart(4, '0') + '.pdf',
      renderManageReferencePageEditor: () => {},
      updateManageReferencePdfHint: () => {},
      showToast: message => { throw new Error('Unexpected error toast: ' + message); },
    });
    await h.prepareManageReferenceMaterial(sourceType);
    assert.equal(field.value, 'SE-42:1');
    assert.equal(pending.size, 2);
    assert.deepEqual(Array.from(pending.keys()), [key(sourceType, 'SE-42:1'), key(sourceType, 'SE-42:2')]);
    assert.equal(pending.get(key(sourceType, 'SE-42:1')).plan.allowCreatePageKey, true);
    assert.equal(pending.get(key(sourceType, 'SE-42:2')).plan.allowCreatePageKey, false);
    assert.equal(pending.get(key(sourceType, 'SE-42:2')).plan.storedFileName, 'SE-42_0002.pdf');
    assert.match(cfg.plan.textContent, /첫 페이지/);
    assert.equal(button.disabled, false);
  }
}

async function testSequentialUploadRequestsAndResume() {
  const pending = new Map();
  const first = 'SE-42:1';
  const fields = { subnotePages: '', textbookPages: first };
  const makeEntry = (n) => ({
    batchFirstToken: first, batchPageCount: 2, batchIndex: n - 1,
    uploadedDriveFileId: '',
    file: { name: 'two-page-' + n + '.pdf', size: 1200, type: 'application/pdf' },
    pageCount: 1,
    plan: { rawMaterialType: 'new-original', materialType: '원본',
      basePageKey: 'SE', pageKey: 'SE-42', pageToken: 'SE-42:' + n,
      allowCreatePageKey: n === 1 },
  });
  pending.set(key('교재', first), makeEntry(1));
  pending.set(key('교재', 'SE-42:2'), makeEntry(2));
  const calls = [];
  let failSecond = true;
  let harness;
  const mocks = {
    pendingReferencePdfFiles: pending,
    allReferencePdfPages: [],
    referencePdfPageCatalogLoadedAt: 17,
    referencePdfPageId: key,
    db: {},
    clean,
    splitPageTokens: x => clean(x).split(/[,;\n]+/).filter(Boolean),
    pageTokenParts: x => {
      const m = clean(x).match(/^([A-Z0-9_-]+):(\d+)$/);
      return m ? { pageKey: m[1], pageNumber: Number(m[2]) } : null;
    },
    getReferencePdfPage: (src, token) => harness.allReferencePdfPages.find(x => x.sourceType === src && x.pageToken === token) || null,
    collectMissingManageReferencePages: f => clean(f.textbookPages).split(',').filter(Boolean)
      .filter(t => !mocks.getReferencePdfPage('교재', t))
      .map(t => ({ sourceType: '교재', pageToken: t, pageKey: t.split(':')[0], pageNumber: Number(t.split(':')[1]) })),
    pendingReferencePdfEntry: (src, token) => pending.get(key(src, token)),
    referencePdfCatalogHasPage: () => false,
    referencePdfCatalogItem: () => null,
    validatePendingReferencePdfFile: file => assert.equal(file.type, 'application/pdf'),
    detectPdfPageCount: async () => 1,
    readFileAsDataUrl: async () => 'data:application/pdf;base64,MTEST',
    getApiUrl: () => 'https://example.invalid',
    sendMutation: async (_, payload) => {
      calls.push(payload);
      if (failSecond && payload.pageNumber === 2) throw new Error('simulated network failure');
      return {
        ...payload, materialType: '원본', driveFileId: 'drive-file-' + payload.pageNumber,
        storedFileName: payload.pageKey + '_000' + payload.pageNumber + '.pdf',
      };
    },
    putReferencePdfPage: async () => {},
    renderManageReferencePageEditor: () => {},
    updateManageReferencePdfHint: () => {},
    ensureManageReferencePdfCatalog: async () => {},
    renderManageReferencePageEditors: () => {},
    refreshReferencePdfPagesFromServer: async () => {},
  };
  harness = createHarness([
    'collectPendingNewOriginalBatchPages', 'collectPendingManageReferenceUploads',
    'referencePdfPageFromUploadStatus', 'uploadPendingManageReferencePages',
  ], mocks);
  await assert.rejects(() => harness.uploadPendingManageReferencePages(fields), /simulated network failure/);
  assert.equal(harness.allReferencePdfPages.length, 1);
  assert.equal(harness.allReferencePdfPages[0].pageToken, first);
  assert.equal(pending.get(key('교재', first)).uploadedDriveFileId, 'drive-file-1');
  assert.equal(pending.get(key('교재', 'SE-42:2')).uploadedDriveFileId, '');
  assert.deepEqual(calls.map(x => x.pageNumber), [1, 2]);
  assert.deepEqual(calls.map(x => x.allowCreatePageKey), [true, false]);
  assert(calls.every(x => x.materialType === 'new-original' && x.pageCount === 1));
  failSecond = false;
  const recovered = await harness.uploadPendingManageReferencePages(fields);
  assert.equal(recovered.uploadedCount, 1);
  assert.equal(recovered.reusedCount, 0);
  assert.deepEqual(calls.map(x => x.pageNumber), [1, 2, 2], 'must not re-upload existing first page');
  assert.equal(harness.allReferencePdfPages.length, 2);
  assert.equal(harness.allReferencePdfPages[1].pageToken, 'SE-42:2');
  assert.equal(harness.allReferencePdfPages[1].basePageKey, 'SE-42');
  assert.equal(fields.textbookPages, first, 'topic must only link the first page');
}


function testMultiPageMaterialPlans() {
  const pending = new Map();
  const existing = new Map();
  const h = createHarness(['buildReferencePdfBatchEntries', 'stageReferencePdfBatch'], {
    pendingReferencePdfFiles: pending,
    expectedReferencePdfFileName: (k, n) => k + '_' + String(n).padStart(4, '0') + '.pdf',
    getReferencePdfPage: (type, token) => existing.get(key(type, token)) || null,
    referencePdfCatalogHasPage: () => false,
  });
  const files = [1, 2, 3].map(n => new File(['%PDF-'+n], 'page-'+n+'.pdf',{type:'application/pdf'}));
  const missing = { pageKey:'SW-2', pageNumber:613, pageToken:'SW-2:613', pageKeyMapped:true,
    allowCreatePageKey:false, rawMaterialType:'missing-original', materialType:'원본',basePageKey:'SW-2' };
  const saved = h.stageReferencePdfBatch('교재','missing-original',missing,files.slice(0,2),'missing.pdf');
  assert.deepEqual(Array.from(saved,e=>e.pageToken),['SW-2:613','SW-2:614']);
  assert.equal(saved[1].plan.rawMaterialType,'missing-original');
  assert.equal(saved[1].plan.allowCreatePageKey,false);
  assert.equal(saved[1].plan.storedFileName,'SW-2_0614.pdf');
  pending.clear();

  const supplement = { pageKey:'SW-2-ADD4', pageNumber:1, pageToken:'SW-2-ADD4:1',
    allowCreatePageKey:true, rawMaterialType:'supplement', materialType:'보강',
    basePageKey:'SW-2', anchorPageToken:'SW-2:613',insertionPosition:'앞',logicalOrder:5 };
  const supp = h.stageReferencePdfBatch('교재','supplement',supplement,files,'supplement.pdf');
  assert.deepEqual(Array.from(supp,e=>e.pageToken),
    ['SW-2-ADD4:1','SW-2-ADD4:2','SW-2-ADD4:3']);
  assert.deepEqual(Array.from(supp,e=>e.plan.logicalOrder),[5,6,7]);
  assert(supp.every(e=>e.plan.anchorPageToken==='SW-2:613'&&e.plan.insertionPosition==='앞'));
  assert.deepEqual(Array.from(supp,e=>e.plan.allowCreatePageKey),[true,false,false]);
  assert.throws(()=>h.stageReferencePdfBatch('교재','supplement',supplement,files,'dup.pdf'),/페이지키가 겹칩니다/);
  pending.clear();

  const revision = {pageKey:'SW-2-R4',pageNumber:613,pageToken:'SW-2-R4:613',
    allowCreatePageKey:true,rawMaterialType:'revision',materialType:'개정',
    basePageKey:'SW-2',replacementTarget:'SW-2:613',versionTag:'R4',logicalOrder:4 };
  const rev=h.stageReferencePdfBatch('교재','revision',revision,files,'revision.pdf');
  assert.deepEqual(Array.from(rev,e=>e.pageToken),
    ['SW-2-R4:613','SW-2-R4:614','SW-2-R4:615']);
  assert.equal(rev[0].plan.rawMaterialType,'revision');
  assert.equal(rev[0].plan.replacementTarget,'SW-2:613');
  assert.deepEqual(Array.from(rev.slice(1),e=>e.plan.rawMaterialType),['supplement','supplement']);
  assert(rev.slice(1).every(e=>e.plan.anchorPageToken==='SW-2:613'&&
    e.plan.insertionPosition==='뒤' && e.plan.materialType==='보강'));
  assert.equal(rev[2].plan.pageKey,'SW-2-R4');
  assert.equal(rev[2].plan.basePageKey,'SW-2');
  assert(rev.every(e=>e.batchLinkToken==='SW-2-R4:613'));
  pending.clear();

  // New-original still receives a separate key with first link only.
  const original={pageKey:'SE-44',pageNumber:1,pageToken:'SE-44:1',
    allowCreatePageKey:true, rawMaterialType:'new-original',materialType:'원본',basePageKey:'SE'};
  const newOrig=h.stageReferencePdfBatch('서브노트','new-original',original,files,'original.pdf');
  assert.deepEqual(Array.from(newOrig,e=>e.pageToken),['SE-44:1','SE-44:2','SE-44:3']);
  pending.clear();

  existing.set(key('교재','SW-2-R4:614'), {driveFileId:'existing'});
  assert.throws(()=>h.stageReferencePdfBatch('교재','revision',revision,files,'conflict.pdf'),/충돌/);
}

function testMultiPageNavigationWithOlderRevisions() {
  const data=[];
  const make=(pageKey,number,materialType,extra={})=>{
    const page={sourceType:'교재',pageKey,pageNumber:number,pageToken:pageKey+':'+number,
      basePageKey:extra.basePageKey || 'SW-2',materialType,active:'Y',...extra};
    data.push(page);return page;
  };
  const original=make('SW-2',613,'원본');
  const next=make('SW-2',614,'원본');
  make('SW-2',615,'원본');
  const older=make('SW-2-R2',613,'개정',{replacementTarget:'SW-2:613',versionTag:'R2'});
  make('SW-2-R2',614,'보강',{anchorPageToken:'SW-2:613',insertionPosition:'뒤'});
  const active=make('SW-2-R3',613,'개정',{replacementTarget:'SW-2:613',versionTag:'R3'});
  const revSecond=make('SW-2-R3',614,'보강',{anchorPageToken:'SW-2:613',insertionPosition:'뒤'});
  const revThird=make('SW-2-R3',615,'보강',{anchorPageToken:'SW-2:613',insertionPosition:'뒤'});
  const suppFirst=make('SW-2-ADD1',1,'보강',{anchorPageToken:'SW-2:613',insertionPosition:'뒤',logicalOrder:2});
  const before=make('SW-2-ADD2',1,'보강',{anchorPageToken:'SW-2:614',insertionPosition:'앞',logicalOrder:3});
  const beforeNext=make('SW-2-ADD2',2,'보강',{anchorPageToken:'SW-2:614',insertionPosition:'앞',logicalOrder:4});
  const h=createHarness([
    'referencePdfVersionRank','referencePdfActiveRevisionFor','resolveReferencePdfEffectivePage',
    'referencePdfRootPageKey','referencePdfBaseSequenceKeys','sortReferencePdfSupplements',
    'buildReferencePdfLogicalSequence','findReferencePdfSequentialPage',
  ],{
    clean,allReferencePdfPages:data,REFERENCE_PDF_PAGE_KEY_SEQUENCES:[['SW-1','SW-2','SW-3']],
  });
  assert.equal(h.resolveReferencePdfEffectivePage(original).pageToken,active.pageToken);
  const tokens=Array.from(h.buildReferencePdfLogicalSequence(original),p=>p.pageToken);
  assert.deepEqual(tokens,[
    active.pageToken,revSecond.pageToken,revThird.pageToken,suppFirst.pageToken,
    before.pageToken,beforeNext.pageToken,next.pageToken,'SW-2:615',
  ]);
  assert(!tokens.includes(older.pageToken));
  assert(!tokens.includes('SW-2-R2:614'),'superseded revision extra pages must remain hidden');
  assert.equal(h.findReferencePdfSequentialPage(original,1).pageToken,revSecond.pageToken);
  assert.equal(h.findReferencePdfSequentialPage(revSecond,1).pageToken,revThird.pageToken);
  assert.equal(h.findReferencePdfSequentialPage(revThird,-1).pageToken,revSecond.pageToken);
  assert.equal(h.findReferencePdfSequentialPage(revThird,1).pageToken,suppFirst.pageToken);
  assert.equal(h.findReferencePdfSequentialPage(before,1).pageToken,beforeNext.pageToken);
  assert.equal(h.findReferencePdfSequentialPage(next,-1).pageToken,beforeNext.pageToken);
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
  await testManagePrepareLinksOnlyFirstPage();
  await testSequentialUploadRequestsAndResume();
  testMultiPageMaterialPlans();
  testMultiPageNavigationWithOlderRevisions();
  testSequentialOriginalNavigation();
  console.log('PASS: HTML scripts parse, real 2-page split, legacy limits, staged retry, collision checks, and sequential navigation');
})().catch(error => { console.error(error); process.exitCode = 1; });
