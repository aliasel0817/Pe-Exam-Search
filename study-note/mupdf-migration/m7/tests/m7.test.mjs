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
 const stripR6 = input => {
   // R6 is an additive, fail-closed release route. Strip exactly the audited
   // changes, then retain M7's strict byte-equivalence for all unrelated HTML.
   let s=input;
   const block=/  <!-- R6_RELEASE_SCRIPTS_BEGIN:[^\n]*\n[\s\S]*?  <!-- R6_RELEASE_SCRIPTS_END -->\n/;
   assert.match(s,block);
   s=s.replace(block,'');
   const gate="// R6: retain the original loopback flag; only an independently reviewed release can opt in.\n"
     +"const R6_PRODUCTION_RELEASE_ENABLED = window.PE_R6_POLICY?.isProductionRelease(\n"
     +"  window.PE_R6_RELEASE, window.location.href) === true;\n";
   assert(s.includes(gate));
   s=s.replace(gate,'');
   for(const [now,was] of [
     ["  && new URLSearchParams(window.location.search).get('m4-local') === '1'\n  || R6_PRODUCTION_RELEASE_ENABLED;",
      "  && new URLSearchParams(window.location.search).get('m4-local') === '1';"],
     ["  && (new URLSearchParams(window.location.search).get('m5-local') === '1'\n      || R6_PRODUCTION_RELEASE_ENABLED);",
      "  && new URLSearchParams(window.location.search).get('m5-local') === '1';"],
     ["  && (new URLSearchParams(window.location.search).get('m6-local') === '1'\n      || R6_PRODUCTION_RELEASE_ENABLED);",
      "  && new URLSearchParams(window.location.search).get('m6-local') === '1';"],
     ["if (M4_REFERENCE_DEV_ENABLED && !R6_PRODUCTION_RELEASE_ENABLED) {\n  window.__M4_REFERENCE_QA__",
      "if (M4_REFERENCE_DEV_ENABLED) {\n  window.__M4_REFERENCE_QA__"]
   ]) {
     assert(s.includes(now),'Missing audited R6 replacement');
     s=s.replace(now,was);
   }
   const runtime=/    \/\/ R6_RELEASE_RUNTIME_M4_BEGIN:[^\n]*\n[\s\S]*?    \/\/ R6_RELEASE_RUNTIME_M4_END\n/;
   assert.match(s,runtime);s=s.replace(runtime,'');
   return s;
 };
 // R10 intentionally changes ONLY five-button navigation visibility and the
 // documented docked notice CSS. Strip these exact public UI changes before
 // retaining the original M7 strict byte-for-byte protection elsewhere.
 const stripR10=input=>{
   let s=input;
   const start='\n/* R10: all five navigation actions';
   const end='/* R10_NAV_NOTICE_CSS_END */\n';
   assert.equal(s.split(start).length,2,'R10 style start must be unique');
   assert.equal(s.split(end).length,2,'R10 style end must be unique');
   const from=s.indexOf(start),to=s.indexOf(end,from);
   assert(from>=0&&to>from,'R10 documented CSS range must exist');
   s=s.slice(0,from)+s.slice(to+end.length);
   const changed='<button id="listBtn" class="nav-btn" type="button">';
   assert.equal(s.split(changed).length,2,'R10 list visibility change must be unique');
   return s.replace(changed,'<button id="listBtn" class="nav-btn mobile-only" type="button">');
 };
 // R11 fixes the reported legacy localStorage bug without altering
 // original learning content, authentication, annotation or other HTML.
 const stripR11=input=>{
   let s=input;
   for(const [current,previous] of [
     [
       "// R11: never restore an old collapsed state on first load. This previously\n"+
       "// made all five topic navigation actions disappear behind a separate notice.\n"+
       "let bottomNavCollapsed = false;",
       "let bottomNavCollapsed = localStorage.getItem(BOTTOM_NAV_COLLAPSE_KEY) === '1';"
     ],
     [
       "  // Collapse remains a session-only user action; refreshing the page always\n"+
       "  // shows the five topic controls and the directly visible AGPL source offer.\n"+
       "  els.navToggleBtn.addEventListener('click', () => setBottomNavCollapsed(!bottomNavCollapsed, { persist: false }));\n"+
       "  setBottomNavCollapsed(false, { persist: false });",
       "  els.navToggleBtn.addEventListener('click', () => setBottomNavCollapsed(!bottomNavCollapsed));\n"+
       "  setBottomNavCollapsed(bottomNavCollapsed, { persist: false });"
     ],
     [
       "\n  // Every selected topic must expose its navigation actions. Do not inherit\n"+
       "  // a previously hidden bar when moving from another topic or search result.\n"+
       "  setBottomNavCollapsed(false, { persist: false });",
       ""
     ]
   ]){
     assert.equal(s.split(current).length,2,'Expected exactly one R11 navigation restoration');
     s=s.replace(current,previous);
   }
   return s;
 };
 // R12 changes only the setting-source disclosure and the session-only
 // closing of the docked source panel when its entire navigation is hidden.
 // The R12 CSS is already removed by stripR10's exact annotated CSS region.
 const stripR12=input=>{
   let s=input;
   const removeExact=(start,end)=>{
     assert.equal(s.split(start).length,2,'Expected unique R12 start: '+start);
     assert.equal(s.split(end).length,2,'Expected unique R12 end: '+end);
     const i=s.indexOf(start),j=s.indexOf(end,i+start.length);
     assert(j>i,'R12 markers out of order');
     s=s.slice(0,i)+s.slice(j+end.length);
   };
   removeExact('\n      <!-- R12_SETTINGS_SOURCE_START',
     '      <!-- R12_SETTINGS_SOURCE_END -->\n');
   removeExact('  /* R12_NAV_NOTICE_COLLAPSE_START */\n',
     '  /* R12_NAV_NOTICE_COLLAPSE_END */\n');
   return s;
 };
 // R13 adds only an independent topic-management scroll toolbar. Remove
 // exactly those marked UI/handler additions, then keep the original strict
 // byte-equivalence test for every unrelated learning, PDF and auth field.
 const stripR13=input=>{
   let s=input;
   const removeRange=(start,end)=>{
     assert.equal(s.split(start).length,2,'R13 start marker must be unique: '+start);
     assert.equal(s.split(end).length,2,'R13 end marker must be unique: '+end);
     const i=s.indexOf(start),j=s.indexOf(end,i+start.length);
     assert(j>i,'R13 markers out of order');
     s=s.slice(0,i)+s.slice(j+end.length);
   };
   const removeOnce=text=>{
     assert.equal(s.split(text).length,2,'R13 replacement must be unique: '+text);
     s=s.replace(text,'');
   };
   removeOnce('  /* R13_MANAGE_CARD_SCROLL_PADDING */\n  scroll-padding-top: 56px;\n');
   removeRange('/* R13_MANAGE_SCROLL_CSS_START */\n',
     '/* R13_MANAGE_SCROLL_CSS_END */\n');
   removeRange('\n      <!-- R13_MANAGE_SCROLL_HTML_START -->\n',
     '      <!-- R13_MANAGE_SCROLL_HTML_END -->\n');
   removeOnce("/* R13_MANAGE_SCROLL_IDS */'manageJumpTopBtn','manageJumpBottomBtn','manageQuickToggleBtn','manageQuickArrows','manageScrollBody',");
   removeRange('  /* R13_MANAGE_SCROLL_EVENTS_START */\n',
     '  /* R13_MANAGE_SCROLL_EVENTS_END */\n');
   removeRange('\n/* R13_MANAGE_SCROLL_FUNCTION_START */\n',
     '/* R13_MANAGE_SCROLL_FUNCTION_END */\n');
   removeOnce("    /* R13_MANAGE_SCROLL_INIT */ setManageQuickArrowsVisible(true); jumpManageToEdge('top');\n");
   return s;
 };
 // R14 only changes the topic-management card from one scrolling layer to
 // a fixed header/scroll body/fixed bottom toolbar. Restore those three exact
 // layout deltas before the existing M7/R13 byte-preservation comparison.
 const stripR14=input=>{
   let s=input;
   const layout=[
     '  /* R14_MANAGE_LAYOUT_START */',
     '  height: min(90dvh, 920px);',
     '  display: flex;',
     '  flex-direction: column;',
     '  overflow: hidden;',
     '  /* R14_MANAGE_LAYOUT_END */'
   ].join('\n')+'\n';
   assert.equal(s.split(layout).length,2,'R14 layout change must be unique');
   s=s.replace(layout,'  overflow-y: auto;\n');
   const removeExact=(start,end)=>{
     assert.equal(s.split(start).length,2,'R14 start marker must be unique: '+start);
     assert.equal(s.split(end).length,2,'R14 end marker must be unique: '+end);
     const from=s.indexOf(start),to=s.indexOf(end,from+start.length);
     assert(to>from,'R14 structural markers out of order');
     s=s.slice(0,from)+s.slice(to+end.length);
   };
   removeExact('      <!-- R14_MANAGE_BODY_OPEN_START -->\n',
     '      <!-- R14_MANAGE_BODY_OPEN_END -->\n');
   removeExact('      <!-- R14_MANAGE_BODY_CLOSE_START -->\n',
     '      <!-- R14_MANAGE_BODY_CLOSE_END -->\n');
   return s;
 };
 const restoredHtml=maskR2(stripR6(stripR10(stripR11(stripR12(stripR13(stripR14(removed)))))));
 const referenceHtml=maskR2(old);
 if(restoredHtml!==referenceHtml){
   let i=0;while(i<Math.min(restoredHtml.length,referenceHtml.length)&&restoredHtml[i]===referenceHtml[i])i++;
   console.error('R11_STRICT_DIFF_POSITION',i,JSON.stringify(restoredHtml.slice(Math.max(0,i-100),i+140)),JSON.stringify(referenceHtml.slice(Math.max(0,i-100),i+140)));
 }
 assert.equal(restoredHtml,referenceHtml,
   'R6/M7/R2/R10/R11 must preserve all unrelated HTML bytes');
 assert.match(now,/const ANNOTATION_SCHEMA_VERSION = 3;/);
 assert.match(now,/coordinateSpace: 'normalized-0-1'/);
 assert.match(m5,/fetchMediaContent\(getApiUrl\(\), item\.attachmentId/);
});
test('M7 remains private: no tracked wasm binaries, source paths and release controls retained',()=>{
 const tracked=execFileSync('git',['-C',root,'ls-files'],{encoding:'utf8'}).split(/\r?\n/);
 assert(!tracked.some(p=>(p.endsWith('.wasm')&&p!=='study-note/vendor/mupdf/1.28.1/mupdf-wasm.wasm')||p.includes('.m2-private/')));
 const gate=fs.readFileSync(path.join(migration,'m2','m2-release-gate.cjs'),'utf8');
 assert.match(gate,/AGPL|LICENSE|release|publish/i);
 assert.match(html,/get\('m6-local'\) === '1'/);
 assert.match(m6,/isM6LocalOptIn\(window\.location\.href\)/);
});
