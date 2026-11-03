// M4 end-to-end REAL study-note.html DOM browser smoke, loopback/private synthetic PDF.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../m3/node_modules/playwright/index.mjs';
import {PDFDocument,StandardFonts,degrees,rgb} from '../../m3/node_modules/pdf-lib/dist/pdf-lib.esm.js';
import {buildSamplePdf} from '../../m3/tests/fixtures.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const m4=path.dirname(here),migration=path.dirname(m4);
const study=path.resolve(migration,'..'),repo=path.resolve(study,'..');
const m2stage=path.join(repo,'.m2-private','staged','mupdf','1.28.1');
const pdfjs=path.join(migration,'m3','node_modules','pdfjs-dist','legacy','build');
const synthetic=await buildSamplePdf();
async function rotatedFixture(){
  const d=await PDFDocument.create();
  const font=await d.embedFont(StandardFonts.Helvetica);
  const p=d.addPage([500,700]);p.setCropBox(50,100,400,500);p.setRotation(degrees(90));
  p.drawText('M4 crop rotated',{x:120,y:350,size:24,font,color:rgb(0.2,0.2,0.2)});
  p.drawRectangle({x:100,y:140,width:150,height:130,color:rgb(0.2,0.5,0.9)});
  return Uint8Array.from(await d.save({useObjectStreams:false}));
}
const rotated=await rotatedFixture();
const staticFiles=new Map([
 ['/study-note/study-note.html',path.join(study,'study-note.html')],
 ...['image-upload-optimizer.js','study-planner.js','tts/natural-tts.js','manifest.webmanifest'].map(x=>['/study-note/'+x,path.join(study,x)]),
 ...['m3-common.mjs','m3-engine.mjs','m3-mupdf.mjs','m3-pdfjs.mjs','m3-worker-client.mjs','m3-worker.mjs'].map(x=>['/study-note/mupdf-migration/m3/'+x,path.join(migration,'m3',x)]),
 ['/study-note/mupdf-migration/m4/m4-reference-adapter.mjs',path.join(m4,'m4-reference-adapter.mjs')],
 ...['mupdf.js','mupdf-wasm.js','mupdf-wasm.wasm'].map(x=>['/__m4_private__/mupdf/'+x,path.join(m2stage,x)]),
 ...['pdf.mjs','pdf.worker.mjs'].map(x=>['/__m4_private__/pdfjs/'+x,path.join(pdfjs,x)]),
]);
const types={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.wasm':'application/wasm','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const pathname=req.url?.split('?')[0];
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  if(pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
  if(pathname==='/__m4_fixture.pdf'||pathname==='/__m4_rotated.pdf'){
    const bytes=pathname.includes('rotated')?rotated:synthetic;
    res.writeHead(200,{'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Length':bytes.length});
    return res.end(bytes);
  }
  const filepath=staticFiles.get(pathname);
  if(!filepath||!fs.existsSync(filepath)){res.writeHead(404);return res.end('404');}
  res.writeHead(200,{'Content-Type':types[path.extname(filepath)]||'text/plain',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  fs.createReadStream(filepath).pipe(res);
});
let browser;
try{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port;
 const chrome=process.env.M4_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 if(!fs.existsSync(chrome))throw Error('A locally authorized Chrome browser is required');
 browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-first-run','--no-default-browser-check']});
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1365,height:960},deviceScaleFactor:2});
 await ctx.route('**/*',route=>{
   if(route.request().url().startsWith(url+'/'))return route.continue();
   return route.abort('blockedbyclient'); // never connect external Apps Script/Drive/Google for the synthetic test
 });
 const inactive=await ctx.newPage();
 await inactive.goto(url+'/study-note/study-note.html?m4-local=0',{waitUntil:'domcontentloaded'});
 const disabled=await inactive.evaluate(()=>typeof window.__M4_REFERENCE_QA__==='undefined');
 if(!disabled)throw Error('M4 opt-in disabled gate failed');
 await inactive.close();
 const page=await ctx.newPage();
 const runtimeErrors=[],consoleErrors=[];
 page.on('pageerror',e=>runtimeErrors.push(String(e.message).slice(0,260)));
 page.on('console',x=>{if(x.type()==='error' && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(x.text()))consoleErrors.push(x.text().slice(0,220));});
 await page.goto(url+'/study-note/study-note.html?m4-local=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof window.__M4_REFERENCE_QA__==='object',null,{timeout:16000});
 const states=[];
 for(const [sourceType,pageToken,fixture] of [
  ['서브노트','M4-QA-S1','/__m4_fixture.pdf'],
  ['서브노트','M4-QA-S2','/__m4_fixture.pdf'],
  ['교재','M4-QA-T1','/__m4_rotated.pdf'],
 ]){
  const state=await page.evaluate(async({sourceType,pageToken,fixture})=>{
   const data=new Uint8Array(await (await fetch(fixture,{cache:'no-store'})).arrayBuffer());
   return window.__M4_REFERENCE_QA__.openFixture({sourceType,pageToken,bytes:data});
  },{sourceType,pageToken,fixture});
  if(!state.vectorReady||state.width<300||!state.annotationKey.endsWith(pageToken)||state.coordinateSpace!=='normalized-0-1')
    throw Error('Actual viewer did not complete high DPI '+JSON.stringify(state));
  states.push(state);
 }
 // Real existing zoom control, actual stage scroll, aligned normalized annotation overlay.
 await page.click('#referencePdfZoomInBtn');
 await page.waitForTimeout(450);
 await page.evaluate(()=>window.__M4_REFERENCE_QA__.zoom(3));
 await page.waitForFunction(()=>window.__M4_REFERENCE_QA__.getState().tile,{timeout:16000});
 const zoomState=await page.evaluate(()=>{
   const canvas=document.querySelector('#referencePdfFrameWrap .reference-pdf-vector-canvas.is-rendered');
   const anno=document.querySelector('#referencePdfFrameWrap .annotation-canvas');
   const scroll=document.querySelector('#referencePdfFrameWrap .reference-pdf-pan-scroller');
   const stage=document.querySelector('#referencePdfFrameWrap .reference-pdf-image-stage');
   const rect=canvas?.getBoundingClientRect();
   const input=window.StudyNoteAnnotation.clientToNormalized(canvas,rect.left+rect.width*.42,rect.top+rect.height*.67);
   const output=window.StudyNoteAnnotation.normalizedToClient(canvas,input);
   scroll.scrollTop=Math.min(scroll.scrollTop+80,scroll.scrollHeight-scroll.clientHeight);
   scroll.dispatchEvent(new Event('scroll'));
   return {canvasPixels:[canvas.width,canvas.height],annoKey:anno?.dataset.annotationKey,
    annoSchema:anno?.dataset.annotationSchemaVersion,annoCoordinate:anno?.dataset.coordinateSpace,
    canvasRect:[rect.width,rect.height],tileCount:stage?.querySelectorAll('.m4-reference-detail-tile').length,
    roundTrip:Math.abs(output.x-(rect.left+rect.width*.42))<1e-5&&Math.abs(output.y-(rect.top+rect.height*.67))<1e-5};
 });
 if(!zoomState.roundTrip||zoomState.annoSchema!=='3'||zoomState.tileCount!==1)
   throw Error('Annotation alignment/tile failure: '+JSON.stringify(zoomState));
 await page.waitForTimeout(400);
 const afterScroll=await page.evaluate(()=>window.__M4_REFERENCE_QA__.getState());
 if(!afterScroll.tile)throw Error('Tile did not survive scroll update');
 const beforeMouse=await page.evaluate(()=>{
   const s=document.querySelector('#referencePdfFrameWrap .reference-pdf-pan-scroller');
   return {x:s.scrollLeft,y:s.scrollTop};
 });
 const panRect=await page.locator('#referencePdfFrameWrap .reference-pdf-pan-scroller').boundingBox();
 await page.mouse.move(panRect.x+panRect.width*.56,panRect.y+panRect.height*.55);
 await page.mouse.down();
 await page.mouse.move(panRect.x+panRect.width*.56-145,panRect.y+panRect.height*.55-95,{steps:6});
 await page.mouse.up();
 const afterMouse=await page.evaluate(()=>{
   const s=document.querySelector('#referencePdfFrameWrap .reference-pdf-pan-scroller');
   return {x:s.scrollLeft,y:s.scrollTop};
 });
 if(Math.abs(afterMouse.x-beforeMouse.x)<20&&Math.abs(afterMouse.y-beforeMouse.y)<20)
   throw Error('Existing mouse drag-to-pan gesture did not scroll');

 // Force PDF.js 6.5.438 fallback only in isolated QA; production secure renderer remains unchanged.
 await page.evaluate(()=>window.__M4_REFERENCE_QA__.usePdfjsFallbackForNextFixture());
 const fallback=await page.evaluate(async()=>{
  const bytes=new Uint8Array(await (await fetch('/__m4_fixture.pdf')).arrayBuffer());
  return window.__M4_REFERENCE_QA__.openFixture({sourceType:'교재',pageToken:'M4-QA-T2',bytes});
 });
 if(fallback.engine!=='pdfjs'||!fallback.vectorReady||!/PDF\.js/.test(fallback.status))
   throw Error('PDF.js fallback UI failed: '+JSON.stringify(fallback));
 await page.evaluate(()=>window.__M4_REFERENCE_QA__.close());
 const closed=await page.evaluate(()=>window.__M4_REFERENCE_QA__.getState());
 if(closed.vectorReady||closed.engine!==null)throw Error('Viewer close did not release renderer');
 // Touch/pen acceptance on Galaxy Tab S11 and iPhone remains for M6/M7.
 // Here only emulate two-finger TouchEvents in real desktop Chrome.
 const mobile=await browser.newContext({serviceWorkers:'block',viewport:{width:820,height:1100},
   deviceScaleFactor:2,hasTouch:true,isMobile:true});
 await mobile.route('**/*',route=>route.request().url().startsWith(url+'/')?route.continue():route.abort('blockedbyclient'));
 const touchPage=await mobile.newPage();
 await touchPage.goto(url+'/study-note/study-note.html?m4-local=1',{waitUntil:'domcontentloaded'});
 await touchPage.waitForFunction(()=>typeof window.__M4_REFERENCE_QA__==='object',null,{timeout:16000});
 await touchPage.evaluate(async()=>{
   const bytes=new Uint8Array(await (await fetch('/__m4_fixture.pdf')).arrayBuffer());
   await window.__M4_REFERENCE_QA__.openFixture({sourceType:'서브노트',pageToken:'M4-QA-TOUCH',bytes});
 });
 const pinch=await touchPage.evaluate(()=>{
   const scroller=document.querySelector('#referencePdfFrameWrap .reference-pdf-pan-scroller');
   const rect=scroller.getBoundingClientRect();
   const target=scroller;
   const mk=(id,x,y)=>new Touch({identifier:id,target,clientX:rect.left+x,
     clientY:rect.top+y,pageX:rect.left+x,pageY:rect.top+y,screenX:x,screenY:y,radiusX:2,radiusY:2});
   const a=mk(11,90,160),b=mk(22,190,160),b2=mk(22,265,160);
   scroller.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,
     touches:[a,b],targetTouches:[a,b],changedTouches:[a,b]}));
   scroller.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,
     touches:[a,b2],targetTouches:[a,b2],changedTouches:[a,b2]}));
   const zoom=window.__M4_REFERENCE_QA__.getState().zoom;
   scroller.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,
     touches:[],targetTouches:[],changedTouches:[a,b2]}));
   return zoom;
 });
 if(pinch<=1.1)throw Error('Emulated touch pinch did not zoom: '+pinch);
 await touchPage.waitForTimeout(400);
 const touchRender=await touchPage.evaluate(()=>window.__M4_REFERENCE_QA__.getState());
 if(!touchRender.vectorReady)throw Error('Renderer lost active page after emulated touch pinch');
 await mobile.close();
 const screenshot=path.join(repo,'.m4-private','m4-private-browser.png');
 fs.mkdirSync(path.dirname(screenshot),{recursive:true});
 // Isolated synthetic screenshot, never uploaded, gitignored.
 await page.screenshot({path:screenshot,fullPage:false});
 const report={status:'PASS',browser:browser.version(),inactiveGate:disabled,
   sources:states.map(x=>({source:x.sourceType,token:x.pageToken,engine:x.engine,px:[x.width,x.height]})),
   zoomState,afterScroll:{tile:afterScroll.tile,engine:afterScroll.engine},
   mousePan:{before:beforeMouse,after:afterMouse},
   fallback:{engine:fallback.engine,status:fallback.status},closed,
   touchEmulated:{pinchZoom:pinch,vectorReady:touchRender.vectorReady,realDevice:false},
   runtimeErrors,consoleErrors,syntheticOnly:true,operatingBackendTouched:false,screenshotPrivate:true};
 console.log(JSON.stringify(report,null,2));
 if(runtimeErrors.length || consoleErrors.length)
   throw Error('Unexpected browser errors '+JSON.stringify({runtimeErrors,consoleErrors}));
}catch(e){console.error('M4_BROWSER_SMOKE_FAILED',String(e.stack||e));process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
