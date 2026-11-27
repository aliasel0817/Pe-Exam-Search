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
const KEYS=Object.values(GROUPS).flat(),GENERAL_KEYS=KEYS.filter(k=>k!=='favorite'),STORE='learningStates';
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
// The favorite lane lives in the existing IndexedDB row, independently of
// memo/progress. Raw favorite is always the visible value; general requests
// project it back to their original base, so they never send a favorite edit.
const generalDirty=raw=>Boolean(raw?.syncV2?.favoriteLane?raw.syncV2.generalDirty:raw?.dirty);
function laneValue(lane,fallback='N'){
 return lane?(lane.pending?lane.desired:lane.known?(lane.base?.favorite||'N'):(lane.observed||fallback)):fallback;
}
function generalSnapshot(raw){
 const s=snapshot(raw),m=raw?.syncV2;
 if(m?.favoriteLane&&m.known)s.favorite=m.base?.favorite||'N';
 return s;
}
const generalKeys=raw=>raw?.syncV2?.favoriteLane?GENERAL_KEYS:KEYS;
function rowFrom(s,meta,dirty){
 const v=snapshot(s),lane=meta.favoriteLane;
 if(lane)meta.generalDirty=Boolean(dirty);
 return {...v,favorite:laneValue(lane,v.favorite)==='Y',
  dirty:Boolean(dirty||lane?.pending),syncV2:meta};
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
 if(old.backup)meta.backup=old.backup;
 if(old.favoriteLane)meta.favoriteLane=clone(old.favoriteLane);
 return rowFrom(remote||blank(id),meta,false);
}
function hold(raw,remote,groups,reason){
 const meta=metaFor(raw,raw.topicId);
 meta.attempt=null;meta.conflict={remote:remote?clone(remote):null,groups:[...groups],reason,at:now()};
 return rowFrom(raw,meta,true);
}
function favoriteStatusOf(rows){
 let local=0,server=0,pending=0,conflicts=0,unverified=0;
 for(const r of rows){
  const lane=r.syncV2?.favoriteLane;
  if(snapshot(r).favorite==='Y')local++;
  if(lane?.seenFavorite==='Y')server++;
  if(lane?.pending||(!lane&&(pendingLegacyFavorite(r)||(generalDirty(r)&&snapshot(r).favorite!==((r.syncV2?.base?.favorite)||'N')))))pending++;
  if(lane?.conflict)conflicts++;
  if(!lane||!lane.seenAt)unverified++;
 }
 return {local,server,pending,conflicts,unverified};
}
function statusOf(rows){
 return {pending:rows.filter(x=>x.dirty).length,conflicts:rows.filter(x=>x.syncV2?.conflict||x.syncV2?.favoriteLane?.conflict).length};
}
const pendingLegacyFavorite=raw=>{
 const a=raw?.syncV2?.attempt;
 return Boolean(a&&a.desired.favorite!==(a.base?.favorite||'N'));
};
function createLane(raw,cloud,verified){
 const original=snapshot(raw),m=raw?.syncV2;
 const known=Boolean(m?.known),base=known?(m.base||null):null;
 // A confirmed V2 base is trustworthy. Legacy records without that base
 // may represent an intentional remote removal, so never union silently.
 if(known){
  return {known:true,base,observed:base?.favorite||'N',desired:original.favorite,
   pending:original.favorite!==(base?.favorite||'N'),attempt:null,conflict:null,
   seenFavorite:verified?(cloud?.favorite||'N'):undefined,seenAt:verified?now():''};
 }
 const seen=cloud?.favorite||'N';
 const preserve=verified&&(original.favorite==='Y'||Boolean(raw?.dirty))&&original.favorite!==seen;
 return {known:verified&&!preserve,base:verified&&!preserve?cloud:null,observed:original.favorite,
  desired:preserve?original.favorite:seen,pending:preserve,attempt:null,conflict:null,
  seenFavorite:verified?seen:undefined,seenAt:verified?now():''};
}
function setLaneConflict(lane,cloud,reason){
 // Retain the user's exact choice; only display the fresh remote side.
 if(!lane.conflict||!sameRemote(lane.conflict.remote,cloud)||lane.conflict.reason!==reason)
  lane.conflict={remote:cloud?clone(cloud):null,reason,at:now()};
 lane.pending=true;lane.attempt=null;
}
function confirmLane(lane,cloud){
 const next={known:true,base:cloud?clone(cloud):null,observed:cloud?.favorite||'N',
  desired:cloud?.favorite||'N',pending:false,attempt:null,conflict:null,
  seenFavorite:cloud?.favorite||'N',seenAt:now()};
 if(lane?.backup)next.backup=lane.backup;
 return next;
}
function adoptFavorite(raw,cloud,verified){
 const id=raw?.topicId||cloud?.topicId,m=metaFor(raw,id);
 if(m.favoriteLane||pendingLegacyFavorite(raw))return raw;
 const value=raw?snapshot(raw):cloud||blank(id);
 let lane=raw?createLane(raw,cloud,verified):confirmLane(null,cloud);
 if(!raw&&!verified)lane={known:false,base:null,observed:'N',desired:'N',pending:false,attempt:null,conflict:null,seenAt:''};
 m.favoriteLane=lane;
 if(raw&&!raw.syncV2){m.legacyUnverified=true;if(raw.dirty){m.known=false;m.base=null;}}
 // Only a favorite-only legacy dirty record with a trustworthy base can be
 // safely removed from the general queue. Unknown legacy ancestry is held.
 let gd=Boolean(raw?.dirty);
 if(gd&&m.known&&!m.attempt&&equal(value,m.base||blank(id),GENERAL_KEYS))gd=false;
 if(m.conflict){
  const rest=(m.conflict.groups||[]).filter(g=>g!=='favorite');
  if(!rest.length){m.conflict=null;if(m.known&&equal(value,m.base||blank(id),GENERAL_KEYS))gd=false;}
  else m.conflict={...m.conflict,groups:rest};
 }
 if(!raw&&cloud){m.known=true;m.base=clone(cloud);}
 return rowFrom(value,m,gd);
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
   let raw=by.get(id);const cur=snapshot(raw||blank(id));
   const patch=typeof item.patch==='function'?item.patch(cur):item.patch;
   const desired=snapshot({...cur,...patch,topicId:id,updatedAt:now(),revision:cur.revision+1});
   if(equal(cur,desired)){out.push(raw||cleanRow(cur,null,id));continue;}
   const favoriteChanged=cur.favorite!==desired.favorite;
   if(favoriteChanged&&!raw?.syncV2?.favoriteLane&&!pendingLegacyFavorite(raw)){
    // No remote query during the click: retain the observed value and defer
    // establishment of an unknown base to a signed server read.
    const newLocal=!raw;
    if(newLocal)raw=rowFrom(blank(id),{known:true,base:null,attempt:null,conflict:null},false);
    raw=adoptFavorite(raw,null,false);
    if(newLocal){raw.syncV2.favoriteLane.known=false;raw.syncV2.favoriteLane.observed='N';}
   }
   const meta=metaFor(raw,id);
   const lane=meta.favoriteLane;
   if(favoriteChanged&&lane){
    if(!lane.known&&!lane.pending)lane.observed=cur.favorite;
    lane.desired=desired.favorite;lane.pending=true;lane.explicit=true;
    // An already sent operation must be acknowledged unchanged. A later
    // click is a separate intent, not a mutation of that operation ID.
    if(lane.known&&!lane.attempt&&!lane.conflict&&desired.favorite===(lane.base?.favorite||'N'))lane.pending=false;
   }
   const otherChanged=!equal(cur,desired,lane?GENERAL_KEYS:KEYS);
   const next=rowFrom(desired,meta,generalDirty(raw)||otherChanged);
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
   const meta=metaFor(raw,id),desired=generalSnapshot(raw),keys=generalKeys(raw);
   if(meta.conflict){
    // Keep the device's desired record. Refresh both sides for review.
    if(equal(desired,cloud||blank(id),keys) && (cloud||!meta.base)){
     store.put(cleanRow(cloud,raw,id));continue;
    }
    if(!sameRemote(meta.conflict.remote,cloud)){
     meta.conflict={...meta.conflict,remote:cloud,at:now()};
     store.put(rowFrom(raw,meta,true));
    }
    continue;
   }
   if(generalDirty(raw)){
    if(!meta.attempt&&equal(desired,cloud||blank(id),keys)&&(cloud||!meta.base||meta.legacyUnverified)){
     store.put(cleanRow(cloud,raw,id));continue;
    }
    if(!meta.known||meta.legacyUnverified){
     store.put(hold(raw,cloud,['legacy'],'기존 미전송 기록의 공통 기준을 확인할 수 없습니다.'));
    }else if(meta.base&&!cloud){
     store.put(hold(raw,null,['remote-missing'],'서버 기록이 없어 자동 재생성하지 않습니다.'));
    }
    // Known dirty row remains untouched until conditional server acknowledgement.
    continue;
   }
   if(!cloud){
    if(equal(desired,blank(id),keys)&&(!raw.syncV2||!meta.base||meta.legacyUnverified)){
     if(!raw.syncV2||meta.legacyUnverified)store.put(cleanRow(null,raw,id));
    }else{
     store.put(hold(raw,null,['remote-missing'],'서버에 대응하는 학습정보가 없습니다. 자동 재생성하지 않습니다.'));
    }
    continue;
   }
   if(raw.syncV2?.known&&!meta.legacyUnverified&&meta.base &&
      (cloud.revision<meta.base.revision || (cloud.revision===meta.base.revision&&!equal(cloud,meta.base)))){
    store.put(hold(raw,cloud,['revision'],'서버 수정버전이 이전 기준과 일치하지 않습니다.'));
    continue;
   }
   if((!raw.syncV2||meta.legacyUnverified)&&!equal(desired,cloud,keys)&&Date.parse(desired.updatedAt)>Date.parse(cloud.updatedAt)){
    store.put(hold(raw,cloud,['legacy'],'기존 기기 기록이 서버보다 새롭지만 기준을 검증할 수 없습니다.'));
    continue;
   }
   const next=cleanRow(cloud,raw,id);
   if((!raw.syncV2||meta.legacyUnverified)&&!equal(desired,cloud,keys))next.syncV2.backup=desired;
   if(!raw.syncV2||meta.legacyUnverified||!sameRemote(meta.base,cloud)||!equal(desired,cloud,keys))store.put(next);
  }
 });
}
function prepare(db,excluded=new Set()){
 return txRows(db,'readwrite',(rows,store)=>{
  const batch=[];let bytes=0;
  for(const row of rows){
   if(!generalDirty(row)||excluded.has(row.topicId))continue;
   const meta=metaFor(row,row.topicId);
   if(!meta.known||meta.conflict)continue;
   const change=meta.attempt||{topicId:row.topicId,operationId:newId(),base:meta.base,desired:generalSnapshot(row)};
   const size=new TextEncoder().encode(JSON.stringify(change)).length;
   if(batch.length&&(batch.length>=20||bytes+size>45000))break;
   if(!meta.attempt){meta.attempt=change;store.put(rowFrom(row,meta,true));}
   batch.push(change);bytes+=size;
  }
  return batch;
 });
}
function acknowledgedRow(raw,change,result){
 const meta=metaFor(raw,raw.topicId),desired=generalSnapshot(raw),keys=generalKeys(raw);
 if(!meta.attempt||meta.attempt.operationId!==change.operationId)return raw;
 if(result.status==='conflict')return hold(raw,result.state? snapshot(result.state):null,result.groups||['unknown'],'서버와 동일 항목이 다르게 수정되어 보류했습니다.');
 if(!['applied','unchanged'].includes(result.status))throw Error('학습정보 ACK 상태 오류');
 const cloud=result.state?snapshot(result.state):null;
 const current=cloud||blank(raw.topicId);
 if(equal(desired,change.desired,keys))return cleanRow(cloud,raw,raw.topicId);
 // A user edited the same record while the request was in flight. Rebase only
 // groups changed after the exact immutable sent snapshot, never the whole row.
 const merged={...current};let conflict=[];
 for(const [group,keys] of Object.entries(GROUPS)){
  if(meta.favoriteLane&&group==='favorite')continue;
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
 if(equal(merged,current,keys))return cleanRow(cloud,raw,raw.topicId);
 const next=cleanRow(cloud,raw,raw.topicId);next.syncV2.attempt=null;
 return rowFrom({...merged,updatedAt:desired.updatedAt,revision:current.revision+1},next.syncV2,true);
}
function validateReply(batch,reply){
 if(!reply||reply.ok!==true||reply.learningSyncVersion!==2||!Array.isArray(reply.results)||reply.results.length!==batch.length)throw Error('서버 변경 확인 응답이 누락되었습니다.');
 const replies=new Map(reply.results.map(r=>[r.operationId,r]));
 for(const c of batch){
  const r=replies.get(c.operationId);
  if(!r||r.topicId!==c.topicId||!['applied','unchanged','conflict'].includes(r.status)||!Object.prototype.hasOwnProperty.call(r,'state')||
   (r.state&&r.state.topicId!==c.topicId)||(r.status==='applied'&&!r.state))throw Error('서버 변경 확인 응답 불일치');
 }
 return replies;
}
function acknowledge(db,batch,reply){
 const replies=validateReply(batch,reply);
 return txRows(db,'readwrite',(rows,store)=>{
  const by=new Map(rows.map(r=>[r.topicId,r]));
  for(const change of batch){
   const raw=by.get(change.topicId);if(raw)store.put(acknowledgedRow(raw,change,replies.get(change.operationId)));
  }
 });
}
function reconcileFavorites(db,remoteRows){
 const remote=remoteMap(remoteRows);
 return txRows(db,'readwrite',(rows,store)=>{
  const local=new Map(rows.map(x=>[x.topicId,x]));
  for(const id of new Set([...local.keys(),...remote.keys()])){
   const cloud=remote.get(id)||null;
   let raw=local.get(id);
   if(!raw){if(cloud){const row=cleanRow(cloud,null,id);row.syncV2.favoriteLane=confirmLane(null,cloud);row.syncV2.generalDirty=false;store.put(row);}continue;}
   if(pendingLegacyFavorite(raw)&&!raw.syncV2?.favoriteLane)continue;
   raw=adoptFavorite(raw,cloud,true);
   const meta=metaFor(raw,id),lane=meta.favoriteLane;
   if(!lane)continue;
   lane.seenFavorite=cloud?.favorite||'N';lane.seenAt=now();
   if(lane.pending){
    if(!lane.attempt&&lane.desired===lane.seenFavorite){
     meta.favoriteLane=confirmLane(lane,cloud);
    }else if(!lane.attempt){
     if(lane.conflict){
      setLaneConflict(lane,cloud,lane.conflict.reason);
     }else if(!lane.known){
      if(lane.explicit&&lane.observed===lane.seenFavorite){
       lane.known=true;lane.base=cloud;lane.observed=lane.seenFavorite;
      }else setLaneConflict(lane,cloud,'이전 기기와 서버의 즐겨찾기가 다릅니다. 추가·해제 의도를 확인해 주세요.');
     }else if(lane.base&&!cloud){
      setLaneConflict(lane,null,'서버의 기존 토픽 학습정보가 없어 자동으로 다시 등록하지 않습니다.');
     }else if(lane.base&&cloud&&(cloud.revision<lane.base.revision||
      (cloud.revision===lane.base.revision&&!sameRemote(cloud,lane.base)))){
      setLaneConflict(lane,cloud,'서버 수정버전이 이전 확인 기록과 일치하지 않습니다.');
     }
    }
   }else{
    if(lane.known&&lane.base&&cloud&&
       (cloud.revision<lane.base.revision||(cloud.revision===lane.base.revision&&!sameRemote(cloud,lane.base)))){
     lane.desired=lane.base.favorite;setLaneConflict(lane,cloud,'서버 수정버전이 이전 확인 기록과 일치하지 않습니다.');
    }else if(lane.known&&lane.base&&!cloud&&lane.base.favorite==='Y'){
     lane.desired='Y';setLaneConflict(lane,null,'서버에서 이전 즐겨찾기 기록을 찾을 수 없습니다.');
    }else meta.favoriteLane=confirmLane(lane,cloud);
   }
   store.put(rowFrom(raw,meta,generalDirty(raw)));
  }
 });
}
function prepareFavorites(db,excluded=new Set()){
 return txRows(db,'readwrite',(rows,store)=>{
  const batch=[];let bytes=0;
  for(const raw of rows){
   if(excluded.has(raw.topicId))continue;
   const meta=metaFor(raw,raw.topicId),lane=meta.favoriteLane;
   if(!lane?.pending||!lane.known||lane.conflict)continue;
   const base=lane.base||null;
   const change=lane.attempt||{topicId:raw.topicId,operationId:newId(),base,
    desired:{...(base||blank(raw.topicId)),favorite:lane.desired,updatedAt:now(),revision:(base?.revision||0)+1}};
   const size=new TextEncoder().encode(JSON.stringify(change)).length;
   if(batch.length&&(batch.length>=20||bytes+size>45000))break;
   if(!lane.attempt){lane.attempt=change;store.put(rowFrom(raw,meta,generalDirty(raw)));}
   batch.push(change);bytes+=size;
  }
  return batch;
 });
}
function acknowledgeFavorites(db,batch,reply){
 const replies=validateReply(batch,reply);
 return txRows(db,'readwrite',(rows,store)=>{
  const by=new Map(rows.map(r=>[r.topicId,r]));
  for(const change of batch){
   const raw=by.get(change.topicId);if(!raw)continue;
   const meta=metaFor(raw,raw.topicId),lane=meta.favoriteLane,r=replies.get(change.operationId);
   if(!lane?.attempt||lane.attempt.operationId!==change.operationId)continue;
   const cloud=r.state?snapshot(r.state):null;
   lane.seenFavorite=cloud?.favorite||'N';lane.seenAt=now();
   if(r.status==='conflict'){
    setLaneConflict(lane,cloud,'다른 기기에서 즐겨찾기 또는 서버 기준이 변경되었습니다. 확인 후 다시 적용해 주세요.');
   }else{
    const next=confirmLane(lane,cloud);
    if(lane.desired!==change.desired.favorite&&lane.desired!==next.desired){
     next.desired=lane.desired;next.pending=true;
     if(next.observed!==change.desired.favorite)setLaneConflict(next,cloud,'전송 중 다른 기기에서 즐겨찾기가 변경되었습니다.');
    }else if(lane.desired===change.desired.favorite&&next.desired!==lane.desired){
     // A duplicate receipt can refer to an operation followed by a newer
     // server edit. Accept that newer state, keep the old choice as a backup.
     next.backup={value:lane.desired,at:now()};
    }
    meta.favoriteLane=next;
   }
   store.put(rowFrom(raw,meta,generalDirty(raw)));
  }
 });
}
async function getVerified(transport){
 const result=await transport.get();
 if(result.version!==2)throw Error('안전한 학습정보 동기화 서버가 확인되지 않았습니다. 기존 기록은 기기에 보관합니다.');
 remoteMap(result.rows);return result;
}
async function favoritePass(db,transport,onPhase,first){
 onPhase?.('즐겨찾기 최신 정보 확인 중');
 let latest=first||await getVerified(transport);
 await reconcileFavorites(db,latest.rows);
 const sent=new Set();let applied=0;
 for(let round=0;round<200;round++){
  const batch=await prepareFavorites(db,sent);if(!batch.length)break;
  onPhase?.('즐겨찾기 변경 전송 중 · '+(sent.size+batch.length)+'건');
  const reply=await transport.post({protocolVersion:2,changes:batch});
  await acknowledgeFavorites(db,batch,reply);
  applied+=Number(reply.savedCount)||0;
  for(const change of batch)sent.add(change.topicId);
 }
 if(sent.size){latest=await getVerified(transport);await reconcileFavorites(db,latest.rows);}
 const status=favoriteStatusOf(await readRows(db));
 const server=[...remoteMap(latest.rows).values()].filter(row=>row.favorite==='Y').length;
 return {latest,result:{...status,server,state:status.pending||status.conflicts||status.unverified?'partial':'synced',applied,at:now()}};
}
let activeSync=null;
async function run(db,transport,onPhase,onFavorite){
 let favorite;
 try{favorite=await favoritePass(db,transport,onPhase);}
 catch(error){
  // Preserve the immutable pending favorite operation; do not let a failed
  // favorite POST prevent unrelated general learning reads/saves.
  const status=favoriteStatusOf(await readRows(db));
  favorite={latest:null,result:{...status,state:'error',message:error.message||String(error),at:now()}};
 }
 await onFavorite?.(favorite.result);
 if(!favorite.latest)favorite.latest=await getVerified(transport);
 // General learning uses the same verified snapshot but does not send
 // favorite changes. Its conflicts or failures cannot undo favorite ACKs.
 await reconcile(db,favorite.latest.rows);
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
  const last=await getVerified(transport);
  await reconcileFavorites(db,last.rows);
  await reconcile(db,last.rows);
 }
 const rows=await readRows(db),status=statusOf(rows),fav=favoriteStatusOf(rows);
 return {...status,state:status.pending?'partial':'synced',applied,received:rows.length,at:now(),
  favorite:{...favorite.result,...fav,state:favorite.result.state==='error'?'error':fav.pending||fav.conflicts||fav.unverified?'partial':'synced'}};
}
function withBrowserLock(task){
 return root.navigator?.locks?.request
  ?root.navigator.locks.request('pe-study-note-learning-sync-v2',{mode:'exclusive'},task)
  :task();
}
function sync(db,transport,onPhase,onFavorite){
 if(activeSync)return activeSync.then(()=>sync(db,transport,onPhase,onFavorite),()=>sync(db,transport,onPhase,onFavorite));
 activeSync=withBrowserLock(()=>run(db,transport,onPhase,onFavorite)).finally(()=>{activeSync=null;});
 return activeSync;
}
function syncFavorites(db,transport,onPhase){
 if(activeSync)return activeSync.then(()=>syncFavorites(db,transport,onPhase),()=>syncFavorites(db,transport,onPhase));
 activeSync=withBrowserLock(async()=>{
  const pass=await favoritePass(db,transport,onPhase);
  return pass.result;
 }).finally(()=>{activeSync=null;});
 return activeSync;
}
async function resolveFavoriteConflicts(db,choices,transport){
 return withBrowserLock(async()=>{
  const latest=await getVerified(transport),remote=remoteMap(latest.rows);
  // All choices must still match the user's displayed local and server states.
  // The actual write remains conditional on that verified server base.
  return txRows(db,'readwrite',(rows,store)=>{
   const by=new Map(rows.map(r=>[r.topicId,r])),updates=[];
   for(const choice of choices){
    const raw=by.get(choice.topicId),meta=raw&&metaFor(raw,raw.topicId),lane=meta?.favoriteLane;
    const cloud=remote.get(choice.topicId)||null;
    if(!lane?.conflict||lane.desired!==choice.local||lane.conflict.at!==choice.at||
     !sameRemote(lane.conflict.remote,choice.remote)||!sameRemote(cloud,choice.remote))
      throw Error('즐겨찾기 비교 결과가 변경되었습니다. 다시 동기화하여 확인해 주세요.');
    if(!['local','server'].includes(choice.choice))throw Error('즐겨찾기 처리 선택 오류');
    const next=confirmLane(lane,cloud);
    next.backup={value:lane.desired,remote:cloud?.favorite||'N',at:now()};
    if(choice.choice==='local'&&lane.desired!==next.desired){next.desired=lane.desired;next.pending=true;next.explicit=true;}
    meta.favoriteLane=next;updates.push(rowFrom(raw,meta,generalDirty(raw)));
   }
   for(const row of updates)store.put(row);
   return updates.length;
  });
 });
}
function resolveConflict(db,id,choice,shownRemote,transport,shownLocal){
 return withBrowserLock(()=>resolveConflictLocked(db,id,choice,shownRemote,transport,shownLocal));
}
async function resolveConflictLocked(db,id,choice,shownRemote,transport,shownLocal){
 const latest=await transport.get();
 if(latest.version!==2)throw Error('안전한 서버 동기화 버전을 확인할 수 없습니다.');
 const cloud=remoteMap(latest.rows).get(id)||null;
 if(!sameRemote(cloud,shownRemote)){await reconcile(db,latest.rows);throw Error('서버 기록이 변경되었습니다. 양쪽 기록을 다시 확인하세요.');}
 return txRows(db,'readwrite',(rows,store)=>{
  const raw=rows.find(x=>x.topicId===id),conflict=raw?.syncV2?.conflict;
  if(!conflict||!sameRemote(conflict.remote,shownRemote))throw Error('충돌 기록이 변경되었습니다. 다시 확인하세요.');
  const local=snapshot(raw);
  if(shownLocal&&!sameRemote(local,shownLocal))throw Error('기기 기록이 변경되었습니다. 양쪽 기록을 다시 확인하세요.');
  const next=cleanRow(cloud,raw,id);
  next.syncV2.backup=local;
  if(choice==='server'){store.put(next);return next;}
  if(choice!=='local')throw Error('알 수 없는 충돌 처리 선택');
  const desired=rowFrom({...local,updatedAt:now(),revision:(cloud?.revision||0)+1},next.syncV2,true);
  // Local selection is still a conditional patch against the displayed server revision.
  store.put(desired);return desired;
 });
}
const api={GROUPS,blank,snapshot,equal,sameRemote,progressPatch,queue,queueBatch,readRows,statusOf,favoriteStatusOf,reconcile,prepare,acknowledge,acknowledgedRow,sync,syncFavorites,reconcileFavorites,resolveFavoriteConflicts,resolveConflict};
root.PELearningSyncV2=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
