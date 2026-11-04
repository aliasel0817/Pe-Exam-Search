import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createM6ScrollCoalescer} from '../../m6/m6-interaction-policy.mjs';
import {MuPDFWorkerSession} from '../../m3/m3-worker-client.mjs';

const migration=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const study=path.dirname(migration);

test('M6 first event at 0ms still respects the hard max-wait deadline',()=>{
 let now=0,id=0;
 const tasks=new Map();
 const gate=createM6ScrollCoalescer({
   now:()=>now,delayMs:125,maxWaitMs:360,
   setTimer:(fn,ms)=>{const key=++id;tasks.set(key,{fn,deadline:now+ms});return key;},
   clearTimer:key=>tasks.delete(key),
 });
 gate.schedule(()=>{});
 now=100;gate.schedule(()=>{});
 now=230;gate.schedule(()=>{});
 now=300;gate.schedule(()=>{});
 assert.equal(tasks.size,1);
 assert.equal([...tasks.values()][0].deadline,360,'initial event deadline must not slide past 360ms');
 gate.cancel();
 assert.equal(tasks.size,0);
 assert.equal(gate.stats().pending,false);
});

test('concurrent bounds and render share one Worker open, with safe cleanup',async()=>{
 const calls=[];
 let terminated=0;
 const worker={
   onmessage:null,onerror:null,
   postMessage(message){
     calls.push(message);
     if(message.op==='open')return;
     queueMicrotask(()=>{
       const value=message.op==='bounds'
         ? {pageWidth:640,pageHeight:880}
         : {width:2,height:2,pixels:new Uint8Array(16)};
       worker.onmessage?.({data:{id:message.id,ok:true,value}});
     });
   },
   terminate(){terminated++;},
 };
 const doc=new MuPDFWorkerSession(new Uint8Array([37,80,68,70,45,49,46,55]),{
   workerFactory:()=>worker,moduleURL:'private-test-only',
 });
 const bounds=doc.getPageBounds(1);
 const render=doc.renderPage(1);
 assert.equal(calls.filter(c=>c.op==='open').length,1,'only one open while shared request is pending');
 const opened=calls.find(c=>c.op==='open');
 worker.onmessage({data:{id:opened.id,ok:true,value:{pageCount:2}}});
 const [b,r]=await Promise.all([bounds,render]);
 assert.equal(b.pageWidth,640);
 assert.equal(r.width,2);
 assert.deepEqual(calls.map(c=>c.op),['open','bounds','render']);
 await doc.close();
 assert.equal(terminated,1);
 assert.equal(doc.bytes,null);
});

test('new repaint invalidates stale detail tile before the next base render',()=>{
 const m4=fs.readFileSync(path.join(study,'study-note.html'),'utf8');
 const m5=fs.readFileSync(path.join(migration,'m5','m5-attachment-ui.js'),'utf8');
 const a=m4.slice(m4.indexOf('async function m4RepaintReferencePdf('),m4.indexOf('function m4ScheduleVisibleDetail()'));
 const b=m5.slice(m5.indexOf('async function m5RepaintAttachment('),m5.indexOf('function m5ScheduleAttachmentTile()'));
 for(const [name,part,pattern] of [
   ['reference',a,/m4ReferenceModule\?\.clearVisibleTile\([^;]+\);/],
   ['attachment',b,/m5AttachmentModule\?\.clearVisibleTile\([\s\S]+?\);/],
 ]){
   assert.match(part,pattern,name+' zoom should remove old raster tile');
   assert(part.indexOf('clearVisibleTile')<part.indexOf('const paintSerial'),
     name+' detail must clear before next render is scheduled');
 }
});

test('R1 changes do not alter annotation schema, persistence, signed GET or M2 release gate',()=>{
 const html=fs.readFileSync(path.join(study,'study-note.html'),'utf8');
 const gate=JSON.parse(fs.readFileSync(path.join(migration,'m2','m2-publication-gate.json'),'utf8'));
 assert.match(html,/const ANNOTATION_SCHEMA_VERSION = 3;/);
 assert.match(html,/coordinateSpace:\s*'normalized-0-1'/);
 assert.match(html,/async function fetchReferencePdfBytesFromServer\(page\)/);
 assert.match(html,/async function fetchMediaContent\(apiUrl, attachmentId/);
 assert.match(html,/function scheduleAnnotationPersist\(documentData/);
 assert.equal(gate.productionDeploymentAllowed,false);
 assert.equal(gate.publicMuPdfBinaryDistributionAllowed,false);
});
