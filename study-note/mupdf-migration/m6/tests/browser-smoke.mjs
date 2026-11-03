// M5 real study-note browser E2E; synthetic attachments only, zero external fetches.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../m3/node_modules/playwright/index.mjs';
import {PDFDocument,StandardFonts,rgb} from '../../m3/node_modules/pdf-lib/dist/pdf-lib.esm.js';
import {buildSamplePdf} from '../../m3/tests/fixtures.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),m6=path.dirname(here);
const migration=path.dirname(m6),m5=path.join(migration,'m5'),study=path.resolve(migration,'..'),root=path.resolve(study,'..');
const m2stage=path.join(root,'.m2-private','staged','mupdf','1.28.1');
const pdfjs=path.join(migration,'m3','node_modules','pdfjs-dist','legacy','build');
const first=await buildSamplePdf();
async function secondFixture(){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
 const page=doc.addPage([420,580]);
 page.drawRectangle({x:54,y:125,width:240,height:240,color:rgb(.2,.6,.9)});
 page.drawText('M5 attachment B',{x:80,y:485,size:24,font});
 return Uint8Array.from(await doc.save({useObjectStreams:false}));
}
const second=await secondFixture();
const dataById=new Map([['M5-QA-A',first],['M5-QA-B',second]]);
const staticFiles=new Map([
 ['/study-note/study-note.html',path.join(study,'study-note.html')],
 ...['image-upload-optimizer.js','study-planner.js','tts/natural-tts.js','manifest.webmanifest']
  .map(name=>['/study-note/'+name,path.join(study,name)]),
 ...['m3-common.mjs','m3-engine.mjs','m3-mupdf.mjs','m3-pdfjs.mjs','m3-worker-client.mjs','m3-worker.mjs']
  .map(name=>['/study-note/mupdf-migration/m3/'+name,path.join(migration,'m3',name)]),
 ['/study-note/mupdf-migration/m4/m4-reference-adapter.mjs',path.join(migration,'m4','m4-reference-adapter.mjs')],
 ...['m6-interaction-policy.mjs','m6-runtime.js']
  .map(name=>['/study-note/mupdf-migration/m6/'+name,path.join(m6,name)]),
 ...['m5-attachment-adapter.mjs','m5-attachment-ui.js']
  .map(name=>['/study-note/mupdf-migration/m5/'+name,path.join(m5,name)]),
 ...['mupdf.js','mupdf-wasm.js','mupdf-wasm.wasm']
  .map(name=>['/__m4_private__/mupdf/'+name,path.join(m2stage,name)]),
 ...['pdf.mjs','pdf.worker.mjs']
  .map(name=>['/__m4_private__/pdfjs/'+name,path.join(pdfjs,name)]),
]);
const types={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
 '.html':'text/html; charset=utf-8','.wasm':'application/wasm',
 '.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const endpoint=req.url?.split('?')[0];
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 if(endpoint==='/favicon.ico'){res.writeHead(204);return res.end();}
 const file=staticFiles.get(endpoint);
 if(!file||!fs.existsSync(file)){res.writeHead(404);return res.end('404');}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 fs.createReadStream(file).pipe(res);
});
let browser;
let externalBlocked=0,syntheticReads=0;
let runtimeErrors=[],consoleErrors=[];
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 const chrome=process.env.M6_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 if(!fs.existsSync(chrome))throw Error('Authorized local Windows Chrome is unavailable');
 browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-first-run','--no-default-browser-check']});
 const routeAssets=route=>{
  const uri=route.request().url();
  if(uri.startsWith(url+'/'))return route.continue();
  let parsed;
  try{parsed=new URL(uri)}catch(_){externalBlocked++;return route.abort('blockedbyclient')}
  const id=parsed.searchParams.get('attachmentId');
  if(parsed.searchParams.get('action')==='mediaContent' && dataById.has(id)){
    syntheticReads++;
    const bytes=dataById.get(id);
    return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*',
      'Content-Type':'application/json','Cache-Control':'no-store'},
      body:JSON.stringify({ok:true,attachmentId:id,mime:'application/pdf',
        base64:Buffer.from(bytes).toString('base64')})});
  }
  externalBlocked++;
  return route.abort('blockedbyclient');
 };
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1365,height:960},
  deviceScaleFactor:2});
 await context.route('**/*',routeAssets);
 const inactive=await context.newPage();
 await inactive.goto(url+'/study-note/study-note.html?m4-local=1&m5-local=1&m6-local=0',{waitUntil:'domcontentloaded'});
 const noOptIn=await inactive.evaluate(()=>!window.__M6_QA__);
 if(!noOptIn)throw Error('M6 opt-out gate failed');
 await inactive.close();
 const page=await context.newPage();
 page.on('pageerror',e=>runtimeErrors.push(String(e.message).slice(0,200)));
 page.on('console',e=>{
  if(e.type()==='error' && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(e.text()))
   consoleErrors.push(e.text().slice(0,220));
 });
 await page.goto(url+'/study-note/study-note.html?m4-local=1&m5-local=1&m6-local=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof window.__M5_ATTACHMENT_QA__==='object' && typeof window.__M6_QA__==='object',null,{timeout:16000});
 const items=[
  {attachmentId:'M5-QA-A',topicId:'M5-QA-T',type:'P',sequence:1,fileName:'Synthetic-A.pdf'},
  {attachmentId:'M5-QA-B',topicId:'M5-QA-T',type:'P',sequence:2,fileName:'Synthetic-B.pdf'},
 ];
 await page.evaluate(items=>window.__M5_ATTACHMENT_QA__.openFixture(items),items);
 const ready=(item,pageNo)=>page.waitForFunction(({item,pageNo})=>{
  const v=window.__M5_ATTACHMENT_QA__.getState();
  return v.ready && v.attachmentId===item && v.page===pageNo && v.width>250;
 },{item,pageNo},{timeout:18000});
 await ready('M5-QA-A',1);
 const firstState=await page.evaluate(()=>window.__M5_ATTACHMENT_QA__.getState());
 if(firstState.engine!=='mupdf-worker'||firstState.count!==2
   ||firstState.annotationKey!=='attachment-pdf:M5-QA-A:1')
  throw Error('First attachment render failed '+JSON.stringify(firstState));
 const seeded=await page.evaluate(()=>window.__M5_ATTACHMENT_QA__.seedInk());
 if(seeded!==1)throw Error('Synthetic in-memory ink was not drawn');
 if(await page.locator('#pdfPageNextBtn').isVisible()) await page.click('#pdfPageNextBtn');
 else await page.click('#attachmentPdfCompactNextBtn');
 await ready('M5-QA-A',2);
 const pageTwo=await page.evaluate(()=>{
  const v=window.__M5_ATTACHMENT_QA__.getState();
  const canvas=document.querySelector('#pdfViewerFrameWrap .attachment-pdf-canvas');
  const overlay=document.querySelector('#pdfViewerFrameWrap .annotation-canvas');
  const rect=canvas.getBoundingClientRect(),mx=rect.left+rect.width*.34,my=rect.top+rect.height*.71;
  const point=window.StudyNoteAnnotation.clientToNormalized(canvas,mx,my);
  const back=window.StudyNoteAnnotation.normalizedToClient(canvas,point);
  return {...v,overlaySchema:overlay?.dataset.annotationSchemaVersion,
   overlayKey:overlay?.dataset.annotationKey,
   aligned:Math.abs(mx-back.x)<1e-4&&Math.abs(my-back.y)<1e-4,
   bounds:[canvas.offsetWidth,canvas.offsetHeight]};
 });
 if(!pageTwo.aligned||pageTwo.overlaySchema!=='3'
  ||pageTwo.overlayKey!=='attachment-pdf:M5-QA-A:2')
  throw Error('Existing per-page annotation alignment failed '+JSON.stringify(pageTwo));
 if(await page.locator('#pdfPagePrevBtn').isVisible()) await page.click('#pdfPagePrevBtn');
 else await page.click('#attachmentPdfCompactPrevBtn');
 await ready('M5-QA-A',1);
 const backOne=await page.evaluate(()=>window.__M5_ATTACHMENT_QA__.getState());
 if(backOne.annotationKey!=='attachment-pdf:M5-QA-A:1'||backOne.inkObjects!==1)
  throw Error('Annotation key changed after page navigation');
 // Synthetic stylus/palm PointerEvents on the existing annotation surface.
 // Disable persistence ONLY inside this ephemeral browser context.
 const stylus=await page.evaluate(()=>{
  window.scheduleAnnotationPersist=()=>{};
  setAnnotationTool('pen');
  const canvas=document.querySelector('#pdfViewerFrameWrap .annotation-canvas');
  const b=canvas.getBoundingClientRect();
  const x=b.left+b.width*.36,y=b.top+b.height*.17;
  const getInk=()=>getAnnotationDocument(window.__M5_ATTACHMENT_QA__.getState().annotationKey).objects;
  const start=getInk().length;
  const dispatch=(type,id,pointerType,buttons,pressure,width=1,height=1,dx=0,dy=0)=>{
   const e=new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType,
      buttons,pressure,width,height,clientX:x+dx,clientY:y+dy,isPrimary:pointerType==='pen'});
   canvas.dispatchEvent(e);
  };
  dispatch('pointerdown',700,'pen',0,0);
  const afterHover=getInk().length;
  dispatch('pointerdown',701,'pen',1,.35);
  dispatch('pointerdown',702,'touch',1,.5,58,32);
  const afterPalm=getInk().length;
  dispatch('pointermove',701,'pen',1,.78,1,1,75,105);
  dispatch('pointerup',701,'pen',0,.5,1,1,75,105);
  dispatch('pointerup',702,'touch',0,0,58,32);
  const objects=getInk(),last=objects.at(-1);
  return {start,afterHover,afterPalm,afterStroke:objects.length,
    lastPointer:last?.pointerType,lastTool:last?.tool,
    pressureFirst:last?.points?.[0]?.p,pressureLast:last?.points?.at(-1)?.p,
    pointCount:last?.points?.length,legacySchema:ANNOTATION_SCHEMA_VERSION};
 });
 if(stylus.afterHover!==stylus.start || stylus.afterPalm!==stylus.start+1
   ||stylus.afterStroke!==stylus.start+1 || stylus.lastPointer!=='pen'
   ||stylus.pointCount<2 ||stylus.legacySchema!==3)
  throw Error('Synthetic pen/palm arbitration failed '+JSON.stringify(stylus));
 await page.evaluate(()=>setAnnotationTool('pan'));
 await page.evaluate(()=>window.__M5_ATTACHMENT_QA__.zoom(3));
 await page.waitForFunction(()=>window.__M5_ATTACHMENT_QA__.getState().tileCount===1,
  null,{timeout:16000});
 const zoom=await page.evaluate(()=>{
  const v=window.__M5_ATTACHMENT_QA__.getState();
  const s=document.querySelector('#pdfViewerFrameWrap .attachment-pdf-pan-scroller');
  const t=document.querySelector('#pdfViewerFrameWrap .m5-attachment-detail-tile');
  return {...v,scrollBefore:[s.scrollLeft,s.scrollTop],
    tileZ:getComputedStyle(t).zIndex,
    inkZ:getComputedStyle(document.querySelector('#pdfViewerFrameWrap .annotation-canvas')).zIndex};
 });
 if(zoom.tileCount!==1||zoom.tileZ!=='2'||zoom.inkZ!=='3'||zoom.tileBytes>32*1024*1024)
  throw Error('High-zoom budget or overlay z-order invalid '+JSON.stringify(zoom));
 // M6 focal zoom: keep the PDF point under the fingers in view after scaling.
 const focus=await page.evaluate(async()=>{
  const s=document.querySelector('#pdfViewerFrameWrap .attachment-pdf-pan-scroller');
  const media=document.querySelector('#pdfViewerFrameWrap .attachment-pdf-canvas');
  const srect=s.getBoundingClientRect();
  const x=srect.left+srect.width*.51,y=srect.top+srect.height*.54;
  const before=media.getBoundingClientRect();
  const anchor=window.__M6_PERF__.normalizedPagePosition({clientX:x,clientY:y},before);
  window.__M6_QA__.zoomAt(s,x,y,()=>window.__M5_ATTACHMENT_QA__.zoom(3.6));
  await new Promise(r=>setTimeout(r,310));
  const after=media.getBoundingClientRect();
  return {errorPx:Math.hypot(after.left+anchor.x*after.width-x,
    after.top+anchor.y*after.height-y),factor:window.__M5_ATTACHMENT_QA__.getState().zoom};
 });
 if(focus.errorPx>28)throw Error('Finger focal point shifted too far '+JSON.stringify(focus));
 const coalesced=await page.evaluate(async()=>{
  const s=document.querySelector('#pdfViewerFrameWrap .attachment-pdf-pan-scroller');
  const before=window.__M6_QA__.getState().attachmentTile;
  for(let i=0;i<65;i++)s.dispatchEvent(new Event('scroll'));
  await new Promise(r=>setTimeout(r,480));
  const after=window.__M6_QA__.getState().attachmentTile;
  return {scheduled:after.schedules-before.schedules,
   collapsed:after.coalesced-before.coalesced,
   executed:after.executions-before.executions};
 });
 if(coalesced.scheduled<60||coalesced.collapsed<50||coalesced.executed>2)
  throw Error('Scroll burst coalescing ineffective '+JSON.stringify(coalesced));
 const zoomBudgets=[];
 for(const factor of [4,8,10]){
  const before=await page.evaluate(()=>window.__M6_PERF__.renderHistory('attachment').length);
  await page.evaluate(z=>window.__M5_ATTACHMENT_QA__.zoom(z),factor);
  await page.waitForFunction(({factor,before})=>{
   const history=window.__M6_PERF__.renderHistory('attachment');
   return window.__M5_ATTACHMENT_QA__.getState().zoom===factor && history.length>before;
  },{factor,before},{timeout:18000});
  await page.waitForFunction(factor=>{
   const stage=document.querySelector('#pdfViewerFrameWrap .attachment-pdf-stage');
   const tile=stage?.querySelector('.m5-attachment-detail-tile');
   return tile && stage?.dataset?.m6TileZoom===String(factor);
  },factor,{timeout:18000});
  const entry=await page.evaluate(factor=>{
   const p=window.__M6_QA__.currentProfile(factor);
   const h=window.__M6_PERF__.renderHistory('attachment');
   const base=h.filter(r=>!r.region && r.zoom===factor).at(-1);
   const detail=h.filter(r=>r.region && r.zoom===factor).at(-1);
   const tile=document.querySelector('#pdfViewerFrameWrap .m5-attachment-detail-tile');
   const canvas=document.querySelector('#pdfViewerFrameWrap .attachment-pdf-canvas');
   return {zoom:factor,baseBudget:p.baseBudget.maxBytes,tileBudget:p.tileBudget.maxBytes,
     baseBytes:base?.bytes||0,tileBytes:detail?.bytes||0,
     previewDensity:canvas.width/canvas.getBoundingClientRect().width,
     detailDensity:tile.width/parseFloat(tile.style.width),
     pixels:[detail?.pixelWidth,detail?.pixelHeight],
     baseTimeMs:base?.elapsedMs,tileTimeMs:detail?.elapsedMs};
  },factor);
  if(!entry.tileBytes||entry.tileBytes>entry.tileBudget||entry.baseBytes>entry.baseBudget||
     entry.detailDensity<=entry.previewDensity)
   throw Error('M6 4x/8x/10x detail pixel quality/budget failed '+JSON.stringify(entry));
  zoomBudgets.push(entry);
 }
 await page.evaluate(()=>window.__M5_ATTACHMENT_QA__.zoom(3));
 await page.waitForTimeout(300);
 const rect=await page.locator('#pdfViewerFrameWrap .attachment-pdf-pan-scroller').boundingBox();
 await page.mouse.move(rect.x+rect.width*.58,rect.y+rect.height*.56);
 await page.mouse.down();
 await page.mouse.move(rect.x+rect.width*.58-145,rect.y+rect.height*.56-90,{steps:6});
 await page.mouse.up();
 const afterMouse=await page.evaluate(()=>{
  const s=document.querySelector('#pdfViewerFrameWrap .attachment-pdf-pan-scroller');
  return [s.scrollLeft,s.scrollTop];
 });
 if(Math.abs(afterMouse[0]-zoom.scrollBefore[0])<20
  && Math.abs(afterMouse[1]-zoom.scrollBefore[1])<20)
  throw Error('Mouse pan did not move the document');
 // Rapid page changes may race; last requested page must win and retain the right overlay key.
 await page.evaluate(async()=>{
  const a=window.__M5_ATTACHMENT_QA__;
  await Promise.all([a.page(2),a.page(1),a.page(2)]);
 });
 await ready('M5-QA-A',2);
 const afterRace=await page.evaluate(()=>window.__M5_ATTACHMENT_QA__.getState());
 if(afterRace.annotationKey!=='attachment-pdf:M5-QA-A:2'
   ||afterRace.tileCount!==0)throw Error('Page navigation race or stale tile '+JSON.stringify(afterRace));
 await page.evaluate(()=>window.__M5_ATTACHMENT_QA__.item(1));
 await ready('M5-QA-B',1);
 const secondState=await page.evaluate(()=>window.__M5_ATTACHMENT_QA__.getState());
 if(secondState.count!==1||secondState.annotationKey!=='attachment-pdf:M5-QA-B:1')
  throw Error('Attachment switch failed '+JSON.stringify(secondState));
 // Restore a fresh session with PDF.js 6.5.x to prove safe fallback.
 await page.evaluate(async()=>{
  await window.__M5_ATTACHMENT_QA__.usePdfjsFallbackForNextFixture();
  await window.__M5_ATTACHMENT_QA__.item(0);
 });
 await ready('M5-QA-A',1);
 const fallback=await page.evaluate(()=>window.__M5_ATTACHMENT_QA__.getState());
 if(fallback.engine!=='pdfjs'||!/PDF\.js/.test(fallback.status))
  throw Error('PDF.js fallback was not activated '+JSON.stringify(fallback));
 await page.evaluate(()=>window.__M5_ATTACHMENT_QA__.close());
 const closed=await page.evaluate(()=>window.__M5_ATTACHMENT_QA__.getState());
 if(closed.ready||closed.engine!==null||closed.visible)
  throw Error('Close did not release renderer '+JSON.stringify(closed));
 // Also exercise the common M6 budget/focal policy on the REAL M4 reference viewer.
 const m4Reference=await page.evaluate(async bytes=>{
  const payload=Uint8Array.from(bytes);
  return window.__M4_REFERENCE_QA__.openFixture({
   sourceType:'교재',pageToken:'M4-QA-M6',bytes:payload});
 },Array.from(first));
 if(!m4Reference.vectorReady||m4Reference.engine!=='mupdf-worker'
   ||m4Reference.annotationSchema!==3)
  throw Error('M6 M4 reference viewer integration failed '+JSON.stringify(m4Reference));
 await page.evaluate(()=>window.__M4_REFERENCE_QA__.zoom(8));
 await page.waitForFunction(()=>{
  const history=window.__M6_PERF__.renderHistory('reference');
  const stage=document.querySelector('.reference-pdf-image-stage');
  return history.length>=3 && window.__M4_REFERENCE_QA__.getState().zoom===8
    && !!stage?.querySelector('.m4-reference-detail-tile') && stage?.dataset?.m6TileZoom==='8';
 },null,{timeout:16000});
 const refHighZoom=await page.evaluate(()=>{
  const profile=window.__M6_QA__.currentProfile(8);
  const state=window.__M4_REFERENCE_QA__.getState();
  const history=window.__M6_PERF__.renderHistory('reference');
  return {state,tier:profile.tier,
   maxBaseBytes:profile.baseBudget.maxBytes,
   maxTileBytes:profile.tileBudget.maxBytes,
   history:history.slice(-3)};
 });
 if(refHighZoom.history.some(h=>h.bytes>refHighZoom.maxTileBytes))
  throw Error('M6 M4 high zoom allocation exceeded budget '+JSON.stringify(refHighZoom));
 await page.evaluate(()=>window.__M4_REFERENCE_QA__.close());
 // Emulate tablet two-finger Touch Events on actual study-note pan scroller.
 const mobile=await browser.newContext({serviceWorkers:'block',viewport:{width:820,height:1100},
  deviceScaleFactor:2,hasTouch:true,isMobile:true});
 await mobile.route('**/*',routeAssets);
 const touchPage=await mobile.newPage();
 await touchPage.goto(url+'/study-note/study-note.html?m4-local=1&m5-local=1&m6-local=1',{waitUntil:'domcontentloaded'});
 await touchPage.waitForFunction(()=>typeof window.__M5_ATTACHMENT_QA__==='object' && typeof window.__M6_QA__==='object',null,{timeout:16000});
 await touchPage.evaluate(items=>window.__M5_ATTACHMENT_QA__.openFixture(items),items);
 await touchPage.waitForFunction(()=>window.__M5_ATTACHMENT_QA__.getState().ready,null,{timeout:16000});
 const pinch=await touchPage.evaluate(()=>{
  const s=document.querySelector('#pdfViewerFrameWrap .attachment-pdf-pan-scroller');
  const b=s.getBoundingClientRect();
  const touch=(i,x,y)=>new Touch({identifier:i,target:s,clientX:b.left+x,
    clientY:b.top+y,pageX:b.left+x,pageY:b.top+y,screenX:x,screenY:y,radiusX:2,radiusY:2});
  const a=touch(1,80,165),b1=touch(2,180,165),b2=touch(2,260,165);
  const ev=(type,touches,changed)=>s.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,
    touches,targetTouches:touches,changedTouches:changed}));
  ev('touchstart',[a,b1],[a,b1]);ev('touchmove',[a,b2],[a,b2]);
  const z=window.__M5_ATTACHMENT_QA__.getState().zoom;
  ev('touchend',[],[a,b2]);return z;
 });
 if(!(pinch>1.1))throw Error('Emulated tablet pinch was ignored '+pinch);
 await touchPage.waitForTimeout(330);
 const touchState=await touchPage.evaluate(()=>window.__M5_ATTACHMENT_QA__.getState());
 if(!touchState.ready)throw Error('Renderer lost page after touch pinch');
 const tabletProfile=await touchPage.evaluate(()=>{
  const p=window.__M6_QA__.currentProfile(2);
  const h=window.__M6_PERF__.renderHistory('attachment');
  return {tier:p.tier,maxBytes:p.baseBudget.maxBytes,frames:h.slice()};
 });
 if(tabletProfile.tier!=='constrained'||!tabletProfile.frames.length||
    tabletProfile.frames.some(e=>e.bytes>tabletProfile.maxBytes))
   throw Error('Tablet budget exceeded '+JSON.stringify(tabletProfile));
 await touchPage.setViewportSize({width:690,height:980});
 await touchPage.waitForTimeout(300);
 const rotatedTablet=await touchPage.evaluate(()=>{
  const v=window.__M6_QA__.getState(),a=window.__M5_ATTACHMENT_QA__.getState();
  return {reflows:v.viewportRelayouts,zoom:a.zoom,ready:a.ready,inkObjects:a.inkObjects};
 });
 if(!rotatedTablet.ready||rotatedTablet.reflows<1)
   throw Error('Tablet viewport/orientation reflow missing '+JSON.stringify(rotatedTablet));
 await mobile.close();

 // Chromium iPhone 16 Pro-size Safari UA emulation (NOT real iOS Safari).
 const phone=await browser.newContext({
  serviceWorkers:'block',viewport:{width:402,height:874},deviceScaleFactor:3,
  hasTouch:true,isMobile:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
 });
 await phone.route('**/*',routeAssets);
 const phonePage=await phone.newPage();
 await phonePage.goto(url+'/study-note/study-note.html?m4-local=1&m5-local=1&m6-local=1',{waitUntil:'domcontentloaded'});
 await phonePage.waitForFunction(()=>window.__M6_QA__ && window.__M5_ATTACHMENT_QA__,null,{timeout:16000});
 await phonePage.evaluate(items=>window.__M5_ATTACHMENT_QA__.openFixture(items),items);
 await phonePage.waitForFunction(()=>window.__M5_ATTACHMENT_QA__.getState().ready,null,{timeout:16000});
 const phoneProfile=await phonePage.evaluate(()=>{
  const p=window.__M6_QA__.currentProfile(1);
  const s=window.__M5_ATTACHMENT_QA__.getState();
  const h=window.__M6_PERF__.renderHistory('attachment');
  return {tier:p.tier,maxBaseBytes:p.baseBudget.maxBytes,dpr:p.dpr,
   canvas:[s.width,s.height],engine:s.engine,inkSchema:s.annotationSchema,
   maxActualBytes:Math.max(...h.map(x=>x.bytes))};
 });
 if(phoneProfile.tier!=='constrained'||phoneProfile.dpr!==2
   ||phoneProfile.maxActualBytes>phoneProfile.maxBaseBytes)
   throw Error('iPhone-sized Chromium budget failed '+JSON.stringify(phoneProfile));
 await phone.close();
 if(syntheticReads<4)throw Error('Synthetic network interception did not exercise unchanged mediaContent GET');
 const result={status:'PASS',chrome:browser.version(),
  localGate:noOptIn,network:{syntheticGetCount:syntheticReads,otherExternalBlocked:externalBlocked,
    operatingBackendContacted:false,operatingMutationCount:0},
  first:{engine:firstState.engine,pixels:[firstState.width,firstState.height],pages:firstState.count},
  syntheticInk:{seeded:seeded,restoredOnReturn:backOne.inkObjects,inMemoryOnly:true,stylusAndPalmSimulation:stylus},
  secondPage:{page:pageTwo.page,engine:pageTwo.engine,pixels:[pageTwo.width,pageTwo.height],
    annotationKey:pageTwo.overlayKey,aligned:pageTwo.aligned},
  zoom:{factor:zoom.zoom,tileCount:zoom.tileCount,tileBytes:zoom.tileBytes,zIndex:[zoom.tileZ,zoom.inkZ]},
  focalZoom:focus,scrollCoalescing:coalesced,highZoomMemory:zoomBudgets,
  m4Reference:{engine:m4Reference.engine,cropSchema:m4Reference.annotationSchema,
    highZoom:refHighZoom},
  mousePan:{before:zoom.scrollBefore,after:afterMouse},
  rapidPageSwitch:{page:afterRace.page,annotationKey:afterRace.annotationKey,staleTileCount:afterRace.tileCount},
  secondAttachment:{id:secondState.attachmentId,engine:secondState.engine,pages:secondState.count},
  pdfjsFallback:{engine:fallback.engine,status:fallback.status},
  closed:{ready:closed.ready,engine:closed.engine,visible:closed.visible},
  touchEmulation:{zoom:pinch,stillReady:touchState.ready,realHardware:false,
    tabletProfile,rotatedTablet,phoneProfile,phoneEmulationNotSafari:true},
  runtimeErrors,consoleErrors,syntheticOnly:true};
 console.log(JSON.stringify(result,null,2));
 if(runtimeErrors.length||consoleErrors.length)
  throw Error('Unexpected Chrome errors '+JSON.stringify({runtimeErrors,consoleErrors}));
}catch(e){console.error('M6_BROWSER_SMOKE_FAILED',String(e.stack||e));process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
