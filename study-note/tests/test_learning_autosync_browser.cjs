'use strict';
// Real Chromium, isolated browser contexts, synthetic cloud only. No live credentials.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let puppeteer;try{puppeteer=require('puppeteer-core');}catch(_){puppeteer=require('../../.qa-browser/node_modules/puppeteer-core');}
const root=path.resolve(__dirname,'..');
const cloud=new Map([['T0001',{topicId:'T0001',favorite:'N',studyStatus:'암기',personalMemo:'server original',lastStudiedAt:'2026-11-26T00:00:00.000Z',reviewCount:1,missCount:0,updatedAt:'2026-11-26T00:00:00.000Z',revision:1,lastMissedAt:''}]]);
let gets=0,posts=0,blockedExternal=0;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1'),p=path.resolve(root,'.'+decodeURIComponent(u.pathname));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css':p.endsWith('.json')?'application/json':p.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(fs.readFileSync(p));
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,errors=[];
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'/usr/bin/chromium'),headless:true,args:['--no-sandbox','--disable-extensions']});
 try{
  async function device(){
   const context=await browser.createBrowserContext(),page=await context.newPage();
   await page.setViewport({width:1366,height:900});
   await page.setRequestInterception(true);
   page.on('request',req=>{if(req.url().startsWith(origin+'/'))req.continue();else{blockedExternal++;req.abort();}});
   page.on('pageerror',e=>errors.push(String(e)));
   await page.exposeFunction('__learningTestGet',()=>{gets++;return {version:2,rows:[...cloud.values()]};});
   await page.exposeFunction('__learningTestPost',payload=>{
    posts++;assert.equal(payload.protocolVersion,2);
    const results=payload.changes.map(c=>{
     const current=cloud.get(c.topicId),state={...c.desired,revision:(current?.revision||0)+1,updatedAt:new Date().toISOString()};
     cloud.set(c.topicId,state);return {operationId:c.operationId,topicId:c.topicId,status:'applied',state,groups:[]};
    });
    return {ok:true,learningSyncVersion:2,savedCount:results.length,results};
   });
   await page.goto(origin+'/study-note.html',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>learningSyncReady&&!!window.PELearningSyncV2&&!!window.StudyPlanner,{timeout:20000});
   await page.waitForFunction(()=>!learningSyncRun,{timeout:20000});
   await page.evaluate(()=>{
    if(learningSyncTimer){clearTimeout(learningSyncTimer);learningSyncTimer=null;}
    ensureActiveSecuritySession=async()=>true;
    fetchLearningStates=async()=>window.__learningTestGet();
    sendMutation=async(_api,payload)=>{const {action,...data}=payload;if(action!=='saveLearningStates')throw Error('unexpected live action');return window.__learningTestPost(data);};
    StudyPlanner.sync=async()=>({state:'migration-required'});StudyPlanner.record=async()=>{};
   });
   return {context,page};
  }
  const a=await device(),b=await device();
  const open=async({page})=>{
   await page.evaluate(()=>document.getElementById('learningBtn').click());
   await page.waitForFunction(()=>!learningSyncRun&&document.getElementById('learningSyncLiveStatus').textContent.includes('일반 학습정보 동기화 완료'),{timeout:20000});
  };
  const read=async({page},id)=>page.evaluate(async id=>(await PELearningSyncV2.readRows(db)).find(x=>x.topicId===id),id);
  const before=gets;await open(a);assert(gets>before);assert.equal((await read(a,'T0001')).personalMemo,'server original');
  await open(b);assert.equal((await read(b,'T0001')).personalMemo,'server original');assert.equal(posts,0);
  await a.page.evaluate(async()=>{currentTopicId='T0001';renderCurrentLearningState();await updateLearningState('T0001',{favorite:true});});
  for(let i=0;i<100&&cloud.get('T0001').favorite!=='Y';i++)await sleep(100);
  assert.equal(cloud.get('T0001').favorite,'Y');
  await open(b);assert.equal((await read(b,'T0001')).favorite,true);
  // A remote pull must not overwrite text currently typed but not saved.
  await b.page.evaluate(()=>{currentTopicId='T0001';renderCurrentLearningState();els.personalMemoInput.value='unsaved local draft';});
  cloud.set('T0001',{...cloud.get('T0001'),personalMemo:'new cloud memo',revision:cloud.get('T0001').revision+1,updatedAt:new Date().toISOString()});
  await open(b);
  assert.equal((await read(b,'T0001')).personalMemo,'new cloud memo');
  assert.equal(await b.page.$eval('#personalMemoInput',el=>el.value),'unsaved local draft');
  // Offline writes remain in IndexedDB, then reconnect automatically uploads.
  const oldPosts=posts;
  await b.page.evaluate(async()=>{
   Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
   window.dispatchEvent(new Event('offline'));
   await updateLearningState('T0001',{favorite:false});
  });
  await sleep(1100);assert.equal(posts,oldPosts);assert.equal((await read(b,'T0001')).dirty,true);
  await b.page.evaluate(()=>{
   Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});
   window.dispatchEvent(new Event('online'));
  });
  for(let i=0;i<100&&cloud.get('T0001').favorite!=='N';i++)await sleep(100);
  assert.equal(cloud.get('T0001').favorite,'N');
  await b.page.waitForFunction(()=>!learningSyncRun&&document.getElementById('learningSyncLiveStatus').textContent.includes('일반 학습정보 동기화 완료'),{timeout:20000});
  await open(a);assert.equal((await read(a,'T0001')).favorite,false);
  assert.deepEqual(errors,[]);
  await a.context.close();await b.context.close();
  console.log('LEARNING_AUTOSYNC_CHROMIUM_PASS '+JSON.stringify({contexts:2,entryPull:true,editUpload:true,otherDevicePull:true,unsavedMemoProtected:true,offlineReconnect:true,pageErrors:errors.length,blockedExternalRequests:blockedExternal,liveRequests:0}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
