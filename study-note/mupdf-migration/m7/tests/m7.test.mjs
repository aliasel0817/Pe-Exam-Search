import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createM6ScrollCoalescer} from '../../m6/m6-interaction-policy.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const migration=path.resolve(here,'../..');
const root=path.resolve(migration,'../..');
const html=fs.readFileSync(path.join(root,'study-note','study-note.html'),'utf8');
const m5=fs.readFileSync(path.join(migration,'m5','m5-attachment-ui.js'),'utf8');
const m6=fs.readFileSync(path.join(migration,'m6','m6-runtime.js'),'utf8');
const before=execFileSync('git',['-C',root,'show','78033198346a3e30989654c643526343271fcefc:study-note/study-note.html'],{encoding:'utf8'});

test('pending scroll tiles are invalidated on page/document close and gate is reusable',()=>{
 let clock=100,seq=0,events=[];
 const timers=new Map();
 const gate=createM6ScrollCoalescer({
  setTimer:cb=>{const id=++seq;timers.set(id,cb);return id},
  clearTimer:id=>timers.delete(id),now:()=>clock,
  delayMs:125,maxWaitMs:360,
 });
 gate.schedule(()=>events.push('old-page'));
 assert.equal(gate.stats().pending,true);
 assert.equal(timers.size,1);
 gate.cancel();
 assert.equal(gate.stats().pending,false);
 assert.equal(timers.size,0);
 clock+=150;
 gate.schedule(()=>events.push('new-page'));
 assert.equal(timers.size,1);
 for(const cb of timers.values())cb();
 assert.deepEqual(events,['new-page']);
 assert.equal(gate.stats().executions,1);
 gate.close();
 gate.schedule(()=>events.push('closed'));
 assert.equal(timers.size,0);
 assert.equal(gate.stats().closed,true);
});
test('M7 cancels both renderer tile queues before retaining new page/document state',()=>{
 assert.match(m6,/cancelTile\(kind\)\{gates\.get\(kind\)\?\.cancel\(\);\}/);
 assert.match(m5,/function m5StopPageRendering\(\)\s*\{[\s\S]*?cancelTile\('attachment'\)[\s\S]*?\+\+m5AttachmentPageSerial;/);
 assert.match(html,/function resetReferencePdfHighQualityRenderer\(\)\s*\{[\s\S]*?cancelTile\('reference'\)[\s\S]*?m4ReferenceTileSerial\+\+;/);
 assert.match(m5,/forgetZoom\(els\.mediaViewerBody\?\.querySelector/);
 assert.match(html,/forgetZoom\(els\.referencePdfFrameWrap\?\.querySelector/);
});
test('legacy reference renderer and annotation schemas remain intact',()=>{
 const old=before.replace(/\r\n/g,'\n');
 const current=html.replace(/\r\n/g,'\n');
 // R4 inserts ONLY one opt-in loopback license-notice loader near </body>.
 // Remove exactly that documented block before testing all unrelated HTML bytes.
 const noticeStart='<!-- R4_LICENSE_NOTICE_PRIVATE_START:';
 const noticeEnd='<!-- R4_LICENSE_NOTICE_PRIVATE_END -->\n';
 assert.equal(current.split(noticeStart).length,2,'R4 private notice loader is unique');
 const begin=current.indexOf(noticeStart),after=current.indexOf(noticeEnd,begin);
 assert(begin>=0&&after>begin,'R4 notice end marker required');
 const now=current.slice(0,begin)+current.slice(after+noticeEnd.length);
 // R1 intentionally adds exactly one safe tile cleanup on repaint. Strip it
 // before asserting that all prior production HTML is byte-equivalent.
 const withoutR1=now.replace("  // Clear the old zoom's detail tile before painting a resized base page.\n"+
   "  m4ReferenceModule?.clearVisibleTile(els.referencePdfFrameWrap?.querySelector('.reference-pdf-image-stage'));\n",'');
 const removed=withoutR1.replace(/  if \(M6_DEV_ENABLED\) \{\n    window\.__M6_PERF__\?\.cancelTile\('reference'\);\n    window\.__M6_PERF__\?\.forgetZoom\(els\.referencePdfFrameWrap\?\.querySelector\('\.reference-pdf-pan-scroller'\)\);\n  \}\n(?=  if \(M4_REFERENCE_DEV_ENABLED\) \{)/,'');
 // R2 changes only these four source-read/renderer lifecycle functions.
 // Compare every unrelated byte with the M6 reference; the R2 focused tests
 // separately exercise signed GET, cancellation and payload validation.
 const maskR2=s=>{
   s=s.replace('// R2: abort a superseded authenticated PDF GET before requesting another page.\n','');
   s=s.replace('let referencePdfSourceAbort = null;\n','');
   const ranges=[
     ['function resetReferencePdfHighQualityRenderer()','function setReferencePdfSourceStatus('],
     ['async function fetchReferencePdfBytesFromServer(','async function repaintReferencePdfAtZoom('],
     ['async function loadReferencePdfHighQuality(','// M4 non-production integration.'],
     ['async function m4LoadReferencePdfHighQuality(','async function m4RepaintReferencePdf('],
   ];
   for(let i=0;i<ranges.length;i++){
     const [start,end]=ranges[i],a=s.indexOf(start),b=s.indexOf(end,a);
     assert(a>=0&&b>a,'R2 compare markers must exist: '+start);
     s=s.slice(0,a)+'[R2-FOCUSED-FUNCTION-'+i+']\n'+s.slice(b);
   }
   return s;
 };
 assert.equal(maskR2(removed),maskR2(old),'M7/R2 must preserve every unrelated HTML byte');
 assert.match(now,/const ANNOTATION_SCHEMA_VERSION = 3;/);
 assert.match(now,/coordinateSpace: 'normalized-0-1'/);
 assert.match(m5,/fetchMediaContent\(getApiUrl\(\), item\.attachmentId/);
});
test('M7 remains private: no tracked wasm binaries, source paths and release controls retained',()=>{
 const tracked=execFileSync('git',['-C',root,'ls-files'],{encoding:'utf8'}).split(/\r?\n/);
 assert(!tracked.some(p=>p.endsWith('.wasm')||p.includes('.m2-private/')));
 const gate=fs.readFileSync(path.join(migration,'m2','m2-release-gate.cjs'),'utf8');
 assert.match(gate,/AGPL|LICENSE|release|publish/i);
 assert.match(html,/get\('m6-local'\) === '1'/);
 assert.match(m6,/isM6LocalOptIn\(window\.location\.href\)/);
});
