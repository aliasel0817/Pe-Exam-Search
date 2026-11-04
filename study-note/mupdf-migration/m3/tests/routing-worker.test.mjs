import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnifiedRenderer} from '../m3-engine.mjs';
import {createMuPDFWorkerEngine} from '../m3-worker-client.mjs';
import {RendererError,normalizedToPixel,pixelToNormalized} from '../m3-common.mjs';
function fakeSession(name,{throwRender=false}={}){
 return {countPages:2,engine:name,closed:false,
   getPageBounds(n){return {pageNumber:n,pageWidth:600,pageHeight:800};},
   async renderPage(n){if(throwRender)throw new RendererError('FAULT','test failure');return {engine:name,pageNumber:n,width:1,height:1,pixels:new Uint8ClampedArray(4)};},
   async close(){this.closed=true;}
 };
}
test('Unified dispatcher switches from MuPDF to PDF.js on render failure',async()=>{
 const mupdf={id:'mupdf',async openDocument(){return fakeSession('mupdf',{throwRender:true});}};
 const pdfjs={id:'pdfjs',async openDocument(){return fakeSession('pdfjs');}};
 const doc=await createUnifiedRenderer({mupdf,pdfjs}).openDocument(Uint8Array.of(1,2,3));
 assert.equal(doc.engine,'mupdf');
 const img=await doc.renderPage(1);
 assert.equal(img.engine,'pdfjs');
 assert.equal(doc.engine,'pdfjs');
 assert.equal(doc.switchCount,1);
 assert.equal(doc.fallbackReason,'mupdf:FAULT');
 await doc.close();assert(doc.closed);
 await assert.rejects(doc.renderPage(1),e=>e.code==='DOCUMENT_CLOSED');
});
test('Unified dispatcher can disallow fallback and never auto-switch on user abort',async()=>{
 const mupdf={id:'mupdf',async openDocument(){return fakeSession('mupdf',{throwRender:true});}};
 const pdfjs={id:'pdfjs',async openDocument(){return fakeSession('pdfjs');}};
 const doc=await createUnifiedRenderer({mupdf,pdfjs,allowFallback:false}).openDocument(Uint8Array.of(1));
 await assert.rejects(doc.renderPage(1),e=>e.code==='FAULT');
 await doc.close();
});
function fakeWorkerFactory(){
 const mock={terminated:false};
 mock.postMessage=function({id,op,payload}){
  queueMicrotask(()=>{
   if(mock.terminated)return;
   if(op==='render'){
    mock.onmessage?.({data:{id,ok:true,value:{engine:'mupdf',width:1,height:1,pixels:new Uint8ClampedArray(4)}}});
   }else if(op==='open')mock.onmessage?.({data:{id,ok:true,value:{pageCount:2}}});
   else if(op==='bounds')mock.onmessage?.({data:{id,ok:true,value:{pageNumber:payload.pageNumber}}});
   else mock.onmessage?.({data:{id,ok:true,value:{closed:true}}});
  });
 };
 mock.terminate=function(){this.terminated=true;};
 return mock;
}
test('Worker supports open, render, bounds and close',async()=>{
 const e=createMuPDFWorkerEngine({moduleURL:'http://127.0.0.1/fake.mjs',workerFactory:fakeWorkerFactory});
 const doc=await e.openDocument(Uint8Array.of(1,2,3));
 assert.equal(doc.countPages,2);
 assert.equal((await doc.getPageBounds(2)).pageNumber,2);
 assert.equal((await doc.renderPage(1)).engine,'mupdf');
 await doc.close();await doc.close();
 assert.equal(doc.bytes,null);
});
test('Worker cancellation kills session and allows reopening on next page',async()=>{
 function hangingWorker(){
   const w=fakeWorkerFactory();
   const p=w.postMessage;
   w.postMessage=function(ev){if(ev.op==='render')return;return p(ev);};
   return w;
 }
 const doc=await createMuPDFWorkerEngine({moduleURL:'http://127.0.0.1/fake.mjs',workerFactory:hangingWorker}).openDocument(Uint8Array.of(1));
 const ctl=new AbortController();
 const pending=doc.renderPage(1,{signal:ctl.signal});
 await new Promise(r=>setTimeout(r,1));ctl.abort();
 await assert.rejects(pending,e=>e.code==='ABORTED');
 assert.equal(doc.countPages,0);
 assert.equal((await doc.getPageBounds(2)).pageNumber,2);
 await doc.close();
});
test('Normalized annotations use crop offsets without mutation',()=>{
 const geo={fullWidth:700,fullHeight:1200,x:200,y:350};
 const src={x:0.45,y:0.72,p:0.6};
 const a=normalizedToPixel(src,geo),b=pixelToNormalized(a,geo);
 assert(Math.abs(b.x-src.x)<1e-12 && Math.abs(b.y-src.y)<1e-12);
 assert.equal(src.p,0.6);
});
