'use strict';
/*
 * Stage 7 synthetic cross-branch contract integration.
 * Uses the isolated Stage 3 Apps Script in-memory emulator + the Stage 6 client.
 * No deployed Apps Script, Google Sheets, authentication secrets or real devices.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
const client=require('../study-planner-sync.js');
const testFile=path.resolve(process.env.STAGE3_TEST_FILE||'.qa-stage3/study-note/tests/test_planner_sync_stage3_synthetic.cjs');
if(!fs.existsSync(testFile))throw Error('Pinned Stage 3 synthetic fixture checkout missing: '+testFile);
const source=fs.readFileSync(testFile,'utf8');

function stage7Assertions(){
 return (async()=>{
  const started=Date.now(),calls={begin:0,put:0,commit:0,get:0,progress:0},bytes={post:0,maxPost:0};
  const client=STAGE7_CLIENT;
  const largeDates=dates.map((date,i)=>({date,round:Math.floor(i/20)+1,ids:[],groups:[]}));
  for(let pass=0;pass<5;pass++)for(let t=1;t<=3812;t++){
   const idx=pass*20+Math.floor((t-1)*20/3812);
   largeDates[idx].ids.push('T'+String(t).padStart(4,'0'));
   largeDates[idx].groups.push('G01');
  }
  const large={id:'stage7-client-large',name:'Stage 7 protocol fixture',start:dates[0],end:dates.at(-1),
   rounds:5,groups:{G01:'Synthetic'},days:largeDates};
  const parts=await client.planChunks(large);
  assert.equal(largeDates.length,100);
  assert.equal(largeDates.reduce((n,d)=>n+d.ids.length,0),19060);
  assert.equal(parts.snapshotHash,await client.sha256(client.canonicalPlan(large)));
  assert(parts.chunks.length>=101);
  assert(parts.chunks.every(x=>Buffer.byteLength(x.payloadJson,'utf8')<=8192),'8KiB chunk contract');
  const op='stage7-client-large-commit';
  const begin={operationId:op,planId:large.id,baseRevision:0,meta:parts.meta,
   snapshotHash:parts.snapshotHash,expectedChunks:parts.chunks.length};
  const record=(kind,action,data)=>{
   const size=Buffer.byteLength(JSON.stringify({action,data}),'utf8');
   bytes.post+=size;bytes.maxPost=Math.max(bytes.maxPost,size);
   calls[kind]++;
   return fn('post')(action,data,A);
  };
  const start=record('begin','beginStudyPlanRevision',begin);
  const stage={operationId:op,stageId:start.stageId};
  for(let i=0;i<parts.chunks.length;i+=12){
   const portion=parts.chunks.slice(i,i+12);
   const done=record('put','putStudyPlanChunks',{...stage,chunks:portion});
   assert(done.ok===true);
  }
  const commit=record('commit','commitStudyPlanRevision',{...stage,baseRevision:0,snapshotHash:parts.snapshotHash});
  assert.equal(commit.activeRevision,1);
  assert.equal(commit.entries,19060);
  const returned=fn('get')('studyPlans',{},A);calls.get++;
  const summary=returned.plans.find(x=>x.planId===large.id);
  assert(summary&&summary.activeHash===parts.snapshotHash);
  let offset=0;const chunks=[];
  do{
   const page=fn('get')('studyPlanSchedule',{planId:large.id,revision:1,offset,limit:100},A);calls.get++;
   assert.equal(page.hash,parts.snapshotHash);
   chunks.push(...page.chunks);
   if(!page.hasMore)break;
   assert(page.nextOffset>offset);offset=page.nextOffset;
  }while(chunks.length<5000);
  assert.equal(chunks.length,parts.chunks.length);
  const restored=await client.parseChunks(summary,chunks);
  assert.equal(restored.days.length,100);
  assert.equal(restored.entries,19060);
  assert.equal(client.canonicalPlan(restored),client.canonicalPlan(large));
  const sample={operationId:'stage7-progress-000001',planId:large.id,date:dates[0],topicId:'T0001',
   status:'done',expectedRowRevision:0,planRevisionAtWrite:1,clientAt:'2026-11-14T00:00:00.000Z'};
  const first=record('progress','saveStudyProgress',{changes:[sample]});
  assert.equal(first.applied.length,1);
  const again=record('progress','saveStudyProgress',{changes:[sample]});
  assert.equal(again.duplicate.length,1,'lost ACK retry must be idempotent');
  const race=record('progress','saveStudyProgress',{changes:[{...sample,operationId:'stage7-progress-000002',status:'miss'}]});
  assert.equal(race.conflicts.length,1,'concurrent edit must be held');
  const reset=record('progress','saveStudyProgress',{changes:[{...sample,operationId:'stage7-progress-000003',status:'todo',expectedRowRevision:1}]});
  assert.equal(reset.applied.length,1,'explicit todo tombstone');
  const page1=fn('get')('studyProgress',{planId:large.id,afterSeq:0,limit:1},A);calls.get++;
  assert.equal(page1.highWatermark,2);
  const page2=fn('get')('studyProgress',{planId:large.id,afterSeq:page1.nextSeq,
   untilSeq:page1.highWatermark,limit:300},B);calls.get++;
  assert.equal(page2.events[0].status,'todo');
  assert.equal(page2.nextSeq,2);
  const blocked={status:'INACTIVE',deviceId:'test'},notDevice={status:'ACTIVE',deviceId:''};
  assert.throws(()=>fn('get')('studyPlans',{},blocked),e=>e.code==='AUTH_REQUIRED');
  assert.throws(()=>fn('get')('studyPlans',{},notDevice),e=>e.code==='AUTH_REQUIRED');

  // A corrupted mixed-round multi-part DAY chunk must never be committed.
  // A commit that succeeds here makes the server accept a revision the client cannot read.
  const firstDay={date:dates[0],round:1,ids:[],groups:[]};
  for(let t=1;t<=700;t++){
   firstDay.ids.push('T'+String(t).padStart(4,'0'));firstDay.groups.push('G01');
  }
  const mixed={id:'stage7-round-guard',name:'Cross-part round integrity',start:dates[0],end:dates[1],
   rounds:5,groups:{G01:'Synthetic'},days:[firstDay,{date:dates[1],round:2,ids:['T0701'],groups:['G01']}]};
  const mp=await client.planChunks(mixed);
  const multi=mp.chunks.filter(x=>x.kind==='DAY'&&x.date===dates[0]);
  assert(multi.length>=2,'fixture must have a multipart DAY');
  const changed=mp.chunks.map(x=>({...x}));
  const second=changed.find(x=>x.kind==='DAY'&&x.date===dates[0]&&x.partIndex===1);
  second.round=2;
  const badOp='stage7-round-guard-001';
  const bs=fn('post')('beginStudyPlanRevision',{operationId:badOp,planId:mixed.id,baseRevision:0,
   meta:mp.meta,snapshotHash:mp.snapshotHash,expectedChunks:changed.length},A);
  let rejected=false;
  try{
   for(let i=0;i<changed.length;i+=12){
    fn('post')('putStudyPlanChunks',{operationId:badOp,stageId:bs.stageId,chunks:changed.slice(i,i+12)},A);
   }
   fn('post')('commitStudyPlanRevision',{operationId:badOp,stageId:bs.stageId,
    baseRevision:0,snapshotHash:mp.snapshotHash},A);
  }catch(e){
   if(['BAD_ROUND','BAD_CHUNK','BAD_CHUNKS'].includes(e.code))rejected=true;
   else throw e;
  }
  assert(rejected,'MIXED_DAY_ROUND_ACCEPTED: backend committed inconsistent round parts');
  const after=fn('get')('studyPlans',{},A);
  assert(!after.plans.some(x=>x.planId===mixed.id),'rejected revision must stay inactive');
  console.log('STAGE7_CROSS_BRANCH_SYNTHETIC_PASS',JSON.stringify({
   days:100,uniqueTopics:3812,slots:19060,chunks:parts.chunks.length,calls,bytes,
   mockElapsedMs:Date.now()-started,source:'Node VM in-memory Sheets only',
   crossBranchHash:true,roundPartGuard:true,hmacNonceActual:'UNVERIFIED',
   realAppsScript:'UNVERIFIED',realSheetsLatency:'UNVERIFIED',userDevices:'UNVERIFIED'
  }));
 })();
}
const context={
 console,require,process,Buffer,__dirname:path.dirname(testFile),__filename:testFile,STAGE7_CLIENT:client
};
vm.createContext(context);
vm.runInContext(source+'\nglobalThis.STAGE7_PROMISE=('+stage7Assertions.toString()+')();',context,
 {filename:testFile,timeout:120000});
Promise.resolve(context.STAGE7_PROMISE).catch(e=>{
 console.error('STAGE7_CROSS_BRANCH_SYNTHETIC_FAIL',e&&e.stack||e);
 process.exitCode=1;
});
