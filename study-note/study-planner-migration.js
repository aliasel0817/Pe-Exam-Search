/* Stage 5 first-device migration (synthetic loopback ONLY, never live).
 * No implicit migration: verified full backup + explicit preview + approval required.
 * Existing plans/progress are not overwritten on any schedule/progress conflict.
 */
(function(root){
'use strict';
const FORMAT='pe-planner-full-backup-v1',ORDER=['plans','progress','pendingOps','syncConflicts','syncMeta'],PRIMARY=ORDER.slice(0,4),SNAP='preSyncSnapshots';
const STATE={REQUIRED:'required',BACKUP:'backed_up',REVIEW:'review_required',UPLOADING:'uploading',RETRY:'pending_retry',CONFLICT:'conflict_held',READY:'ready',LOCAL:'local_only'};
const KEY={plans:'id',progress:'key',pendingOps:'id',syncConflicts:'id',syncMeta:'key'};
const dangerous=/^(sessiontoken|password|secret|apikey|access_token|refresh_token|hmac|privatekey|oauth|credential|authorization)$/i;
const client=()=>root.PEPlannerSyncClient;
const now=()=>new Date().toISOString();
const copy=x=>JSON.parse(JSON.stringify(x));
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
const stable=x=>JSON.stringify(sorted(x));
const id=()=>{
 const c=root.crypto;if(!c?.getRandomValues)throw Error('안전한 migration ID를 생성할 수 없습니다.');
 const b=new Uint8Array(16);c.getRandomValues(b);return [...b].map(n=>n.toString(16).padStart(2,'0')).join('');
};
function guard(){
 if(!client()?.testEnabled?.())throw Error('격리 합성 시험 환경에서만 최초 통합을 사용할 수 있습니다.');
}
function validatePublic(value,depth=0){
 if(depth>100)throw Error('백업 객체 중첩 제한 초과');
 if(!value||typeof value!=='object')return;
 for(const [key,val] of Object.entries(value)){
  if(dangerous.test(key))throw Error('인증 비밀정보가 포함된 항목은 백업할 수 없습니다: '+key);
  validatePublic(val,depth+1);
 }
}
function req(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('IndexedDB 오류'));});}
function read(db,store,key){return req(db.transaction(store,'readonly').objectStore(store).get(key));}
function put(db,store,row){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('저장 취소'));});}
async function readAll(db){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(ORDER,'readonly'),result={};
  for(const store of ORDER){const r=tx.objectStore(store).getAll();r.onsuccess=()=>{result[store]=r.result;};}
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(tx.error||Error('일괄 스냅샷 조회 실패'));
  tx.onabort=()=>reject(tx.error||Error('일괄 스냅샷 취소'));
 });
}
function rowsValid(data){
 for(const store of ORDER){
  const rows=data?.[store];
  if(!Array.isArray(rows))throw Error('누락된 백업 저장소: '+store);
  const keys=new Set();
  for(const row of rows){
   if(!row||typeof row!=='object'||typeof row[KEY[store]]!=='string'||!row[KEY[store]]||keys.has(row[KEY[store]]))throw Error(store+' 백업 키 형식·중복 오류');
   keys.add(row[KEY[store]]);
   validatePublic(row);
   if(store==='plans')client().canonicalPlan(row);
   if(store==='progress'&&(row.key!==row.planId+'|'+row.date+'|'+row.topicId||!['done','miss','todo'].includes(row.status)))throw Error('진도 키·상태 오류');
  }
 }
}
function counts(data){
 return {plans:data.plans.length,days:data.plans.reduce((n,p)=>n+p.days.length,0),
 slots:data.plans.reduce((n,p)=>n+p.days.reduce((a,d)=>a+d.ids.length,0),0),
 progress:data.progress.length,pendingOps:data.pendingOps.length,conflicts:data.syncConflicts.length,meta:data.syncMeta.length};
}
async function hashes(data){
 const h={};for(const store of ORDER)h[store]=await client().sha256(stable(data[store]));
 return h;
}
async function criticalHash(data){return client().sha256(stable(PRIMARY.map(k=>[k,data[k]])));}
async function backup(db,deviceLabel='이 기기'){
 guard();const data=await readAll(db);rowsValid(data);
 const original={format:FORMAT,schemaVersion:1,deviceLabel:String(deviceLabel).slice(0,80),createdAt:now(),backupId:'backup-'+id(),counts:counts(data),data};
 const manifest={hashes:await hashes(data),criticalHash:await criticalHash(data)};
 const bundleHash=await client().sha256(stable({...original,manifest}));
 return {...original,manifest,bundleHash};
}
async function verifyBackup(blob){
 if(typeof blob==='string')blob=JSON.parse(blob);
 if(!blob||blob.format!==FORMAT||blob.schemaVersion!==1||typeof blob.bundleHash!=='string'||!/^[0-9a-f]{64}$/.test(blob.bundleHash))throw Error('백업 파일 형식 오류');
 const data=blob.data;rowsValid(data);
 if(stable(counts(data))!==stable(blob.counts))throw Error('백업 데이터 개수가 맞지 않습니다.');
 const hashesNow=await hashes(data),critical=await criticalHash(data);
 if(stable(hashesNow)!==stable(blob.manifest?.hashes)||critical!==blob.manifest?.criticalHash)throw Error('백업 저장소 해시 검증 실패');
 const {bundleHash,...unsigned}=blob;
 if(await client().sha256(stable(unsigned))!==bundleHash)throw Error('전체 백업 해시가 일치하지 않습니다.');
 return {valid:true,backupId:blob.backupId,counts:blob.counts,bundleHash,criticalHash:critical};
}
function downloadBackup(blob){
 const content=JSON.stringify(blob);
 if(content.length>25*1024*1024)throw Error('백업이 25MB보다 큽니다. 분할 백업 지원 전까지 중단합니다.');
 const url=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='학습계획_전체백업_'+blob.createdAt.slice(0,10)+'_'+blob.backupId+'.json';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);
}
async function storeBackup(db,backupFile){
 guard();const details=await verifyBackup(backupFile);
 const row={id:'migration:'+backupFile.backupId,state:'BACKUP_PREPARED',file:copy(backupFile),
  backupHash:details.bundleHash,criticalHash:details.criticalHash,createdAt:now(),journal:null,preview:null};
 await put(db,SNAP,row);
 return row;
}
async function state(db){return (await read(db,'syncMeta','migration'))||{key:'migration',state:STATE.REQUIRED};}
async function putState(db,snapshotRow,mode,additional={}){
 await new Promise((resolve,reject)=>{
  const tx=db.transaction([SNAP,'syncMeta'],'readwrite');
  const r={...snapshotRow,state:mode,...additional,updatedAt:now()};
  tx.objectStore(SNAP).put(r);
  tx.objectStore('syncMeta').put({key:'migration',state:mode.toLowerCase(),snapshotId:r.id,backupHash:r.backupHash,updatedAt:r.updatedAt});
  tx.oncomplete=()=>resolve(r);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('이행 단계 저장 취소'));
 });
 return read(db,SNAP,snapshotRow.id);
}
async function confirmBackup(db,snapshotId,selectedFile){
 guard();const snap=await read(db,SNAP,snapshotId);
 if(!snap||snap.state!=='BACKUP_PREPARED')throw Error('백업 준비 단계가 아닙니다.');
 const proof=await verifyBackup(selectedFile);
 if(proof.bundleHash!==snap.backupHash||proof.backupId!==snap.file.backupId)throw Error('다른 백업 파일입니다. 방금 저장한 전체 백업을 다시 선택하세요.');
 const latest=await readAll(db);
 if(await criticalHash(latest)!==snap.criticalHash)throw Error('백업 이후 학습기록이 변경되었습니다. 새 백업이 필요합니다.');
 return putState(db,snap,'BACKED_UP',{fileConfirmedAt:now()});
}
function entries(p){const out=new Map();for(const d of p.days)for(let i=0;i<d.ids.length;i++)out.set(d.date+'|'+d.ids[i],{date:d.date,topicId:d.ids[i],group:d.groups[i],round:d.round});return out;}
function placements(p){const out=new Map();for(const d of p.days)for(const topicId of d.ids){let a=out.get(topicId);if(!a)out.set(topicId,a=[]);a.push(d.date);}return out;}
function additive(base,variant){
 if(!base||!variant||base.id!==variant.id||base.name!==variant.name||base.start!==variant.start||base.end!==variant.end||
  Number(base.rounds)!==Number(variant.rounds)||base.days.length!==variant.days.length)return false;
 for(const [code,label] of Object.entries(base.groups))if(variant.groups[code]!==label)return false;
 for(let i=0;i<base.days.length;i++){
  const b=base.days[i],v=variant.days[i];
  if(b.date!==v.date||b.round!==v.round)return false;
  let cursor=0;for(let j=0;j<v.ids.length;j++)if(b.ids[cursor]===v.ids[j]&&b.groups[cursor]===v.groups[j])cursor++;
  if(cursor!==b.ids.length)return false;
 }
 const bv=entries(base),vv=entries(variant);
 for(const [key,value] of bv)if(stable(vv.get(key))!==stable(value))return false;
 return true;
}
function mergeAdditions(base,left,right){
 if(!additive(base,left)||!additive(base,right))return null;
 for(const [name,desc] of Object.entries(left.groups))if(right.groups[name]!=null&&right.groups[name]!==desc)return null;
 const a=placements(left),b=placements(right),original=placements(base);
 for(const [topic,ds] of a){
  if(original.has(topic))continue;
  if(b.has(topic)&&stable(ds)!==stable(b.get(topic)))return null;
 }
 const groups={...base.groups,...left.groups,...right.groups};
 const days=base.days.map((d,i)=>{
  const l=left.days[i],r=right.days[i],ids=d.ids.slice(),g=d.groups.slice(),seen=new Set(ids);
  for(const side of [r,l])for(let j=0;j<side.ids.length;j++){
   const topic=side.ids[j],code=side.groups[j];
   if(seen.has(topic)){if(g[ids.indexOf(topic)]!==code)return null;continue;}
   ids.push(topic);g.push(code);seen.add(topic);
  }
  return {date:d.date,round:d.round,ids,groups:g};
 });
 if(days.some(x=>x===null))return null;
 return {...base,groups,days,entries:days.reduce((n,d)=>n+d.ids.length,0)};
}
function serverTopicKeys(plan){return new Set([...entries(plan).keys()].map(k=>plan.id+'|'+k));}
async function remoteData(transport){
 const header=await transport.get('studyPlans',{});
 if(!header?.ok||header.plannerSyncVersion!==1||!Array.isArray(header.plans))throw Error('격리 서버 동기화 버전 오류');
 const summaries=new Map(),plans=new Map(),progress=new Map(),marks={};
 for(const info of header.plans){
  if(!info||!info.planId||summaries.has(info.planId)||!Number.isInteger(Number(info.activeRevision)))throw Error('원격 계획 중복/형식 오류');
  summaries.set(info.planId,info);
  let offset=0,arr=[];
  for(let i=0;i<2000;i++){
   const reply=await transport.get('studyPlanSchedule',{planId:info.planId,revision:info.activeRevision,offset,limit:100});
   if(!reply?.ok||Number(reply.revision)!==Number(info.activeRevision)||reply.hash!==info.activeHash)throw Error('원격 일정 버전 오류');
   arr.push(...reply.chunks);
   if(!reply.hasMore)break;
   if(!(reply.nextOffset>offset)||i===1999)throw Error('원격 일정 조회 중단');
   offset=reply.nextOffset;
  }
  const parsed=await client().parseChunks(info,arr);
  if(await client().sha256(client().canonicalPlan(parsed))!==info.activeHash)throw Error('원격 계획 최종 해시 오류');
  plans.set(info.planId,parsed);
  let after=0,high=null,events=[];
  for(let i=0;i<2000;i++){
   const args={planId:info.planId,afterSeq:after,limit:300};if(high!==null)args.untilSeq=high;
   const reply=await transport.get('studyProgress',args);
   if(!reply?.ok||!Array.isArray(reply.events))throw Error('원격 진도 형식 오류');
   if(high===null)high=Number(reply.highWatermark);
   if(!Number.isInteger(high)||high<0||Number(reply.highWatermark)!==high)throw Error('원격 진도 커서 오류');
   for(const e of reply.events){
    if(!Number.isInteger(e.serverSeq)||e.serverSeq!==after+1||!['done','miss','todo'].includes(e.status)||
      !/^T\d{4}$/.test(e.topicId)||!e.date)throw Error('진도 사건이 누락되었거나 잘못되었습니다.');
    events.push(e);after=e.serverSeq;
   }
   if(!reply.hasMore){if(after!==high)throw Error('원격 진도 마지막 커서 누락');break;}
   if(!reply.events.length||i===1999)throw Error('원격 진도 페이지 중단');
  }
  const latest=new Map();
  for(const e of events)latest.set(info.planId+'|'+e.date+'|'+e.topicId,{...e,key:info.planId+'|'+e.date+'|'+e.topicId,planId:info.planId});
  progress.set(info.planId,{events,latest});marks[info.planId]=high;
 }
 return {summaries,plans,progress,marks};
}
function getPlanAction(local,remote,base,id){
 if(!local)return {planId:id,kind:'download',target:remote};
 if(!remote)return {planId:id,kind:'upload',target:local};
 const x=client().canonicalPlan(local),y=client().canonicalPlan(remote);
 if(x===y)return {planId:id,kind:'same',target:local};
 if(base){
  const baseCode=client().canonicalPlan(base);
  if(x===baseCode&&additive(base,remote))return {planId:id,kind:'download',target:remote};
  if(y===baseCode&&additive(base,local))return {planId:id,kind:'upload',target:local};
  const union=mergeAdditions(base,local,remote);
  if(union)return {planId:id,kind:client().canonicalPlan(union)===y?'download':'merge-upload',target:union};
 }
 return {planId:id,kind:'conflict',local:copy(local),remote:copy(remote),reason:'PLAN_DIVERGENCE'};
}
async function compare(db,snapshotId,transport,basePlans=[]){
 guard();if(!root.navigator?.onLine)throw Error('오프라인에서는 서버 비교를 할 수 없습니다.');
 const original=await read(db,SNAP,snapshotId);
 if(!original||!['BACKED_UP','REVIEW_REQUIRED'].includes(original.state))throw Error('다운로드한 전체 백업을 먼저 검증해야 합니다.');
 const live=await readAll(db);
 if(await criticalHash(live)!==original.criticalHash)throw Error('백업 이후 변경된 데이터가 있습니다. 다시 백업하세요.');
 const upstream=await remoteData(transport||root.PE_PLANNER_SYNC_TEST_TRANSPORT);
 const localPlans=new Map(live.plans.map(p=>[p.id,p]));
 const base=new Map(basePlans.map(p=>[p.id,p]));
 const planActions=[],conflicts=[],progressActions=[];
 for(const planId of new Set([...localPlans.keys(),...upstream.plans.keys()])){
  const local=localPlans.get(planId),remote=upstream.plans.get(planId);
  const action=getPlanAction(local,remote,base.get(planId),planId);
  const summary=upstream.summaries.get(planId);
  action.localHash=local?await client().sha256(client().canonicalPlan(local)):null;
  action.remoteHash=summary?.activeHash||null;action.remoteRevision=summary?.activeRevision||0;
  action.targetHash=action.target?await client().sha256(client().canonicalPlan(action.target)):null;
  action.operationId='mig-'+id();
  if(action.kind==='conflict')conflicts.push({kind:'plan',key:planId,reason:action.reason,local:action.local,remote:action.remote});
  planActions.push(action);
 }
 const planKinds=new Map(planActions.map(x=>[x.planId,x.kind]));
 const localProgress=new Map(live.progress.map(p=>[p.key,p]));
 const upstreamProgress=new Map();for(const group of upstream.progress.values())for(const [key,row] of group.latest)upstreamProgress.set(key,row);
 for(const key of new Set([...localProgress.keys(),...upstreamProgress.keys()])){
  const local=localProgress.get(key),remote=upstreamProgress.get(key),planId=(local?.planId||remote?.planId);
  let kind;if(planKinds.get(planId)==='conflict')kind='conflict';
  else if(!local)kind='download';
  else if(!remote)kind='upload';
  else if(local.status===remote.status)kind='same';
  else kind='conflict';
  const row={key,planId,kind,local:local?copy(local):null,remote:remote?copy(remote):null,operationId:'mig-'+id()};
  if(kind==='conflict')conflicts.push({kind:'progress',key,reason:'PROGRESS_DIVERGENCE',local:row.local,remote:row.remote});
  progressActions.push(row);
 }
 const preview={id:'preview-'+id(),snapshotId,createdAt:now(),planActions,progressActions,conflicts,
  serverStamp:{plans:[...upstream.summaries.values()].map(x=>({planId:x.planId,hash:x.activeHash,revision:x.activeRevision})),marks:upstream.marks},
  counts:{localPlans:localPlans.size,remotePlans:upstream.plans.size,localProgress:localProgress.size,remoteProgress:upstreamProgress.size,
   planUploads:planActions.filter(x=>['upload','merge-upload'].includes(x.kind)).length,
   planDownloads:planActions.filter(x=>x.kind==='download').length,
   progressUploads:progressActions.filter(x=>x.kind==='upload').length,
   progressDownloads:progressActions.filter(x=>x.kind==='download').length,
   identicalPlans:planActions.filter(x=>x.kind==='same').length,conflicts:conflicts.length},
  journal:{uploadedPlans:{},uploadedProgress:{},verified:false}};
 await putState(db,original,'REVIEW_REQUIRED',{preview,previewAt:now()});
 return preview;
}
function choices(options){
 const o=options||{};
 return {uploadPlans:o.uploadPlans===true,downloadPlans:o.downloadPlans===true,uploadProgress:o.uploadProgress===true,downloadProgress:o.downloadProgress===true};
}
function enabledAction(a,o){return a.kind==='upload'||a.kind==='merge-upload'?o.uploadPlans:a.kind==='download'?o.downloadPlans:false;}
function enabledProgress(a,o){return a.kind==='upload'?o.uploadProgress:a.kind==='download'?o.downloadProgress:false;}
function remoteFingerprint(data){return stable({plans:[...data.summaries.values()].map(x=>[x.planId,x.activeHash,x.activeRevision]).sort((a,b)=>a[0].localeCompare(b[0])),marks:data.marks});}
function priorFingerprint(preview){return stable({plans:preview.serverStamp.plans.map(x=>[x.planId,x.hash,x.revision]).sort((a,b)=>a[0].localeCompare(b[0])),marks:preview.serverStamp.marks});}
async function uploadPlan(transport,action){
 const parts=await client().planChunks(action.target);
 const baseRevision=Number(action.remoteRevision||0),operationId=action.operationId;
 const start=await transport.post('beginStudyPlanRevision',{operationId,planId:action.planId,baseRevision,meta:parts.meta,snapshotHash:parts.snapshotHash,expectedChunks:parts.chunks.length});
 if(!start?.ok||!start.stageId)throw Error('계획 단계 시작 오류: '+action.planId);
 for(let i=0;i<parts.chunks.length;i+=12){
  const reply=await transport.post('putStudyPlanChunks',{operationId,stageId:start.stageId,chunks:parts.chunks.slice(i,i+12)});
  if(!reply?.ok)throw Error('계획 청크 업로드 오류: '+action.planId);
 }
 const reply=await transport.post('commitStudyPlanRevision',{operationId,stageId:start.stageId,baseRevision,snapshotHash:parts.snapshotHash});
 if(!reply?.ok||reply.activeHash!==action.targetHash)throw Error('계획 최종 확인 오류: '+action.planId);
 return reply;
}
function snapshotLocalUnchanged(current,before){return stable(current)===stable(before);}
async function apply(db,snapshotId,options,transport){
 guard();if(!root.navigator?.onLine)throw Error('오프라인: 승인된 작업은 기기에 유지됩니다.');
 let snap=await read(db,SNAP,snapshotId);const opt=choices(options);
 if(!snap?.fileConfirmedAt||!snap.preview||!['REVIEW_REQUIRED','PENDING_RETRY'].includes(snap.state))throw Error('백업 검증·비교·사용자 승인 단계를 먼저 수행하세요.');
 const preview=snap.preview,env=transport||root.PE_PLANNER_SYNC_TEST_TRANSPORT;
 if(!Object.values(opt).some(Boolean))throw Error('최소 하나의 안전한 통합 작업을 선택하세요.');
 // Re-reading before the first write protects against other device changes since preview.
 const local=await readAll(db);
 if(await criticalHash(local)!==snap.criticalHash)throw Error('현재 기기 기록이 미리보기와 다릅니다. 새 백업이 필요합니다.');
 let remote=await remoteData(env);
 if(snap.state==='REVIEW_REQUIRED'&&remoteFingerprint(remote)!==priorFingerprint(preview))throw Error('서버 기록이 변경되었습니다. 다시 비교해야 합니다.');
 if(snap.state==='PENDING_RETRY'){
  for(const a of preview.planActions){
   const p=remote.summaries.get(a.planId);
   if(p&&p.activeHash!==a.remoteHash&&p.activeHash!==a.targetHash)throw Error('재개 중 서버 계획이 다른 기기에서 수정되었습니다.');
  }
  for(const a of preview.progressActions){
   if(a.kind!=='upload'||!opt.uploadProgress)continue;
   const p=remote.progress.get(a.planId)?.latest.get(a.key);
   if(p&&p.operationId!==a.operationId)throw Error('재개 중 동일 진도키에 다른 기기 변경이 발생했습니다.');
  }
 }
 snap=await putState(db,snap,'UPLOADING',{approval:opt,approvedAt:snap.approvedAt||now()});
 const plans=preview.planActions,progress=preview.progressActions;
 try{
  for(const a of plans){
   if(!enabledAction(a,opt))continue;
   if(!['upload','merge-upload'].includes(a.kind))continue;
   const observed=remote.summaries.get(a.planId);
   if(observed?.activeHash===a.targetHash){snap.journal.uploadedPlans[a.planId]=true;continue;}
   await uploadPlan(env,a);
   snap.journal.uploadedPlans[a.planId]=true;
   await put(db,SNAP,snap);
  }
  remote=await remoteData(env);
  for(const a of plans)if(enabledAction(a,opt)&&a.targetHash!==remote.summaries.get(a.planId)?.activeHash)throw Error('서버 계획 업로드 검증 실패');
  for(const a of progress){
   if(a.kind!=='upload'||!opt.uploadProgress)continue;
   const plan=remote.plans.get(a.planId);
   if(!plan||!serverTopicKeys(plan).has(a.key))throw Error('업로드 대상 진도에 대응되는 서버 일정이 없습니다: '+a.key);
   const previous=remote.progress.get(a.planId)?.latest.get(a.key);
   if(previous){
    if(previous.operationId===a.operationId){snap.journal.uploadedProgress[a.key]=true;continue;}
    throw Error('동일 진도키에 신규 서버 기록이 생겨 충돌을 보류합니다: '+a.key);
   }
   const request={operationId:a.operationId,planId:a.planId,date:a.local.date,topicId:a.local.topicId,status:a.local.status,
    expectedRowRevision:0,planRevisionAtWrite:Number(remote.summaries.get(a.planId).activeRevision),clientAt:a.local.updatedAt||now()};
   const reply=await env.post('saveStudyProgress',{changes:[request]});
   if(!reply?.ok)throw Error('진도 서버 저장 오류: '+a.key);
   const ack=[...(reply.applied||[]),...(reply.duplicate||[])].find(x=>x.operationId===a.operationId);
   if(!ack)throw Error('진도 서버 CAS 충돌 또는 ACK 누락: '+a.key);
   snap.journal.uploadedProgress[a.key]=true;await put(db,SNAP,snap);
  }
  remote=await remoteData(env);
  for(const a of progress)if(a.kind==='upload'&&opt.uploadProgress){
   if(remote.progress.get(a.planId)?.latest.get(a.key)?.operationId!==a.operationId)throw Error('진도 서버 저장 재검증 오류: '+a.key);
  }
  // Reconfirm local original snapshot immediately before the atomic local merge.
  const beforeWrite=await readAll(db);
  if(await criticalHash(beforeWrite)!==snap.criticalHash)throw Error('업로드 중 로컬 변경 감지: 원본은 보존하고 재비교해야 합니다.');
  const planRows=beforeWrite.plans,progressRows=beforeWrite.progress,pendingRows=beforeWrite.pendingOps;
  const pm=new Map(planRows.map(p=>[p.id,p])),gm=new Map(progressRows.map(p=>[p.key,p]));
  const newPlans=[],newProgress=[],metadata=[],conflictRows=[];
  for(const a of plans){
   if(a.kind==='conflict'){conflictRows.push({id:'migration:plan:'+a.planId,kind:'plan',key:a.planId,local:a.local,remote:a.remote,reason:a.reason,at:now()});continue;}
   if(!a.target||!enabledAction(a,opt)&&a.kind!=='same')continue;
   const current=pm.get(a.planId),server=remote.summaries.get(a.planId);
   if(!server||server.activeHash!==a.targetHash)throw Error('일정 최종 버전이 변경되었습니다: '+a.planId);
   if(a.kind==='download'&&!current)newPlans.push(copy(a.target));
   else if(a.kind==='download'&&client().canonicalPlan(current)!==client().canonicalPlan(a.target))newPlans.push(copy(a.target));
   else if(a.kind==='merge-upload'&&client().canonicalPlan(current)!==client().canonicalPlan(a.target))newPlans.push(copy(a.target));
   metadata.push({key:'plan:'+a.planId,hash:server.activeHash,revision:server.activeRevision});
  }
  for(const a of progress){
   if(a.kind==='conflict'){conflictRows.push({id:'migration:progress:'+a.key,kind:'progress',key:a.key,local:a.local,remote:a.remote,reason:'PROGRESS_DIVERGENCE',at:now()});continue;}
   if(a.kind==='same')continue;
   if(!enabledProgress(a,opt))continue;
   const server=remote.progress.get(a.planId)?.latest.get(a.key),prior=gm.get(a.key);
   if(!server)throw Error('진도 최종 서버 내역 누락: '+a.key);
   if(a.kind==='download'&&!prior)newProgress.push({key:a.key,planId:a.planId,date:server.date,topicId:server.topicId,status:server.status,
    updatedAt:server.serverAt,serverSeq:server.serverSeq,serverRowRevision:server.rowRevision,dirty:false,pendingOpId:null,source:'migration'});
   if(a.kind==='upload'&&prior){
    if(!snapshotLocalUnchanged(prior,a.local))throw Error('로컬 진도 원본이 바뀌어 반영 중단: '+a.key);
    newProgress.push({...prior,serverSeq:server.serverSeq,serverRowRevision:server.rowRevision,dirty:false,pendingOpId:null});
   }
  }
  for(const [planId,mark] of Object.entries(remote.marks)){
   if(!plans.some(a=>a.planId===planId&&a.kind==='conflict'))metadata.push({key:'cursor:'+planId,seq:mark});
  }
  const pendingAcked=pendingRows.filter(op=>op.kind==='progress'&&snap.journal.uploadedProgress[op.key]||
   op.kind==='plan'&&snap.journal.uploadedPlans[op.planId]).map(op=>op.id);
  await new Promise((resolve,reject)=>{
   const names=['plans','progress','syncMeta','pendingOps','syncConflicts',SNAP],tx=db.transaction(names,'readwrite');
   for(const p of newPlans)tx.objectStore('plans').put(p);
   for(const p of newProgress)tx.objectStore('progress').put(p);
   for(const m of metadata)tx.objectStore('syncMeta').put(m);
   for(const op of pendingAcked)tx.objectStore('pendingOps').delete(op);
   for(const c of conflictRows)tx.objectStore('syncConflicts').put(c);
   const conflictsCount=preview.conflicts.length;const pendingUnmatched=pendingRows.filter(x=>!pendingAcked.includes(x.id));
   const complete=!conflictsCount&&!pendingUnmatched.length &&
    plans.every(a=>a.kind==='same'||a.kind==='conflict'||enabledAction(a,opt))&&
    progress.every(a=>a.kind==='same'||a.kind==='conflict'||enabledProgress(a,opt));
   const final=complete?'SYNC_READY':'CONFLICT_HELD';
   tx.objectStore('syncMeta').put({key:'migration',state:complete?'ready':'conflict_held',snapshotId:snap.id,backupHash:snap.backupHash,updatedAt:now()});
   tx.objectStore(SNAP).put({...snap,state:final,journal:{...snap.journal,verified:true},finalAt:now(),result:{downloadedPlans:newPlans.length,downloadedProgress:newProgress.length,conflicts:conflictRows.length,pending:pendingUnmatched.length,ready:complete}});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('최초 통합 로컬 반영 실패'));tx.onabort=()=>reject(tx.error||Error('최초 통합 거래 취소'));
  });
  return (await read(db,SNAP,snapshotId)).result;
 }catch(error){
  snap=await read(db,SNAP,snapshotId);
  await putState(db,snap,'PENDING_RETRY',{lastError:error.message,lastErrorAt:now()});
  throw error;
 }
}
async function cancel(db,snapshotId){
 guard();const snap=await read(db,SNAP,snapshotId);if(!snap)throw Error('이행 스냅샷이 없습니다.');
 if(snap.state==='UPLOADING'||snap.state==='PENDING_RETRY')throw Error('서버 전송이 이미 시작되어 취소 대신 안전한 재시도를 사용해야 합니다.');
 if(snap.state==='SYNC_READY')throw Error('완료된 동기화는 자동 롤백하지 않습니다.');
 return putState(db,snap,'LOCAL_ONLY',{cancelledAt:now()});
}
async function restore(db,blob,confirmed){
 guard();if(confirmed!==true)throw Error('로컬 복원에 대한 명시적 동의가 필요합니다.');
 const v=await verifyBackup(blob),data=blob.data;
 const before=await readAll(db);
 const maps=Object.fromEntries(ORDER.map(k=>[k,new Map(before[k].map(r=>[r[KEY[k]],r]))]));
 const additions={},conflicts=[];
 for(const store of ORDER){
  additions[store]=[];
  for(const row of data[store]){
   if(store==='syncMeta'&&(/^(migration|cursor:|plan:|lastSuccess)$/.test(row.key)||row.key.startsWith('lastSuccess')))continue;
   const existing=maps[store].get(row[KEY[store]]);
   if(!existing)additions[store].push(copy(row));
   else if(stable(existing)!==stable(row))conflicts.push({id:'restore:'+store+':'+row[KEY[store]],kind:'restore',key:row[KEY[store]],store,
    local:copy(existing),backup:copy(row),reason:'RESTORE_COLLISION',at:now()});
  }
 }
 // Entire local-only restore is one atomic transaction. Existing records NEVER overwritten.
 await new Promise((resolve,reject)=>{
  const tx=db.transaction(ORDER,'readwrite');
  for(const store of ORDER)for(const row of additions[store])tx.objectStore(store).add(row);
  for(const row of conflicts)tx.objectStore('syncConflicts').put(row);
  tx.objectStore('syncMeta').put({key:'migration',state:'required',reason:'restore-requires-review',updatedAt:now()});
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('복원 중단'));tx.onabort=()=>reject(tx.error||Error('복원 거래 취소'));
 });
 return {restored:Object.fromEntries(ORDER.map(k=>[k,additions[k].length])),conflicts:conflicts.length,backupHash:v.bundleHash};
}
const api={FORMAT,STATE,backup,verifyBackup,downloadBackup,storeBackup,confirmBackup,compare,apply,cancel,restore,state,readAll,
 additive,mergeAdditions,remoteData};
root.PEPlannerMigration=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
