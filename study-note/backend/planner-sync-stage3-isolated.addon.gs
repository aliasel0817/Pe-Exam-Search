/* Stage 3 ONLY: isolated synthetic-data study planner backend.
 * This source is NOT the live Code.js and is NOT deployed.
 * Host signed routes must invoke PS3_get_ / PS3_post_ only after ACTIVE/HMAC validation.
 * Properties: PLANNER_SYNC_MODE=ISOLATED_TEST, PLANNER_SYNC_TEST_SPREADSHEET_ID=<non-live ID>.
 */
var PS3_HEADERS_={
  plans:['planId','name','start','end','rounds','activeRevision','nextRevision','activeHash','dayCount','slotCount','groupCount','progressSeq','status','createdAt','updatedAt','schemaVersion'],
  schedule:['planId','revision','chunkKey','kind','date','round','partIndex','partCount','payloadJson','chunkHash','stageId','createdAt'],
  progress:['planId','serverSeq','date','topicId','progressKey','status','previousRevision','rowRevision','operationId','payloadHash','deviceId','planRevision','serverAt','clientAt','source'],
  operations:['operationId','stageId','planId','action','baseRevision','allocatedRevision','snapshotHash','expectedChunks','receivedChunks','operationPayloadHash','state','resultJson','deviceId','createdAt','expiresAt']
};
var PS3_TABS_={plans:'학습계획',schedule:'학습계획일정',progress:'학습계획진도',operations:'학습계획작업'};
function PS3_fail_(code,message){var e=new Error(message||code);e.code=code;throw e;}
function PS3_str_(v){return v===null||v===undefined?'':String(v);}
function PS3_date_(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
function PS3_planId_(s){return /^[a-zA-Z0-9_.-]{2,80}$/.test(s);}
function PS3_opId_(s){return /^[a-zA-Z0-9_.:-]{8,130}$/.test(s);}
function PS3_sha_(s){var b=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8);return b.map(function(x){return ('0'+(x&255).toString(16)).slice(-2);}).join('');}
function PS3_now_(){return new Date().toISOString();}
function PS3_length_(s){return Utilities.newBlob(s).getBytes().length;}
function PS3_context_(){
 var props=PropertiesService.getScriptProperties();
 if(props.getProperty('PLANNER_SYNC_MODE')!=='ISOLATED_TEST')PS3_fail_('ISOLATION_REQUIRED','격리 시험 모드만 허용합니다.');
 var id=props.getProperty('PLANNER_SYNC_TEST_SPREADSHEET_ID');
 var live=props.getProperty('STUDY_NOTE_SPREADSHEET_ID')||props.getProperty('PLANNER_SYNC_PRODUCTION_SPREADSHEET_ID');
 if(!id||id===live)PS3_fail_('LIVE_BLOCKED','시험용 ID가 없거나 운영 원장과 같습니다.');
 var ss=SpreadsheetApp.openById(id);
 if(!/격리시험용/.test(ss.getName())||/topic_study_data/i.test(ss.getName()))PS3_fail_('LIVE_BLOCKED','격리시험용 원장이 아닙니다.');
 var proof=ss.getSheetByName('테스트토픽');
 if(!proof||PS3_str_(proof.getRange(2,4).getValue()).indexOf('TEST ONLY')<0)PS3_fail_('TEST_MARKER_MISSING','합성 데이터 검증 마커 없음');
 return ss;
}
function PS3_table_(ss,kind){
 var sheet=ss.getSheetByName(PS3_TABS_[kind]);if(!sheet)PS3_fail_('SCHEMA_MISSING',kind+' 탭 없음');
 var h=PS3_HEADERS_[kind],actual=sheet.getRange(1,1,1,h.length).getValues()[0];
 if(JSON.stringify(actual)!==JSON.stringify(h))PS3_fail_('SCHEMA_MISMATCH',kind+' 헤더 불일치');
 var last=sheet.getLastRow(),rows=last>1?sheet.getRange(2,1,last-1,h.length).getValues():[];
 return {sheet:sheet,rows:rows};
}
function PS3_row_(sheet,values){sheet.getRange(sheet.getLastRow()+1,1,1,values.length).setValues([values]);}
function PS3_index_(headers,key){var i=headers.indexOf(key);if(i<0)PS3_fail_('SCHEMA_MISSING',key);return i;}
function PS3_find_(rows,key,value){for(var i=0;i<rows.length;i++)if(PS3_str_(rows[i][key])===PS3_str_(value))return {row:rows[i],index:i};return null;}
function PS3_auth_(ctx){if(!ctx||ctx.status!=='ACTIVE'||!ctx.deviceId)PS3_fail_('AUTH_REQUIRED','ACTIVE 신뢰기기 검증 필요');}
function PS3_validatePlan_(m){
 m=m||{};if(!PS3_planId_(m.planId))PS3_fail_('BAD_PLAN','계획 ID 오류');
 if(!m.name||PS3_str_(m.name).length>100||/^[=+@-]/.test(PS3_str_(m.name))||!PS3_date_(m.start)||!PS3_date_(m.end)||m.end<m.start)PS3_fail_('BAD_PLAN','계획 이름/기간 오류');
 if(!Number.isInteger(m.rounds)||m.rounds<1||m.rounds>30)PS3_fail_('BAD_PLAN','회독 수 오류');
}
function PS3_lock_(fn){
 var lock=LockService.getScriptLock();lock.waitLock(15000);
 try{return fn();}finally{lock.releaseLock();}
}
function PS3_mutationId_(o){
 var id=PS3_str_(o.operationId);
 if(!PS3_opId_(id))PS3_fail_('BAD_OPERATION','operationId 오류');
 return id;
}
function PS3_operationFind_(ss,operationId){
 var t=PS3_table_(ss,'operations');
 return {table:t,match:t.rows.map(function(r,i){return {row:r,index:i};}).filter(function(x){return x.row[0]===operationId;})[0]||null};
}
function PS3_ensurePlan_(ss,id){
 var t=PS3_table_(ss,'plans'),m=PS3_find_(t.rows,0,id);
 return {table:t,match:m};
}
function PS3_outputPlan_(r){return {planId:r[0],name:r[1],start:r[2],end:r[3],rounds:Number(r[4]),activeRevision:Number(r[5]),activeHash:r[7],dayCount:Number(r[8]),slotCount:Number(r[9]),groupCount:Number(r[10]),progressSeq:Number(r[11]),status:r[12]};}
function PS3_get_(action,data,auth){
 PS3_auth_(auth);action=String(action||'').toLowerCase();var ss=PS3_context_(),d=data||{};
 if(action==='studyplans'){
  var plans=PS3_table_(ss,'plans').rows.filter(function(x){return x[0];}).map(PS3_outputPlan_);
  return {ok:true,plannerSyncVersion:1,plans:plans};
 }
 if(action==='studyplanschedule'){
  var p=PS3_ensurePlan_(ss,PS3_str_(d.planId)).match;if(!p)PS3_fail_('PLAN_NOT_FOUND','계획 없음');
  var rev=Number(d.revision||p.row[5]);if(rev!==Number(p.row[5]))PS3_fail_('REVISION_NOT_ACTIVE','요청한 버전이 활성 버전이 아님');
  var offset=Number(d.offset||0),limit=Number(d.limit||40);
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)PS3_fail_('BAD_PAGE','일정 페이지 오류');
  var rows=PS3_table_(ss,'schedule').rows.filter(function(r){return r[0]===p.row[0]&&Number(r[1])===rev;});
  rows.sort(function(a,b){return PS3_str_(a[2]).localeCompare(PS3_str_(b[2]));});
  return {ok:true,planId:p.row[0],revision:rev,hash:p.row[7],chunks:rows.slice(offset,offset+limit).map(function(x){return {chunkKey:x[2],kind:x[3],date:x[4],round:x[5],partIndex:x[6],partCount:x[7],payloadJson:x[8],chunkHash:x[9]};}),hasMore:offset+limit<rows.length,nextOffset:Math.min(rows.length,offset+limit)};
 }
 if(action==='studyprogress'){
  var plan=PS3_ensurePlan_(ss,PS3_str_(d.planId)).match;if(!plan)PS3_fail_('PLAN_NOT_FOUND','계획 없음');
  var after=Number(d.afterSeq||0),limit2=Number(d.limit||100);
  if(!Number.isInteger(after)||after<0||!Number.isInteger(limit2)||limit2<1||limit2>300)PS3_fail_('BAD_PAGE','진도 페이지 오류');
  var r=PS3_table_(ss,'progress').rows.filter(function(x){return x[0]===plan.row[0];});
  var max=r.reduce(function(m,x){return Math.max(m,Number(x[1]||0));},0);
  var until=d.untilSeq==null?max:Number(d.untilSeq);
  if(!Number.isInteger(until)||until<0||until>max)PS3_fail_('BAD_PAGE','진도 highWatermark 오류');
  r=r.filter(function(x){return Number(x[1])>after&&Number(x[1])<=until;}).sort(function(a,b){return Number(a[1])-Number(b[1]);});
  return {ok:true,planId:plan.row[0],events:r.slice(0,limit2).map(function(x){return {serverSeq:Number(x[1]),date:x[2],topicId:x[3],progressKey:x[4],status:x[5],previousRevision:Number(x[6]),rowRevision:Number(x[7]),operationId:x[8],deviceId:x[10],planRevision:Number(x[11]),serverAt:x[12]};}),hasMore:r.length>limit2,nextSeq:r.length?Number(r[Math.min(r.length,limit2)-1][1]):after,highWatermark:until};
 }
 PS3_fail_('UNKNOWN_ACTION','지원하지 않는 조회 action');
}
function PS3_post_(action,data,auth){
 PS3_auth_(auth);var d=data||{};
 var known=['beginstudyplanrevision','putstudyplanchunks','commitstudyplanrevision','savestudyprogress'];
 if(known.indexOf(action.toLowerCase())<0)PS3_fail_('UNKNOWN_ACTION','지원하지 않는 쓰기 action');
 return PS3_lock_(function(){
  var ss=PS3_context_();
  if(action.toLowerCase()==='beginstudyplanrevision')return PS3_begin_(ss,d,auth);
  if(action.toLowerCase()==='putstudyplanchunks')return PS3_putChunks_(ss,d,auth);
  if(action.toLowerCase()==='commitstudyplanrevision')return PS3_commit_(ss,d,auth);
  return PS3_progressWrite_(ss,d,auth);
 });
}
function PS3_begin_(ss,d,auth){
 var op=PS3_mutationId_(d),meta=d.meta||{};meta.planId=d.planId;PS3_validatePlan_(meta);
 var base=Number(d.baseRevision),count=Number(d.expectedChunks),hash=PS3_str_(d.snapshotHash);
 if(!Number.isInteger(base)||base<0||!Number.isInteger(count)||count<1||count>5000||!/^[a-f0-9]{64}$/.test(hash))PS3_fail_('BAD_PLAN','revision/chunk/hash 오류');
 var fingerprint=PS3_sha_(JSON.stringify([d.planId,base,meta,hash,count]));
 var existing=PS3_operationFind_(ss,op).match;
 if(existing){
  if(existing.row[9]!==fingerprint)PS3_fail_('OPERATION_REUSE','같은 ID 다른 payload');
  return {ok:true,action:'beginStudyPlanRevision',duplicate:true,stageId:existing.row[1],allocatedRevision:Number(existing.row[5]),state:existing.row[10]};
 }
 var p=PS3_ensurePlan_(ss,d.planId);
 if(p.match && Number(p.match.row[5])!==base)PS3_fail_('REVISION_CONFLICT','서버 계획이 변경됨');
 if(!p.match && base!==0)PS3_fail_('REVISION_CONFLICT','신규 계획 baseRevision은 0');
 var operationTable=PS3_table_(ss,'operations'),now=PS3_now_(),alloc=p.match?Number(p.match.row[6]):1;
 operationTable.rows.forEach(function(existingRow,index){
   if(existingRow[2]!==d.planId)return;
   alloc=Math.max(alloc,Number(existingRow[5]||0)+1);
   if(existingRow[10]==='STAGING'){
     var expires=Date.parse(existingRow[14]);
     if(Number.isFinite(expires)&&expires<Date.now()){
       operationTable.sheet.getRange(index+2,11).setValue('EXPIRED');
     } else PS3_fail_('PLAN_STAGE_BUSY','이 계획의 다른 버전 업로드가 진행 중입니다.');
   }
 });
 var stage='stage-'+op,expiresAt=new Date(Date.now()+3600000).toISOString();
 PS3_row_(operationTable.sheet,[op,stage,d.planId,'beginStudyPlanRevision',base,alloc,hash,count,0,fingerprint,'STAGING',JSON.stringify(meta),auth.deviceId,now,expiresAt]);
 return {ok:true,action:'beginStudyPlanRevision',stageId:stage,allocatedRevision:alloc};
}
function PS3_stage_(ss,d){
 var op=PS3_mutationId_(d),x=PS3_operationFind_(ss,op);
 if(!x.match||x.match.row[1]!==d.stageId)PS3_fail_('STAGE_NOT_FOUND','stage 없음');
 if(x.match.row[10]!=='STAGING'&&x.match.row[10]!=='COMMITTED')PS3_fail_('STAGE_CLOSED','stage 종료됨');
 return x;
}
function PS3_putChunks_(ss,d,auth){
 var stage=PS3_stage_(ss,d),meta=stage.match.row;
 if(meta[12]!==auth.deviceId)PS3_fail_('AUTH_REQUIRED','다른 기기 단계 접근 금지');
 if(meta[10]==='COMMITTED')return {ok:true,duplicate:true,state:'COMMITTED'};
 var chunks=d.chunks;
 if(!Array.isArray(chunks)||chunks.length<1||chunks.length>12)PS3_fail_('BAD_CHUNKS','1~12개 청크만 허용');
 var total=0;
 chunks.forEach(function(c){
  if(!c||!/^DAY:\d{4}-\d{2}-\d{2}:\d{3}$|^GROUPS:\d{3}$/.test(c.chunkKey)||!['DAY','GROUPS'].includes(c.kind))PS3_fail_('BAD_CHUNK','청크 키/종류');
  if(c.kind==='DAY'&&!PS3_date_(c.date))PS3_fail_('BAD_CHUNK','DAY 날짜');
  if(!Number.isInteger(c.partIndex)||!Number.isInteger(c.partCount)||c.partIndex<0||c.partIndex>=c.partCount)PS3_fail_('BAD_CHUNK','청크 partIndex');
  var json=PS3_str_(c.payloadJson);total+=PS3_length_(json);
  if(PS3_length_(json)>8192||PS3_sha_(json)!==c.chunkHash)PS3_fail_('HASH_MISMATCH','청크 길이/해시 오류');
  var parsed=JSON.parse(json);if(!Array.isArray(parsed))PS3_fail_('BAD_CHUNK','청크 JSON은 배열');
 });
 if(total>100000)PS3_fail_('BAD_CHUNKS','요청이 너무 큼');
 var t=PS3_table_(ss,'schedule'),already={};
 t.rows.forEach(function(r){if(r[0]===meta[2]&&Number(r[1])===Number(meta[5]))already[r[2]]=r;});
 var append=[];
 chunks.forEach(function(c){
  var a=already[c.chunkKey];
  if(a){if(a[9]!==c.chunkHash||a[8]!==c.payloadJson)PS3_fail_('CHUNK_CONFLICT','기존 키와 다른 내용');return;}
  append.push([meta[2],Number(meta[5]),c.chunkKey,c.kind,c.date||'',c.round==null?'':c.round,c.partIndex,c.partCount,c.payloadJson,c.chunkHash,d.stageId,PS3_now_()]);
  already[c.chunkKey]=append[append.length-1];
 });
 if(append.length)t.sheet.getRange(t.sheet.getLastRow()+1,1,append.length,12).setValues(append);
 var received=Object.keys(already).length,op=PS3_table_(ss,'operations');
 op.sheet.getRange(stage.match.index+2,9).setValue(received);
 return {ok:true,action:'putStudyPlanChunks',accepted:append.length,duplicates:chunks.length-append.length,received:received};
}
function PS3_snapshot_(rows,meta){
 var days={},groupPairs=[],groupParts={},dayParts={};
 rows.forEach(function(r){
  var kind=r[3],key=kind==='GROUPS'?'GROUPS':r[4],target=kind==='GROUPS'?groupParts:dayParts;
  if(!target[key])target[key]={count:Number(r[7]),parts:{},round:r[5]};
  var g=target[key];if(g.count!==Number(r[7])||g.parts[r[6]])PS3_fail_('BAD_CHUNKS','중복/partCount 충돌');
  g.parts[r[6]]=JSON.parse(r[8]);
 });
 function flatten(x){var a=[];for(var i=0;i<x.count;i++){if(!x.parts[i])PS3_fail_('BAD_CHUNKS','누락 part');a=a.concat(x.parts[i]);}return a;}
 if(!groupParts.GROUPS)PS3_fail_('BAD_CHUNKS','GROUPS 청크 없음');
 groupPairs=flatten(groupParts.GROUPS);
 var groups={};
 groupPairs.forEach(function(x){if(!Array.isArray(x)||x.length!==2||!x[0]||groups[x[0]])PS3_fail_('BAD_GROUP','그룹 오류');groups[x[0]]=x[1];});
 var dates=Object.keys(dayParts).sort();
 var seen={};var slots=0;
 dates.forEach(function(date){
  if(!PS3_date_(date))PS3_fail_('BAD_DATE','날짜');
  var x=dayParts[date],items=flatten(x),round=x.round===''?null:Number(x.round);
  if(round!==null&&(!Number.isInteger(round)||round<1||round>Number(meta.rounds)))PS3_fail_('BAD_ROUND','회독 범위');
  if(items.some(function(z){return !Array.isArray(z)||z.length!==2||!/^T\d{4}$/.test(z[0])||!Object.prototype.hasOwnProperty.call(groups,z[1]);}))PS3_fail_('BAD_SLOT','토픽·그룹 오류');
  items.forEach(function(z){var k=date+'|'+z[0];if(seen[k])PS3_fail_('DUPLICATE_SLOT','동일 날짜 중복');seen[k]=true;});
  days[date]={date:date,round:round,entries:items};slots+=items.length;
 });
 if(!dates.length||dates[0]!==meta.start||dates[dates.length-1]!==meta.end)PS3_fail_('BAD_PLAN','일정 시작/종료 불일치');
 for(var i=1;i<dates.length;i++)if((Date.parse(dates[i])-Date.parse(dates[i-1]))!==86400000)PS3_fail_('BAD_PLAN','날짜 연속성 오류');
 var canonical=JSON.stringify({id:meta.planId,name:meta.name,start:meta.start,end:meta.end,rounds:Number(meta.rounds),groups:Object.keys(groups).sort().map(function(k){return [k,groups[k]];}),days:dates.map(function(d){return days[d];})});
 return {hash:PS3_sha_(canonical),dayCount:dates.length,slotCount:slots,groupCount:Object.keys(groups).length,dates:dates};
}
function PS3_commit_(ss,d,auth){
 var stage=PS3_stage_(ss,d),row=stage.match.row;
 if(row[12]!==auth.deviceId)PS3_fail_('AUTH_REQUIRED','다른 기기 단계 접근 금지');
 if(row[10]==='COMMITTED')return {ok:true,action:'commitStudyPlanRevision',duplicate:true,activeRevision:Number(row[5]),activeHash:row[6]};
 if(row[6]!==d.snapshotHash||Number(row[4])!==Number(d.baseRevision))PS3_fail_('BAD_PLAN','stage 정보 불일치');
 var alreadyActive=PS3_ensurePlan_(ss,row[2]).match;
 if(alreadyActive&&Number(alreadyActive.row[5])===Number(row[5])&&alreadyActive.row[7]===row[6]){
   PS3_table_(ss,'operations').sheet.getRange(stage.match.index+2,11).setValue('COMMITTED');
   return {ok:true,action:'commitStudyPlanRevision',duplicate:true,state:'ALREADY_APPLIED',activeRevision:Number(row[5]),activeHash:row[6]};
 }
 var chunks=PS3_table_(ss,'schedule').rows.filter(function(r){return r[0]===row[2]&&Number(r[1])===Number(row[5]);});
 if(chunks.length!==Number(row[7]))PS3_fail_('INCOMPLETE_STAGE','청크 누락');
 var meta=JSON.parse(row[11]);var snap=PS3_snapshot_(chunks,meta);
 if(snap.hash!==row[6])PS3_fail_('HASH_MISMATCH','계획 전체 SHA 불일치');
 var p=PS3_ensurePlan_(ss,row[2]),now=PS3_now_();
 if(p.match&&Number(p.match.row[5])!==Number(row[4]))PS3_fail_('REVISION_CONFLICT','다른 기기에서 먼저 확정됨');
 if(!p.match&&Number(row[4])!==0)PS3_fail_('REVISION_CONFLICT','새 계획 baseRevision 불일치');
 var prev=p.match?p.match.row:[];
 var planRow=[meta.planId,meta.name,meta.start,meta.end,meta.rounds,Number(row[5]),Number(row[5])+1,row[6],snap.dayCount,snap.slotCount,snap.groupCount,p.match?Number(prev[11]):0,'ACTIVE',p.match?prev[13]:now,now,1];
 if(p.match)p.table.sheet.getRange(p.match.index+2,1,1,16).setValues([planRow]);
 else PS3_row_(p.table.sheet,planRow);
 SpreadsheetApp.flush();
 var ot=PS3_table_(ss,'operations');ot.sheet.getRange(stage.match.index+2,11).setValue('COMMITTED');
 return {ok:true,action:'commitStudyPlanRevision',activeRevision:Number(row[5]),activeHash:row[6],days:snap.dayCount,entries:snap.slotCount};
}
function PS3_slots_(ss,planId,rev){
 var rows=PS3_table_(ss,'schedule').rows.filter(function(r){return r[0]===planId&&Number(r[1])===Number(rev)&&r[3]==='DAY';});
 var slots={};
 rows.forEach(function(r){JSON.parse(r[8]).forEach(function(x){slots[r[4]+'|'+x[0]]=true;});});
 return slots;
}
function PS3_progressWrite_(ss,d,auth){
 var changes=d.changes;if(!Array.isArray(changes)||!changes.length||changes.length>25)PS3_fail_('BAD_PROGRESS','1~25건 진도');
 var progress=PS3_table_(ss,'progress'),plans=PS3_table_(ss,'plans'),result={ok:true,action:'saveStudyProgress',applied:[],duplicate:[],conflicts:[]};
 var existingIds={};progress.rows.forEach(function(r){existingIds[r[8]]=r;});
 var slotsByPlan={},pmeta={};
 changes.forEach(function(c){
  var op=PS3_mutationId_(c),hash=PS3_sha_(JSON.stringify([c.planId,c.date,c.topicId,c.status,c.expectedRowRevision,c.planRevisionAtWrite,PS3_str_(c.clientAt)]));
  if(c.clientAt!=null&&c.clientAt!==''&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(PS3_str_(c.clientAt)))PS3_fail_('BAD_TIMESTAMP','clientAt는 ISO UTC 시간이어야 합니다.');
  var oldOp=existingIds[op];
  if(oldOp){
   if(oldOp[9]!==hash)PS3_fail_('OPERATION_REUSE','이미 사용한 operationId와 다른 데이터');
   result.duplicate.push({operationId:op,rowRevision:Number(oldOp[7]),serverSeq:Number(oldOp[1])});return;
  }
  if(!PS3_planId_(c.planId)||!PS3_date_(c.date)||!/^T\d{4}$/.test(c.topicId)||!['done','miss','todo'].includes(c.status))PS3_fail_('BAD_PROGRESS','키/상태 오류');
  var p=pmeta[c.planId];
  if(!p){p=PS3_find_(plans.rows,0,c.planId);if(!p)PS3_fail_('PLAN_NOT_FOUND','계획 없음');pmeta[c.planId]=p;}
  if(Number(p.row[5])!==Number(c.planRevisionAtWrite)){result.conflicts.push({operationId:op,code:'PLAN_REVISION_CONFLICT',serverRevision:Number(p.row[5])});return;}
  if(!slotsByPlan[c.planId])slotsByPlan[c.planId]=PS3_slots_(ss,c.planId,Number(p.row[5]));
  var key=c.planId+'|'+c.date+'|'+c.topicId;
  if(!slotsByPlan[c.planId][c.date+'|'+c.topicId])PS3_fail_('SLOT_NOT_FOUND','현재 일정에 없는 토픽');
  var latest=null,maxSeq=0;
  progress.rows.forEach(function(r){if(r[0]===c.planId){maxSeq=Math.max(maxSeq,Number(r[1]||0));if(r[4]===key&&(!latest||Number(r[1])>Number(latest[1])))latest=r;}});
  var rowRev=latest?Number(latest[7]):0,expected=Number(c.expectedRowRevision);
  if(!Number.isInteger(expected)||expected<0)PS3_fail_('BAD_PROGRESS','expectedRowRevision 오류');
  if(expected!==rowRev){result.conflicts.push({operationId:op,progressKey:key,serverRowRevision:rowRev,serverStatus:latest?latest[5]:'todo'});return;}
  var seq=maxSeq+1,row=[c.planId,seq,c.date,c.topicId,key,c.status,rowRev,rowRev+1,op,hash,auth.deviceId,Number(c.planRevisionAtWrite),PS3_now_(),PS3_str_(c.clientAt),'user'];
  PS3_row_(progress.sheet,row);progress.rows.push(row);existingIds[op]=row;
  result.applied.push({operationId:op,rowRevision:rowRev+1,serverSeq:seq});
  var pNew=PS3_table_(ss,'plans');var pRec=PS3_find_(pNew.rows,0,c.planId);
  pNew.sheet.getRange(pRec.index+2,12).setValue(seq);
 });
 return result;
}
