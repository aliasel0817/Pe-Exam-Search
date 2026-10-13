'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../study-note.html'), 'utf8');
const manual = fs.readFileSync(path.resolve(__dirname, '../STUDY-NOTE-USER-MANUAL-KO.md'), 'utf8');
assert.match(html, /id="openStudyManualLink"[^>]+STUDY-NOTE-USER-MANUAL-KO\.md/);
assert.match(html, /\.settings-card \.modal-actions \{ flex-wrap: wrap; \}/);
assert.match(manual, /T4036/);
assert.match(manual, /운영 반영/);
assert.match(manual, /신뢰기기/);
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
    pendingReferencePdfEntry: (src, token) => pending.get(key(src, token)) || null,
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
    const h = createHarness(['buildReferencePdfBatchEntries', 'stageReferencePdfBatch', 'isReferencePdfOriginalBaseKey', 'prepareManageReferenceMaterial'], {
      navigator: { onLine: true },
      manageReferenceMaterialConfig: () => cfg,
      referencePdfCatalogItem: () => ({pageKey:'SE',pageCount:2,materialType:'원본'}),
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
  assert.deepEqual(Array.from(rev, r=>r.plan.allowCreatePageKey),[false,true,false],
    'revision continuation creates the key; visible cover is published last');
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


async function testVersionedRowReplacementAndRevisionCodeFallback() {
  const pending = new Map();
  const pendingReplacements = new Map();
  const original = {sourceType:'교재',pageKey:'SW-2',pageNumber:613,pageToken:'SW-2:613',
    materialType:'원본',driveFileId:'ORIGINAL_FILE'};
  const uploaded = new Map([[key('교재',original.pageToken),original]]);
  let harness;
  const requests = [];
  const toasts = [];
  const file = new File(['%PDF-fake'], 'replacement-two-pages.pdf', {type:'application/pdf'});
  const h = createHarness([
    'buildReferencePdfBatchEntries','stageReferencePdfBatch',
    'nextUnusedReferenceRevisionKey',
    'handleManageReferenceReplacementSelection',
    'applyPendingReferencePdfReplacements',
  ], {
    clean, File,
    referencePdfPreparationCount:0,
    referencePdfPreparationGeneration:0,
    pendingReferencePdfFiles:pending,
    pendingReferencePdfReplacements:pendingReplacements,
    referencePdfPageCatalog:[{sourceType:'교재',pageKey:'SW-2-R2',pageCount:1}],
    allReferencePdfPages:[original],
    navigator:{onLine:true},
    getReferencePdfPage:(type,token)=>uploaded.get(key(type,token))||null,
    referencePdfCatalogHasPage:()=>false,
    expectedReferencePdfFileName:(k,n)=>k+'_'+String(n).padStart(4,'0')+'.pdf',
    validatePendingReferencePdfFile:()=>{},
    splitNewOriginalReferencePdf:async ()=>[
      new File(['%PDF-1'],'one.pdf',{type:'application/pdf'}),
      new File(['%PDF-2'],'two.pdf',{type:'application/pdf'}),
    ],
    getApiUrl:()=> 'https://example.invalid',
    getManageDomainPrefix:()=> 'SW',
    fetchReferencePdfRegistrationPlan:async (_url,req)=>{
      requests.push(req);
      const pageKey=req.requestedPageKey||'SW-2-R2';
      return {pageKey,pageNumber:613,pageToken:pageKey+':613',basePageKey:'SW-2',
        materialType:'개정',rawMaterialType:'revision',replacementTarget:'SW-2:613',
        allowCreatePageKey:!!req.requestedPageKey,pageKeyMapped:!req.requestedPageKey,
        versionTag:'R'+pageKey.split('-R')[1],logicalOrder:3};
    },
    renderManageReferencePageEditor:()=>{},
    updateManageReferencePdfHint:()=>{},
    showToast:m=>toasts.push(m),
    readFileAsDataUrl:async()=> 'data:application/pdf;base64,MOCK',
    sendMutation:()=>{throw new Error('Must not call destructive replaceReferencePdfPage');},
    refreshReferencePdfPagesFromServer:async()=>{throw Error('Must not change original')},
  });
  harness=h;
  const input={files:[file],value:'new'};
  await h.handleManageReferenceReplacementSelection('교재','SW-2:613',input);
  assert.deepEqual(toasts,[]);
  assert.equal(requests.length,2,'existing -R2 key must be skipped');
  assert.equal(requests[1].requestedPageKey,'SW-2-R3');
  assert.equal(pendingReplacements.get(key('교재','SW-2:613')).mode,'versioned-batch');
  assert.equal(pending.size,2);
  const extras=Array.from(pending.values());
  assert.deepEqual(extras.map(x=>x.pageToken),['SW-2-R3:613','SW-2-R3:614']);
  assert(extras.every(x=>x.batchLinkToken==='SW-2:613'));
  assert.equal(extras[0].plan.rawMaterialType,'revision');
  assert.equal(extras[1].plan.rawMaterialType,'supplement');
  assert.equal(uploaded.get(key('교재','SW-2:613')).driveFileId,'ORIGINAL_FILE');
  extras.forEach((p,i)=>{p.uploadedDriveFileId='REV'+i;uploaded.set(key('교재',p.pageToken),{driveFileId:'REV'+i})});
  const result=await h.applyPendingReferencePdfReplacements();
  assert.equal(result.replacedCount,0);
  assert.equal(result.versionedCount,1);
  assert.equal(pendingReplacements.size,0);
  assert.equal(uploaded.get(key('교재','SW-2:613')).driveFileId,'ORIGINAL_FILE');

  // A one-page replacement still follows the existing direct replacement path.
  pending.clear();
  uploaded.clear();
  uploaded.set(key('교재',original.pageToken),original);
  let directCalls=0;
  const single = createHarness(['handleManageReferenceReplacementSelection'],{
    File, referencePdfPreparationCount:0, referencePdfPreparationGeneration:0,
    pendingReferencePdfReplacements:pendingReplacements,
    clean, validatePendingReferencePdfFile:()=>{},
    getReferencePdfPage:()=>original,
    splitNewOriginalReferencePdf:async()=>[new File(['%PDF'], 'one.pdf', {type:'application/pdf'})],
    renderManageReferencePageEditor:()=>{},updateManageReferencePdfHint:()=>{},
    showToast:m=>{throw Error('unexpected: '+m)},
  });
  await single.handleManageReferenceReplacementSelection('교재','SW-2:613',{files:[file],value:'x'});
  assert.equal(pendingReplacements.get(key('교재','SW-2:613')).pageCount,1);
}



async function testMaterialPreparationForBothSources() {
  for (const sourceType of ['교재','서브노트']) {
    for (const mode of ['missing-original','supplement','revision']) {
      const pending=new Map();
      const pageNumber=613;
      const isMissing=mode==='missing-original';
      const keyName=isMissing?'SW-2':mode==='supplement'?'SW-2-ADD5':'SW-2-R4';
      const firstNum=isMissing||mode==='revision'?613:1;
      const originalFile=new File(['%PDF-data'], 'three.pdf',{type:'application/pdf'});
      const cfg={
        file:{files:[originalFile],value:'selected'},
        type:{value:mode},baseKey:{value:'SW-2'},pageNumber:{value:String(pageNumber)},
        position:{value:'앞'},keyOverride:{value:''},plan:{className:'',textContent:''},
      };
      const linked={value:''};
      const buttons={manageSubnoteMaterialPrepareBtn:{disabled:false},
                     manageTextbookMaterialPrepareBtn:{disabled:false}};
      const serverRequests=[];
      const h=createHarness([
        'buildReferencePdfBatchEntries','stageReferencePdfBatch',
        'nextUnusedReferenceRevisionKey','isReferencePdfOriginalBaseKey', 'prepareManageReferenceMaterial',
      ], {
        clean, File,navigator:{onLine:true},els:buttons,
        referencePdfPreparationGeneration:0,referencePdfPreparationCount:0,
        referencePdfPageCatalog:[],allReferencePdfPages:[],
        pendingReferencePdfFiles:pending,
        manageReferenceMaterialConfig:()=>cfg,
        referencePdfCatalogItem:()=>({pageKey:'SW-2',pageCount:30,materialType:'원본'}),
        validatePendingReferencePdfFile:()=>{},
        splitNewOriginalReferencePdf:async()=>[1,2,3].map(i=>
          new File(['%PDF-'+i],'split'+i+'.pdf',{type:'application/pdf'})),
        getApiUrl:()=>'https://example.invalid',getManageDomainPrefix:()=>'SW',
        getReferencePdfPage:()=>null,referencePdfCatalogHasPage:()=>false,
        fetchReferencePdfRegistrationPlan:async (_url,request)=>{
          serverRequests.push(request);
          return { pageKey:keyName, pageNumber:firstNum,pageToken:keyName+':'+firstNum,
            materialType:isMissing?'원본':mode==='supplement'?'보강':'개정',
            rawMaterialType:mode,basePageKey:'SW-2',
            allowCreatePageKey:!isMissing,exists:false,pageKeyMapped:isMissing,
            anchorPageToken:mode==='supplement'?'SW-2:613':'',
            insertionPosition:'앞',replacementTarget:mode==='revision'?'SW-2:613':'',
            logicalOrder:4,versionTag:'R4' };
        },
        manageReferenceEditorConfig:()=>({hidden:linked}),
        splitPageTokens:value=>clean(value).split(',').filter(Boolean),
        setManageReferenceTokens:(_type,tokens)=>{linked.value=tokens.join(',')},
        expectedReferencePdfFileName:(k,n)=>k+'_'+String(n).padStart(4,'0')+'.pdf',
        renderManageReferencePageEditor:()=>{},updateManageReferencePdfHint:()=>{},
        showToast:m=>{throw Error('unexpected: '+m)},
      });
      await h.prepareManageReferenceMaterial(sourceType);
      assert.equal(serverRequests[0].materialType,mode);
      assert.equal(linked.value,keyName+':'+firstNum,'first page only');
      assert.equal(pending.size,3);
      const itemList=Array.from(pending.values());
      assert(itemList.every(entry=>entry.batchLinkToken===linked.value));
      assert.deepEqual(itemList.map(entry=>entry.plan.pageNumber),[firstNum,firstNum+1,firstNum+2]);
      assert.equal(itemList[2].plan.allowCreatePageKey,false);
      if(mode==='supplement')assert(itemList.every(x=>x.plan.anchorPageToken==='SW-2:613'));
      if(mode==='revision')assert.equal(itemList[2].plan.rawMaterialType,'supplement');
      assert.equal(cfg.file.value,'');
    }
  }
}




async function testSavePreflightAllowsRevisionBatchCover() {
  const link='SW-2-R7:613';
  const pkey=key('교재',link);
  const pending=new Map([[pkey,{
    file:{name:'revision.pdf',type:'application/pdf',size:120},
    batchFirstToken:link, batchPageCount:2,batchIndex:0,
    plan:{allowCreatePageKey:false},
  }]]);
  const fields={
    topicName:'SAFE TEST',status:'기존서브노트',subnotePages:'',
    textbookPages:link,
  };
  let uploads=0, writes=0;
  const errors=[];
  const h=createHarness(['saveManagedTopic'],{
    navigator:{onLine:true},
    referencePdfPreparationCount:0,
    ensureActiveSecuritySession:async()=>true,
    collectManageFields:()=>fields,
    collectMissingManageReferencePages:()=>[
      {sourceType:'교재',pageKey:'SW-2-R7',pageNumber:613,pageToken:link}
    ],
    referencePdfCatalogItem:()=>null,
    pendingReferencePdfEntry:(_source,token)=>pending.get(key('교재',token)),
    referencePdfCatalogHasPage:()=>false,
    pendingReferencePdfFiles:pending,
    manageMode:'edit',
    currentTopicId:'T4036',
    pendingNewCategory:null,
    els:{manageCategory:{value:'MG'}},
    collectPendingManageReferenceUploads:()=>[{
      sourceType:'교재',pageKey:'SW-2-R7',pageNumber:613,pageToken:link,
    }],
    uploadPendingManageReferencePages:async()=>{uploads++;return {uploadedCount:2,reusedCount:0}},
    validateManageReferencePages:()=>({ok:true,missing:[]}),
    pendingReferencePdfReplacements:new Map(),
    setLoading:()=>{},
    getApiUrl:()=> 'https://example.invalid',
    sendMutation:async()=>{writes++;return {headers:[],row:[],referencePdfLinkCount:1}},
    normalizeSingleRow:()=>({topicId:'T4036'}),
    applyServerTopicLocally:async()=>{},
    refreshTopicReferencePdfLinks:async()=>{},
    closeManage:()=>{},
    renderReferencePdfSummary:()=>{},
    renderAttachmentSummary:()=>{},
    renderManageAttachments:()=>{},
    pendingAttachmentDeletes:new Set(),
    pendingAttachmentFiles:{I:[],P:[]},
    showToast:msg=>errors.push(msg),
  });
  await h.saveManagedTopic({preventDefault(){}});
  assert.equal(uploads,1,'revision batch must reach the upload stage');
  assert.equal(writes,1,'revision batch must not be rejected as missing folder');
  assert(errors.some(msg=>msg.includes('수정 완료')));
  assert(!errors.some(msg=>msg.includes('등록 준비가 필요')));
}



function testLocalCatalogRetainsMaterialTypesAndOriginalBaseChoices() {
  const pages=[];
  const add=(sourceType,pageKey,pageNumber,materialType,basePageKey)=>
    pages.push({sourceType,pageKey,pageNumber,pageToken:pageKey+':'+pageNumber,
      materialType,basePageKey:basePageKey||pageKey});
  [1,2].forEach(n=>add('교재','SW',n,'원본'));
  [1,2].forEach(n=>add('교재','SW-2-ADD1',n,'보강','SW'));
  add('교재','SW-R3',613,'개정','SW');
  add('교재','SW-R3',614,'보강','SW');
  add('교재','SW-R4',614,'보강','SW');
  add('서브노트','MG',1,undefined);
  const select={value:'SW-R3',innerHTML:''};
  const h=createHarness([
    'referencePdfCatalogFromLocal','isReferencePdfOriginalBaseKey',
    'populateManageReferenceMaterialBaseKeys',
  ],{
    clean,allReferencePdfPages:pages,referencePdfPageCatalog:[],
    manageReferenceMaterialConfig:()=>({baseKey:select}),
    escapeHtml:v=>String(v),pageKeyForCategory:()=> 'SW',
    updateManageReferenceMaterialUi:()=>{},
  });
  const catalog=h.referencePdfCatalogFromLocal();
  const find=(type,pageKey)=>catalog.find(e=>e.sourceType===type&&e.pageKey===pageKey);
  assert.equal(find('교재','SW').materialType,'원본');
  assert.equal(find('교재','SW-2-ADD1').materialType,'보강');
  assert.equal(find('교재','SW-R3').materialType,'개정');
  assert.equal(find('교재','SW-R4').materialType,'보강');
  assert.equal(find('서브노트','MG').materialType,'원본',
    'legacy offline cache without materialType should remain an original');
  assert.deepEqual(Array.from(find('교재','SW').ranges,x=>Array.from(x)),[[1,2]]);
  h.referencePdfPageCatalog=catalog;
  h.populateManageReferenceMaterialBaseKeys('교재');
  assert.match(select.innerHTML,/value="SW"/);
  assert.doesNotMatch(select.innerHTML,/ADD1|SW-R3|SW-R4/);
  assert.equal(select.value,'SW');
}

function testReferencePdfBaseKeyChoicesExcludeAddAndRevisionKeys() {
  const catalog=[
    {sourceType:'교재',pageKey:'SW',pageCount:100,materialType:'원본'},
    {sourceType:'교재',pageKey:'SW-2',pageCount:80,materialType:'원본'},
    {sourceType:'교재',pageKey:'SW-2-ADD1',pageCount:2,materialType:'보강'},
    {sourceType:'교재',pageKey:'SW-2-R2',pageCount:3,materialType:'보강'},
    {sourceType:'교재',pageKey:'SW-2-R3',pageCount:2,materialType:'원본'},
    {sourceType:'서브노트',pageKey:'MG',pageCount:60,materialType:'원본'},
  ];
  const select={value:'SW-2-R2',innerHTML:''};
  let uiUpdates=0;
  const h=createHarness([
    'isReferencePdfOriginalBaseKey',
    'populateManageReferenceMaterialBaseKeys',
  ],{
    clean,referencePdfPageCatalog:catalog,
    manageReferenceMaterialConfig:()=>({baseKey:select}),
    escapeHtml:v=>String(v),
    pageKeyForCategory:()=> 'SW',
    updateManageReferenceMaterialUi:()=>uiUpdates++,
  });
  assert.equal(h.isReferencePdfOriginalBaseKey(catalog[0]),true);
  assert.equal(h.isReferencePdfOriginalBaseKey(catalog[2]),false);
  assert.equal(h.isReferencePdfOriginalBaseKey(catalog[3]),false);
  assert.equal(h.isReferencePdfOriginalBaseKey(catalog[4]),false,
    'even a mislabeled -R original must never become a source base');
  h.populateManageReferenceMaterialBaseKeys('교재');
  assert.match(select.innerHTML,/value="SW"/);
  assert.match(select.innerHTML,/value="SW-2"/);
  assert.doesNotMatch(select.innerHTML,/ADD1/);
  assert.doesNotMatch(select.innerHTML,/R2/);
  assert.doesNotMatch(select.innerHTML,/R3/);
  assert.equal(select.value,'SW','invalid old selection must move to valid original');
  assert.equal(uiUpdates,1);
}

async function testRejectRevisionBaseEvenWhenCatalogMislabeledOriginal() {
  const file=new File(['%PDF-x'],'fake.pdf',{type:'application/pdf'});
  const cfg={
    type:{value:'new-original'},baseKey:{value:'SW-2-R3'},
    pageNumber:{value:''},position:{value:'뒤'},keyOverride:{value:''},
    file:{files:[file],value:'x'},plan:{className:'',textContent:''},
  };
  const button={disabled:false},errors=[];
  const h=createHarness([
    'isReferencePdfOriginalBaseKey','prepareManageReferenceMaterial',
  ],{
    clean,File,navigator:{onLine:true},
    manageReferenceMaterialConfig:()=>cfg,
    referencePdfCatalogItem:()=>({pageKey:'SW-2-R3',pageCount:3,materialType:'원본'}),
    pendingReferencePdfFiles:new Map(),
    referencePdfPreparationGeneration:0,referencePdfPreparationCount:0,
    els:{manageTextbookMaterialPrepareBtn:button},
    validatePendingReferencePdfFile:()=>{},
    splitNewOriginalReferencePdf:async()=>[file,file],
    fetchReferencePdfRegistrationPlan:async()=>{throw Error('must not request plan from revision source');},
    showToast:m=>errors.push(m),
  });
  await h.prepareManageReferenceMaterial('교재');
  assert.equal(h.pendingReferencePdfFiles.size,0);
  assert(errors.some(m=>m.includes('원본 페이지키')));
}

async function testNoSupplementAsBaseKey() {
  const file=new File(['%PDF-X'],'bad.pdf',{type:'application/pdf'});
  const cfg={type:{value:'supplement'},baseKey:{value:'SW-2-R4'},
    pageNumber:{value:'613'},position:{value:'뒤'},keyOverride:{value:''},
    file:{files:[file],value:'x'},plan:{className:'',textContent:''}};
  const b={disabled:false}, pending=new Map(),errors=[];
  const h=createHarness(['isReferencePdfOriginalBaseKey', 'prepareManageReferenceMaterial'],{
    File,clean,navigator:{onLine:true},els:{manageTextbookMaterialPrepareBtn:b},
    referencePdfPreparationCount:0,referencePdfPreparationGeneration:0,
    pendingReferencePdfFiles:pending,manageReferenceMaterialConfig:()=>cfg,
    referencePdfCatalogItem:()=>({materialType:'개정'}),
    validatePendingReferencePdfFile:()=>{},
    splitNewOriginalReferencePdf:async()=>[file,file],
    showToast:m=>errors.push(m),
    fetchReferencePdfRegistrationPlan:async()=>{throw Error('must not request plan for non-original base');},
  });
  await h.prepareManageReferenceMaterial('교재');
  assert.equal(pending.size,0);
  assert(errors.some(x=>x.includes('원본 페이지키')));
}

async function testChangedFormInputsAbortPendingPDFBatch() {
  for (const changedField of ['baseKey','pageNumber','position','keyOverride']) {
    const oldFile={name:'two.pdf',size:100,type:'application/pdf'};
    const cfg={
      type:{value:'supplement'},baseKey:{value:'SW-2'},
      pageNumber:{value:'613'},position:{value:'뒤'},
      keyOverride:{value:''},file:{files:[oldFile],value:'chosen'},
      plan:{className:'',textContent:''},
    };
    const button={disabled:false},pending=new Map(),messages=[];
    let release;
    const splitPromise=new Promise(resolve=>{release=resolve;});
    const h=createHarness(['isReferencePdfOriginalBaseKey', 'prepareManageReferenceMaterial'],{
      clean, navigator:{onLine:true},pendingReferencePdfFiles:pending,
      referencePdfPreparationGeneration:0,referencePdfPreparationCount:0,
      manageReferenceMaterialConfig:()=>cfg,
      els:{manageSubnoteMaterialPrepareBtn:button,manageTextbookMaterialPrepareBtn:button},
      validatePendingReferencePdfFile:()=>{},
      splitNewOriginalReferencePdf:async()=>splitPromise,
      showToast:m=>messages.push(m),
      fetchReferencePdfRegistrationPlan:async()=>{throw Error('must abort before server plan');},
    });
    const work=h.prepareManageReferenceMaterial('교재');
    cfg[changedField].value='CHANGED';
    release([new File(['%PDF-X'],'x.pdf',{type:'application/pdf'})]);
    await work;
    assert.equal(pending.size,0,'must not stage a stale plan');
    assert.equal(button.disabled,false);
    assert.equal(h.referencePdfPreparationCount,0);
    assert(messages.some(m=>m.includes('변경')),'should clearly request fresh preparation');
  }
}


async function testManualMultiPageUploadRow() {
  const sourceType='교재',pageToken='SW-2:613';
  const pending=new Map();
  const sourceFile=new File(['%PDF-data'],'manual.pdf',{type:'application/pdf'});
  const fields={value:pageToken};
  const h=createHarness([
    'buildReferencePdfBatchEntries','stageReferencePdfBatch',
    'handleManageReferenceFileSelection',
  ], {
    File, clean,
    referencePdfPreparationGeneration:0,referencePdfPreparationCount:0,
    pendingReferencePdfFiles:pending,
    validatePendingReferencePdfFile:()=>{},
    pageTokenParts:token=>({pageKey:token.split(':')[0],pageNumber:Number(token.split(':')[1])}),
    pendingReferencePdfEntry:(src,t)=>pending.get(key(src,t)),
    splitNewOriginalReferencePdf:async()=>[new File(['%PDF-1'],'one.pdf',{type:'application/pdf'}),
                                          new File(['%PDF-2'],'two.pdf',{type:'application/pdf'})],
    manageReferenceEditorConfig:()=>({hidden:fields}),
    splitPageTokens:s=>clean(s).split(',').filter(Boolean),
    expectedReferencePdfFileName:(k,n)=>k+'_'+String(n).padStart(4,'0')+'.pdf',
    getReferencePdfPage:()=>null,referencePdfCatalogHasPage:()=>false,
    renderManageReferencePageEditor:()=>{},updateManageReferencePdfHint:()=>{},
    showToast:message=>{throw Error('unexpected: '+message)},
  });
  await h.handleManageReferenceFileSelection(sourceType,pageToken,{files:[sourceFile],value:'selected'});
  assert.equal(fields.value,pageToken);
  assert.deepEqual(Array.from(pending.keys()),[key('교재','SW-2:613'),key('교재','SW-2:614')]);
  assert.equal(pending.get(key('교재','SW-2:614')).batchLinkToken,pageToken);
}



function testIncompleteRevisionRemainsInvisibleAndUploadOrderSafe() {
  const type='교재', first='SW-2-R7:613', pending=new Map();
  const make=(n)=>({
    batchFirstToken:first,batchLinkToken:first,batchMode:'revision',batchPageCount:3,
    batchIndex:n-613,pageToken:'SW-2-R7:'+n,
    file:{name:'page-'+n+'.pdf',type:'application/pdf'},
    plan:{pageKey:'SW-2-R7',pageNumber:n,
      rawMaterialType:n===613?'revision':'supplement',
      allowCreatePageKey:n===614,
    },
  });
  [613,614,615].forEach(n=>pending.set(key(type,'SW-2-R7:'+n),make(n)));
  const uploaded=[];
  const h=createHarness([
    'collectPendingNewOriginalBatchPages','collectPendingManageReferenceUploads',
    'referencePdfVersionRank','referencePdfActiveRevisionFor','resolveReferencePdfEffectivePage',
    'referencePdfRootPageKey','referencePdfBaseSequenceKeys','sortReferencePdfSupplements',
    'buildReferencePdfLogicalSequence','findReferencePdfSequentialPage',
  ],{
    clean,pendingReferencePdfFiles:pending,
    splitPageTokens:s=>clean(s).split(',').filter(Boolean),
    pageTokenParts:s=>{const m=s.match(/^(.+):(\d+)$/);return m?{pageKey:m[1],pageNumber:Number(m[2])}:null;},
    getReferencePdfPage:(source,token)=>uploaded.find(p=>p.sourceType===source&&p.pageToken===token),
    pendingReferencePdfEntry:(src,token)=>pending.get(key(src,token)) || null,
    collectMissingManageReferencePages:f=> f.textbookPages && !uploaded.some(p=>p.pageToken===f.textbookPages)
      ? [{sourceType:type,pageToken:f.textbookPages,pageKey:'SW-2-R7',pageNumber:613}]
      : [],
    allReferencePdfPages:uploaded,
    REFERENCE_PDF_PAGE_KEY_SEQUENCES:[['SW-1','SW-2','SW-3']],
  });
  const base={sourceType:type,pageKey:'SW-2',pageNumber:613,pageToken:'SW-2:613',
    materialType:'원본',basePageKey:'SW-2',active:'Y'};
  uploaded.push(base);
  const fields={subnotePages:'',textbookPages:first};
  assert.deepEqual(Array.from(h.collectPendingManageReferenceUploads(fields),x=>x.pageToken),[
    'SW-2-R7:614','SW-2-R7:615','SW-2-R7:613'
  ],'revision cover must be uploaded last');
  uploaded.push({sourceType:type,pageKey:'SW-2-R7',pageNumber:614,pageToken:'SW-2-R7:614',
    materialType:'보강',basePageKey:'SW-2',anchorPageToken:base.pageToken,insertionPosition:'뒤',active:'Y'});
  uploaded.push({sourceType:type,pageKey:'SW-2-R7',pageNumber:615,pageToken:'SW-2-R7:615',
    materialType:'보강',basePageKey:'SW-2',anchorPageToken:base.pageToken,insertionPosition:'뒤',active:'Y'});
  assert.deepEqual(Array.from(h.buildReferencePdfLogicalSequence(base),x=>x.pageToken),[
    base.pageToken
  ],'pending revision extras must stay hidden until cover uploads');
  uploaded.push({sourceType:type,pageKey:'SW-2-R7',pageNumber:613,pageToken:'SW-2-R7:613',
    materialType:'개정',basePageKey:'SW-2',replacementTarget:base.pageToken,versionTag:'R7',active:'Y'});
  assert.deepEqual(Array.from(h.buildReferencePdfLogicalSequence(base),x=>x.pageToken),[
    'SW-2-R7:613','SW-2-R7:614','SW-2-R7:615'
  ],'the complete revision becomes visible after the final cover upload');
}



async function testRevisionContinuationFailureAndRetry() {
  const first='SW-2-R4:613', sourceType='교재';
  const pending=new Map();
  for(let i=0;i<3;i++){
    const number=613+i, token='SW-2-R4:'+number;
    pending.set(key(sourceType,token),{
      batchFirstToken:first,batchLinkToken:first,
      batchMode:'revision',batchPageCount:3,batchIndex:i,
      originalName:'revision-three.pdf',uploadedDriveFileId:'',
      file:{name:'rev-part-'+i+'.pdf',type:'application/pdf',size:1024},
      pageCount:1,plan:{
        pageKey:'SW-2-R4',pageNumber:number,pageToken:token,
        rawMaterialType:i?'supplement':'revision',
        basePageKey:'SW-2',anchorPageToken:i?'SW-2:613':'',
        replacementTarget:i?'':'SW-2:613',insertionPosition:i?'뒤':'',
        versionTag:'R4',allowCreatePageKey:i===1,
      },
    });
  }
  const base={sourceType,pageKey:'SW-2',pageNumber:613,pageToken:'SW-2:613',
    driveFileId:'ORIGINAL_STAYS',materialType:'원본',basePageKey:'SW-2',active:'Y'};
  const requests=[];
  let h, failThird=true;
  const env={
    clean, pendingReferencePdfFiles:pending,
    allReferencePdfPages:[base],
    referencePdfPageCatalogLoadedAt:0,
    db:{},
    REFERENCE_PDF_PAGE_KEY_SEQUENCES:[['SW-1','SW-2','SW-3']],
    splitPageTokens:value=>clean(value).split(',').filter(Boolean),
    pageTokenParts:token=>{const m=clean(token).match(/^(.+):(\d+)$/);return m?{pageKey:m[1],pageNumber:Number(m[2])}:null;},
    referencePdfPageId:key,
    getReferencePdfPage:(src,token)=>h.allReferencePdfPages.find(p=>p.sourceType===src&&p.pageToken===token)||null,
    collectMissingManageReferencePages:fields=>
      h.getReferencePdfPage('교재',first)?[]:
      [{sourceType:'교재',pageKey:'SW-2-R4',pageNumber:613,pageToken:first}],
    pendingReferencePdfEntry:(src,token)=>pending.get(key(src,token))||null,
    referencePdfCatalogHasPage:()=>false,
    referencePdfCatalogItem:()=>null,
    validatePendingReferencePdfFile:()=>{},
    detectPdfPageCount:async()=>1,
    readFileAsDataUrl:async()=> 'data:application/pdf;base64,REVISION',
    getApiUrl:()=> 'https://example.invalid',
    sendMutation:async(_url,payload)=>{
      requests.push(payload);
      if(failThird&&payload.pageNumber===615)throw new Error('simulated revision continuation failure');
      return {...payload,driveFileId:'REV_FILE_'+payload.pageNumber,
        storedFileName:payload.pageKey+'_'+String(payload.pageNumber).padStart(4,'0')+'.pdf',
        materialType:payload.materialType==='revision'?'개정':'보강',
        active:'Y'};
    },
    putReferencePdfPage:async()=>{},
    renderManageReferencePageEditor:()=>{},
    updateManageReferencePdfHint:()=>{},
    ensureManageReferencePdfCatalog:async()=>{},
    renderManageReferencePageEditors:()=>{},
    refreshReferencePdfPagesFromServer:async()=>{throw Error('unexpected server refresh');},
  };
  h=createHarness([
    'collectPendingNewOriginalBatchPages','collectPendingManageReferenceUploads',
    'referencePdfPageFromUploadStatus','uploadPendingManageReferencePages',
    'referencePdfActiveRevisionFor','referencePdfVersionRank',
    'resolveReferencePdfEffectivePage','referencePdfRootPageKey',
    'referencePdfBaseSequenceKeys','sortReferencePdfSupplements',
    'buildReferencePdfLogicalSequence','findReferencePdfSequentialPage',
  ],env);
  const fields={subnotePages:'',textbookPages:first};
  await assert.rejects(()=>h.uploadPendingManageReferencePages(fields),/simulated revision continuation failure/);
  assert.deepEqual(requests.map(x=>x.pageNumber),[614,615]);
  assert.deepEqual(requests.map(x=>x.allowCreatePageKey),[true,false]);
  assert.deepEqual(Array.from(h.buildReferencePdfLogicalSequence(base),p=>p.pageToken),[
    base.pageToken,
  ],'revision should remain invisible after only first continuation is stored');
  assert.equal(h.getReferencePdfPage('교재','SW-2-R4:613'),null);
  assert.equal(h.getReferencePdfPage('교재','SW-2:613').driveFileId,'ORIGINAL_STAYS');
  failThird=false;
  const recovered=await h.uploadPendingManageReferencePages(fields);
  assert.equal(recovered.uploadedCount,2);
  assert.deepEqual(requests.map(x=>x.pageNumber),[614,615,615,613]);
  assert.equal(requests[3].materialType,'revision','cover must be last');
  assert.equal(requests[3].allowCreatePageKey,false);
  assert.deepEqual(Array.from(h.buildReferencePdfLogicalSequence(base),p=>p.pageToken),[
    'SW-2-R4:613','SW-2-R4:614','SW-2-R4:615'
  ],'full revision must appear after cover registration');
  assert.equal(h.getReferencePdfPage('교재','SW-2:613').driveFileId,'ORIGINAL_STAYS');
  assert.equal(h.findReferencePdfSequentialPage(h.getReferencePdfPage('교재','SW-2-R4:614'),1).pageToken,'SW-2-R4:615');
}

function testServerPayloadReloadForSubnoteAndRevision() {
  // Mirrors the real Apps Script buildPdfPageFilesPayload_ response: six
  // physical columns plus eight optional relation columns. Crucially, a new
  // original with no relation gets basePageKey = its own pageKey even if its
  // Drive folder was created from a different existing base folder.
  const headers = ['출처유형','페이지키','페이지번호','페이지토큰',
    '페이지Drive파일ID','페이지파일명','자료유형','기준페이지키',
    '기준페이지토큰','삽입위치','대체대상페이지토큰','논리순서','판본','활성여부'];
  const rows = [];
  const push = (sourceType, pageKey, pageNumber, flow = {}) => {
    const token = pageKey + ':' + pageNumber;
    rows.push([sourceType,pageKey,pageNumber,token,
      'PDF_FILE_ID_' + rows.length, pageKey + '_' + String(pageNumber).padStart(4,'0') + '.pdf',
      flow.materialType || '원본',
      flow.basePageKey || pageKey,
      flow.anchorPageToken || '',
      flow.insertionPosition || '',
      flow.replacementTarget || '',
      flow.logicalOrder || 0,
      flow.versionTag || '',
      flow.active || 'Y',
    ]);
  };
  // Existing subnote original remains independent from newly uploaded MG-6.
  [1,2,3].forEach(n => push('서브노트','MG',n));
  [1,2].forEach(n => push('서브노트','MG-6',n));
  [613,614,615].forEach(n => push('교재','SW-2',n));
  push('교재','SW-2-R2',613,{materialType:'개정',basePageKey:'SW-2',
    replacementTarget:'SW-2:613',versionTag:'R2'});
  push('교재','SW-2-R2',614,{materialType:'보강',basePageKey:'SW-2',
    anchorPageToken:'SW-2:613',insertionPosition:'뒤'});
  // Revision continuation pages are uploaded before the cover by the app,
  // so they arrive as supplements with the *same -R3 key*.
  [614,615].forEach(n => push('교재','SW-2-R3',n,{materialType:'보강',
    basePageKey:'SW-2',anchorPageToken:'SW-2:613',insertionPosition:'뒤'}));
  push('교재','SW-2-R3',613,{materialType:'개정',basePageKey:'SW-2',
    replacementTarget:'SW-2:613',versionTag:'R3'});
  [1,2].forEach(n => push('교재','SW-2-ADD1',n,{materialType:'보강',
    basePageKey:'SW-2',anchorPageToken:'SW-2:613',insertionPosition:'뒤',
    logicalOrder:n+10}));

  const h = createHarness([
    'normalizeReferencePdfPages',
    'referencePdfActiveRevisionFor','referencePdfVersionRank',
    'resolveReferencePdfEffectivePage','referencePdfRootPageKey',
    'referencePdfBaseSequenceKeys','sortReferencePdfSupplements',
    'buildReferencePdfLogicalSequence','findReferencePdfSequentialPage',
  ],{
    clean,referencePdfPageId:key,
    REFERENCE_PDF_PAGE_HEADERS:headers.slice(0,6),
    toNumber:(value,defaultValue)=>Number(value) || defaultValue,
    allReferencePdfPages:[],
    REFERENCE_PDF_PAGE_KEY_SEQUENCES:[['SW-1','SW-2','SW-3']],
  });
  const parsed=h.normalizeReferencePdfPages({headers,rows});
  h.allReferencePdfPages=parsed;
  assert.equal(parsed.length,rows.length);
  const find=(type,token)=>{
    const page=parsed.find(p=>p.sourceType===type&&p.pageToken===token);
    assert(page,'missing parsed page '+type+' '+token);
    return page;
  };
  const subFirst=find('서브노트','MG-6:1');
  assert.equal(subFirst.basePageKey,'MG-6');
  assert.deepEqual(Array.from(h.buildReferencePdfLogicalSequence(subFirst),x=>x.pageToken),[
    'MG-6:1','MG-6:2'
  ],'new subnote original must be isolated from legacy MG after full reload');
  assert.equal(h.findReferencePdfSequentialPage(subFirst,1).pageToken,'MG-6:2');
  assert.equal(h.findReferencePdfSequentialPage(find('서브노트','MG-6:2'),-1).pageToken,'MG-6:1');
  assert.equal(h.findReferencePdfSequentialPage(find('서브노트','MG-6:2'),1),null);

  const base=find('교재','SW-2:613');
  const sequence=Array.from(h.buildReferencePdfLogicalSequence(base),p=>p.pageToken);
  assert.deepEqual(sequence,[
    'SW-2-R3:613','SW-2-R3:614','SW-2-R3:615',
    'SW-2-ADD1:1','SW-2-ADD1:2','SW-2:614','SW-2:615',
  ]);
  assert.equal(h.resolveReferencePdfEffectivePage(base).pageToken,'SW-2-R3:613');
  assert(!sequence.includes('SW-2-R2:613'));
  assert(!sequence.includes('SW-2-R2:614'));
  assert.equal(h.findReferencePdfSequentialPage(find('교재','SW-2-R3:615'),1).pageToken,'SW-2-ADD1:1');
  assert.equal(h.findReferencePdfSequentialPage(find('교재','SW-2-ADD1:2'),1).pageToken,'SW-2:614');
  // No cross-source contamination even when a pageKey is shared.
  assert.equal(h.findReferencePdfSequentialPage(find('서브노트','MG:2'),1).pageToken,'MG:3');

  assert.throws(()=>h.normalizeReferencePdfPages({headers,rows:[rows[0],rows[0]]}),
    /중복/,'duplicate page tokens must be rejected during server reload');
  const broken=rows[0].slice();
  broken[4]='';
  assert.throws(()=>h.normalizeReferencePdfPages({headers,rows:[broken]}),
    /필수값/,'Drive file id is mandatory in a server page row');
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
  testIncompleteRevisionRemainsInvisibleAndUploadOrderSafe();
  await testVersionedRowReplacementAndRevisionCodeFallback();
  await testMaterialPreparationForBothSources();
  await testManualMultiPageUploadRow();
  await testChangedFormInputsAbortPendingPDFBatch();
  testReferencePdfBaseKeyChoicesExcludeAddAndRevisionKeys();
  testLocalCatalogRetainsMaterialTypesAndOriginalBaseChoices();
  await testRejectRevisionBaseEvenWhenCatalogMislabeledOriginal();
  await testNoSupplementAsBaseKey();
  await testSavePreflightAllowsRevisionBatchCover();
  await testRevisionContinuationFailureAndRetry();
  testServerPayloadReloadForSubnoteAndRevision();
  testSequentialOriginalNavigation();
  console.log('PASS: HTML scripts parse, real 2-page split, legacy limits, staged retry, collision checks, and sequential navigation');
})().catch(error => { console.error(error); process.exitCode = 1; });
