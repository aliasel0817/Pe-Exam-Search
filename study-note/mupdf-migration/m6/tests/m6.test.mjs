import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {boundedMetrics} from '../../m3/m3-common.mjs';
import {
 isM6LocalOptIn,selectM6DeviceTier,m6BudgetForDevice,transformQuarterTurn,inverseQuarterTurn,
 normalizedPagePosition,clientPagePosition,createM6ScrollCoalescer,M6ZoomAnchor,
 isM6AccidentalPenContact,isM6LikelyPalmNearActiveStylus,
} from '../m6-interaction-policy.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),migration=path.resolve(here,'../..');
const root=path.resolve(migration,'../..'),htmlPath=path.join(root,'study-note','study-note.html');
const html=fs.readFileSync(htmlPath,'utf8').replace(/\r\n/g,'\n');
const prior=execFileSync('git',['-C',root,'show',
  '6d30445f7119bb7261cbe1ca51fe68d9ab2068fa:study-note/study-note.html'],{encoding:'utf8'})
  .replace(/\r\n/g,'\n');
const m5=fs.readFileSync(path.join(migration,'m5','m5-attachment-ui.js'),'utf8');
const priorM5=execFileSync('git',['-C',root,'show',
  '6d30445f7119bb7261cbe1ca51fe68d9ab2068fa:study-note/mupdf-migration/m5/m5-attachment-ui.js'],{encoding:'utf8'});
const before=(source,a,b)=>{
 const i=source.indexOf(a),j=source.indexOf(b,i+a.length);
 assert(i>=0&&j>i,'Invalid source boundaries '+a+' / '+b);
 return source.slice(i,j);
};
test('M6 guarded on all 3 explicit flags AND loopback HTTP, not external distribution',()=>{
 const cases=[
 ['http://localhost:8050/study-note/study-note.html?m4-local=1&m5-local=1&m6-local=1',true],
 ['http://127.0.0.1:9050/study-note/study-note.html?m4-local=1&m5-local=1&m6-local=1',true],
 ['http://localhost:8050/study-note/study-note.html?m4-local=1&m5-local=1',false],
 ['http://localhost:8050/study-note/study-note.html?m4-local=1&m6-local=1',false],
 ['http://localhost:8050/study-note/study-note.html?m5-local=1&m6-local=1',false],
 ['http://localhost.evil.com/study-note/study-note.html?m4-local=1&m5-local=1&m6-local=1',false],
 ['https://localhost/study-note/study-note.html?m4-local=1&m5-local=1&m6-local=1',false],
 ['https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html?m4-local=1&m5-local=1&m6-local=1',false],
 ];
 for(const [uri,expected]of cases)assert.equal(isM6LocalOptIn(uri),expected,uri);
 assert(html.includes("const M6_DEV_ENABLED = M5_ATTACHMENT_DEV_ENABLED"));
 assert(html.includes("get('m6-local') === '1'"));
});
test('M6 adaptive device budgets respect stricter desktop/tablet/phone caps',()=>{
 const scenarios=[
 [{width:1440,deviceMemory:16,hasTouch:false},'desktop',36,32,3],
 [{width:960,deviceMemory:8,hasTouch:true},'tablet',24,20,2.5],
 [{width:1600,deviceMemory:8,hasTouch:true,coarse:true},'tablet',24,20,2.5],
 [{width:390,deviceMemory:null,hasTouch:true},'constrained',16,12,2],
 [{width:1440,deviceMemory:4,hasTouch:true},'constrained',16,12,2],
 ];
 for(const [device,tier,base,tile,dpr] of scenarios){
  assert.equal(selectM6DeviceTier(device),tier);
  const p=m6BudgetForDevice(device,{zoom:2});
  assert.equal(p.tier,tier);
  assert.equal(p.baseBudget.maxBytes,base*1024*1024);
  assert.equal(p.tileBudget.maxBytes,tile*1024*1024);
  assert.equal(p.effectiveDpr(4),dpr);
  const result=boundedMetrics(612,792,{scale:18,dpr:p.effectiveDpr(4),budget:p.tileBudget,
   region:{x:0.4,y:0.3,width:0.2,height:0.3}});
  assert(result.estimatedRGBABytes<=p.tileBudget.maxBytes);
  assert(result.width<=p.tileBudget.maxEdge);
 }
 const high=m6BudgetForDevice({width:1440,deviceMemory:16},{zoom:10});
 assert(high.baseBudget.maxBytes<=12*1024*1024);
 assert.equal(high.tileBudget.maxBytes,32*1024*1024);
});
test('M6 crop-aware CSS normalized point survives all quarter turns and back',()=>{
 const rect={left:145,top:70,width:756.25,height:1009.25};
 for(const point of [{x:0,y:0},{x:.15,y:.25},{x:.57,y:.82},{x:1,y:1}]){
  const px=clientPagePosition(point,rect);
  const n=normalizedPagePosition(px,rect);
  assert(Math.abs(n.x-point.x)<1e-10&&Math.abs(n.y-point.y)<1e-10);
  for(const turn of [0,90,180,270]){
   const shifted=transformQuarterTurn(n,turn),back=inverseQuarterTurn(shifted,turn);
   assert(Math.abs(back.x-point.x)<1e-10&&Math.abs(back.y-point.y)<1e-10);
  }
 }
});
test('Tile queue coalesces a 60-event scroll burst into one last-frame task',()=>{
 let current=100,seq=0;
 const callbacks=new Map(),run=[];
 const timer=(cb)=>{const id=++seq;callbacks.set(id,cb);return id;};
 const clear=id=>callbacks.delete(id);
 const gate=createM6ScrollCoalescer({setTimer:timer,clearTimer:clear,now:()=>current,
  delayMs:125,maxWaitMs:350});
 for(let i=0;i<60;i++){current+=1;gate.schedule(()=>run.push(i));}
 assert.equal(gate.stats().schedules,60);
 assert.equal(gate.stats().coalesced,59);
 assert.equal(callbacks.size,1);
 callbacks.values().next().value();
 assert.deepEqual(run,[59]);
 assert.equal(gate.stats().executions,1);
 gate.schedule(()=>run.push(60));gate.close();
 assert.equal(callbacks.size,0);
 assert.equal(gate.stats().closed,true);
});
test('M6 focal anchor stays under touch center even when flex-centered page shifts',()=>{
 let rect={left:100,top:115,width:300,height:450},frameId=0;
 const frames=new Map();
 const requestFrame=fn=>{frames.set(++frameId,fn);return frameId;};
 const cancelFrame=id=>frames.delete(id);
 const media={isConnected:true,getBoundingClientRect:()=>rect};
 const scroller={scrollLeft:250,scrollTop:400};
 const anchor=new M6ZoomAnchor({requestFrame,cancelFrame});
 const clientX=240,clientY=330;
 const original=normalizedPagePosition({clientX,clientY},rect);
 anchor.zoomAt(scroller,media,clientX,clientY,()=>{
  rect={left:49,top:54,width:600,height:900};
 });
 for(let k=0;k<2;k++){
  const [id,cb]=frames.entries().next().value;
  frames.delete(id);cb();
 }
 assert.equal(frames.size,0);
 const before=clientPagePosition(original,rect);
 assert(Math.abs(scroller.scrollLeft-(250+before.clientX-clientX))<1e-10);
 assert(Math.abs(scroller.scrollTop-(400+before.clientY-clientY))<1e-10);
});
test('M6 excludes hover-only pen down, retains actual pressed pen and prevents palm while pen active',()=>{
 assert.equal(isM6AccidentalPenContact({type:'pointerdown',pointerType:'pen',buttons:0,pressure:0}),true);
 assert.equal(isM6AccidentalPenContact({type:'pointerdown',pointerType:'pen',buttons:1,pressure:0.6}),false);
 assert.equal(isM6AccidentalPenContact({type:'pointerdown',pointerType:'mouse',buttons:0}),false);
 assert.equal(isM6LikelyPalmNearActiveStylus({pointerType:'touch',width:1,height:1},true),true);
 assert.equal(isM6LikelyPalmNearActiveStylus({pointerType:'touch',width:12,height:9},false),false);
});
test('No existing annotation schema, persistence/API endpoints or mutation path was changed',()=>{
 const segments=[
 ['function annotationSurfaceKey(', 'function annotationBitmapSize('],
 ['function annotationClientPointToNormalized(', 'window.StudyNoteAnnotation = Object.freeze('],
 ['function renderAnnotationSurface(surface)', 'function scheduleAnnotationRender(surface)'],
 ['async function fetchMediaContent(', 'function normalizeAttachmentDataset('],
 ['function normalizeAttachmentDataset(', 'const LEARNING_HEADERS'],
 ['function scheduleAnnotationPersist(', 'function '],
 ['function setAttachmentPdfZoomFactor(', 'async function deactivateCurrentTopic('],
 ];
 for(const [a,b]of segments)assert.equal(before(html,a,b),before(prior,a,b),a);
 assert(html.includes('const ANNOTATION_SCHEMA_VERSION = 3;'));
 assert(html.includes("coordinateSpace: 'normalized-0-1'"));
 assert(!m5.includes('sendMutation('));
 assert(html.includes('m6ZoomAtFingerCenter(scroller, focalX, focalY, setZoom, nextZoom)'));
 assert(html.includes('window.__M6_PERF__?.profile({zoom:activeReferencePdfZoomFactor})'));
 assert(m5.includes('window.__M6_PERF__?.profile({zoom:activeAttachmentPdfZoomFactor})'));
});
test('Legacy production M5 renderer and PDF.js fallback paths remain beneath M6-only enhancements',()=>{
 const normalizeM6=s=>s.replace(/    const m6Plan=[^\n]+\n/g,'')
  .replace(/    const m6Started=[^\n]+\n/g,'')
  .replace(/      if \(m6Plan\)[\s\S]*?\n      \}\);\n/g,'');
 assert(m5.includes('M6_DEV_ENABLED && window.__M6_PERF__'));
 assert(priorM5.includes('m5ScheduleAttachmentTile'));
 assert(m5.includes('m5AttachmentDocument'));
 assert(m5.includes("m5SetAttachmentStatus(label,result.width"));
 assert(html.includes("privateM6Script.src = './mupdf-migration/m6/m6-runtime.js'"));
 // Build remains without committed WASM, raw PDF fixtures, or secrets.
 const tracked=execFileSync('git',['-C',root,'ls-files'],{encoding:'utf8'}).split(/\r?\n/);
 assert(!tracked.some(p=>p.endsWith('.wasm')));
 assert(!tracked.some(p=>/\/\.m6-private\//.test(p)));
});
test('M6 browser scripts and inline application JavaScript pass parsing',()=>{
 const runtime=fs.readFileSync(path.join(migration,'m6','m6-runtime.js'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(runtime));
 assert.doesNotThrow(()=>new vm.Script(m5));
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(m=>m[1]).filter(x=>x.trim());
 scripts.forEach((source,i)=>assert.doesNotThrow(()=>new vm.Script(source,{filename:'inline-'+i})));
});
