'use strict';
/* No LIVE data, Apps Script or real devices. Stage5 deterministic IndexedDB + simulated server. */
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
globalThis.location={hostname:'127.0.0.1'};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
globalThis.PE_PLANNER_SYNC_TEST_ENABLED=true;
globalThis.PE_PLANNER_SYNC_TEST_TRANSPORT={get:async()=>({ok:false}),post:async()=>({ok:false})};
const {indexedDB}=require('../../.qa-browser/node_modules/fake-indexeddb');
globalThis.indexedDB=indexedDB;
const client=require('../study-planner-sync.js');
const mig=require('../study-planner-migration.js');
const names=['plans','progress','syncMeta','pendingOps','syncConflicts','preSyncSnapshots'];
function dbOpen(name){
 return new Promise((resolve,reject)=>{
  const r=indexedDB.open(name,2);
  r.onupgradeneeded=()=>{for(const [n,k] of [['plans','id'],['progress','key'],['syncMeta','key'],['pendingOps','id'],['syncConflicts','id'],['preSyncSnapshots','id']])if(!r.result.objectStoreNames.contains(n))r.result.createObjectStore(n,{keyPath:k});};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
}
function write(db,store,row){return new Promise((resolve,reject)=>{
 const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
});}
function all(db,store){return new Promise((resolve,reject)=>{
 const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});}
function basePlan(id='same-plan'){
 return {id,name:'합성 3일 계획',start:'2026-11-13',end:'2026-11-15',rounds:3,groups:{G01:'합성 그룹'},days:[
 {date:'2026-11-13',round:1,ids:['T0001'],groups:['G01']},
 {date:'2026-11-14',round:2,ids:['T0001'],groups:['G01']},
 {date:'2026-11-15',round:3,ids:['T0001'],groups:['G01']}],entries:3};
}
function extend(plan,topic,date){
 const p=JSON.parse(JSON.stringify(plan)),day=p.days.find(d=>d.date===date);
 day.ids.push(topic);day.groups.push('G01');p.entries++;return p;
}
function progress(plan,date,topic,status){
 return {key:plan+'|'+date+'|'+topic,planId:plan,date,topicId:topic,status,updatedAt:'2026-11-13T14:00:00.000Z'};
}
class Server{
 constructor(){this.plans=new Map();this.progress=new Map();this.stages=new Map();this.op=new Map();this.calls=0;this.drop=null;}
 async seed(plan){
  const p=await client.planChunks(plan);this.plans.set(plan.id,{plan,meta:p.meta,hash:p.snapshotHash,rev:1,chunks:p.chunks});
 }
 async seedEvent(row){
  const r=this.progress.get(row.planId)||[],evt={serverSeq:r.length+1,progressKey:row.key,date:row.date,topicId:row.topicId,status:row.status,rowRevision:1,operationId:'server-seed-'+r.length,serverAt:new Date().toISOString()};
  r.push(evt);this.progress.set(row.planId,r);
 }
 async get(action,data={}){
  this.calls++;const a=action.toLowerCase();
  if(a==='studyplans')return {ok:true,plannerSyncVersion:1,plans:[...this.plans.values()].map(p=>({planId:p.meta.planId,name:p.meta.name,start:p.meta.start,end:p.meta.end,rounds:p.meta.rounds,activeRevision:p.rev,activeHash:p.hash}))};
  if(a==='studyplanschedule'){
   const p=this.plans.get(data.planId);assert(p);
   const arr=p.chunks.slice().sort((x,y)=>x.chunkKey.localeCompare(y.chunkKey)),n=data.limit||100,offset=data.offset||0;
   return {ok:true,revision:p.rev,hash:p.hash,chunks:arr.slice(offset,offset+n),hasMore:arr.length>offset+n,nextOffset:Math.min(arr.length,offset+n)};
  }
  if(a==='studyprogress'){
   const arr=this.progress.get(data.planId)||[],high=data.untilSeq??arr.length;
   const found=arr.filter(e=>e.serverSeq>(data.afterSeq||0)&&e.serverSeq<=high),n=data.limit||300;
   return {ok:true,events:found.slice(0,n),hasMore:found.length>n,nextSeq:found.length?found[Math.min(n,found.length)-1].serverSeq:(data.afterSeq||0),highWatermark:high};
  }
  throw Error('Unexpected GET '+action);
 }
 async post(action,data){
  this.calls++;const a=action.toLowerCase();let result;
  if(a==='beginstudyplanrevision'){
   const old=this.stages.get(data.operationId);
   if(old)result={ok:true,stageId:old.stageId,allocatedRevision:old.rev,duplicate:true};
   else{
    const p=this.plans.get(data.planId);assert.equal(data.baseRevision,p?.rev||0,'base revision CAS');
    const stage={stageId:'stage-'+data.operationId,operationId:data.operationId,planId:data.planId,meta:data.meta,hash:data.snapshotHash,count:data.expectedChunks,rev:(p?.rev||0)+1,chunks:new Map(),committed:false};
    this.stages.set(data.operationId,stage);result={ok:true,stageId:stage.stageId,allocatedRevision:stage.rev};
   }
  }else if(a==='putstudyplanchunks'){
   const stage=this.stages.get(data.operationId);assert(stage);
   for(const c of data.chunks)stage.chunks.set(c.chunkKey,c);
   result={ok:true,received:stage.chunks.size};
  }else if(a==='commitstudyplanrevision'){
   const stage=this.stages.get(data.operationId);assert(stage);
   if(stage.committed)result={ok:true,activeRevision:stage.rev,activeHash:stage.hash,duplicate:true};
   else{
    assert.equal(stage.count,stage.chunks.size);
    const chunks=[...stage.chunks.values()];
    const summary={planId:stage.planId,...stage.meta,activeHash:stage.hash,activeRevision:stage.rev};
    const parsed=await client.parseChunks(summary,chunks);
    this.plans.set(stage.planId,{plan:parsed,meta:stage.meta,hash:stage.hash,rev:stage.rev,chunks});
    stage.committed=true;result={ok:true,activeRevision:stage.rev,activeHash:stage.hash};
   }
  }else if(a==='savestudyprogress'){
   result={ok:true,applied:[],duplicate:[],conflicts:[]};
   for(const c of data.changes){
    if(this.op.has(c.operationId)){
     const old=this.op.get(c.operationId);assert.deepEqual(c,old.request,'same operationId stable payload');result.duplicate.push(old.ack);continue;
    }
    const plan=this.plans.get(c.planId);assert(plan);
    const list=this.progress.get(c.planId)||[],key=c.planId+'|'+c.date+'|'+c.topicId,old=list.filter(x=>x.progressKey===key).at(-1);
    if(old||c.expectedRowRevision!==0||c.planRevisionAtWrite!==plan.rev){
     result.conflicts.push({operationId:c.operationId,progressKey:key,serverStatus:old?.status,serverRowRevision:old?.rowRevision||0});continue;
    }
    const evt={serverSeq:list.length+1,progressKey:key,date:c.date,topicId:c.topicId,status:c.status,rowRevision:1,operationId:c.operationId,serverAt:new Date().toISOString()};
    list.push(evt);this.progress.set(c.planId,list);
    const ack={operationId:c.operationId,serverSeq:evt.serverSeq,rowRevision:1};this.op.set(c.operationId,{request:c,ack});result.applied.push(ack);
   }
  }else throw Error('Unexpected POST '+action);
  if(this.drop===a){this.drop=null;throw Error('SYNTHETIC_ACK_LOST');}
  return result;
 }
}
function selections(){return {uploadPlans:true,downloadPlans:true,uploadProgress:true,downloadProgress:true};}
async function prepared(db,srv,base=[]){
 const file=await mig.backup(db);
 const saved=await mig.storeBackup(db,file);
 await mig.confirmBackup(db,saved.id,JSON.parse(JSON.stringify(file)));
 return {file,id:saved.id,preview:await mig.compare(db,saved.id,srv,base)};
}
(async()=>{
 // Backup is a full consistent snapshot; no backup file confirmation => no server calls.
 const base=basePlan('seed-plan'),pc=await dbOpen('stage5-pc');
 await write(pc,'plans',base);
 const done=progress(base.id,'2026-11-13','T0001','done');await write(pc,'progress',done);
 await write(pc,'pendingOps',{id:'old-pending-001',kind:'progress',planId:'unrelated-plan',key:'unrelated-plan|2026-11-13|T0001',state:'conflict',createdAt:'2026-11-13T00:00:00.000Z'});
 const server=new Server();
 const backupFile=await mig.backup(pc),saved=await mig.storeBackup(pc,backupFile);
 const before=server.calls;
 await assert.rejects(mig.compare(pc,saved.id,server),/백업/);
 assert.equal(server.calls,before,'no remote GET without file proof');
 await assert.rejects(mig.apply(pc,saved.id,selections(),server),/백업 검증/);
 const forged=JSON.parse(JSON.stringify(backupFile));forged.data.progress[0].status='miss';
 await assert.rejects(mig.verifyBackup(forged),/해시/);
 await mig.confirmBackup(pc,saved.id,JSON.parse(JSON.stringify(backupFile)));
 const preview=await mig.compare(pc,saved.id,server);
 assert.equal(preview.counts.planUploads,1);
 assert.equal(preview.counts.progressUploads,1);
 // Old unrelated pending must not be silently erased; state is held until resolved.
 const first=await mig.apply(pc,saved.id,selections(),server,true);
 assert.equal(first.ready,false);
 assert.equal(first.pending,1);
 assert.equal((await mig.state(pc)).state,'conflict_held');
 assert.equal(server.plans.get(base.id).rev,1);
 assert.equal(server.progress.get(base.id)[0].status,'done');
 assert.equal((await all(pc,'progress')).find(x=>x.key===done.key).status,'done');
 assert((await all(pc,'pendingOps')).some(x=>x.id==='old-pending-001'));
 // A fresh device with no prior records downloads the shared plan and day-specific progress.
 const fresh=await dbOpen('stage5-empty-device');
 const f=await prepared(fresh,server);
 assert.equal(f.preview.counts.planDownloads,1);assert.equal(f.preview.counts.progressDownloads,1);
 const synced=await mig.apply(fresh,f.id,selections(),server,true);
 assert.equal(synced.ready,true);
 assert.equal((await all(fresh,'plans')).length,1);
 assert.equal((await all(fresh,'progress'))[0].status,'done');
 assert.equal((await mig.state(fresh)).state,'ready');
 // Other device contains a different state for same key; must preserve BOTH and upload nothing conflicting.
 const tablet=await dbOpen('stage5-tablet');await write(tablet,'plans',base);
 await write(tablet,'progress',{...done,status:'miss'});
 await write(tablet,'progress',progress(base.id,'2026-11-14','T0001','done'));
 const t=await prepared(tablet,server,[base]);assert.equal(t.preview.counts.conflicts,1);
 const tFinal=await mig.apply(tablet,t.id,selections(),server,true);
 assert.equal(tFinal.ready,false);
 assert.equal((await all(tablet,'progress')).find(x=>x.key===done.key).status,'miss');
 const held=(await all(tablet,'syncConflicts')).find(x=>x.key===done.key);
 assert.equal(held.local.status,'miss');assert.equal(held.remote.status,'done');
 assert.equal(server.progress.get(base.id).find(x=>x.date==='2026-11-13').status,'done');
 assert.equal(server.progress.get(base.id).find(x=>x.date==='2026-11-14').status,'done');
 // Verified restoration must never overwrite an existing progress or plan, even if caller confirms.
 const restoreTarget=await dbOpen('stage5-restore');
 await write(restoreTarget,'progress',{...done,status:'miss'});
 const r=await mig.restore(restoreTarget,backupFile,true);
 assert.equal(r.restored.plans,1);assert(r.conflicts>=1);
 assert.equal((await all(restoreTarget,'progress')).find(x=>x.key===done.key).status,'miss');
 assert.equal((await mig.state(restoreTarget)).state,'required');
 // A three-way merge accepts only additive, disjoint changes from an actual common ancestor.
 const common=basePlan('three-way');
 const local=extend(common,'T0002','2026-11-13'),rem=extend(common,'T0003','2026-11-14');
 assert(mig.additive(common,local));assert(mig.additive(common,rem));
 const union=mig.mergeAdditions(common,local,rem);
 assert.equal(union.entries,5);
 assert.equal(mig.mergeAdditions(common,extend(common,'T0002','2026-11-13'),extend(common,'T0002','2026-11-14')),null);
 const another=new Server();await another.seed(rem);
 const third=await dbOpen('stage5-merge');await write(third,'plans',local);
 const stage=await prepared(third,another,[common]);
 assert.equal(stage.preview.planActions[0].kind,'merge-upload');
 const merged=await mig.apply(third,stage.id,selections(),another,true);
 assert.equal(merged.ready,true);
 assert.equal(another.plans.get(common.id).rev,2);
 assert.equal((await all(third,'plans'))[0].entries,5);
 // Conflicting dates for same new topic must stay held, not unioned.
 const badServer=new Server();await badServer.seed(extend(common,'T0002','2026-11-14'));
 const bad=await dbOpen('stage5-schedule-conflict');await write(bad,'plans',extend(common,'T0002','2026-11-13'));
 const bp=await prepared(bad,badServer,[common]);assert.equal(bp.preview.counts.conflicts,1);
 const blocked=await mig.apply(bad,bp.id,selections(),badServer,true);
 assert.equal(blocked.ready,false);
 assert.equal(badServer.plans.get(common.id).rev,1);
 assert((await all(bad,'syncConflicts')).some(x=>x.kind==='plan'));
 // A server commit succeeded but ACK disappeared: retry with identical durable operationId.
 const failServer=new Server(),fail=await dbOpen('stage5-retry');await write(fail,'plans',basePlan('retry-plan'));
 const retry=await prepared(fail,failServer);
 failServer.drop='commitstudyplanrevision';
 await assert.rejects(mig.apply(fail,retry.id,selections(),failServer,true),/SYNTHETIC_ACK_LOST/);
 assert.equal((await mig.state(fail)).state,'pending_retry');
 await assert.rejects(mig.cancel(fail,retry.id),/취소할 수 없습니다/);
 assert.equal(failServer.plans.get('retry-plan').rev,1);
 const replay=await mig.apply(fail,retry.id,selections(),failServer,true);
 assert.equal(replay.ready,true);
 assert.equal(failServer.plans.get('retry-plan').rev,1);
 const ids=[...failServer.stages.keys()];assert.equal(ids.length,1);
 // A browser process may close after persisting UPLOADING but before the first API request.
 const crashServer=new Server(),crashed=await dbOpen('stage5-browser-crash');
 await write(crashed,'plans',basePlan('crash-plan'));
 const cr=await prepared(crashed,crashServer);
 const pre=await new Promise((resolve,reject)=>{
  const r=crashed.transaction('preSyncSnapshots').objectStore('preSyncSnapshots').get(cr.id);
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
 await write(crashed,'preSyncSnapshots',{...pre,state:'UPLOADING',approvedAt:new Date().toISOString(),approval:selections(),journal:cr.preview.journal});
 const afterCrash=await mig.apply(crashed,cr.id,selections(),crashServer);
 assert.equal(afterCrash.ready,true);
 assert.equal(crashServer.plans.get('crash-plan').rev,1);
 // Changing local data after a backup but before file proof blocks that proof.
 const stale=await dbOpen('stage5-stale');await write(stale,'plans',basePlan('stale-plan'));
 const staleFile=await mig.backup(stale),sref=await mig.storeBackup(stale,staleFile);
 await write(stale,'progress',progress('stale-plan','2026-11-15','T0001','miss'));
 await assert.rejects(mig.confirmBackup(stale,sref.id,staleFile),/새 백업/);
 // Cancellation before upload is local-only and cannot mutate the remote.
 const cancelServer=new Server(),cancelDb=await dbOpen('stage5-cancel');await write(cancelDb,'plans',basePlan('cancel-plan'));
 const cancel=await prepared(cancelDb,cancelServer);
 const beforeCancel=cancelServer.calls;await mig.cancel(cancelDb,cancel.id);
 assert.equal(cancelServer.calls,beforeCancel);assert.equal((await mig.state(cancelDb)).state,'local_only');
 // Outside the synthetic loopback gate everything is blocked.
 globalThis.PE_PLANNER_SYNC_TEST_ENABLED=false;
 await assert.rejects(mig.backup(cancelDb),/격리/);
 assert.deepEqual([...names].sort(),['plans','progress','syncMeta','pendingOps','syncConflicts','preSyncSnapshots'].sort());
 console.log('STAGE5_MIGRATION_PASS',JSON.stringify({verifiedBackup:true,tamperRejected:true,firstSyncBlockedWithoutProof:true,
  remoteImport:true,progressConflictHeld:true,localRestoreNeverOverwrites:true,threeWayAdditive:true,
  divergedScheduleHeld:true,ackLostReplay:true,staleBackupRejected:true,cancelNoRemoteWrite:true,operationReplay:ids[0]}));
})().catch(e=>{console.error('STAGE5_MIGRATION_FAIL',e.stack||e);process.exitCode=1;});
