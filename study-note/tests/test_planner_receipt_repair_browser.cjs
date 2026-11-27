'use strict';
// Isolated Chromium and synthetic server only. No live plan, credentials or user browser profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const puppeteer=require('../../.qa-browser/node_modules/puppeteer-core');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 const files={'/sync.js':'study-planner-sync.js','/migration.js':'study-planner-migration.js'};
 if(files[pathname]){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(fs.readFileSync(path.join(root,files[pathname])));return;}
 if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><meta charset="utf-8"><script src="/sync.js"></script><script src="/migration.js"></script>');return;}
 res.writeHead(404);res.end();
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--no-first-run','--disable-background-networking']});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const result=await page.evaluate(async()=>{
   const eq=(a,b,msg)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(msg+': '+JSON.stringify(a)+' != '+JSON.stringify(b));};
   const C=window.PEPlannerSyncClient,M=window.PEPlannerMigration;
   const plan={id:'synthetic-three-rounds',name:'Synthetic 3 rounds',start:'2026-11-28',end:'2026-11-30',rounds:3,groups:{G01:'Test'},days:[1,2,3].map((round,i)=>({date:'2026-11-'+(28+i),round,ids:['T0001'],groups:['G01']})),entries:3};
   const p=await C.planChunks(plan),summary={...p.meta,activeRevision:1,activeHash:p.snapshotHash};
   let posts=0;
   const transport={get:async(action,data={})=>{
    if(action==='studyPlans')return {ok:true,plannerSyncVersion:1,plans:[summary]};
    if(action==='studyPlanSchedule')return {ok:true,revision:1,hash:p.snapshotHash,chunks:p.chunks,hasMore:false};
    if(action==='studyProgress')return {ok:true,events:[],hasMore:false,highWatermark:0};
    throw Error('unexpected GET '+action);
   },post:async()=>{posts++;throw Error('unexpected remote write');}};
   window.PE_PLANNER_SYNC_TEST_ENABLED=true;window.PE_PLANNER_SYNC_TEST_TRANSPORT=transport;
   const stores=['plans','progress','syncMeta','pendingOps','syncConflicts','preSyncSnapshots'];
   const open=name=>new Promise((resolve,reject)=>{const r=indexedDB.open(name,2);r.onupgradeneeded=()=>{for(const s of stores)r.result.createObjectStore(s,{keyPath:s==='progress'||s==='syncMeta'?'key':'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   const write=(db,s,rows)=>new Promise((resolve,reject)=>{const t=db.transaction(s,'readwrite');for(const r of rows)t.objectStore(s).put(r);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});
   const all=(db,s)=>new Promise((resolve,reject)=>{const r=db.transaction(s).objectStore(s).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   const old='2026-11-27T09:00:00.000Z',recent='2026-11-27T10:00:00.000Z';
   const receipt=(key,at)=>({key,at});
   const rows=Array.from({length:4},(_,i)=>{const key=i<2?'lastPlanSyncAt':'lastProgressSyncAt';return {id:'restore:'+String(i+1).padStart(32,'0')+':syncMeta:'+key,kind:'restore',store:'syncMeta',key,local:receipt(key,recent),backup:receipt(key,old),reason:'RESTORE_COLLISION',at:recent};});
   const genuine={id:'progress:some-key',kind:'progress',key:'some-key',local:{status:'done'},remote:{status:'miss'}};
   const unknown={...rows[0],id:'restore:'+String(9).padStart(32,'0')+':syncMeta:lastPlanSyncAt',local:{...rows[0].local,unrecognized:true}};
   for(const row of rows)eq(M.isReceiptRestoreCollision(row),true,'strict match');
   for(const row of [genuine,unknown])eq(M.isReceiptRestoreCollision(row),false,'preserve unknown');
   const approvals={uploadPlans:false,downloadPlans:true,uploadProgress:false,downloadProgress:true};
   const prepare=async db=>{const f=await M.backup(db),snap=await M.storeBackup(db,f);await M.confirmBackup(db,snap.id,f);await M.compare(db,snap.id,transport);return snap.id;};
   // Same shape as the reported four receipt collisions; preserve both timestamps.
   const pc=await open('receipt-pc');
   await write(pc,'plans',[plan]);await write(pc,'syncConflicts',rows);await write(pc,'syncMeta',[{key:'migration',state:'required'},receipt('lastPlanSyncAt',recent),receipt('lastProgressSyncAt',recent)]);
   const saved=await M.backup(pc);eq(saved.counts.conflicts,4,'original backup count');await M.verifyBackup(saved);
   const pid=await prepare(pc),done=await M.apply(pc,pid,approvals,transport,true);
   eq(done.ready,true,'PC verified');eq((await C.status(pc)).conflicts,0,'four resolved');
   eq(await all(pc,'plans'),[plan],'plan unchanged');eq(await all(pc,'progress'),[],'progress unchanged');eq(await all(pc,'pendingOps'),[],'outbox unchanged');
   eq((await all(pc,'preSyncSnapshots')).filter(x=>x.state==='RECEIPT_COLLISIONS_ARCHIVED').flatMap(x=>x.records),rows,'archive exact records');
   eq((await all(pc,'syncMeta')).find(x=>x.key==='lastPlanSyncAt').at,recent,'receipt unchanged by migration');
   // Tablet contains no plan: verified download only.
   const tablet=await open('receipt-tablet'),tid=await prepare(tablet);
   eq((await M.apply(tablet,tid,approvals,transport,true)).ready,true,'tablet ready');
   const downloaded=(await all(tablet,'plans'))[0];eq(await C.sha256(C.canonicalPlan(downloaded)),p.snapshotHash,'tablet plan matches');
   // Restoring old data is local only; no imported receipt proof, no new false conflict.
   const restore=await open('receipt-restore');await write(restore,'syncMeta',[receipt('lastPlanSyncAt',old)]);
   const restored=await M.restore(restore,saved,true);eq(restored.conflicts,0,'restore no false conflicts');
   eq(await all(restore,'syncConflicts'),[],'old receipt conflicts not reactivated');
   eq((await all(restore,'syncMeta')).find(x=>x.key==='lastPlanSyncAt').at,old,'current receipt not overwritten');
   eq((await all(restore,'syncMeta')).some(x=>x.key==='lastProgressSyncAt'),false,'foreign receipt not imported');
   eq((await all(restore,'preSyncSnapshots')).filter(x=>x.state==='RECEIPT_COLLISIONS_ARCHIVED').flatMap(x=>x.records),rows,'restore archive');
   // Already integrated device: real or unfamiliar collisions stay active.
   const ready=await open('receipt-ready');await write(ready,'plans',[plan]);await write(ready,'syncMeta',[{key:'migration',state:'ready'}]);await write(ready,'syncConflicts',[...rows,genuine,unknown]);
   await write(ready,'preSyncSnapshots',[{id:'migration:synthetic',state:'BACKUP_PREPARED',createdAt:recent}]);
   eq(await M.archiveReceiptConflicts(ready),0,'pending backup protected');
   eq((await all(ready,'syncConflicts')).length,6,'no early deletion');
   await write(ready,'preSyncSnapshots',[{id:'migration:synthetic',state:'SYNC_READY',createdAt:recent}]);
   const status=await C.sync(ready,transport);
   eq(status.conflicts,2,'real and unknown retained');eq((await all(ready,'syncConflicts')).map(x=>x.id).sort(),[genuine.id,unknown.id].sort(),'exact retained ids');
   eq(await M.archiveReceiptConflicts(ready),0,'idempotent cleanup');
   eq(posts,0,'no remote mutation');
   for(const db of [pc,tablet,restore,ready])db.close();
   return {receiptArchived:4,tabletHashMatches:true,realConflictsRetained:2,restoreNoNewConflicts:true,backupProtected:true,serverWrites:posts};
  });
  assert.equal(result.receiptArchived,4);console.log('RECEIPT_REPAIR_CHROMIUM_PASS',JSON.stringify(result));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
