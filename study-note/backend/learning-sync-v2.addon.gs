/* Learning sync v2: signed route, field-group compare-and-merge under ScriptLock.
 * No MASTER changes or new sheets. Learning-state column K stores per-row
 * revision/receipt metadata atomically with A:J. Reject legacy whole-row writes.
 * Ambiguous concurrent progress or deleted remote records are held, not overwritten.
 */
const LS2_META_HEADER_ = '학습동기화메타V2';
const LS2_GROUPS_ = Object.freeze({
  favorite: ['favorite'],
  personalMemo: ['personalMemo'],
  progress: ['studyStatus','lastStudiedAt','reviewCount','missCount','lastMissedAt']
});
function LS2_blank_(id) {
  return {topicId:id,favorite:'N',studyStatus:'미학습',personalMemo:'',
    lastStudiedAt:'',reviewCount:0,missCount:0,updatedAt:'',revision:0,lastMissedAt:''};
}
function LS2_snapshot_(raw) {
  if (!raw || typeof raw !== 'object') throw Error('학습정보 데이터 형식 오류');
  const id = String(raw.topicId || '').trim();
  if (!id || id.length > 100) throw Error('학습정보 통합ID 오류');
  if (!['Y','N',true,false].includes(raw.favorite) ||
      !['미학습','암기','미암기'].includes(raw.studyStatus)) throw Error('학습정보 상태 오류');
  const state = {topicId:id,favorite:raw.favorite === true || raw.favorite === 'Y' ? 'Y':'N',
    studyStatus:raw.studyStatus,personalMemo:raw.personalMemo,
    lastStudiedAt:raw.lastStudiedAt,reviewCount:raw.reviewCount,missCount:raw.missCount,
    updatedAt:raw.updatedAt,revision:raw.revision,lastMissedAt:raw.lastMissedAt};
  for (const key of ['personalMemo','lastStudiedAt','lastMissedAt','updatedAt']) {
    if (typeof state[key] !== 'string') throw Error('학습정보 문자열 형식 오류: '+key);
  }
  if (state.personalMemo.length > 49000) throw Error('개인메모 길이 제한 초과');
  for (const key of ['reviewCount','missCount','revision']) {
    if (!Number.isSafeInteger(state[key]) || state[key] < 0) throw Error('학습정보 수치 형식 오류: '+key);
  }
  if (state.missCount > state.reviewCount) throw Error('미암기횟수가 복습횟수보다 많습니다.');
  return state;
}
function LS2_fromRow_(row) {
  return LS2_snapshot_({topicId:clean_(row[0]),favorite:clean_(row[1]).toUpperCase()==='Y'?'Y':'N',
    studyStatus:clean_(row[2])||'미학습',personalMemo:row[3]==null?'':String(row[3]),
    lastStudiedAt:learningTimestampText_(row[4]),reviewCount:Number(row[5])||0,
    missCount:Number(row[6])||0,updatedAt:learningTimestampText_(row[7]),
    revision:Number(row[8])||0,lastMissedAt:learningTimestampText_(row[9]) ||
      (clean_(row[2])==='미암기'?learningTimestampText_(row[4]):'')});
}
function LS2_same_(a,b,keys) { return keys.every(k=>a[k]===b[k]); }
function LS2_day_(value) {
  if (!value) return '';
  const date = new Date(value);
  return isNaN(date.getTime()) ? '' : Utilities.formatDate(date,'Asia/Seoul','yyyy-MM-dd');
}
function LS2_sameDay_(a,b) {
  return a===b || Boolean(LS2_day_(a) && LS2_day_(a)===LS2_day_(b));
}
function LS2_latest_(a,b) {
  if(!a)return b;if(!b)return a;
  return Date.parse(a)>=Date.parse(b)?a:b;
}
function LS2_duplicateProgress_(a,b) {
  return a.studyStatus===b.studyStatus && a.reviewCount===b.reviewCount &&
    a.missCount===b.missCount && LS2_sameDay_(a.lastStudiedAt,b.lastStudiedAt) &&
    LS2_sameDay_(a.lastMissedAt,b.lastMissedAt);
}
/* Only merge a provable pair of distinct new study dates. Unknown overlapping history,
 * resets and same-day opposite status require review. Never sum cumulative snapshots.
 */
function LS2_oneDay_(base,next) {
  const day=LS2_day_(next.lastStudiedAt), previous=LS2_day_(base.lastStudiedAt);
  if(!day || (base.lastStudiedAt&&!previous) || (previous && day<=previous) ||
     (!previous && base.reviewCount!==0) || !['암기','미암기'].includes(next.studyStatus) ||
     next.reviewCount!==base.reviewCount+1) return null;
  const missed=next.missCount-base.missCount;
  if(missed!==0&&missed!==1)return null;
  if(missed===1 && LS2_day_(next.lastMissedAt)!==day)return null;
  if(missed===0 && (next.lastMissedAt!==base.lastMissedAt || next.studyStatus==='미암기'))return null;
  return {day,missed};
}
function LS2_mergeProgress_(base,current,desired) {
  const a=LS2_oneDay_(base,current),b=LS2_oneDay_(base,desired);
  if(!a||!b)return null;
  if(a.day===b.day)return null;
  const latest=a.day>b.day?current:desired;
  return {...latest,reviewCount:base.reviewCount+2,missCount:base.missCount+a.missed+b.missed,
    lastMissedAt:LS2_latest_(current.lastMissedAt,desired.lastMissedAt)};
}
function LS2_hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value), Utilities.Charset.UTF_8)
    .map(n=>((n+256)%256).toString(16).padStart(2,'0')).join('');
}
function LS2_stateEqual_(a,b) {
  return Boolean(a&&b)&&a.topicId===b.topicId&&a.revision===b.revision&&a.updatedAt===b.updatedAt&&
    Object.values(LS2_GROUPS_).every(keys=>LS2_same_(a,b,keys));
}
function LS2_meta_(raw,current) {
  const fresh=()=>({version:2,groups:Object.fromEntries(Object.keys(LS2_GROUPS_).map(k=>[k,current?.revision||0])),
    resetRevision:0,receipts:[],stateHash:current?LS2_hash_(current):null});
  if(!raw)return {meta:fresh(),external:false};
  let meta;
  try{meta=JSON.parse(String(raw));}catch(_){throw Error('학습정보 동기화 메타데이터 손상: '+current?.topicId);}
  if(meta?.version!==2||!meta.groups||!Array.isArray(meta.receipts)||meta.receipts.length>48||
    !Number.isSafeInteger(meta.resetRevision)||meta.resetRevision<0||
    Object.keys(LS2_GROUPS_).some(k=>!Number.isSafeInteger(meta.groups[k])||meta.groups[k]<0)||
    meta.receipts.some(r=>!r||typeof r.id!=='string'||!/^([a-f0-9]{64})$/.test(r.hash)))throw Error('학습정보 동기화 메타데이터 형식 오류: '+current?.topicId);
  if(current && meta.stateHash===LS2_hash_(current) &&
    Object.values(meta.groups).every(v=>v<=current.revision)&&meta.resetRevision<=current.revision)return {meta,external:false};
  // A direct spreadsheet edit/old restore bypassed the protocol. Only a caller
  // who has explicitly seen the exact current state may establish a new base.
  const replacement=fresh();replacement.receipts=meta.receipts;replacement.resetRevision=current?.revision||0;
  return {meta:replacement,external:true};
}
function LS2_apply_(existing,change,at,previousMeta) {
  const desired=LS2_snapshot_(change.desired);
  if(desired.topicId!==change.topicId)throw Error('학습정보 통합ID 불일치');
  const base=change.base===null?LS2_blank_(desired.topicId):LS2_snapshot_(change.base);
  if(base.topicId!==desired.topicId)throw Error('학습정보 기준 통합ID 불일치');
  if(change.base!==null&&!existing)return {topicId:desired.topicId,status:'conflict',groups:['remote-missing'],state:null};
  const current=existing||LS2_blank_(desired.topicId);
  const info=previousMeta||LS2_meta_(null,existing),meta=info.meta;
  const operationHash=LS2_hash_([change.topicId,change.base===null?null:base,desired]);
  const receipt=meta.receipts.find(r=>r.id===change.operationId);
  if(receipt){
    if(receipt.hash!==operationHash)throw Error('동일 작업 ID에 다른 학습정보가 전송되었습니다.');
    return {topicId:desired.topicId,status:'unchanged',groups:[],state:existing||null,duplicate:true};
  }
  if(existing && (base.revision>current.revision ||
    (change.base!==null&&base.revision===current.revision&&!LS2_stateEqual_(base,current)) ||
    (info.external&&!LS2_stateEqual_(base,current))))return {topicId:desired.topicId,status:'conflict',groups:['revision'],state:existing};
  const next={...current},conflicts=[];
  for(const [group,keys] of Object.entries(LS2_GROUPS_)){
    if(LS2_same_(base,desired,keys)||LS2_same_(current,desired,keys))continue;
    let source=null;
    if(LS2_same_(current,base,keys) && meta.groups[group]<=base.revision)source=desired;
    else if(group==='progress' && meta.resetRevision<=base.revision && !info.external){
      if(LS2_duplicateProgress_(current,desired)){
        source={...current,lastStudiedAt:LS2_latest_(current.lastStudiedAt,desired.lastStudiedAt),
          lastMissedAt:LS2_latest_(current.lastMissedAt,desired.lastMissedAt)};
      } else source=LS2_mergeProgress_(base,current,desired);
    }
    if(!source){conflicts.push(group);continue;}
    for(const key of keys)next[key]=source[key];
  }
  if(conflicts.length)return {topicId:desired.topicId,status:'conflict',groups:conflicts,state:existing||null};
  if(Object.values(LS2_GROUPS_).every(keys=>LS2_same_(current,next,keys))){
    return {topicId:desired.topicId,status:'unchanged',groups:[],state:existing||null};
  }
  next.updatedAt=at;next.revision=current.revision+1;
  const nextMeta={version:2,groups:{...meta.groups},resetRevision:meta.resetRevision,
    receipts:meta.receipts.concat([{id:change.operationId,hash:operationHash}]).slice(-48),stateHash:LS2_hash_(next)};
  for(const [group,keys] of Object.entries(LS2_GROUPS_)){
    if(!LS2_same_(current,next,keys))nextMeta.groups[group]=next.revision;
  }
  if(next.reviewCount<current.reviewCount||next.missCount<current.missCount||
    (next.studyStatus==='미학습'&&current.studyStatus!=='미학습'))nextMeta.resetRevision=next.revision;
  return {topicId:desired.topicId,status:'applied',groups:[],state:next,meta:nextMeta};
}
function LS2_saveLearningChanges_(payload) {
  if(payload.protocolVersion!==2)throw Error('학습노트 최신 버전으로 새로고침 후 동기화해 주세요. 이전 방식의 전체 덮어쓰기는 차단되었습니다.');
  const changes=payload.changes;
  if(!Array.isArray(changes)||changes.length>50)throw Error('학습정보 변경 목록은 50건 이하로 전송해 주세요.');
  const ids=new Set();
  for(const change of changes){
    if(!change||typeof change.topicId!=='string'||ids.has(change.topicId)||
       !Object.prototype.hasOwnProperty.call(change,'base')||
       typeof change.operationId!=='string'||!/^ls2-[0-9a-f-]{16,64}$/i.test(change.operationId))throw Error('학습정보 변경 요청 오류');
    ids.add(change.topicId);
    LS2_snapshot_(change.desired);
    if(change.base!==null)LS2_snapshot_(change.base);
  }
  if(!changes.length)return {action:'saveLearningStates',learningSyncVersion:2,savedCount:0,results:[]};
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const sheet=ensureLearningSheet_(),{sheet:topicSheet}=getStudySheet_(),table=readTable_(topicSheet);
    const valid=new Set(table.rows.map(row=>clean_(row[table.headerIndex['통합ID']])).filter(Boolean));
    const last=sheet.getLastRow();
    if(sheet.getMaxColumns()<11)throw Error('학습정보 동기화 메타데이터 열을 확보할 수 없습니다.');
    const header=sheet.getRange(1,11).getDisplayValue(),headerFormula=sheet.getRange(1,11).getFormula();
    if(headerFormula||(header&&header!==LS2_META_HEADER_))throw Error('학습정보 K열에 기존 데이터가 있어 자동으로 수정하지 않습니다.');
    const rows=last>=2?sheet.getRange(2,1,last-1,11).getValues():[];
    if(!header&&last>=2){
      const formulas=sheet.getRange(2,11,last-1,1).getFormulas();
      if(rows.some((row,i)=>row[10]!==''&&row[10]!=null||Boolean(formulas[i]?.[0])))
        throw Error('학습정보 K열에 기존 데이터가 있어 자동으로 수정하지 않습니다.');
    }
    const byId=new Map();
    rows.forEach((row,index)=>{
      const id=clean_(row[0]);if(!id)return;
      if(byId.has(id))throw Error('서버 학습정보 통합ID 중복: '+id);
      byId.set(id,{row,index:index+2});
    });
    const prepared=[],at=new Date().toISOString();let nextIndex=last+1;
    for(const change of changes){
      const entry=byId.get(change.topicId);
      if(!valid.has(change.topicId)){
        prepared.push({result:{topicId:change.topicId,status:'conflict',groups:['topic-missing'],state:entry?LS2_fromRow_(entry.row):null}});
        continue;
      }
      const current=entry?LS2_fromRow_(entry.row):null;
      const result=LS2_apply_(current,change,at,LS2_meta_(entry?.row[10]||null,current));
      prepared.push({result,index:result.status==='applied'?(entry?entry.index:nextIndex++):null});
    }
    // All rows are validated first. Each row is written only if changed, with its
    // server-assigned revision. Partial transmission can be safely compared again.
    if(!header&&prepared.some(item=>item.index!==null&&item.index!==undefined)){
      sheet.getRange(1,11).setValue(LS2_META_HEADER_);
    }
    for(const item of prepared)if(item.index!==null&&item.index!==undefined){
      const values=learningStateToRow_(item.result.state).concat(JSON.stringify(item.result.meta));
      // Sheets treats leading "=" as a formula. Store arbitrary personal notes as text.
      if(typeof values[3]==='string'&&/^[=']/.test(values[3]))values[3]="'"+values[3];
      if(item.index>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),item.index-sheet.getMaxRows());
      sheet.getRange(item.index,1,1,11).setValues([values]);
    }
    SpreadsheetApp.flush();
    const results=prepared.map((item,i)=>{
      const {meta,...receipt}=item.result;
      return {...receipt,operationId:changes[i].operationId};
    });
    return {action:'saveLearningStates',learningSyncVersion:2,savedCount:results.filter(x=>x.status==='applied').length,results};
  }finally{lock.releaseLock();}
}
