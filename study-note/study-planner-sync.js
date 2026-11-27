/* Cross-device planner sync. Signed production is enabled only after a verified handshake.
 * First migration must be approved before regular server writes or local merges.
 */
(function (root) {
'use strict';
const STORES={plan:'plans',progress:'progress',meta:'syncMeta',outbox:'pendingOps',conflict:'syncConflicts',backup:'preSyncSnapshots'};
const VERSION=1, CHUNK_BYTES=7800;
function clone(x){return JSON.parse(JSON.stringify(x));}
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('IndexedDB 요청 오류'));});}
function transaction(db,names,mode,write){
 return new Promise((resolve,reject)=>{
  let answer;const tx=db.transaction(names,mode);let failed=false;
  tx.oncomplete=()=>resolve(answer);
  tx.onerror=()=>{if(!failed){failed=true;reject(tx.error||Error('IndexedDB 거래 오류'));}};
  tx.onabort=()=>{if(!failed){failed=true;reject(tx.error||Error('IndexedDB 거래 취소'));}};
  try{write(tx,x=>{answer=x;});}catch(error){failed=true;try{tx.abort();}catch(_){}reject(error);}
 });
}
function get(db,store,key){return request(db.transaction(store,'readonly').objectStore(store).get(key));}
function all(db,store){return request(db.transaction(store,'readonly').objectStore(store).getAll());}
function save(db,store,item){return transaction(db,[store],'readwrite',tx=>{tx.objectStore(store).put(item);});}
function erase(db,store,id){return transaction(db,[store],'readwrite',tx=>{tx.objectStore(store).delete(id);});}
function uuid(){
 if(root.crypto&&typeof root.crypto.randomUUID==='function')return root.crypto.randomUUID();
 if(!root.crypto||!root.crypto.getRandomValues)throw Error('안전한 작업 ID를 생성할 수 없습니다.');
 const b=new Uint8Array(16);root.crypto.getRandomValues(b);
 return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function operationId(){return 'op-'+uuid();}
function now(){return new Date().toISOString();}
function isDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
function checkPlan(p){
 if(!p||!(/^[A-Za-z0-9_.-]{2,80}$/).test(p.id)||!Array.isArray(p.days)||!p.days.length||!p.groups)throw Error('학습계획 구조 오류');
 const days=p.days.slice().sort((a,b)=>a.date.localeCompare(b.date));
 const rounds=Number(p.rounds||Math.max(1,...days.map(d=>Number(d.round)||0)));
 if(!Number.isInteger(rounds)||rounds<1||rounds>30)throw Error('회독 수가 잘못되었습니다.');
 const start=p.start||days[0].date,end=p.end||days[days.length-1].date;
 if(!isDate(start)||!isDate(end)||start!==days[0].date||end!==days[days.length-1].date)throw Error('계획 기간이 잘못되었습니다.');
 const unique=new Set();
 for(let i=0;i<days.length;i++){
  const d=days[i];
  if(!isDate(d.date)||unique.has(d.date)||!Array.isArray(d.ids)||!Array.isArray(d.groups)||d.ids.length!==d.groups.length)throw Error('일정이 중복되었거나 손상되었습니다.');
  if(i&&Date.parse(d.date+'T00:00:00Z')-Date.parse(days[i-1].date+'T00:00:00Z')!==86400000)throw Error('계획 날짜가 연속되지 않습니다.');
  if(d.round!=null&&(!Number.isInteger(d.round)||d.round<1||d.round>rounds))throw Error('회독 범위 오류');
  const within=new Set();
  d.ids.forEach((id,j)=>{if(!/^T\d{4}$/.test(id)||!Object.prototype.hasOwnProperty.call(p.groups,d.groups[j])||within.has(id))throw Error('통합ID/그룹/중복 오류');within.add(id);});
  unique.add(d.date);
 }
 return {id:p.id,name:p.name||p.id,start,end,rounds,days};
}
function canonicalPlan(p){
 const v=checkPlan(p),keys=Object.keys(p.groups).sort();
 const canonical={id:v.id,name:v.name,start:v.start,end:v.end,rounds:v.rounds,
  groups:keys.map(key=>[key,p.groups[key]]),
  days:v.days.map(d=>({date:d.date,round:d.round==null?null:d.round,entries:d.ids.map((id,j)=>[id,d.groups[j]])}))};
 return JSON.stringify(canonical);
}
async function sha256(text){
 if(!root.crypto?.subtle)throw Error('SHA-256 실행 환경이 없습니다.');
 const b=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function slices(records){
 const result=[];let batch=[];
 for(const row of records){
  const test=JSON.stringify(batch.concat([row]));
  if(new TextEncoder().encode(test).length>CHUNK_BYTES&&batch.length){result.push(batch);batch=[];}
  batch.push(row);
  if(new TextEncoder().encode(JSON.stringify(batch)).length>8192)throw Error('단일 학습 데이터가 서버 청크 제한을 초과합니다.');
 }
 result.push(batch);return result;
}
async function planChunks(p){
 const v=checkPlan(p),chunks=[],groups=Object.keys(p.groups).sort().map(k=>[k,p.groups[k]]);
 async function add(kind,date,round,rows){
  const parts=slices(rows);
  for(let i=0;i<parts.length;i++){
   const payloadJson=JSON.stringify(parts[i]);
   chunks.push({chunkKey:(kind==='GROUPS'?'GROUPS:':('DAY:'+date+':'))+String(i).padStart(3,'0'),
    kind,date:kind==='GROUPS'?'':date,round:kind==='GROUPS'?null:round,
    partIndex:i,partCount:parts.length,payloadJson,chunkHash:await sha256(payloadJson)});
  }
 }
 await add('GROUPS','',null,groups);
 for(const day of v.days)await add('DAY',day.date,day.round,day.ids.map((id,j)=>[id,day.groups[j]]));
 return {meta:{planId:v.id,name:v.name,start:v.start,end:v.end,rounds:v.rounds},
  chunks,snapshotHash:await sha256(canonicalPlan(p))};
}
async function parseChunks(summary,chunks){
 const groupsParts=new Map(),daysParts=new Map(),seen=new Set();
 for(const c of chunks){
  if(!c||!c.chunkKey||seen.has(c.chunkKey))throw Error('중복 또는 빈 일정 청크');
  seen.add(c.chunkKey);
  if(await sha256(c.payloadJson)!==c.chunkHash)throw Error('일정 청크 SHA-256 손상');
  if(!Number.isInteger(Number(c.partIndex))||!Number.isInteger(Number(c.partCount))||Number(c.partIndex)<0||Number(c.partIndex)>=Number(c.partCount))throw Error('청크 분할 번호 오류');
  const rows=JSON.parse(c.payloadJson);if(!Array.isArray(rows))throw Error('청크 내용 오류');
  const key=c.kind==='GROUPS'?'GROUPS':c.date;
  if(c.kind!=='GROUPS'&&c.kind!=='DAY')throw Error('청크 종류 오류');
  const target=c.kind==='GROUPS'?groupsParts:daysParts;
  if(!target.has(key))target.set(key,{count:Number(c.partCount),round:c.round,parts:new Map()});
  const part=target.get(key);
  if(part.count!==Number(c.partCount)||part.parts.has(Number(c.partIndex))||(c.kind==='DAY'&&part.round!==c.round))throw Error('청크 개수/회독 충돌');
  part.parts.set(Number(c.partIndex),rows);
 }
 function flatten(part){if(!part)throw Error('필수 청크 누락');const rows=[];for(let i=0;i<part.count;i++){if(!part.parts.has(i))throw Error('누락된 청크가 있습니다.');rows.push(...part.parts.get(i));}return rows;}
 const groups=Object.fromEntries(flatten(groupsParts.get('GROUPS')));
 const days=[...daysParts.keys()].sort().map(date=>{
  const part=daysParts.get(date),records=flatten(part);
  return {date,round:part.round===''||part.round==null?null:Number(part.round),
   ids:records.map(x=>x[0]),groups:records.map(x=>x[1])};
 });
 const p={id:summary.planId,name:summary.name,start:summary.start,end:summary.end,rounds:Number(summary.rounds),groups,days};
 const canonicalHash=await sha256(canonicalPlan(p));
 if(canonicalHash!==summary.activeHash)throw Error('활성 계획 해시가 일치하지 않아 저장하지 않았습니다.');
 return {...p,entries:days.reduce((a,d)=>a+d.ids.length,0)};
}
function testEnabled(){
 const host=root.location?.hostname;
 return root.PE_PLANNER_SYNC_TEST_ENABLED===true && (host==='localhost'||host==='127.0.0.1') &&
  root.PE_PLANNER_SYNC_TEST_TRANSPORT &&
  typeof root.PE_PLANNER_SYNC_TEST_TRANSPORT.get==='function'&&typeof root.PE_PLANNER_SYNC_TEST_TRANSPORT.post==='function';
}
function productionEnabled(){
 const transport=root.PE_PLANNER_SYNC_PRODUCTION_TRANSPORT;
 return root.location?.hostname==='aliasel0817.github.io' &&
  root.PE_PLANNER_SYNC_SERVER_VERIFIED===true &&
  Boolean(transport&&typeof transport.get==='function'&&typeof transport.post==='function');
}
function enabled(){return Boolean(testEnabled()||productionEnabled());}
function notifyChange(value){if(typeof root.dispatchEvent==='function'&&typeof root.Event==='function')root.dispatchEvent(new root.Event('pe-planner-sync-changed'));return value;}
async function queuePlan(db,plan,expectedJson){
 const copy=clone(plan),id=operationId();
 return transaction(db,[STORES.plan,STORES.outbox],'readwrite',(tx,finish)=>{
  const plans=tx.objectStore(STORES.plan),pending=tx.objectStore(STORES.outbox),r=plans.get(plan.id);
  r.onsuccess=()=>{
   if(expectedJson!==undefined&&JSON.stringify(r.result)!==expectedJson){tx.abort();return;}
   if(expectedJson===undefined&&r.result){tx.abort();return;}
   plans.put(copy);
   pending.put({id,kind:'plan',planId:plan.id,plan:copy,createdAt:now(),state:'pending',attempted:false});
   finish(copy);
  };
 }).then(notifyChange);
}
function queueProgressRows(db,input){
 const copies=input.map(clone);
 return transaction(db,[STORES.progress,STORES.outbox],'readwrite',(tx,finish)=>{
  const ps=tx.objectStore(STORES.progress),pending=tx.objectStore(STORES.outbox);
  const pr=ps.getAll(),oq=pending.getAll();let complete=0;
  const ready=()=>{
   if(++complete!==2)return;
   const rows=new Map(pr.result.map(r=>[r.key,r])),ops=new Map(oq.result.map(o=>[o.id,o])),out=[];
   for(const row of copies){
    const prev=rows.get(row.key)||{};
    if(prev.key&&prev.dirty&&prev.status===row.status){out.push(prev);continue;}
    // Retain attempted and conflicted operations. Only a never-sent intermediate
    // state can be superseded by a newer choice on this same device.
    for(const op of ops.values())if(op.kind==='progress'&&op.key===row.key&&!op.attempted&&op.state!=='conflict'){
     pending.delete(op.id);ops.delete(op.id);
    }
    const id=operationId(),next={...prev,...row,dirty:true,pendingOpId:id,
     serverRowRevision:Number(prev.serverRowRevision||0),serverSeq:Number(prev.serverSeq||0)};
    const op={id,kind:'progress',key:row.key,planId:row.planId,date:row.date,topicId:row.topicId,
     status:row.status,clientAt:row.updatedAt||now(),createdAt:now(),state:'pending',attempted:false,
     reassert:Boolean(prev.key&&!prev.dirty&&prev.status===row.status),baseRowRevision:Number(prev.serverRowRevision||0)};
    ps.put(next);pending.put(op);rows.set(row.key,next);ops.set(id,op);out.push(next);
   }
   finish(out);
  };
  pr.onsuccess=ready;oq.onsuccess=ready;
 }).then(notifyChange);
}
async function queueProgress(db,row){return (await queueProgressRows(db,[row]))[0];}
async function queueProgressBatch(db,rows){return (await queueProgressRows(db,rows)).length;}
async function migration(db){return (await get(db,STORES.meta,'migration'))||{key:'migration',state:'required'};}
async function status(db){
 const q=await all(db,STORES.outbox),conflicts=await all(db,STORES.conflict),m=await migration(db);
 const waiting=q.filter(x=>x.state!=='ack'),planWaiting=waiting.filter(x=>x.kind==='plan'),
  progressWaiting=waiting.filter(x=>x.kind==='progress'),
  planConflicts=conflicts.filter(x=>x.kind==='plan'),progressConflicts=conflicts.filter(x=>x.kind==='progress');
 const planReceipt=await get(db,STORES.meta,'lastPlanSyncAt'),progressReceipt=await get(db,STORES.meta,'lastProgressSyncAt');
 return {enabled:enabled(),migration:m.state,online:root.navigator?.onLine!==false,
  pending:waiting.length,conflicts:conflicts.length,planPending:planWaiting.length,progressPending:progressWaiting.length,
  planConflicts:planConflicts.length,progressConflicts:progressConflicts.length,
  planResult:planReceipt?.at?{state:'confirmed',at:planReceipt.at}:null,
  progressResult:progressReceipt?.at?{state:'confirmed',at:progressReceipt.at}:null,
  lastSuccess:(await get(db,STORES.meta,'lastSuccess'))?.at||null};
}
async function markConflict(db,kind,key,details,op){
 const id=kind+':'+key;
 await save(db,STORES.conflict,{id,kind,key,details:clone(details),operationId:op||null,at:now()});
 if(op){const entry=await get(db,STORES.outbox,op);if(entry)await save(db,STORES.outbox,{...entry,state:'conflict'});}
}
async function metadata(db,kind,id){return await get(db,STORES.meta,kind+':'+id);}
async function setMetadata(db,kind,id,data){await save(db,STORES.meta,{key:kind+':'+id,...data});}
async function loadSchedule(transport,summary){
 const chunks=[];let offset=0;
 for(let i=0;i<2000;i++){
  const resp=await transport.get('studyPlanSchedule',{planId:summary.planId,revision:summary.activeRevision,offset,limit:100});
  if(!resp?.ok||resp.revision!==summary.activeRevision||resp.hash!==summary.activeHash)throw Error('일정 원격 응답 버전 오류');
  chunks.push(...resp.chunks);
  if(!resp.hasMore)return parseChunks(summary,chunks);
  if(!(resp.nextOffset>offset))throw Error('청크 페이지가 진행되지 않았습니다.');
  offset=resp.nextOffset;
 }
 throw Error('일정 청크 페이지 제한을 초과했습니다.');
}
async function uploadPlan(db,transport,op,remote){
 const plan=op.plan;const data=await planChunks(plan),prior=await metadata(db,'plan',op.planId);
 let baseRevision=op.baseRevision;
 if(baseRevision===undefined){
  if(remote && (!prior||prior.hash!==remote.activeHash)){await markConflict(db,'plan',op.planId,{code:'UNKNOWN_BASE',remote},op.id);return 'conflict';}
  baseRevision=remote?remote.activeRevision:0;
 }
 const persisted={...op,baseRevision,attempted:true};
 await save(db,STORES.outbox,persisted);
 const start=await transport.post('beginStudyPlanRevision',{operationId:op.id,planId:op.planId,baseRevision,
  meta:data.meta,snapshotHash:data.snapshotHash,expectedChunks:data.chunks.length});
 if(!start?.ok||!start.stageId)throw Error('계획 업로드 시작 ACK가 없습니다.');
 const stage={operationId:op.id,stageId:start.stageId};
 for(let i=0;i<data.chunks.length;i+=12){
  const resp=await transport.post('putStudyPlanChunks',{...stage,chunks:data.chunks.slice(i,i+12)});
  if(!resp?.ok)throw Error('계획 청크 업로드에 실패했습니다.');
 }
 const committed=await transport.post('commitStudyPlanRevision',{...stage,baseRevision,snapshotHash:data.snapshotHash});
 if(!committed?.ok||committed.activeHash!==data.snapshotHash)throw Error('계획 commit 결과를 확인할 수 없습니다.');
 await setMetadata(db,'plan',op.planId,{hash:data.snapshotHash,revision:Number(committed.activeRevision)});
 await erase(db,STORES.outbox,op.id);
 return {activeRevision:Number(committed.activeRevision),activeHash:data.snapshotHash};
}
async function importRemotePlan(db,transport,summary,local,pendingPlanIds){
 if(pendingPlanIds.has(summary.planId))return 'pending';
 const prior=await metadata(db,'plan',summary.planId);
 if(local){
  const localHash=await sha256(canonicalPlan(local));
  if(localHash===summary.activeHash){
   await setMetadata(db,'plan',summary.planId,{hash:localHash,revision:summary.activeRevision});return 'same';
  }
  if(!prior||prior.hash!==localHash){
   await markConflict(db,'plan',summary.planId,{code:'LOCAL_PLAN_DIVERGED',localHash,remoteHash:summary.activeHash});return 'conflict';
  }
 }
 const parsed=await loadSchedule(transport,summary);
 return transaction(db,[STORES.plan,STORES.meta,STORES.outbox],'readwrite',(tx,finish)=>{
  const ps=tx.objectStore(STORES.plan),p=ps.get(summary.planId),q=tx.objectStore(STORES.outbox).getAll();let ready=0;
  const apply=()=>{
   if(++ready!==2)return;
   if(JSON.stringify(p.result||null)!==JSON.stringify(local||null)||
     q.result.some(op=>op.kind==='plan'&&op.planId===summary.planId)){
    finish('pending');return;
   }
   ps.put(parsed);tx.objectStore(STORES.meta).put({key:'plan:'+summary.planId,hash:summary.activeHash,revision:summary.activeRevision});
   finish('downloaded');
  };
  p.onsuccess=apply;q.onsuccess=apply;
 });
}
async function pullProgress(db,transport,planId){
 const cursor=await metadata(db,'cursor',planId),start=Number(cursor?.seq||0);
 const events=[];let after=start,high=null;
 for(let i=0;i<2000;i++){
  const args={planId,afterSeq:after,limit:300};if(high!==null)args.untilSeq=high;
  const resp=await transport.get('studyProgress',args);
  if(!resp?.ok||!Array.isArray(resp.events))throw Error('진도 응답 오류');
  if(high===null)high=Number(resp.highWatermark);
  if(Number(resp.highWatermark)!==high)throw Error('진도 highWatermark 변경');
  let previous=after;
  for(const e of resp.events){if(!Number.isInteger(e.serverSeq)||e.serverSeq!==previous+1||e.serverSeq>high)throw Error('진도 이벤트 순서 오류');previous=e.serverSeq;}
  events.push(...resp.events);after=resp.events.length?resp.events[resp.events.length-1].serverSeq:after;
  if(!resp.hasMore){if(after!==high)throw Error('진도 커서 중간 누락');break;}
  if(!resp.events.length)throw Error('진도 페이지가 진행되지 않습니다.');
  if(i===1999)throw Error('진도 페이지 제한 초과');
 }
 if(!events.length){await setMetadata(db,'cursor',planId,{seq:high??start});return 0;}
 for(const e of events)if(!isDate(e.date)||!/^T\d{4}$/.test(e.topicId)||
  !['done','miss','todo'].includes(e.status)||!Number.isInteger(e.rowRevision)||e.rowRevision<1)
  throw Error('서버 진도 항목 오류');
 await transaction(db,[STORES.progress,STORES.meta,STORES.outbox,STORES.conflict],'readwrite',(tx,finish)=>{
  const ps=tx.objectStore(STORES.progress),qs=tx.objectStore(STORES.outbox),cs=tx.objectStore(STORES.conflict);
  const a=ps.getAll(),b=qs.getAll(),c=tx.objectStore(STORES.meta).get('cursor:'+planId);let complete=0;
  const apply=()=>{
   if(++complete!==3)return;
   if(Number(c.result?.seq||0)!==start){tx.abort();return;}
   const local=new Map(a.result.map(r=>[r.key,r])),ops=new Map(b.result.map(o=>[o.id,o]));
   const byKey=new Map();
   for(const op of ops.values())if(op.kind==='progress'){
    if(!byKey.has(op.key))byKey.set(op.key,[]);
    byKey.get(op.key).push(op);
   }
   const remove=op=>{qs.delete(op.id);ops.delete(op.id);};
   for(const e of events){
    const key=planId+'|'+e.date+'|'+e.topicId,prev=local.get(key)||{};
    if(Number(prev.serverSeq||0)>e.serverSeq)continue;
    const pending=(byKey.get(key)||[]).filter(op=>ops.has(op.id));
    const own=pending.find(op=>op.id===e.operationId);
    const cloud={key,planId,date:e.date,topicId:e.topicId,status:e.status,updatedAt:e.serverAt,
     serverSeq:e.serverSeq,serverRowRevision:e.rowRevision,dirty:false,pendingOpId:null};
    let next;
    if(own){
     remove(own);
     const remaining=pending.filter(op=>op.id!==own.id);
     const latest=prev.pendingOpId===own.id;
     if(latest&&!remaining.length){
      next={...prev,...cloud};cs.delete('progress:'+key);
     }else next={...prev,serverSeq:e.serverSeq,serverRowRevision:e.rowRevision,dirty:true};
    }else if(pending.length||prev.dirty){
     if(Number(prev.serverRowRevision||0)>=e.rowRevision)continue;
     if(pending.length&&pending.every(op=>!op.attempted&&op.state!=='conflict')&&prev.status===e.status){
      for(const op of pending)remove(op);
      next={...prev,...cloud};cs.delete('progress:'+key);
     }else{
      // Preserve both sides before advancing the cursor. The pending operation
      // keeps its original CAS base and is never retried over this conflict.
      cs.put({id:'progress:'+key,kind:'progress',key,local:clone(prev),remote:clone(cloud),
       details:{code:'REMOTE_PROGRESS_CHANGED',local:clone(prev),remote:clone(cloud)},at:now()});
      for(const op of pending){const held={...op,state:'conflict'};qs.put(held);ops.set(op.id,held);}
      next={...prev,dirty:true};
     }
    }else next={...prev,...cloud};
    ps.put(next);local.set(key,next);
   }
   tx.objectStore(STORES.meta).put({key:'cursor:'+planId,seq:high});finish(events.length);
  };
  a.onsuccess=apply;b.onsuccess=apply;c.onsuccess=apply;
 });
 return events.length;
}
async function claimProgressOperation(db,id,planId){
 return transaction(db,[STORES.progress,STORES.outbox,STORES.meta,STORES.conflict],'readwrite',(tx,finish)=>{
  const out=tx.objectStore(STORES.outbox),r=out.get(id);
  r.onsuccess=()=>{
   const op=r.result;if(!op||op.state==='conflict'){finish(null);return;}
   const a=tx.objectStore(STORES.progress).get(op.key),b=tx.objectStore(STORES.meta).get('plan:'+planId),
    c=tx.objectStore(STORES.conflict).get('progress:'+op.key);let ready=0;
   const apply=()=>{
    if(++ready!==3)return;
    if(c.result){finish(null);return;}
    if(!b.result?.revision){tx.abort();return;}
    // The just-completed remote pull proved this unchanged status. Suppress a
    // redundant event only now, not at click time (the device could be stale).
    if(op.reassert&&!op.attempted&&op.baseRowRevision>0&&
       Number(a.result?.serverRowRevision||0)===op.baseRowRevision&&a.result?.status===op.status&&a.result?.pendingOpId===op.id){
      tx.objectStore(STORES.progress).put({...a.result,dirty:false,pendingOpId:null});out.delete(op.id);finish(null);return;
    }
    const expected=op.attempted?op.expectedRowRevision:Number(a.result?.serverRowRevision||0);
    const base=op.attempted?op.planRevisionAtWrite:Number(b.result.revision);
    const claimed={...op,attempted:true,expectedRowRevision:expected,planRevisionAtWrite:base};
    out.put(claimed);finish(claimed);
   };
   a.onsuccess=apply;b.onsuccess=apply;c.onsuccess=apply;
  };
 });
}
async function pushProgress(db,transport,planId){
 const allOps=(await all(db,STORES.outbox)).filter(o=>o.kind==='progress'&&o.planId===planId&&o.state!=='conflict').sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
 const blocked=new Set((await all(db,STORES.conflict)).filter(c=>c.kind==='progress').map(c=>c.key));
 let applied=0,conflicts=0;
 for(const queued of allOps){
  if(blocked.has(queued.key))continue;
  const op=await claimProgressOperation(db,queued.id,planId);if(!op)continue;
  const data={operationId:op.id,planId,date:op.date,topicId:op.topicId,status:op.status,
   expectedRowRevision:op.expectedRowRevision,planRevisionAtWrite:op.planRevisionAtWrite,clientAt:op.clientAt};
  const res=await transport.post('saveStudyProgress',{changes:[data]});
  if(!res?.ok)throw Error('진도 업로드 응답 오류');
  const ack=(res.applied||[]).concat(res.duplicate||[]).find(x=>x.operationId===op.id);
  if(ack){
   await transaction(db,[STORES.progress,STORES.outbox],'readwrite',tx=>{
    const store=tx.objectStore(STORES.progress),r=store.get(op.key);
    r.onsuccess=()=>{
     if(!r.result)return;
     const prev=r.result,latest=prev.pendingOpId===op.id;
     if(Number(prev.serverSeq||0)>Number(ack.serverSeq))return;
     store.put({...prev,serverRowRevision:Number(ack.rowRevision),serverSeq:Number(ack.serverSeq),
      dirty:!latest,pendingOpId:latest?null:prev.pendingOpId});
    };
    tx.objectStore(STORES.outbox).delete(op.id);
   });
   applied++;continue;
  }
  const conflict=(res.conflicts||[]).find(x=>x.operationId===op.id);
  if(!conflict)throw Error('진도 요청 결과를 알 수 없습니다.');
  const local=await get(db,STORES.progress,op.key);
  await markConflict(db,'progress',op.key,{...conflict,local},op.id);
  blocked.add(op.key);conflicts++;
 }
 return {applied,conflicts};
}
let activeSync=null;
async function runSync(db,transport){
 if(!enabled())return {...await status(db),state:'disabled'};
 const ready=await migration(db);
 if(ready.state!=='ready')return {...await status(db),state:'migration-required'};
 if(!root.navigator?.onLine)return {...await status(db),state:'offline'};
 if(!transport)transport=testEnabled()?root.PE_PLANNER_SYNC_TEST_TRANSPORT:root.PE_PLANNER_SYNC_PRODUCTION_TRANSPORT;
 const result={state:'syncing',plansUploaded:0,plansDownloaded:0,progressUploaded:0,progressDownloaded:0,conflicts:0};
 const list=await transport.get('studyPlans',{});
 if(!list?.ok||list.plannerSyncVersion!==VERSION||!Array.isArray(list.plans))throw Error('격리 서버 동기화 버전 불일치');
 const remote=new Map(list.plans.map(x=>[x.planId,x])),pending=await all(db,STORES.outbox);
 const blockedPlans=new Set((await all(db,STORES.conflict)).filter(x=>x.kind==='plan').map(x=>x.key));
 let byPlan=new Set(pending.filter(x=>x.kind==='plan').map(x=>x.planId));
 for(const op of pending.filter(x=>x.kind==='plan'&&x.state!=='conflict').sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){
  if(blockedPlans.has(op.planId))continue;
  const s=await uploadPlan(db,transport,op,remote.get(op.planId));
  if(s==='conflict'){result.conflicts++;blockedPlans.add(op.planId);continue;}
  remote.set(op.planId,{...remote.get(op.planId),planId:op.planId,
   activeRevision:s.activeRevision,activeHash:s.activeHash});result.plansUploaded++;
 }
 byPlan=new Set([...(await all(db,STORES.outbox)).filter(x=>x.kind==='plan').map(x=>x.planId),...blockedPlans]);
 const local=new Map((await all(db,STORES.plan)).map(x=>[x.id,x]));
 for(const info of remote.values()){
  if(!info?.activeRevision)continue;
  const state=await importRemotePlan(db,transport,info,local.get(info.planId),byPlan);
  if(state==='downloaded')result.plansDownloaded++;
  if(state==='conflict'){result.conflicts++;byPlan.add(info.planId);}
  if(state==='pending')byPlan.add(info.planId);
 }
 for(const info of remote.values()){
  if(!info?.activeRevision||byPlan.has(info.planId))continue;
  result.progressDownloaded+=await pullProgress(db,transport,info.planId);
  const pushed=await pushProgress(db,transport,info.planId);
  result.progressUploaded+=pushed.applied;result.conflicts+=pushed.conflicts;
  result.progressDownloaded+=await pullProgress(db,transport,info.planId);
 }
 // Only after the normal server roundtrip, archive known receipt-only collisions.
 // Older cached clients can still synchronize safely without the optional helper.
 if(typeof root.PEPlannerMigration?.archiveReceiptConflicts==='function'){
  try{await root.PEPlannerMigration.archiveReceiptConflicts(db);}catch(error){console.warn('Receipt collision archive deferred:',error?.message||error);}
 }
 const after=await status(db);
 result.pending=after.pending;result.conflicts=after.conflicts;
 const planOk=after.planPending===0&&after.planConflicts===0&&after.conflicts===after.planConflicts+after.progressConflicts;
 const progressOk=after.progressPending===0&&after.progressConflicts===0&&after.planConflicts===0&&after.planPending===0&&after.conflicts===after.planConflicts+after.progressConflicts;
 const at=now();
 result.planResult={state:planOk?'confirmed':'partial',at:planOk?at:null};
 result.progressResult={state:progressOk?'confirmed':'partial',at:progressOk?at:null};
 if(planOk)await save(db,STORES.meta,{key:'lastPlanSyncAt',at});
 if(progressOk)await save(db,STORES.meta,{key:'lastProgressSyncAt',at});
 result.state=after.pending||after.conflicts?'partial':'synced';
 if(result.state==='synced')await save(db,STORES.meta,{key:'lastSuccess',at});
 return result;
}
async function sync(db,transport){
 if(activeSync)return activeSync;
 const task=()=>runSync(db,transport);
 activeSync=root.navigator?.locks?.request?root.navigator.locks.request('pe-study-planner-sync-v1',{mode:'exclusive'},task):task();
 try{return await activeSync;}finally{activeSync=null;}
}
function makeSignedTransport({apiUrl,buildSignedGetUrl,sendSecureMutation,fetchImpl}){
 if(typeof buildSignedGetUrl!=='function'||typeof sendSecureMutation!=='function')throw Error('기존 서명 함수가 필요합니다.');
 return {
  async get(action,data){
   const url=await buildSignedGetUrl(apiUrl,action,data);
   const r=await (fetchImpl||fetch)(url,{method:'GET',cache:'no-store',redirect:'follow'});
   if(!r.ok)throw Error('동기화 GET HTTP '+r.status);
   const body=await r.json();if(!body?.ok)throw Error(body?.message||'서버 조회 실패');return body;
  },
  post(action,data){return sendSecureMutation(apiUrl,action,data);}
 };
}
const api={STORES,canonicalPlan,planChunks,parseChunks,sha256,queuePlan,queueProgress,queueProgressBatch,
 status,migration,sync,testEnabled,productionEnabled,enabled,makeSignedTransport};
root.PEPlannerSyncClient=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
