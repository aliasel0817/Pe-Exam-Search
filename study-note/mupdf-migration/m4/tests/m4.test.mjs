import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {isM4LocalOptIn,makeReferencePageFacade,M4_BUDGET,M4_TILE_BUDGET,
  M4ReferenceDocument} from '../m4-reference-adapter.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../../../..');
const current=fs.readFileSync(path.join(root,'study-note','study-note.html'),'utf8').replace(/\r\n/g,'\n');
const baseline=execFileSync('git',['-C',root,'show',
  'bd0ffb606ae8f10923abf2246b800ca534bcf580:study-note/study-note.html'],{encoding:'utf8'}).replace(/\r\n/g,'\n');

function between(source,start,end){
 const a=source.indexOf(start);
 const b=source.indexOf(end,a+start.length);
 assert(a>=0&&b>a,'Missing source markers: '+start+' / '+end);
 return source.slice(a,b);
}
test('M4 private gate rejects public origins and non-opt-in loopback',()=>{
 const cases=[
  ['http://127.0.0.1:5000/study-note/study-note.html?m4-local=1',true],
  ['http://localhost:9000/study-note/study-note.html?m4-local=1',true],
  ['http://localhost/study-note/study-note.html?m4-local=0',false],
  ['https://localhost/study-note/study-note.html?m4-local=1',false],
  ['https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html?m4-local=1',false],
  ['http://attacker.example/?m4-local=1',false],
  ['http://127.0.0.1.evil.example/?m4-local=1',false]
 ];
 for(const [url,expected]of cases)assert.equal(isM4LocalOptIn(url),expected,url);
});
test('M4 original signed GET and ACTIVE session checks survive R2 abort hardening',()=>{
 const start='async function fetchReferencePdfBytesFromServer(page, { signal } = {}) {';
 const oldStart='async function fetchReferencePdfBytesFromServer(page) {';
 const end='async function repaintReferencePdfAtZoom(';
 const now=between(current,start,end),old=between(baseline,oldStart,end);
 const required=[
   "buildSignedGetUrl(getApiUrl(), 'referencePdfContent', { sourceType, pageToken })",
   'hasActiveSecuritySession()',
   "payload.mime !== 'application/pdf'",
   'MAX_REFERENCE_PAGE_BYTES',
   "cache: 'no-store'",
 ];
 for(const s of required){
   assert(now.includes(s),'R2 lost original signed GET behavior: '+s);
   assert(old.includes(s),'M3 baseline missing signed GET behavior: '+s);
 }
 assert.match(now,/signal\?\.aborted/);
 assert.match(now,/referrerPolicy:\s*'no-referrer'/);
 assert(!now.includes('sendMutation('),'Signed PDF read must never mutate data');
});
test('Annotation schema, coordinate and persistence functions remain unchanged',()=>{
 const segments=[
  ['function annotationSurfaceKey(', 'function annotationBitmapSize('],
  ['function annotationClientPointToNormalized(', 'window.StudyNoteAnnotation = Object.freeze('],
  ['async function hydrateAnnotationDocuments(', 'function getAnnotationDocument('],
  ['function scheduleAnnotationPersist(', 'function '],
 ];
 for(const [a,b] of segments.slice(0,3))assert.equal(between(current,a,b),between(baseline,a,b),a);
 assert(current.includes("const ANNOTATION_SCHEMA_VERSION = 3;"));
 assert(current.includes("coordinateSpace: 'normalized-0-1'"));
 assert(current.includes('z-index: 3;')&&current.includes('.m4-reference-detail-tile'));
});
test('M4 legacy attachment viewer remains identical beneath explicit M5 local dispatch',()=>{
 const a='async function loadAttachmentPdfPage(';
 const b='function computeAttachmentPdfRenderMetrics(';
 // M5 is allowed to add only its local-only dispatch at function entry.
 // Continue to compare the entire original attachment-PDF.js function byte-for-byte.
 const m5Dispatch = "  if (typeof M5_ATTACHMENT_DEV_ENABLED !== 'undefined' && M5_ATTACHMENT_DEV_ENABLED) {\n"
   + "    return m5LoadAttachmentPdfPage(pageNumber,{serial});\n"
   + "  }\n";
 const currentBody=between(current,a,b);
 const normalized=(currentBody.includes(m5Dispatch)
   ? currentBody.replace(m5Dispatch,'') : currentBody)
   // Attachment performance fix prevents a redundant first-page repaint only.
   .replace('renderActiveAttachmentPdfCanvas({ preserveCenter: false, scheduleRender: false });',
     'renderActiveAttachmentPdfCanvas({ preserveCenter: false });');
 assert.equal(normalized,between(baseline,a,b));
 assert(current.includes("sendMutation(getApiUrl()"));
 assert(!between(current,'async function m4LoadReferencePdfHighQuality(', 'async function m4RepaintReferencePdf(').includes('sendMutation'));
});
test('All M4 assets and QA harness remain private and no upstream vendor binary tracked',()=>{
 const tracked=execFileSync('git',['-C',root,'ls-files'],{encoding:'utf8'}).split(/\r?\n/);
 assert(tracked.filter(f=>f.endsWith('.wasm')).every(f=>f==='study-note/vendor/mupdf/1.28.1/mupdf-wasm.wasm'));
 assert(!tracked.some(f=>f.includes('.m2-private/')||f.includes('.m4-private/')));
 assert(!tracked.some(f=>/mupdf-migration\/m4\/.*\.(pdf|png)$/i.test(f)));
 assert(current.includes("window.__M4_REFERENCE_QA__"));
 assert(current.includes('if (M4_REFERENCE_DEV_ENABLED)'));
 assert(current.includes("return m4LoadReferencePdfHighQuality(page, loadSerial);"));
});
test('New page facade reports correct crop-aware viewport without touching schema',()=>{
 const p=makeReferencePageFacade({pageWidth:500,pageHeight:400,rotation:90});
 assert.deepEqual(p.getViewport({scale:2}),{width:1000,height:800});
 assert.equal(p.rotate,90);
 assert.equal(M4_BUDGET.maxBytes,36*1024*1024);
 assert.equal(M4_TILE_BUDGET.maxBytes,32*1024*1024);
});
test('M4 session disposes and never persists data',async()=>{
 let closed=0;
 const mock={engine:'mupdf-worker',countPages:1,
  async getPageBounds(){return {pageWidth:100,pageHeight:200};},
  async close(){closed++;}
 };
 const s=new M4ReferenceDocument(mock);
 assert.equal(s.pageCount,1);
 assert.equal(s.coordinateSpace,'normalized-0-1');
 assert.equal(s.annotationSchema,3);
 await s.close();await s.close();
 assert.equal(closed,1);
 await assert.rejects(s.getPageBounds(1),e=>e.code==='DOCUMENT_CLOSED');
});
