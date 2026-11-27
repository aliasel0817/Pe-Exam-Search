/* Signed learning synchronization v2. IndexedDB row contains its last verified
 * cloud base and immutable in-flight change. Never rewrite the MASTER.
 * Ambiguous legacy or concurrent changes are retained for explicit review.
 */
(function(root){
'use strict';
const GROUPS=Object.freeze({
 favorite:['favorite'],personalMemo:['personalMemo'],
 progress:['studyStatus','lastStudiedAt','reviewCount','missCount','lastMissedAt']
});
const KEYS=Object.values(GROUPS).flat(),STORE='learningStates';
const blank=id=>({topicId:id,favorite:'N',studyStatus:'미학습',personalMemo:'',lastStudiedAt:'',
 reviewCount:0,missCount:0,updatedAt:'',revision:0,lastMissedAt:''});
const snapshot=raw=>{
 const s={...blank(String(raw?.topicId||'')),...raw};
 return {topicId:s.topicId,favorite:s.favorite===true||s.favorite==='Y'?'Y':'N',
  studyStatus:['암기','미암기'].includes(s.studyStatus)?s.studyStatus:'미학습',
  personalMemo:String(s.personalMemo??''),lastStudiedAt:String(s.lastStudiedAt||''),
  reviewCount:Number(s.reviewCount)||0,missCount:Number(s.missCount)||0,
  updatedAt:String(s.updatedAt||''),revision:Number(s.revision)||0,
  lastMissedAt:String(s.lastMissedAt||(s.studyStatus==='미암기'?s.lastStudiedAt:'')||'')};
};
const clone=x=>JSON.parse(JSON.stringify(x));
const equal=(a,b,keys=KEYS)=>Boolean(a&&b)&&keys.every(k=>a[k]===b[k]);
const sameRemote=(a,b)=>a===null&&b===null||Boolean(a&&b)&&a.topicId===b.topicId&&a.revision===b.revision&&a.updatedAt===b.updatedAt&&equal(a,b);
const newId=()=>{
 if(root.crypto?.randomUUID)return 'ls2-'+root.crypto.randomUUID();
 if(!root.crypto?.getRandomValues)throw Error('안전한 작업 ID를 생성할 수 없습니다.');
 return 'ls2-'+Array.from(root.crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
};
const now=()=>new Date().toISOString();
function dateKey(value){
 if(!value)return '';
 const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
function progressPatch(s,result,at=now()){
 const day=dateKey(at),reviewed=dateKey(s.lastStudiedAt)===day,missed=dateKey(s.lastMissedAt)===day;
 const patch={studyStatus:result,lastStudiedAt:at,
  reviewCount:s.reviewCount+(reviewed?0:1),missCount:s.missCount+(result==='미암기'&&!missed?1:0)};
 if(result==='미암기')patch.lastMissedAt=at;
 return patch;
}
function rowFrom(s,meta,dirty){
 const {syncV2:_sync,dirty:_dirty,...v}=snapshot(s);
 return {...v,favorite:v.favorite==='Y',dirty:Boolean(dirty),syncV2:meta};
}
function metaFor(raw,id){
 if(raw?.syncV2&&typeof raw.syncV2==='object')return clone(raw.syncV2);
 // Legacy dirty rows have no reliable common ancestor. Do not guess.
 if(raw?.dirty)return {known:false,base:null,attempt:null,conflict:null};
 return {known:true,base:raw?snapshot(raw):null,attempt:null,conflict:null};
}
function cleanRow(remote,prior,id){
 const old=prior?.syncV2||{};
 const meta={known:true,base:remote?clone(remote):null,attempt:null,conflict:null};
 // One recoverable legacy/conflict snapshot, not a continuously growing history.
 if(old.backup)meta.backup=old.backup;
 return rowFrom(remote||blank(id),meta,false);
}
function hold(raw,remote,groups,reason){
 const meta=metaFor(raw,raw.topicId);
 meta.attempt=null;meta.conflict={remote:remote?clone(remote):null,groups:[...groups],reason,at:now()};
 return rowFrom(raw,meta,true);
}
function statusOf(rows){
 return {pending:rows.filter(x=>x.dirty).length,conflicts:rows.filter(x=>x.syncV2?.conflict).length};
}
function txRows(db,mode,task){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);let result,error;
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(error||tx.error||Error('학습정보 저장 오류'));
  tx.onabort=()=>reject(error||tx.error||Error('학습정보 저장 취소'));
  const r=store.getAll();
  r.onerror=()=>{error=r.error;try{tx.abort();}catch(_){}};
  r.onsuccess=()=>{try{result=task(r.result,store);}catch(e){error=e;try{tx.abort();}catch(_){}}};
 });
}
const readRows=db=>txRows(db,'readonly',rows=>rows);
function queueBatch(db,items){
 if(!Array.isArray(items)||!items.length)return Promise.resolve([]);
 return txRows(db,'readwrite',(rows,store)=>{
  const by=new Map(rows.map(r=>[r.topicId,r])),out=[];
  for(const item of items){
   const id=String(item.topicId||'');if(!id)throw Error('학습정보 통합ID 오류');
   const raw=by.get(id),cur=snapshot(raw||blank(id)),meta=metaFor(raw,id);
   const patch=typeof item.patch==='function'?item.patch(cur):item.patch;
   const desired=snapshot({...cur,...patch,topicId:id,updatedAt:now(),revision:cur.revision+1});
   if(equal(cur,desired)){out.push(raw||cleanRow(cur,null,id));continue;}
   const next=rowFrom(desired,meta,true);
   store.put(next);by.set(id,next);out.push(next);
  }
  return out;
 });
}
async function queue(db,topicId,patch){return (await queueBatch(db,[{topicId,patch}]))[0];}
function remoteMap(rows){
 if(!Array.isArray(rows))throw Error('서버 학습정보 응답 형식 오류');
 const map=new Map();
 for(const raw of rows){
  const s=snapshot(raw);
  if(!s.topicId||map.has(s.topicId))throw Error('서버 학습정보 통합ID 누락 또는 중복');
  map.set(s.topicId,s);
 }
 return map;
}
function reconcile(db,remoteRows){
 const remote=remoteMap(remoteRows);
 return txRows(db,'readwrite',(rows,store)=>{
  const local=new Map(rows.map(x=>[x.topicId,x]));
  for(const id of new Set([...local.keys(),...remote.keys()])){
   const raw=local.get(id),cloud=remote.get(id)||null;
   if(!raw){if(cloud)store.put(cleanRow(cloud,null,id));continue;}
   const meta=metaFor(raw,id),desired=snapshot(raw);
   if(meta.conflict){
    // Keep the device's desired record. Refresh both sides for review.
    if(equal(desired,cloud||blank(id)) && (cloud||!meta.base)){
     store.put(cleanRow(cloud,raw,id));continue;
    }
    if(!sameRemote(meta.conflict.remote,cloud)){
     meta.conflict={...meta.conflict,remote:cloud,at:now()};
     store.put(rowFrom(raw,meta,true));
    }
    continue;
   }
   if(raw.dirty){
    if(equal(desired,cloud||blank(id))&&(cloud||!meta.base)){
     store.put(cleanRow(cloud,raw,id));continue;
    }
    if(!meta.known){
     store.put(hold(raw,cloud,['legacy'],'기존 미전송 기록의 공통 기준을 확인할 수 없습니다.'));
    }else if(meta.base&&!cloud){
     store.put(hold(raw,null,['remote-missing'],'서버 기록이 없어 자동 재생성하지 않습니다.'));
    }
    // Known dirty row remains untouched until conditional server acknowledgement.
    continue;
   }
   if(!cloud){
    if(equal(desired,blank(id))&&!meta.base){
     if(!raw.syncV2)store.put(cleanRow(null,raw,id));
    }else{
     store.put(hold(raw,null,['remote-missing'],'서버에 대응하는 학습정보가 없습니다. 자동 재생성하지 않습니다.'));
    }
    continue;
   }
   if(raw.syncV2?.known&&meta.base &&
      (cloud.revision<meta.base.revision || (cloud.revision===meta.base.revision&&!equal(cloud,meta.base)))){
    store.put(hold(raw,cloud,['revision'],'서버 수정버전이 이전 기준과 일치하지 않습니다.'));
    continue;
   }
   if(!raw.syncV2&&!equal(desired,cloud)&&Date.parse(desired.updatedAt)>Date.parse(cloud.updatedAt)){
    store.put(hold(raw,cloud,['legacy'],'기존 기기 기록이 서버보다 새롭지만 기준을 검증할 수 없습니다.'));
    continue;
   }
   const next=cleanRow(cloud,raw,id);
   if(!raw.syncV2&&!equal(desired,cloud))next.syncV2.backup=desired;
   if(!raw.syncV2||!sameRemote(meta.base,cloud)||!equal(desired,cloud))store.put(next);
  }
 });
}
function prepare(db,excluded=new Set()){
 return txRows(db,'readwrite',(rows,store)=>{
  const batch=[];let bytes=0;
  for(const row of rows){
   if(!row.dirty||excluded.has(row.topicId))continue;
   const meta=metaFor(row,row.topicId);
   if(!meta.known||meta.conflict)continue;
   const change=meta.attempt||{topicId:row.topicId,operationId:newId(),base:meta.base,desired:snapshot(row)};
   const size=new TextEncoder().encode(JSON.stringify(change)).length;
   if(batch.length&&(batch.length>=20||bytes+size>45000))break;
   if(!meta.attempt){meta.attempt=change;store.put(rowFrom(row,meta,true));}
   batch.push(change);bytes+=size;
  }
  return batch;
 });
}
function acknowledgedRow(raw,change,result){
 const meta=metaFor(raw,raw.topicId),desired=snapshot(raw);
 if(!meta.attempt||meta.attempt.operationId!==change.operationId)return raw;
 if(result.status==='conflict')return hold(raw,result.state? snapshot(result.state):null,result.groups||['unknown'],'서버와 동일 항목이 다르게 수정되어 보류했습니다.');
 if(!['applied','unchanged'].includes(result.status))throw Error('학습정보 ACK 상태 오류');
 const cloud=result.state?snapshot(result.state):null;
 const current=cloud||blank(raw.topicId);
 if(equal(desired,change.desired))return cleanRow(cloud,raw,raw.topicId);
 // A user edited the same record while the request was in flight. Rebase only
 // groups changed after the exact immutable sent snapshot, never the whole row.
 const merged={...current};let conflict=[];
 for(const [group,keys] of Object.entries(GROUPS)){
  if(equal(desired,change.desired,keys))continue;
  if(!equal(current,change.desired,keys)&&!equal(current,desired,keys)){
   conflict.push(group);continue;
  }
  for(const key of keys)merged[key]=desired[key];
 }
 if(conflict.length){
  const updated=hold(raw,cloud,conflict,'전송 중 같은 항목의 다른 변경이 확인되었습니다.');
  updated.syncV2.known=true;updated.syncV2.base=cloud;
  return updated;
 }
 if(equal(merged,current))return cleanRow(cloud,raw,raw.topicId);
 const next=cleanRow(cloud,raw,raw.topicId);next.syncV2.attempt=null;
 return rowFrom({...merged,updatedAt:desired.updatedAt,revision:current.revision+1},next.syncV2,true);
}
function acknowledge(db,batch,reply){
 if(!reply||reply.ok!==true||reply.learningSyncVersion!==2||!Array.isArray(reply.results)||reply.results.length!==batch.length)throw Error('서버 변경 확인 응답이 누락되었습니다.');
 const replies=new Map(reply.results.map(r=>[r.operationId,r]));
 for(const c of batch){
  const r=replies.get(c.operationId);
  if(!r||r.topicId!==c.topicId||!['applied','unchanged','conflict'].includes(r.status)||!Object.prototype.hasOwnProperty.call(r,'state')||
   (r.state&&r.state.topicId!==c.topicId))throw Error('서버 변경 확인 응답 불일치');
 }
 return txRows(db,'readwrite',(rows,store)=>{
  const by=new Map(rows.map(r=>[r.topicId,r]));
  for(const change of batch){
   const raw=by.get(change.topicId);if(raw)store.put(acknowledgedRow(raw,change,replies.get(change.operationId)));
  }
 });
}
let activeSync=null;
async function run(db,transport,onPhase){
 onPhase?.('서버 최신 학습정보 확인 중');
 const first=await transport.get();if(first.version!==2)throw Error('안전한 학습정보 동기화 서버가 확인되지 않았습니다. 기존 기록은 기기에 보관합니다.');
 await reconcile(db,first.rows);
 const sent=new Set();let applied=0;
 for(let round=0;round<200;round++){
  const batch=await prepare(db,sent);if(!batch.length)break;
  onPhase?.('학습 변경 전송 중 · '+(sent.size+batch.length)+'건');
  const reply=await transport.post({protocolVersion:2,changes:batch});
  await acknowledge(db,batch,reply);
  applied+=Number(reply.savedCount)||0;
  for(const change of batch)sent.add(change.topicId);
 }
 if(sent.size){
  onPhase?.('서버 반영 재확인 중');
  const last=await transport.get();if(last.version!==2)throw Error('서버 응답 버전 변경');
  await reconcile(db,last.rows);
 }
 const rows=await readRows(db),status=statusOf(rows);
 return {...status,state:status.pending?'partial':'synced',applied,received:rows.length,at:now()};
}
function sync(db,transport,onPhase){
 if(activeSync)return activeSync;
 activeSync=run(db,transport,onPhase).finally(()=>{activeSync=null;});
 return activeSync;
}
async function resolveConflict(db,id,choice,shownRemote,transport){
 const latest=await transport.get();
 if(latest.version!==2)throw Error('안전한 서버 동기화 버전을 확인할 수 없습니다.');
 const cloud=remoteMap(latest.rows).get(id)||null;
 if(!sameRemote(cloud,shownRemote)){await reconcile(db,latest.rows);throw Error('서버 기록이 변경되었습니다. 양쪽 기록을 다시 확인하세요.');}
 return txRows(db,'readwrite',(rows,store)=>{
  const raw=rows.find(x=>x.topicId===id),conflict=raw?.syncV2?.conflict;
  if(!conflict||!sameRemote(conflict.remote,shownRemote))throw Error('충돌 기록이 변경되었습니다. 다시 확인하세요.');
  const local=snapshot(raw),next=cleanRow(cloud,raw,id);
  next.syncV2.backup=local;
  if(choice==='server'){store.put(next);return next;}
  if(choice!=='local')throw Error('알 수 없는 충돌 처리 선택');
  const desired=rowFrom({...local,updatedAt:now(),revision:(cloud?.revision||0)+1},next.syncV2,true);
  // Local selection is still a conditional patch against the displayed server revision.
  store.put(desired);return desired;
 });
}
const api={GROUPS,blank,snapshot,equal,sameRemote,progressPatch,queue,queueBatch,readRows,statusOf,reconcile,prepare,acknowledge,acknowledgedRow,sync,resolveConflict};
root.PELearningSyncV2=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
