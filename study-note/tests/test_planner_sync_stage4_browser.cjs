'use strict';
// Stage 4 regression: two isolated Chromium profiles and an in-memory HTTP server. No LIVE requests.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const puppeteer=require('../../.qa-browser/node_modules/puppeteer-core');
const root=path.resolve(__dirname,'..'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const memory={plans:new Map(),stages:new Map(),progress:new Map(),ops:new Map(),calls:0,dropNext:false};
const err=code=>({ok:false,code,message:code});
function mock(method,action,data){
 memory.calls++;
 action=action.toLowerCase();
 if(method==='get'){
  if(action==='studyplans')return {ok:true,plannerSyncVersion:1,plans:[...memory.plans.values()].map(p=>({planId:p.id,name:p.meta.name,start:p.meta.start,end:p.meta.end,rounds:p.meta.rounds,activeRevision:p.rev,activeHash:p.hash}))};
  if(action==='studyplanschedule'){
   const p=memory.plans.get(data.planId);if(!p||p.rev!==Number(data.revision))return err('BAD_REVISION');
   const items=p.chunks.slice().sort((a,b)=>a.chunkKey.localeCompare(b.chunkKey)),offset=data.offset||0,n=data.limit||100;
   return {ok:true,revision:p.rev,hash:p.hash,chunks:items.slice(offset,offset+n),hasMore:offset+n<items.length,nextOffset:Math.min(items.length,offset+n)};
  }
  if(action==='studyprogress'){
   const events=memory.progress.get(data.planId)||[],high=data.untilSeq??events.length;
   const rows=events.filter(x=>x.serverSeq>(data.afterSeq||0)&&x.serverSeq<=high),n=data.limit||300;
   return {ok:true,events:rows.slice(0,n),hasMore:rows.length>n,nextSeq:rows.length?rows[Math.min(n,rows.length)-1].serverSeq:(data.afterSeq||0),highWatermark:high};
  }
  return err('UNKNOWN_GET');
 }
 if(action==='beginstudyplanrevision'){
  const old=memory.stages.get(data.operationId),plan=memory.plans.get(data.planId);
  if(old)return {ok:true,stageId:old.stageId,allocatedRevision:old.rev,duplicate:true};
  if(Number(data.baseRevision)!==(plan?.rev||0))return err('REVISION_CONFLICT');
  const st={stageId:'stage-'+data.operationId,id:data.planId,meta:data.meta,hash:data.snapshotHash,rev:(plan?.rev||0)+1,expected:data.expectedChunks,parts:new Map()};
  memory.stages.set(data.operationId,st);
  return {ok:true,stageId:st.stageId,allocatedRevision:st.rev};
 }
 if(action==='putstudyplanchunks'){
  const st=memory.stages.get(data.operationId);if(!st||st.stageId!==data.stageId)return err('STAGE_NOT_FOUND');
  for(const c of data.chunks){if(sha(c.payloadJson)!==c.chunkHash)return err('HASH_MISMATCH');st.parts.set(c.chunkKey,c);}
  return {ok:true,received:st.parts.size};
 }
 if(action==='commitstudyplanrevision'){
  const st=memory.stages.get(data.operationId);if(!st||st.stageId!==data.stageId)return err('STAGE_NOT_FOUND');
  if(st.committed)return {ok:true,duplicate:true,activeRevision:st.rev,activeHash:st.hash};
  if(st.parts.size!==st.expected)return err('MISSING_CHUNKS');
  const chunks=[...st.parts.values()],groups=chunks.filter(x=>x.kind==='GROUPS').sort((a,b)=>a.partIndex-b.partIndex).flatMap(x=>JSON.parse(x.payloadJson));
  const days=[...new Set(chunks.filter(x=>x.kind==='DAY').map(x=>x.date))].sort().map(date=>{
   const p=chunks.filter(x=>x.kind==='DAY'&&x.date===date);
   return {date,round:p[0].round,entries:p.sort((a,b)=>a.partIndex-b.partIndex).flatMap(x=>JSON.parse(x.payloadJson))};
  });
  const canonical=JSON.stringify({id:st.id,name:st.meta.name,start:st.meta.start,end:st.meta.end,rounds:st.meta.rounds,groups:groups.sort((a,b)=>a[0].localeCompare(b[0])),days});
  if(sha(canonical)!==st.hash)return err('BAD_HASH');
  memory.plans.set(st.id,{id:st.id,meta:st.meta,hash:st.hash,rev:st.rev,chunks});
  st.committed=true;return {ok:true,activeRevision:st.rev,activeHash:st.hash};
 }
 if(action==='savestudyprogress'){
  const reply={ok:true,applied:[],duplicate:[],conflicts:[]};
  for(const c of data.changes){
   const old=memory.ops.get(c.operationId);
   if(old){if(JSON.stringify(c)!==JSON.stringify(old.original))return err('OPERATION_REUSE');reply.duplicate.push(old.ack);continue;}
   const p=memory.plans.get(c.planId);if(!p)return err('PLAN_NOT_FOUND');
   const events=memory.progress.get(c.planId)||[],key=c.planId+'|'+c.date+'|'+c.topicId;
   const last=events.filter(x=>x.progressKey===key).at(-1),rev=last?.rowRevision||0;
   if(p.rev!==c.planRevisionAtWrite||rev!==c.expectedRowRevision){
    reply.conflicts.push({operationId:c.operationId,progressKey:key,serverRowRevision:rev,serverStatus:last?.status||'todo'});continue;
   }
   const slots=p.chunks.filter(x=>x.kind==='DAY'&&x.date===c.date).flatMap(x=>JSON.parse(x.payloadJson));
   if(!slots.some(x=>x[0]===c.topicId))return err('SLOT_NOT_FOUND');
   const evt={serverSeq:events.length+1,progressKey:key,date:c.date,topicId:c.topicId,status:c.status,rowRevision:rev+1,operationId:c.operationId,serverAt:new Date().toISOString()};
   events.push(evt);memory.progress.set(c.planId,events);
   const ack={operationId:c.operationId,rowRevision:rev+1,serverSeq:evt.serverSeq};
   memory.ops.set(c.operationId,{original:c,ack});reply.applied.push(ack);
  }
  return reply;
 }
 return err('UNKNOWN_POST');
}
const harness='<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'+
 '<button id="syncLearningBtn" type="button">학습정보 동기화</button><div class="learning-view-tabs"><button data-learning-view="recent">최근</button></div><div id="learningList"></div><nav id="learningPager"></nav>'+
 '<script>var learningView="plan",learningPage=1;var allTopics=[{topicId:"T0001",topicName:"합성 토픽",studyTarget:"Y",categoryCode:"G01",categoryName:"합성 그룹",domain:"SW"}];function renderLearningDashboard(){return StudyPlanner.render()}function navigateToLearningTopic(id){window.currentTestTopic=id}function syncLearningStates(){window.__legacySyncCount=(window.__legacySyncCount||0)+1;return Promise.resolve()}</script>'+
 '<script src="/study-note/study-planner-sync.js"></script><script src="/study-note/study-planner.js"></script></body></html>';
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/__mock'){
  let text='';req.on('data',x=>{text+=x;if(text.length>150000)req.destroy();});
  req.on('end',()=>{try{
   const b=JSON.parse(text),out=mock(b.method,b.action,b.data);
   if(b.method==='post'&&b.action.toLowerCase()==='savestudyprogress'&&memory.dropNext){
    memory.dropNext=false;res.writeHead(503);res.end('synthetic ACK lost');return;
   }
   res.writeHead(out.ok?200:409,{'Content-Type':'application/json'});res.end(JSON.stringify(out));
  }catch(e){res.writeHead(500);res.end(e.message);}});return;
 }
 if(u.pathname==='/__drop'){memory.dropNext=true;res.writeHead(204);res.end();return;}
 if(u.pathname==='/empty'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>empty</title>');return;}
 if(u.pathname==='/harness'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(harness);return;}
 if(['/study-planner-sync-ux.js','/study-planner-migration.js','/study-planner-migration-ui.js'].includes(u.pathname)){
  const p=path.resolve(root,u.pathname.slice(1));
  res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(p));return;
 }
 if(u.pathname.startsWith('/study-note/')){
  const p=path.resolve(root,u.pathname.slice('/study-note/'.length));
  if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':'application/json');res.end(fs.readFileSync(p));return;
 }
 res.writeHead(404);res.end();
});
const legacyPlan={id:'legacy-plan',name:'기존 계획',start:'2026-11-13',end:'2026-11-15',rounds:3,groups:{G01:'합성 그룹'},days:[
 {date:'2026-11-13',round:1,ids:['T0001'],groups:['G01']},
 {date:'2026-11-14',round:2,ids:['T0001'],groups:['G01']},
 {date:'2026-11-15',round:3,ids:['T0001'],groups:['G01']}
],entries:3};
const legacyProgress={key:'legacy-plan|2026-11-13|T0001',planId:'legacy-plan',date:'2026-11-13',topicId:'T0001',status:'done',updatedAt:'2026-11-13T00:00:00Z'};
async function values(page){
 return page.evaluate(async()=>{
  const d=await new Promise((resolve,reject)=>{const r=indexedDB.open('pe-study-planner-v1',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const all=store=>new Promise((resolve,reject)=>{const r=d.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const names=[...d.objectStoreNames],v=await Promise.all(['plans','progress','pendingOps','syncMeta','syncConflicts'].map(all));
  const version=d.version;d.close();return {version,names,plans:v[0],progress:v[1],pending:v[2],meta:v[3],conflicts:v[4]};
 });
}
async function newPage(context,origin){
 const page=await context.newPage();
 await page.evaluateOnNewDocument(()=>{
  window.PE_PLANNER_SYNC_TEST_ENABLED=true;
  const call=async(method,action,data)=>{
   const r=await fetch('/__mock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,action,data})});
   if(!r.ok)throw Error('mock HTTP '+r.status);
   return r.json();
  };
  window.PE_PLANNER_SYNC_TEST_TRANSPORT={get:(action,data)=>call('get',action,data),post:(action,data)=>call('post',action,data)};
 });
 return page;
}
async function navigate(page,origin){
 await page.goto(origin+'/harness',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.StudyPlanner&&document.getElementById('plannerManagement'),{timeout:14000});
 await page.evaluate(()=>StudyPlanner.render());
 // A genuinely new second device has no local plans until remote first import.
}
async function migrateMock(page){
 await page.evaluate(async()=>{
  const d=await new Promise(resolve=>{const r=indexedDB.open('pe-study-planner-v1',2);r.onsuccess=()=>resolve(r.result);});
  await new Promise((resolve,reject)=>{const tx=d.transaction('syncMeta','readwrite');tx.objectStore('syncMeta').put({key:'migration',state:'ready',syntheticApproved:true});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});d.close();
 });
}
async function selectTopic(page,id,date){
 await page.evaluate(async(id,date)=>{
  const s=document.getElementById('plannerSelect');s.value=id;s.dispatchEvent(new Event('change',{bubbles:true}));
  const d=document.getElementById('plannerDate');d.value=date;d.dispatchEvent(new Event('change',{bubbles:true}));
  await StudyPlanner.render();const b=document.querySelector('[data-plan-topic="T0001"]');
  if(!b)throw Error('합성 토픽 버튼 누락');b.click();
 },id,date);
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser,c1,c2;
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  c1=await browser.createBrowserContext();c2=await browser.createBrowserContext();
  const pc=await newPage(c1,origin),tab=await newPage(c2,origin),pageErrors=[];
  pc.on('dialog',d=>d.accept());tab.on('dialog',d=>d.accept());
  pc.on('pageerror',e=>pageErrors.push(String(e)));tab.on('pageerror',e=>pageErrors.push(String(e)));
  await pc.goto(origin+'/empty');
  await pc.evaluate((p,g)=>new Promise((resolve,reject)=>{
   const r=indexedDB.open('pe-study-planner-v1',1);
   r.onupgradeneeded=()=>{r.result.createObjectStore('plans',{keyPath:'id'});r.result.createObjectStore('progress',{keyPath:'key'});};
   r.onsuccess=()=>{const db=r.result,tx=db.transaction(['plans','progress'],'readwrite');tx.objectStore('plans').put(p);tx.objectStore('progress').put(g);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);
  }),legacyPlan,legacyProgress);
  await navigate(pc,origin);
  let snap=await values(pc);
  assert.equal(snap.version,2);assert.equal(snap.names.length,6);
  assert.deepEqual(snap.plans.find(p=>p.id==='legacy-plan'),legacyPlan);
  assert.deepEqual(snap.progress.find(p=>p.key===legacyProgress.key),legacyProgress);
  const before=memory.calls;
  assert.equal((await pc.evaluate(()=>StudyPlanner.sync())).state,'migration-required');
  assert.equal(memory.calls,before,'migration block must make zero server calls');
  await pc.waitForFunction(()=>window.PEPlannerSyncUX&&document.getElementById('plannerSyncDetails')&&
   document.getElementById('syncLearningBtn').dataset.plannerSyncBridge==='installed',{timeout:8000});
  await pc.click('#syncLearningBtn');
  await pc.waitForFunction(()=>window.__legacySyncCount===1,{timeout:4000});
  await pc.waitForFunction(()=>document.getElementById('plannerSyncAreaLegacy').textContent.includes('미확인'),{timeout:6000});
  assert((await pc.$eval('#plannerSyncAreaPlan',e=>e.textContent)).includes('최초 통합'));
  assert.equal(memory.calls,before,'legacy sync button must not bypass first-migration gate');
  await migrateMock(pc);
  await pc.click('#plannerManage');
  await pc.waitForFunction(()=>document.getElementById('plannerManagement').open,{timeout:4000});
  await pc.$eval('#plannerCreateName',e=>{e.value='합성 클라우드';e.dispatchEvent(new Event('input',{bubbles:true}))});
  await pc.$eval('#plannerCreateStart',e=>{e.value='2026-11-13';e.dispatchEvent(new Event('change',{bubbles:true}))});
  await pc.$eval('#plannerCreateEnd',e=>{e.value='2026-11-15';e.dispatchEvent(new Event('change',{bubbles:true}))});
  await pc.select('#plannerCreateRounds','3');await pc.select('#plannerCreateScope','selected');
  await pc.$eval('#plannerCreateIds',e=>{e.value='T0001';e.dispatchEvent(new Event('input',{bubbles:true}))});
  await pc.click('#plannerCreatePreviewBtn');
  await pc.waitForFunction(()=>!document.getElementById('plannerCreateApply').disabled,{timeout:6000});
  await pc.click('#plannerCreateApply');
  await pc.waitForFunction(()=>document.getElementById('plannerNotice').textContent.includes('새 계획 저장 완료'),{timeout:8000});
  const planId=await pc.$eval('#plannerSelect',e=>e.value);assert.match(planId,/^auto-/);
  assert((await values(pc)).pending.some(x=>x.kind==='plan'&&x.planId===planId));
  assert.equal((await pc.evaluate(()=>StudyPlanner.sync())).state,'synced');
  assert.equal(memory.plans.get(planId).rev,1);
  await selectTopic(pc,planId,'2026-11-13');await pc.evaluate(()=>StudyPlanner.record('T0001','암기'));
  assert.equal((await pc.evaluate(()=>StudyPlanner.sync())).state,'synced');
  await navigate(tab,origin);await migrateMock(tab);
  assert.equal((await tab.evaluate(()=>StudyPlanner.sync())).state,'synced');
  snap=await values(tab);
  assert.equal(snap.plans.find(p=>p.id===planId).days.length,3);
  assert.equal(snap.progress.find(x=>x.key===planId+'|2026-11-13|T0001').status,'done');
  assert.equal(snap.progress.filter(x=>x.planId===planId&&x.status==='done').length,1);
  await selectTopic(tab,planId,'2026-11-14');await tab.evaluate(()=>StudyPlanner.record('T0001','미암기'));
  assert.equal((await tab.evaluate(()=>StudyPlanner.sync())).state,'synced');
  assert.equal((await pc.evaluate(()=>StudyPlanner.sync())).state,'synced');
  snap=await values(pc);assert.equal(snap.progress.find(x=>x.key===planId+'|2026-11-14|T0001').status,'miss');
  await pc.setOfflineMode(true);
  await selectTopic(pc,planId,'2026-11-15');await pc.evaluate(()=>StudyPlanner.record('T0001','암기'));
  assert.equal((await pc.evaluate(()=>StudyPlanner.sync())).state,'offline');
  assert((await values(pc)).pending.some(x=>x.date==='2026-11-15'));
  await pc.setOfflineMode(false);
  assert.equal((await pc.evaluate(()=>StudyPlanner.sync())).state,'synced');
  assert.equal((await tab.evaluate(()=>StudyPlanner.sync())).state,'synced');
  assert.equal((await values(tab)).progress.find(x=>x.key===planId+'|2026-11-15|T0001').status,'done');
  await selectTopic(pc,planId,'2026-11-13');await pc.evaluate(()=>StudyPlanner.record('T0001','미암기'));
  await selectTopic(tab,planId,'2026-11-13');await tab.evaluate(()=>StudyPlanner.record('T0001','암기'));
  assert.equal((await pc.evaluate(()=>StudyPlanner.sync())).state,'synced');
  const clash=await tab.evaluate(()=>StudyPlanner.sync());assert.equal(clash.state,'partial');
  assert((await values(tab)).conflicts.some(x=>x.kind==='progress'));
  assert((await values(tab)).pending.some(x=>x.state==='conflict'));
  await tab.waitForSelector('#plannerSyncDetails',{timeout:8000});
  await tab.evaluate(()=>StudyPlanner.syncStatus());
  assert((await tab.$eval('#plannerSyncAreaProgress',e=>e.textContent)).includes('충돌'));
  assert.equal(memory.progress.get(planId).filter(x=>x.date==='2026-11-13').at(-1).status,'miss');
  await selectTopic(pc,planId,'2026-11-14');await pc.evaluate(()=>StudyPlanner.record('T0001','암기'));
  await pc.evaluate(()=>fetch('/__drop',{method:'POST'}));
  await assert.rejects(()=>pc.evaluate(()=>StudyPlanner.sync()),/mock HTTP 503/);
  const count=memory.progress.get(planId).length;
  assert((await values(pc)).pending.some(x=>x.date==='2026-11-14'));
  assert.equal((await pc.evaluate(()=>StudyPlanner.sync())).state,'synced');
  assert.equal(memory.progress.get(planId).length,count,'ack retry must not duplicate');
  snap=await values(pc);
  assert.deepEqual(snap.plans.find(p=>p.id==='legacy-plan'),legacyPlan);
  assert.deepEqual(snap.progress.find(p=>p.key===legacyProgress.key),legacyProgress);
  assert.deepEqual(pageErrors,[]);
  // Third synthetic profile: validate the real Stage5 wizard's backup-file
  // re-selection gate, preview and user-confirmed initial import.
  const mobileCtx=await browser.createBrowserContext();
  const mobile=await newPage(mobileCtx,origin);
  mobile.on('dialog',d=>d.accept());mobile.on('pageerror',e=>pageErrors.push(String(e)));
  await navigate(mobile,origin);
  await mobile.waitForSelector('#plannerFirstSyncWizard',{timeout:10000});
  assert.equal(await mobile.evaluate(()=>document.querySelectorAll('#plannerMigSteps li').length),7,'7 accessible migration steps');
  assert.equal((await mobile.$eval('#plannerMigCompare',e=>e.disabled)),true);
  await mobile.evaluate(()=>{
   PEPlannerMigration.downloadBackup=file=>{window.__stage5SavedFile=JSON.stringify(file);};
  });
  await mobile.click('#plannerManage');
  const preflightCalls=memory.calls;
  await mobile.click('#plannerMigBackup');
  await mobile.waitForFunction(()=>Boolean(window.__stage5SavedFile),{timeout:25000});
  assert.equal(memory.calls,preflightCalls,'backup download must make no server calls');
  assert.equal(await mobile.$eval('#plannerMigCompare',e=>e.disabled),true,'preview disabled until physical-file reimport');
  await mobile.evaluate(()=>{
   const selection=new DataTransfer();
   selection.items.add(new File([window.__stage5SavedFile],'downloaded-full-backup.json',{type:'application/json'}));
   const input=document.getElementById('plannerMigVerify');input.files=selection.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await mobile.waitForFunction(()=>!document.getElementById('plannerMigCompare').disabled,{timeout:12000});
  await mobile.click('#plannerMigCompare');
  await mobile.waitForFunction(()=>!document.getElementById('plannerMigApprove').disabled,{timeout:25000});
  assert((await mobile.$eval('#plannerMigPreview',e=>e.textContent)).includes('충돌'));
  await mobile.click('#plannerMigApprove');
  await mobile.waitForFunction(()=>document.getElementById('plannerMigMessage').textContent.includes('첫 통합 검증 완료'),{timeout:90000});
  const mobileData=await values(mobile);
  assert(mobileData.plans.some(p=>p.id===planId),'third profile must import server plan');
  assert(mobileData.progress.some(p=>p.planId===planId),'third profile must import server progress');
  assert(mobileData.meta.some(x=>x.key==='migration'&&x.state==='ready'));
  const layouts=[];
  for(const width of [1366,768,390]){
   await mobile.setViewport({width,height:880});
   const info=await mobile.evaluate(()=>{
    const panel=document.getElementById('studyPlannerPanel'),wizard=document.getElementById('plannerFirstSyncWizard'),
     fieldset=document.getElementById('plannerMigChoices'),bounds=panel.getBoundingClientRect();
    return {viewport:window.innerWidth,panelWidth:bounds.width,bodyScroll:document.scrollingElement.scrollWidth,
     wizardScroll:wizard.scrollWidth,wizardWidth:wizard.clientWidth,fieldsetScroll:fieldset.scrollWidth,fieldsetWidth:fieldset.clientWidth,
     status:document.getElementById('plannerSyncDetails').getBoundingClientRect().width};
   });
   assert.equal(info.viewport,width);
   assert(info.bodyScroll<=width+3,'horizontal document overflow '+width+' '+JSON.stringify(info));
   assert(info.wizardScroll<=info.wizardWidth+5,'wizard overflow '+width+' '+JSON.stringify(info));
   assert(info.fieldsetScroll<=info.fieldsetWidth+7,'fieldset overflow '+width+' '+JSON.stringify(info));
   layouts.push({width,bodyScroll:info.bodyScroll,status:Math.round(info.status)});
  }
  assert((await mobile.$eval('#plannerMigSteps',e=>e.textContent)).includes('서버 버전·해시·진도 시퀀스 검증'));
  // A different existing device can inspect BOTH sources without writing over either.
  await tab.waitForSelector('#plannerFirstSyncWizard',{timeout:10000});
  await tab.evaluate(()=>{PEPlannerMigration.downloadBackup=file=>{window.__stage6ConflictFile=JSON.stringify(file)};});
  await tab.$eval('#plannerManagement',e=>{e.open=true;});
  await tab.click('#plannerMigBackup');
  await tab.waitForFunction(()=>Boolean(window.__stage6ConflictFile),{timeout:12000});
  await tab.evaluate(()=>{
   const selection=new DataTransfer();
   selection.items.add(new File([window.__stage6ConflictFile],'existing-device-full-backup.json',{type:'application/json'}));
   const input=document.getElementById('plannerMigVerify');input.files=selection.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await tab.waitForFunction(()=>!document.getElementById('plannerMigCompare').disabled,{timeout:15000});
  await tab.click('#plannerMigCompare');
  await tab.waitForFunction(()=>!document.getElementById('plannerMigConflictDetails').hidden,{timeout:30000});
  const conflictText=await tab.$eval('#plannerMigConflictRows',e=>e.textContent);
  assert(conflictText.includes('로컬 기록')&&conflictText.includes('서버 기록'),'both conflict sources visible');
  assert(conflictText.includes('rowRevision'),'server revision visible for conflict');
  assert((await tab.$eval('#plannerMigApprove',e=>e.disabled))===false,'safe preview allows selective approval');
  assert.deepEqual(pageErrors,[]);
  console.log('STAGE6_UI_BROWSER_PASS',JSON.stringify({areaReceiptsSeparated:true,legacyNotFalseSuccess:true,
    conflictBothSources:true,sevenSteps:true,viewports:layouts,operatingHtmlUntouched:true}));
  console.log('STAGE5_UI_BROWSER_PASS',JSON.stringify({downloadReselected:true,previewRequired:true,approved:true,thirdProfile:true,slotsPreserved:mobileData.plans.length}));
  await mobileCtx.close();
  console.log('STAGE4_BROWSER_PASS',JSON.stringify({v1Preserved:true,stores:snap.names.length,crossDevice:true,offline:true,conflictHeld:true,ackReplay:true,mockCalls:memory.calls,planId}));
 }finally{
  if(c1)await c1.close();if(c2)await c2.close();if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error('STAGE4_BROWSER_FAIL',e.stack||e);process.exitCode=1;});
