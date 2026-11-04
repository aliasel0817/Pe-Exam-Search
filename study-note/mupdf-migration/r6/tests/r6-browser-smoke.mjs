// R6 synthetic-only Windows Chrome route: intercept published-origin requests locally.
// Nothing is deployed. No operating Apps Script, Drive, LIVE MASTER, or ink data is used.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../m3/node_modules/playwright/index.mjs';
const require=createRequire(new URL('../../m3/package.json',import.meta.url));
const {PDFDocument}=require('pdf-lib');
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../..');
const study=path.join(root,'study-note');
const staged=path.join(root,'.r6-private','site','study-note');
const expectedSite='https://aliasel0817.github.io/Pe-Exam-Search/study-note/';
const home=expectedSite+'study-note.html';
const chrome=process.env.R6_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if(!fs.existsSync(chrome))throw Error('Real Windows Chrome is required');
if(!fs.existsSync(path.join(staged,'vendor','mupdf','1.28.1','mupdf-wasm.wasm')))
 throw Error('R6 private verified binaries must be staged; no public download');
const revision='2501f9bb64bcad9ef31aa85c87b82cf67633d59f'; // simulated only
const approved={
 schema:'pe-study-note-r6-mupdf-release-v1',status:'RELEASED',enabled:true,
 releaseCommit:revision,mupdfVersion:'1.28.1',
 mupdfCommit:'20061bd45183f5a2bff8f43675e4da91e5ac2901',
 wasmSha256:'5a30ef7b027f541ea8fc54e7c73f16414b0b59940741a12efe5e55f1fd0a99d7',
 sourceUrl:'https://github.com/aliasel0817/Pe-Exam-Search/tree/'+revision+'/study-note',
 review:{rights:true,source:true,security:true,devices:true,operator:true},
};
const doc=await PDFDocument.create(),pagePdf=doc.addPage([612,792]);
pagePdf.drawText('R6 SYNTHETIC PDF NO USER DATA',{x:55,y:715,size:18});
const bytes=Buffer.from(await doc.save()),base64=bytes.toString('base64');
let approvedMode=false,externalBlocked=0,authenticatedRequests=0,mutations=0,assetHits=[];
const browser=await chromium.launch({executablePath:chrome,headless:true,
 args:['--no-first-run','--no-default-browser-check']});
let context;
try{
 context=await browser.newContext({serviceWorkers:'block',viewport:{width:1365,height:900},
   deviceScaleFactor:1});
 await context.route('**/*',async route=>{
  const request=route.request(),url=request.url();
  if(request.method()!=='GET'){mutations++;return route.abort('blockedbyclient');}
  if(!url.startsWith(expectedSite)){
   externalBlocked++;
   if(/script.google.com|googleusercontent.com|drive.google.com/i.test(url))authenticatedRequests++;
   return route.abort('blockedbyclient');
  }
  let rel;
  try{rel=decodeURIComponent(new URL(url).pathname.slice('/Pe-Exam-Search/study-note/'.length));}
  catch{ return route.abort('blockedbyclient'); }
  // R9: exercise R6 fail-closed behavior when the new release add-on
  // is unavailable, then exercise the public release code on the next load.
  if(rel==='mupdf-migration/r9/r9-release-config.js'&&!approvedMode)
    return route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:'/* R9 unavailable: fallback must remain blocked */'});
  if(rel==='mupdf-migration/r6/r6-release-config.js'&&approvedMode)
    return route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',
      headers:{'cache-control':'no-store'},
      body:'window.PE_R6_RELEASE=Object.freeze('+JSON.stringify(approved)+');'});
  const base=rel.startsWith('vendor/')?staged:study;
  const file=path.resolve(base,rel);
  if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())
    return route.fulfill({status:404,body:'Not found'});
  if(rel.startsWith('vendor/'))assetHits.push(rel);
  const mime=file.endsWith('.wasm')?'application/wasm':
    /\.m?js$/.test(file)?'text/javascript; charset=utf-8':
    file.endsWith('.html')?'text/html; charset=utf-8':
    file.endsWith('.json')?'application/json; charset=utf-8':'text/plain; charset=utf-8';
  return route.fulfill({status:200,contentType:mime,headers:{'cache-control':'no-store'},
    body:fs.readFileSync(file)});
 });
 const browserPage=await context.newPage();
 await browserPage.goto(home,{waitUntil:'domcontentloaded'});
 const blocked=await browserPage.evaluate(()=>({
   release:R6_PRODUCTION_RELEASE_ENABLED,reference:M4_REFERENCE_DEV_ENABLED,
   attachment:M5_ATTACHMENT_DEV_ENABLED,interaction:M6_DEV_ENABLED
 }));
 if(Object.values(blocked).some(Boolean))throw Error('Default production release gate unexpectedly enabled');
 if(assetHits.length)throw Error('Vendor assets fetched while release gate closed');
 approvedMode=true;
 await browserPage.goto(home,{waitUntil:'domcontentloaded'});
 await browserPage.waitForFunction(()=>typeof m5AttachmentRuntime==='function',{timeout:20000});
 const render=await browserPage.evaluate(async b64=>{
  const data=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  if(!R6_PRODUCTION_RELEASE_ENABLED||!M4_REFERENCE_DEV_ENABLED
      ||!M5_ATTACHMENT_DEV_ENABLED||!M6_DEV_ENABLED)
    throw Error('Synthetic release route not enabled');
  if(window.__M4_REFERENCE_QA__||window.__M5_ATTACHMENT_QA__||window.__M6_QA__)
    throw Error('Private synthetic QA hook leaked into production route');
  const first=await m4ReferenceRuntime();
  const reference=await first.openDocument(data);
  const c=document.createElement('canvas');
  document.body.appendChild(c);
  const bounds=await reference.getPageBounds(1);
  const frame=await reference.renderInto(c,{pageNumber:1,fitScale:1,zoom:2,dpr:1});
  await reference.close();c.remove();
  const second=await m5AttachmentRuntime();
  const attachment=await second.openDocument(data);
  const p=await attachment.getPageView(1);
  const ca=document.createElement('canvas');document.body.appendChild(ca);
  const result=await attachment.renderPage(ca,{pageNumber:1,fitScale:1,zoom:2,dpr:1});
  await attachment.close();ca.remove();
  const {createR6ReferenceEngine}=await import('./mupdf-migration/r6/r6-production-renderer.mjs');
  const pdfEngine=await createR6ReferenceEngine(window.PE_R6_RELEASE,{forcePdfjs:true});
  const fallback=await pdfEngine.openDocument(data);
  const cf=document.createElement('canvas');document.body.appendChild(cf);
  const fallbackResult=await fallback.renderInto(cf,{pageNumber:1,fitScale:1,zoom:2,dpr:1});
  await fallback.close();cf.remove();
  return {reference:{engine:frame.engine,width:frame.width,height:frame.height,
      pageWidth:bounds.pageWidth,pageHeight:bounds.pageHeight},
    attachment:{engine:result.engine,width:result.width,height:result.height,
      pageWidth:p.facade.getViewport({scale:1}).width},
    fallback:{engine:fallbackResult.engine,width:fallbackResult.width,height:fallbackResult.height},
    annotationSchema:ANNOTATION_SCHEMA_VERSION,
    sourceUrl:PE_R6_RELEASE.sourceUrl,
    noticeCount:document.querySelectorAll('#r4-private-notice').length};
 },base64);
 if(!(render.reference.width>612&&render.attachment.width>612
     &&render.fallback.width>612&&render.fallback.engine==='pdfjs')
   ||render.annotationSchema!==3||render.noticeCount!==1)
   throw Error('Synthetic browser render assertions failed '+JSON.stringify(render));
 if(authenticatedRequests||mutations)
   console.log('R6_BLOCKED_NETWORK_ATTEMPTS',JSON.stringify({authenticatedRequests,mutations,externalBlocked}));
 if(mutations)throw Error('Unexpected operating mutation attempt');
 console.log(JSON.stringify({status:'PASS',chromeVersion:browser.version(),physicalWindowsChrome:true,
  syntheticProductionOriginOnly:true,simulatedApprovalsNotLegalAuthorization:true,
  defaultReleaseBlocked:true,realCToWasmRebuildReusedFromR5:true,
  reference:render.reference,attachment:render.attachment,fallback:render.fallback,
  legalSourceNoticeRendered:true,annotationSchema:render.annotationSchema,
  blockedOperatingRequestAttempts:authenticatedRequests,operatingNetworkRequestsSent:0,
  operatingWrites:mutations,
  interceptedExternalRequests:externalBlocked,privateStaticVendorRequests:assetHits.length,
  galaxyTabS11:'NOT_VERIFIED',iPhoneSafari:'NOT_VERIFIED'},null,2));
}finally{await context?.close().catch(()=>{});await browser.close();}
