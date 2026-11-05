import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {
  isM5LocalOptIn,validateAttachmentPdfBytes,annotationPageKey,
  M5AttachmentDocument,M5_BASE_BUDGET,M5_TILE_BUDGET,M5_MAX_ATTACHMENT_BYTES,
} from '../m5-attachment-adapter.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../..');
const html=fs.readFileSync(path.join(root,'study-note','study-note.html'),'utf8').replace(/\r\n/g,'\n');
const ui=fs.readFileSync(path.join(here,'..','m5-attachment-ui.js'),'utf8').replace(/\r\n/g,'\n');
const baseline=execFileSync('git',['-C',root,'show',
  '0829a17666bd25490ce7b4f9e542ab5ba16c951a:study-note/study-note.html'],
  {encoding:'utf8'}).replace(/\r\n/g,'\n');
function section(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert(a>=0&&b>a,'Not found: '+start+' / '+end);
 return source.slice(a,b);
}
test('M5 explicitly rejects public, remote and partial local flag URLs',()=>{
 const cases=[
 ['http://127.0.0.1:8060/study-note/study-note.html?m4-local=1&m5-local=1',true],
 ['http://localhost:5000/study-note/study-note.html?m4-local=1&m5-local=1',true],
 ['http://localhost:5000/study-note/study-note.html?m5-local=1',false],
 ['http://localhost:5000/study-note/study-note.html?m4-local=1',false],
 ['https://localhost:5000/study-note/study-note.html?m4-local=1&m5-local=1',false],
 ['https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html?m4-local=1&m5-local=1',false],
 ['http://127.0.0.1.evil.example/?m4-local=1&m5-local=1',false],
 ];
 for(const [uri,expected]of cases)assert.equal(isM5LocalOptIn(uri),expected,uri);
});
test('Unchanged public read API, attachment records and mutation handlers',()=>{
 for(const [a,b]of [
  ['async function fetchMediaContent(', 'function normalizeAttachmentDataset('],
  ['function normalizeAttachmentDataset(', 'const LEARNING_HEADERS'],
  ['function renderPdfViewer(items) {','function updateAttachmentPdfViewerUi() {'],
  ['function updateAttachmentPdfViewerUi() {','async function loadPdfAtIndex(index) {'],
  ['function computeAttachmentPdfRenderMetrics(', 'async function repaintAttachmentPdfAtZoom('],
  ['function setAttachmentPdfZoomFactor(', 'async function deactivateCurrentTopic('],
 ]){
  assert.equal(section(html,a,b),section(baseline,a,b),a);
 }
 assert(section(html,'async function fetchMediaContent(', 'function normalizeAttachmentDataset(')
  .includes("action=mediaContent&attachmentId="));
 assert(!ui.includes('sendMutation('));
 assert(ui.includes('fetchMediaContent(getApiUrl(), item.attachmentId, {signal:abort.signal})'));
});
test('Legacy PDF.js preserves PDF opening, navigation and security with isolated load optimizations',()=>{
 const now=section(html,'  if (!activePdfAttachments.length) return;','async function loadAttachmentPdfPage(');
 assert(now.includes('attachmentPdfFetchAbort?.abort()'));
 assert(now.includes('fetchMediaContent(getApiUrl(), item.attachmentId, { signal: fetchAbort.signal })'));
 assert(now.includes('await Promise.all([bytesPromise, ensurePdfJsLoaded()])'));
 assert(now.includes('pdfjsLib.getDocument({ data: bytes })'));
 assert(now.includes('await loadAttachmentPdfPage(1, { serial })'));
 assert(!now.includes('sendMutation('));
 assert(section(html,'async function repaintAttachmentPdfAtZoom(', 'function renderActiveAttachmentPdfCanvas(')
  .includes('computeAttachmentPdfRenderMetrics'));
});
test('Existing schema 3, ink coordinate system and page keys remain unchanged',()=>{
 for(const [a,b] of [
  ['function annotationSurfaceKey(', 'function annotationBitmapSize('],
  ['function annotationClientPointToNormalized(', 'window.StudyNoteAnnotation = Object.freeze('],
  ['function renderAnnotationSurface(surface)', 'function scheduleAnnotationRender(surface)'],
 ]){
  assert.equal(section(html,a,b),section(baseline,a,b),a);
 }
 assert(html.includes("const ANNOTATION_SCHEMA_VERSION = 3;"));
 assert(html.includes("coordinateSpace: 'normalized-0-1'"));
 assert.equal(annotationPageKey('M5-QA-A',2,3),'attachment-pdf:M5-QA-A:2');
 assert.throws(()=>annotationPageKey('M5-QA-A',4,3),/Page must/);
 assert.throws(()=>annotationPageKey('evil:bad',1,3),/attachment ID/);
 assert(ui.includes("key:annotationSurfaceKey('attachment-pdf',item?.attachmentId||'unknown',String(activeAttachmentPdfPageNumber))"));
});
test('M5 never ships vendor JS/WASM, private data or screenshots',()=>{
 const tracked=execFileSync('git',['-C',root,'ls-files'],{encoding:'utf8'}).split(/\r?\n/);
 assert(tracked.filter(f=>f.endsWith('.wasm')).every(f=>f==='study-note/vendor/mupdf/1.28.1/mupdf-wasm.wasm'));
 assert(!tracked.some(f=>/\.(m2|m3|m4|m5)-private\//.test(f)));
 assert(!tracked.some(f=>/mupdf-migration\/m5\/.+\.(pdf|png|jpg)$/.test(f)));
 assert(html.includes("new URLSearchParams(window.location.search).get('m5-local') === '1'"));
 assert(html.includes("privateM5Script.src = './mupdf-migration/m5/m5-attachment-ui.js'"));
 assert(M5_BASE_BUDGET.maxBytes<=36*1024*1024);
 assert(M5_TILE_BUDGET.maxBytes<=32*1024*1024);
});
test('Real PDF header and max attachment payload are checked before opening',()=>{
 const data=Uint8Array.from(Buffer.from('%PDF-1.7\nsample'));
 assert.deepEqual(validateAttachmentPdfBytes(data),data);
 assert.throws(()=>validateAttachmentPdfBytes(Uint8Array.from([1,2,3])),/size/);
 assert.throws(()=>validateAttachmentPdfBytes(Uint8Array.from(Buffer.from('FAKE-1.7\nsample'))),/real PDF/);
 assert.equal(M5_MAX_ATTACHMENT_BYTES,25*1024*1024);
});
test('Document multipage bounds, rotation, same schema and idempotent cleanup',async()=>{
 let closed=0,calls=0;
 const mock={pageCount:3,engine:'mupdf-worker',
  async getPageBounds(n){calls++;return {pageWidth:n*200,pageHeight:n*320,rotation:n===2?90:0}},
  async renderInto(canvas,opts){return {engine:'mupdf-worker',width:512,height:768,pageNumber:opts.pageNumber}},
  async renderVisibleRegion(){return null},
  async close(){closed++;}
 };
 const doc=new M5AttachmentDocument(mock);
 assert.equal(doc.pageCount,3);
 assert.equal(doc.coordinateSpace,'normalized-0-1');
 assert.equal(doc.annotationSchema,3);
 const a=await doc.getPageView(2),b=await doc.getPageView(2);
 assert.equal(a,b);assert.equal(calls,1);
 assert.deepEqual(a.facade.getViewport({scale:1.5}),{width:600,height:960});
 assert.equal(a.facade.rotate,90);
 const p=await doc.renderPage({}, {pageNumber:2,fitScale:1});
 assert.equal(p.pageNumber,2);
 await doc.close();await doc.close();
 assert.equal(closed,1);
 await assert.rejects(()=>doc.getPageView(1),/closed/);
});
test('Real study-note inline scripts still parse and physical device claims remain separated',()=>{
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
   .map(m=>m[1]).filter(s=>s.trim());
 assert(scripts.length>0);
 scripts.forEach((s,i)=>assert.doesNotThrow(()=>new vm.Script(s,{filename:'inline-'+i})));
 assert.doesNotThrow(()=>new vm.Script(ui,{filename:'m5-attachment-ui.js'}));
 assert(html.includes('if (typeof M5_ATTACHMENT_DEV_ENABLED !=='));
});
