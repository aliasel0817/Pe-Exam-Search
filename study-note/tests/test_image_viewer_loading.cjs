"use strict";
/**
 * Isolated, synthetic image viewer loading benchmark and regression.
 * Delivers the REAL study-note.html JS with local mock media responses.
 * No live Sheets, Apps Script, files, login or annotation persistence.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),http=require("node:http");
const root=path.resolve(__dirname,"..");
const engine=process.env.IMAGE_QA_ENGINE==="webkit"?"webkit":"chromium";
const baseline=process.env.IMAGE_QA_BASELINE==="1";
const puppeteer=engine==="chromium"
  ? require(process.env.QA_PUPPETEER_CORE||path.resolve(root,"../.qa-browser/node_modules/puppeteer-core")) : null;
const webkit=engine==="webkit" ? require(path.resolve(root,"../.qa-webkit/node_modules/playwright")).webkit : null;
const src=fs.readFileSync(path.join(root,"study-note.html"),"utf8");
const init="window.addEventListener('DOMContentLoaded', init);";
assert.equal(src.split(init).length,2,"Cannot locate normal app bootstrap");
const testHTML=src.replace(init,
  "window.addEventListener('DOMContentLoaded', () => { bindElements(); window.__imageQaReady=true; });")
  .replace(/<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>/,"")
  .replace(/<script src="\.\/tts\/natural-tts\.js\?v=[^"]+"><\/script>/,"")
  .replace(/<link rel="manifest" href="\.\/manifest\.webmanifest">/,"");
const server=http.createServer((req,res)=>{
 if(req.url==="/"){
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
  res.end(testHTML);
 }else{res.writeHead(404);res.end("isolated fixture only")}
});
function initFakeMedia(){
 const q=window.__imgPerf={
   inFlight:0,maxInFlight:0,requests:[],delayMs:340,
   payloadBytes:220000, shouldFail:new Set(), version:"a",
   waiters:new Set(),
   setup(n=14){
     allTopics=[{topicId:"QA-IMAGE",topicName:"이미지 로딩 합성 성능 측정"}];
     currentTopicId="QA-IMAGE";
     allAttachments=Array.from({length:n},(_,i)=>({
       attachmentId:"QA-"+String(i+1).padStart(2,"0"),type:"I",topicId:currentTopicId,
       fileName:"mock-"+i+".svg",mime:"image/svg+xml",size:q.payloadBytes,
       createdAt:q.version,driveFileId:"drive-"+q.version+"-"+i,sequence:i+1
     }));
   },
   render(){openMediaViewer("I")},
   close(){closeMediaViewer()},
   firstDone(){return !!document.querySelector('.media-image-item:first-child[data-loaded="1"]')},
   pictures(){return [...document.querySelectorAll(".media-image-item")].map(f=>({
     id:f.dataset.mediaImageId,loaded:f.dataset.loaded||"",loading:f.dataset.loading||"",
     hasImage:!!f.querySelector("img"),
     annotation:!!f.querySelector(".annotation-canvas")
   }))},
   info(){return{requests:q.requests.length,maxInFlight:q.maxInFlight,
     currentInFlight:q.inFlight,images:q.pictures(),
     cacheCount:typeof imageMediaBlobCache!=="undefined"?imageMediaBlobCache.size:null,
     cacheBytes:typeof imageMediaBlobCacheBytes!=="undefined"?imageMediaBlobCacheBytes:null}}
 };
 getApiUrl=()=>"https://qa.example.invalid";
 const gap=" ".repeat(q.payloadBytes);
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800"><rect width="1200" height="1800" fill="#eff6ff"/><path d="M0 0L1200 1800" stroke="#2563eb" stroke-width="10"/><!--'+gap+'--></svg>';
 q.originalSvg=svg;
 const base64=btoa(svg);
 fetchMediaContent=async (_apiUrl,id,opts)=>{
   q.requests.push(id);
   q.inFlight++;
   q.maxInFlight=Math.max(q.maxInFlight,q.inFlight);
   try{
     await new Promise((resolve,reject)=>{
       const timer=setTimeout(resolve,q.delayMs);
       if(opts?.signal){
         if(opts.signal.aborted){clearTimeout(timer);reject(new DOMException("Aborted","AbortError"));return;}
         opts.signal.addEventListener("abort",()=>{clearTimeout(timer);reject(new DOMException("Aborted","AbortError"))},{once:true});
       }
     });
     if(q.shouldFail.has(id))throw new Error("synthetic media failure");
     return{base64,mime:"image/svg+xml",fileName:"fixture-"+id+".svg"};
   }finally{q.inFlight--}
 };
 q.setup();
}
async function waitUntil(page,expression,timeout=9000){
 await page.waitForFunction(expression,{timeout});
}
async function run(){
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url="http://127.0.0.1:"+server.address().port+"/";
 let browser;
 try{
  browser=engine==="webkit"?
    await webkit.launch({headless:true}):
    await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",args:["--no-first-run","--no-default-browser-check","--no-sandbox"]});
  const page=engine==="webkit"?
    await browser.newPage({viewport:{width:820,height:1050},deviceScaleFactor:1}):
    await browser.newPage();
  if(engine==="chromium")await page.setViewport({width:820,height:1050,deviceScaleFactor:1});
  const errors=[],external=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("request",req=>{if(!req.url().startsWith("http://127.0.0.1:")&&!req.url().startsWith("blob:http://127.0.0.1:"))external.push(req.url())});
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:20000});
  await waitUntil(page,"window.__imageQaReady===true");
  await page.evaluate("("+initFakeMedia.toString()+")()");
  // Test first view, return a single image and leave other responses blocked.
  await page.evaluate(()=>{window.__imgPerf.setup(1);window.__imgPerf.delayMs=340});
  const firstStart=Date.now();
  await page.evaluate(()=>window.__imgPerf.render());
  await waitUntil(page,"window.__imgPerf.firstDone()");
  await waitUntil(page,"document.querySelector('.media-image-item img')?.naturalWidth===1200");
  await waitUntil(page,"!!document.querySelector('.media-image-item .annotation-canvas')");
  const firstMs=Date.now()-firstStart;
  const first=await page.evaluate(()=>window.__imgPerf.info());
  await waitUntil(page,"document.querySelector('.media-image-item img')?.naturalWidth===1200");
  const dimensions=await page.evaluate(()=>{
    const img=document.querySelector(".media-image-item img");
    return{width:img.naturalWidth,height:img.naturalHeight};
  });
  assert.deepEqual(dimensions,{width:1200,height:1800});
  if(!baseline){
    const exact=await page.evaluate(async()=>((await imageMediaBlobCache.get('QA-01').blob.text())===window.__imgPerf.originalSvg));
    assert(exact,'Decoded image binary does not match the original bytes');
  }
  await page.evaluate(()=>window.__imgPerf.close());
  const secondStart=Date.now();
  await page.evaluate(()=>window.__imgPerf.render());
  await waitUntil(page,"window.__imgPerf.firstDone()");
  await waitUntil(page,"document.querySelector('.media-image-item img')?.naturalWidth===1200");
  await waitUntil(page,"!!document.querySelector('.media-image-item .annotation-canvas')");
  const secondMs=Date.now()-secondStart;
  const repeat=await page.evaluate(()=>window.__imgPerf.info());
  await page.evaluate(()=>window.__imgPerf.close());
  console.log("IMAGE_LOAD_FIRST_SECOND "+JSON.stringify({engine,baseline,firstMs,secondMs,initialRequests:first.requests,repeatRequests:repeat.requests,dimensions,cacheCount:repeat.cacheCount,cacheBytes:repeat.cacheBytes}));
  if(!baseline){
    assert.equal(first.requests,1,"Initial image should have one request");
    assert.equal(repeat.requests,1,"Reopened image must use cache");
    assert(secondMs<Math.max(180,firstMs/2),"Repeated image not significantly faster "+firstMs+" -> "+secondMs);
  }
  // Many initially visible placeholders: limited concurrent work.
  await page.evaluate(()=>{
    window.__imgPerf.version='burst';
    window.__imgPerf.setup(16);
    window.__imgPerf.delayMs=220;
    window.__imgPerf.requests=[];
    window.__imgPerf.maxInFlight=0;
    // Make multiple lazy placeholders visible at once to stress concurrency.
    const style=document.createElement('style');
    style.id='qa-burst-style';
    style.textContent='#imageViewerBody .media-placeholder{min-height:1px;height:1px;padding:0} #imageViewerBody .media-image-item{padding:0;margin:0}';
    document.head.appendChild(style);
  });
  await page.evaluate(()=>window.__imgPerf.render());
  await waitUntil(page,"window.__imgPerf.firstDone()");
  await new Promise(r=>setTimeout(r,320));
  const burst=await page.evaluate(()=>window.__imgPerf.info());
  console.log("IMAGE_LOAD_BURST "+JSON.stringify({engine,baseline,count:burst.requests,maxConcurrency:burst.maxInFlight,loaded:burst.images.filter(x=>x.loaded==="1").length,annotations:burst.images.filter(x=>x.annotation).length}));
  if(!baseline){
    assert(burst.requests>=3,'Burst test did not trigger multiple image requests');
    assert(burst.maxInFlight<=2,'Concurrent requests exceeded two');
  }
  await page.evaluate(()=>window.__imgPerf.close());
  // Simultaneous stale close / delayed results must not repopulate a new viewer.
  await page.evaluate(()=>{
    window.__imgPerf.setup(1);
    window.__imgPerf.version="stale";
    allAttachments[0].driveFileId="new-drive";
    allAttachments[0].createdAt="new-version";
    window.__imgPerf.delayMs=350;
    window.__imgPerf.requests=[];
    window.__imgPerf.render();
    window.__imgPerf.close();
  });
  await new Promise(r=>setTimeout(r,410));
  const afterClose=await page.evaluate(()=>({
    inFlight:window.__imgPerf.inFlight,
    leftoverImages:document.querySelectorAll("#imageViewerBody img").length,
    leftoverUrls:mediaViewerObjectUrls.length
  }));
  assert.equal(afterClose.leftoverImages,0);
  assert.equal(afterClose.leftoverUrls,0);
  console.log("IMAGE_LOAD_STALE_CLOSE "+JSON.stringify({engine,afterClose}));
  if(!baseline){
    // New same-id content must re-fetch, not reuse old blob when Drive metadata changes.
    await page.evaluate(()=>{
      window.__imgPerf.version="b";
      window.__imgPerf.setup(1);
      window.__imgPerf.delayMs=80;
    });
    const prev=await page.evaluate(()=>window.__imgPerf.requests.length);
    await page.evaluate(()=>window.__imgPerf.render());
    await waitUntil(page,"window.__imgPerf.firstDone()");
    const fresh=await page.evaluate(()=>window.__imgPerf.info());
    assert(fresh.requests>prev,"Changed Drive metadata must trigger a fresh request");
    await page.evaluate(()=>window.__imgPerf.close());
    // Deliberately exceed both the entry cap and byte cap: confirm LRU evictions.
    const bounds=await page.evaluate(()=>{
      for(let i=0;i<19;i++){
        const item={attachmentId:'LRU-'+i,driveFileId:'D-'+i,size:2*1024*1024,createdAt:'now',mime:'image/png',fileName:'lru.png'};
        cacheImageBlob(item,new Blob([new Uint8Array(2*1024*1024)]),'lru.png');
      }
      return{count:imageMediaBlobCache.size,bytes:imageMediaBlobCacheBytes,
        maxCount:IMAGE_BLOB_CACHE_MAX_ITEMS,maxBytes:IMAGE_BLOB_CACHE_MAX_BYTES,
        oldestEvicted:!imageMediaBlobCache.has('LRU-0'),newestKept:imageMediaBlobCache.has('LRU-18')};
    });
    assert(bounds.oldestEvicted&&bounds.newestKept,'LRU eviction order incorrect');
    assert(bounds.count<=bounds.maxCount,"Blob-cache entry limit exceeded");
    assert(bounds.bytes<=bounds.maxBytes,"Blob-cache memory budget exceeded");
    console.log("IMAGE_LOAD_CACHE_BOUNDS "+JSON.stringify({engine,bounds}));
    const afterLogout=await page.evaluate(()=>{
      clearSecuritySession();
      return {entries:imageMediaBlobCache.size,bytes:imageMediaBlobCacheBytes};
    });
    assert.deepEqual(afterLogout,{entries:0,bytes:0},'Image cache persisted after session clear');
    console.log('IMAGE_LOAD_LOGOUT_PURGE_PASS '+JSON.stringify({engine,afterLogout}));
    // No IntersectionObserver: first image still loads, scrolling loads the next.
    await page.evaluate(()=>{
      clearCachedImageBlobs();
      document.getElementById('qa-burst-style')?.remove();
      window.IntersectionObserver=undefined;
      window.__imgPerf.version='fallback';
      window.__imgPerf.setup(12);
      window.__imgPerf.delayMs=85;
      window.__imgPerf.requests=[];
      window.__imgPerf.render();
    });
    await waitUntil(page,"window.__imgPerf.firstDone()");
    await waitUntil(page,"document.querySelector('.media-image-item img')?.naturalWidth===1200");
    const fallbackFirst=await page.evaluate(()=>window.__imgPerf.requests.length);
    assert(fallbackFirst<12,'Fallback fetched all images without scrolling');
    await page.evaluate(()=>{
      const body=els.imageViewerBody;
      const fig=body.querySelectorAll('.media-image-item')[10];
      body.scrollTop+=fig.getBoundingClientRect().top-body.getBoundingClientRect().top-25;
      body.dispatchEvent(new Event('scroll'));
    });
    await waitUntil(page,"document.querySelectorAll('.media-image-item')[10].dataset.loaded==='1'");
    const fallbackRequests=await page.evaluate(()=>window.__imgPerf.requests.slice());
    assert(fallbackRequests.includes('QA-11'),'Fallback scrolling never loaded target image');
    console.log('IMAGE_LOAD_SCROLL_FALLBACK_PASS '+JSON.stringify({engine,requests:fallbackRequests}));
    await page.evaluate(()=>window.__imgPerf.close());

    // Server failure must leave a retryable placeholder, not a cached broken blob.
    await page.evaluate(()=>{
      window.__imgPerf.version='error';
      window.__imgPerf.setup(1);
      window.__imgPerf.delayMs=85;
      window.__imgPerf.shouldFail.add('QA-01');
      window.__imgPerf.requests=[];
      window.__imgPerf.render();
    });
    await waitUntil(page,"document.querySelector('.media-placeholder')?.textContent.includes('불러오기 실패')");
    const failed=await page.evaluate(()=>({images:window.__imgPerf.pictures(),cached:imageMediaBlobCache.has('QA-01'),requests:window.__imgPerf.requests.length}));
    assert.equal(failed.cached,false,'Failed transfer was cached');
    assert.equal(failed.images[0].loaded,'','Failed transfer marked loaded');
    await page.evaluate(()=>{window.__imgPerf.close();window.__imgPerf.shouldFail.delete('QA-01');window.__imgPerf.render()});
    await waitUntil(page,"window.__imgPerf.firstDone()");
    await waitUntil(page,"document.querySelector('.media-image-item img')?.naturalWidth===1200");
    const retry=await page.evaluate(()=>window.__imgPerf.info());
    assert(retry.requests>failed.requests,'Retry skipped the network unexpectedly');
    await page.evaluate(()=>window.__imgPerf.close());
    console.log('IMAGE_LOAD_ERROR_RETRY_PASS '+JSON.stringify({engine,attempts:retry.requests}));
  }
  assert.equal(errors.length,0,"Browser JS errors: "+JSON.stringify(errors));
  assert.equal(external.length,0,"Test unexpectedly used external URLs: "+JSON.stringify(external));
  console.log("IMAGE_VIEWER_LOADING_QA_PASS "+JSON.stringify({engine,baseline,firstMs,secondMs,initialRequests:first.requests,afterRepeatRequests:repeat.requests,maxBurstConcurrency:burst.maxInFlight}));
  await page.close();
 }catch(e){console.error("IMAGE_VIEWER_LOADING_QA_FAIL "+String(e.stack||e));process.exitCode=1}
 finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
run();
