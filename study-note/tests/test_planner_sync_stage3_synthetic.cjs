'use strict';
/* Deterministic Stage 3 synthetic Apps Script runner. No external services. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../backend/planner-sync-stage3-isolated.addon.gs'),'utf8');
const HEAD={
 학습계획:['planId','name','start','end','rounds','activeRevision','nextRevision','activeHash','dayCount','slotCount','groupCount','progressSeq','status','createdAt','updatedAt','schemaVersion'],
 학습계획일정:['planId','revision','chunkKey','kind','date','round','partIndex','partCount','payloadJson','chunkHash','stageId','createdAt'],
 학습계획진도:['planId','serverSeq','date','topicId','progressKey','status','previousRevision','rowRevision','operationId','payloadHash','deviceId','planRevision','serverAt','clientAt','source'],
 학습계획작업:['operationId','stageId','planId','action','baseRevision','allocatedRevision','snapshotHash','expectedChunks','receivedChunks','operationPayloadHash','state','resultJson','deviceId','createdAt','expiresAt'],
 테스트토픽:['통합ID','토픽명','학습대상','설명']
};
class Range {
 constructor(sheet,row,col,count,width){Object.assign(this,{sheet,row,col,count:count||1,width:width||1});}
 getValues(){return Array.from({length:this.count},(_,i)=>Array.from({length:this.width},(_,j)=>this.sheet.rows[this.row+i-1]?.[this.col+j-1]??''));}
 getValue(){return this.getValues()[0][0];}
 setValues(vals){assert.equal(vals.length,this.count);vals.forEach((a,i)=>{assert.equal(a.length,this.width);const n=this.row+i-1;while(this.sheet.rows.length<=n)this.sheet.rows.push([]);a.forEach((v,j)=>this.sheet.rows[n][this.col+j-1]=v);});}
 setValue(v){this.setValues([[v]]);}
}
class Sheet {
 constructor(name){this.rows=[HEAD[name].slice()];this.name=name;}
 getRange(row,col,rows,cols){return new Range(this,row,col,rows,cols);}
 getLastRow(){return this.rows.length;}
}
const sheets=Object.fromEntries(Object.keys(HEAD).map(n=>[n,new Sheet(n)]));
sheets.테스트토픽.rows.push(['T0001','합성 데이터','Y','TEST ONLY synthetic']);
const properties={PLANNER_SYNC_MODE:'ISOLATED_TEST',PLANNER_SYNC_TEST_SPREADSHEET_ID:'synthetic-only-123',STUDY_NOTE_SPREADSHEET_ID:'production-inaccessible'};
const ss={getId(){return 'synthetic-only-123';},getName(){return '학습계획 동기화 Stage3 격리시험용 — synthetic';},getSheetByName(n){return sheets[n]??null;}};
const sandbox={
 console,JSON,Math,Date,Number,RegExp,String,Array,Object,Error,Map,Set,parseInt,isNaN,
 SpreadsheetApp:{openById:id=>{assert.equal(id,'synthetic-only-123');return ss;},flush:()=>{}},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||''})},
 Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},computeDigest:(algo,s)=>[...crypto.createHash('sha256').update(s).digest()].map(x=>x>127?x-256:x),newBlob:s=>({getBytes:()=>[...Buffer.from(s)]})},
 LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})}
};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const fn=n=>sandbox['PS3_'+n+'_'];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const ok=(type,method)=>{assert.throws(method,e=>e.code===type,'expected '+type);};
const A={status:'ACTIVE',deviceId:'synthetic-device-a'},B={status:'ACTIVE',deviceId:'synthetic-device-b'};
const now='2026-10-22';const dates=Array.from({length:100},(_,i)=>new Date(Date.UTC(2026,9,22)+i*86400000).toISOString().slice(0,10));
function fixture(id,count,small){
 const name=small?'2-topic-small':'100day-3812-topic';
 const groups=[['G01','Synthetic']];
 const data=dates.map((date,i)=>({date,round:1+Math.floor(i*5/100),entries:[]}));
 let n=0;
 if(small){data[0].entries=[['T0001','G01'],['T0002','G01']];n=2;}
 else {
  for(let pass=0;pass<5;pass++)for(let t=1;t<=3812;t++){
   const day=pass*20+Math.floor((t-1)*20/3812);
   data[day].entries.push(['T'+String(t).padStart(4,'0'),'G01']);n++;
  }
 }
 const canonical=JSON.stringify({id,name,start:dates[0],end:dates.at(-1),rounds:5,groups,days:data});
 const chunks=[];
 function push(kind,date,round,records){
  const raw=[];let pending=[];
  for(const record of records){
   if(Buffer.byteLength(JSON.stringify([...pending,record]),'utf8')>7800&&pending.length){raw.push(pending);pending=[];}
   pending.push(record);
  }
  raw.push(pending);
  raw.forEach((items,i)=>{const payloadJson=JSON.stringify(items);chunks.push({
    chunkKey:kind==='GROUPS'?'GROUPS:'+String(i).padStart(3,'0'):'DAY:'+date+':'+String(i).padStart(3,'0'),
    kind,date:kind==='GROUPS'?'':date,round:kind==='GROUPS'?null:round,
    partIndex:i,partCount:raw.length,payloadJson,chunkHash:hash(payloadJson)
  });});
 }
 push('GROUPS',null,null,groups);
 for(const day of data)push('DAY',day.date,day.round,day.entries);
 return {meta:{planId:id,name,start:dates[0],end:dates.at(-1),rounds:5},hash:hash(canonical),chunks,slots:n};
}
function createPlan(f,device=A,base=0,op='operation-'+f.meta.planId+'-'+base){
 const stage=fn('post')('beginStudyPlanRevision',{operationId:op,planId:f.meta.planId,baseRevision:base,meta:f.meta,snapshotHash:f.hash,expectedChunks:f.chunks.length},device);
 const state={operationId:op,stageId:stage.stageId};
 for(let i=0;i<f.chunks.length;i+=12)fn('post')('putStudyPlanChunks',{...state,chunks:f.chunks.slice(i,i+12)},device);
 return fn('post')('commitStudyPlanRevision',{...state,baseRevision:base,snapshotHash:f.hash},device);
}
const started=Date.now();
assert.equal(fn('get')('studyPlans',{},A).plans.length,0);
const small=fixture('test-small',2,true);
const result=createPlan(small);assert.equal(result.entries,2);assert.equal(result.days,100);assert.equal(result.activeRevision,1);
assert.equal(fn('get')('studyPlans',{},A).plans.length,1);
const pg=fn('get')('studyPlanSchedule',{planId:'test-small',offset:0,limit:40},A);
assert.equal(pg.chunks.length,40);assert.equal(pg.hasMore,true);
ok('AUTH_REQUIRED',()=>fn('get')('studyPlans',{},{}));
properties.PLANNER_SYNC_MODE='PRODUCTION';ok('ISOLATION_REQUIRED',()=>fn('get')('studyPlans',{},A));properties.PLANNER_SYNC_MODE='ISOLATED_TEST';
properties.STUDY_NOTE_SPREADSHEET_ID=properties.PLANNER_SYNC_TEST_SPREADSHEET_ID;
ok('LIVE_BLOCKED',()=>fn('get')('studyPlans',{},A));
properties.STUDY_NOTE_SPREADSHEET_ID='production-inaccessible';
const first={operationId:'progress-op-001',planId:'test-small',date:now,topicId:'T0001',status:'done',expectedRowRevision:0,planRevisionAtWrite:1};
const saved=fn('post')('saveStudyProgress',{changes:[first]},A);assert.equal(saved.applied.length,1);
const duplicate=fn('post')('saveStudyProgress',{changes:[first]},A);assert.equal(duplicate.duplicate.length,1);
ok('OPERATION_REUSE',()=>fn('post')('saveStudyProgress',{changes:[{...first,status:'miss'}]},A));
const conflict=fn('post')('saveStudyProgress',{changes:[{...first,operationId:'progress-op-002',status:'miss'}]},B);assert.equal(conflict.conflicts.length,1);
const miss=fn('post')('saveStudyProgress',{changes:[{...first,operationId:'progress-op-003',topicId:'T0002',status:'miss'}]},A);
assert.equal(miss.applied.length,1);
const reset=fn('post')('saveStudyProgress',{changes:[{...first,operationId:'progress-op-004',status:'todo',expectedRowRevision:1}]},A);
assert.equal(reset.applied.length,1);
assert.equal(sheets.학습계획진도.rows.length,4,'only 3 unique changes');
const cursor=fn('get')('studyProgress',{planId:'test-small',limit:1},A);
assert.equal(cursor.highWatermark,3);
const next=fn('get')('studyProgress',{planId:'test-small',afterSeq:cursor.nextSeq,untilSeq:cursor.highWatermark,limit:30},A);
assert.equal(next.events.length,2);
ok('SLOT_NOT_FOUND',()=>fn('post')('saveStudyProgress',{changes:[{...first,operationId:'progress-op-005',topicId:'T9999'}]},A));
const revise={operationId:'stage-revision-test-small',planId:'test-small',baseRevision:1,meta:small.meta,snapshotHash:small.hash,expectedChunks:small.chunks.length};
const startedStage=fn('post')('beginStudyPlanRevision',revise,A);
const stageArgs={operationId:revise.operationId,stageId:startedStage.stageId};
ok('HASH_MISMATCH',()=>fn('post')('putStudyPlanChunks',{...stageArgs,chunks:[{...small.chunks[0],payloadJson:'[["tampered"]]'}]},A));
assert.equal(fn('get')('studyPlans',{},A).plans.find(p=>p.planId==='test-small').activeRevision,1);
ok('PLAN_STAGE_BUSY',()=>fn('post')('beginStudyPlanRevision',{...revise,operationId:'stage-race-duplicate'},B));
for(let offset=0;offset<small.chunks.length;offset+=12)fn('post')('putStudyPlanChunks',{...stageArgs,chunks:small.chunks.slice(offset,offset+12)},A);
const rev2=fn('post')('commitStudyPlanRevision',{...stageArgs,baseRevision:1,snapshotHash:small.hash},A);
assert.equal(rev2.activeRevision,2);
const replay=fn('post')('commitStudyPlanRevision',{...stageArgs,baseRevision:1,snapshotHash:small.hash},A);
assert.equal(replay.duplicate,true);
assert.equal(fn('get')('studyPlans',{},A).plans.find(p=>p.planId==='test-small').activeRevision,2);

const big=fixture('test-big',19060,false);
assert.equal(big.slots,19060);
const committed=createPlan(big,A);
assert.equal(committed.entries,19060);assert.equal(committed.days,100);assert.equal(committed.activeRevision,1);
const pages=[];let off=0;
while(true){const p=fn('get')('studyPlanSchedule',{planId:'test-big',offset:off,limit:100},A);pages.push(...p.chunks);off=p.nextOffset;if(!p.hasMore)break;}
assert.equal(pages.length,big.chunks.length);
assert.equal(pages.map(x=>x.chunkKey).sort().join('|'),big.chunks.map(x=>x.chunkKey).sort().join('|'));
const updated=fixture('test-big',19060,false);updated.meta.name='altered-name';
ok('REVISION_CONFLICT',()=>fn('post')('beginStudyPlanRevision',{operationId:'competing-op-001',planId:'test-big',baseRevision:0,meta:updated.meta,snapshotHash:updated.hash,expectedChunks:updated.chunks.length},B));
const stats={checks:'PASS',plans:2,days:100,slots:19060,chunks:big.chunks.length,progressEvents:3,elapsedMs:Date.now()-started};
console.log('STAGE3_SYNTHETIC_PASS',JSON.stringify(stats));
