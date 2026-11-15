/*
 * Stage 8 isolated Google Apps Script REAL SHEETS probe (editor-only).
 * This file is not a deployed route and never modifies the main application.
 *
 * Requires:
 *  - Study Planner Stage3 isolated addon source installed in the SAME
 *    NEW test-only Apps Script project.
 *  - PLANNER_SYNC_MODE=ISOLATED_TEST
 *  - PLANNER_SYNC_TEST_SPREADSHEET_ID = separately owned TEST ONLY Sheet.
 *  - No operating database ID, device key or user learning data.
 *
 * Test sequence in Apps Script editor:
 * PS8R_preflight, PS8R_begin, PS8R_upload (repeat until complete),
 * PS8R_commit, PS8R_verify, PS8R_progress.
 *
 * This is an editor-only synthetic ACTIVE context to measure Sheets
 * persistence; it is NOT HMAC/nonce/production trust-device validation.
 * Do NOT attach this file to any operating Apps Script deployment.
 */

var PS8R_STATE_KEY_ = 'PS8R_ISOLATED_RUN_STATE';
var PS8R_AUTH_ = { status:'ACTIVE', deviceId:'ps8r-editor-synthetic-test-only' };
function PS8R_assert_(condition,description) {
  if(!condition) throw new Error('PS8R_ASSERT: '+description);
}
function PS8R_log_(name,report){
  var result={test:name,kind:'REAL_GOOGLE_SHEETS_EDITOR_SYNTHETIC_AUTH',
    actualHmacNonce:'NOT_TESTED',releaseReady:false};
  Object.keys(report||{}).forEach(function(k){result[k]=report[k];});
  Logger.log(JSON.stringify(result));
  return result;
}
function PS8R_bytes_(text){return Utilities.newBlob(text).getBytes().length;}
function PS8R_plan_(planId){
  var days=[],startUtc=Date.UTC(2026,10,16),oneDayMs=86400000;
  for(var i=0;i<100;i++){
    var date=new Date(startUtc+i*oneDayMs).toISOString().slice(0,10);
    days.push({date:date,round:Math.floor(i/20)+1,ids:[],groups:[]});
  }
  for(var pass=0;pass<5;pass++){
    for(var t=1;t<=3812;t++){
      var idx=pass*20+Math.floor((t-1)*20/3812);
      days[idx].ids.push('T'+('0000'+t).slice(-4));
      days[idx].groups.push('G01');
    }
  }
  return {id:planId,name:'Stage8 isolated synthetic load 19060',
    start:days[0].date,end:days[days.length-1].date,rounds:5,
    groups:{G01:'Synthetic'},days:days};
}
function PS8R_canonical_(p){
  return JSON.stringify({
    id:p.id,name:p.name,start:p.start,end:p.end,rounds:p.rounds,
    groups:Object.keys(p.groups).sort().map(function(k){return [k,p.groups[k]];}),
    days:p.days.map(function(d){
      return {date:d.date,round:d.round==null?null:d.round,
        entries:d.ids.map(function(id,i){return [id,d.groups[i]];})};
    })
  });
}
function PS8R_slices_(rows){
  var result=[],batch=[];
  rows.forEach(function(row){
    if(PS8R_bytes_(JSON.stringify(batch.concat([row])))>7800&&batch.length){
      result.push(batch);batch=[];
    }
    batch.push(row);
    PS8R_assert_(PS8R_bytes_(JSON.stringify(batch))<=8192,'oversized single chunk');
  });
  result.push(batch);
  return result;
}
function PS8R_chunks_(p){
  var chunks=[];
  function add(kind,date,round,rows){
    var groups=PS8R_slices_(rows);
    groups.forEach(function(part,i){
      var payloadJson=JSON.stringify(part);
      chunks.push({chunkKey:(kind==='GROUPS'?'GROUPS:':'DAY:'+date+':')+('000'+i).slice(-3),
        kind:kind,date:kind==='GROUPS'?'':date,round:kind==='GROUPS'?null:round,
        partIndex:i,partCount:groups.length,payloadJson:payloadJson,chunkHash:PS3_sha_(payloadJson)});
    });
  }
  add('GROUPS','',null,Object.keys(p.groups).sort().map(function(k){return [k,p.groups[k]];}));
  p.days.forEach(function(d){add('DAY',d.date,d.round,d.ids.map(function(id,i){return [id,d.groups[i]];}));});
  return {meta:{planId:p.id,name:p.name,start:p.start,end:p.end,rounds:p.rounds},
    chunks:chunks,snapshotHash:PS3_sha_(PS8R_canonical_(p))};
}
function PS8R_wireChunk_(c){
  return {chunkKey:c.chunkKey,kind:c.kind,date:c.date,
    // Google Sheets returns blank GROUPS round as '', while the client sends null.
    // This representation-only difference must not invalidate a verified chunk.
    round:c.kind==='GROUPS'&&c.round===''?null:c.round,
    partIndex:Number(c.partIndex),partCount:Number(c.partCount),
    payloadJson:c.payloadJson,chunkHash:c.chunkHash};
}
function PS8R_chunksEquivalent_(actual,expected){
  return JSON.stringify(PS8R_wireChunk_(actual))===JSON.stringify(PS8R_wireChunk_(expected));
}
function PS8R_getState_(){
  var v=PropertiesService.getScriptProperties().getProperty(PS8R_STATE_KEY_);
  if(!v)throw new Error('No PS8R run. Execute PS8R_begin first.');
  return JSON.parse(v);
}
function PS8R_saveState_(state){
  PropertiesService.getScriptProperties().setProperty(PS8R_STATE_KEY_,JSON.stringify(state));
}
function PS8R_check_(){
  var ss=PS3_context_(); // requires mode, separate ID, name and TEST ONLY marker
  ['plans','schedule','progress','operations'].forEach(function(x){PS3_table_(ss,x);});
  return ss;
}
function PS8R_preflight(){
  var start=Date.now(),ss=PS8R_check_();
  return PS8R_log_('preflight',{sheetTitle:ss.getName(),tabCount:ss.getSheets().length,
    isolationGuard:true,elapsedMs:Date.now()-start,
    next:'PS8R_begin. Editor-only; do not publish any web endpoint.'});
}
function PS8R_begin(){
  PS8R_check_();
  var previous=PropertiesService.getScriptProperties().getProperty(PS8R_STATE_KEY_);
  if(previous){
    var old=JSON.parse(previous);
    if(old.status!=='VERIFIED'){
      return PS8R_log_('begin-existing',{state:old,
        next:'Continue unfinished run; will not overwrite or delete it.'});
    }
  }
  var planId='s8r_'+Utilities.getUuid().replace(/-/g,'').slice(0,20);
  var operationId='s8rop_'+Utilities.getUuid().replace(/-/g,'').slice(0,24);
  var p=PS8R_plan_(planId),v=PS8R_chunks_(p);
  var slots=p.days.reduce(function(n,d){return n+d.ids.length;},0);
  PS8R_assert_(slots===19060,'slots != 19060');
  PS8R_assert_(v.chunks.length>=101,'minimum chunks');
  var begin={operationId:operationId,planId:planId,baseRevision:0,
    meta:v.meta,snapshotHash:v.snapshotHash,expectedChunks:v.chunks.length};
  var t0=Date.now(),created=PS3_post_('beginStudyPlanRevision',begin,PS8R_AUTH_);
  PS8R_assert_(created.ok===true&&!!created.stageId,'begin response');
  var state={planId:planId,operationId:operationId,stageId:created.stageId,
    snapshotHash:v.snapshotHash,chunkCount:v.chunks.length,nextOffset:0,
    status:'STAGING',startedAt:new Date().toISOString(),
    timings:{beginMs:Date.now()-t0,puts:[],commitMs:null,verifyMs:null}};
  PS8R_saveState_(state);
  return PS8R_log_('begin',{planId:planId,slots:slots,chunks:v.chunks.length,
    beginMs:state.timings.beginMs,next:'PS8R_upload; repeat until status=READY'});
}
function PS8R_upload(){
  PS8R_check_();
  var state=PS8R_getState_();
  if(state.status==='COMMITTED'||state.status==='VERIFIED')return PS8R_log_('upload-already-done',{status:state.status});
  if(state.status==='READY')return PS8R_log_('upload-ready',{next:'PS8R_commit'});
  PS8R_assert_(state.status==='STAGING','unexpected upload state');
  var v=PS8R_chunks_(PS8R_plan_(state.planId));
  PS8R_assert_(v.snapshotHash===state.snapshotHash&&v.chunks.length===state.chunkCount,'fixture mismatch');
  var from=state.nextOffset,to=Math.min(from+12,v.chunks.length);
  PS8R_assert_(from<to,'upload range');
  var request={operationId:state.operationId,stageId:state.stageId,chunks:v.chunks.slice(from,to)};
  var requestBytes=PS8R_bytes_(JSON.stringify({action:'putStudyPlanChunks',data:request}));
  var t0=Date.now(),done=PS3_post_('putStudyPlanChunks',request,PS8R_AUTH_);
  PS8R_assert_(done.ok===true&&done.received>=to,'chunk accepted');
  var elapsedMs=Date.now()-t0;
  state.timings.puts.push({from:from,to:to,elapsedMs:elapsedMs,requestBytes:requestBytes,
    accepted:done.accepted,duplicates:done.duplicates});
  state.nextOffset=to;
  if(to===v.chunks.length)state.status='READY';
  PS8R_saveState_(state);
  return PS8R_log_('upload',{from:from,to:to,total:state.chunkCount,status:state.status,
    elapsedMs:elapsedMs,requestBytes:requestBytes,
    next:state.status==='READY'?'PS8R_commit':'PS8R_upload'});
}
function PS8R_commit(){
  PS8R_check_();
  var s=PS8R_getState_();
  if(s.status==='COMMITTED'||s.status==='VERIFIED')return PS8R_log_('commit-already-done',{status:s.status});
  PS8R_assert_(s.status==='READY'&&s.nextOffset===s.chunkCount,'not fully uploaded');
  var request={operationId:s.operationId,stageId:s.stageId,
    baseRevision:0,snapshotHash:s.snapshotHash};
  var t0=Date.now(),r=PS3_post_('commitStudyPlanRevision',request,PS8R_AUTH_);
  PS8R_assert_(r.ok===true&&Number(r.activeRevision)===1,'commit revision mismatch');
  if(r.duplicate){
    // A lost commit ACK may leave a committed revision with no `entries`
    // field on retry. Verify the persisted active hash and count before resuming.
    var summaries=PS3_get_('studyPlans',{},PS8R_AUTH_).plans;
    var active=summaries.filter(function(p){return p.planId===s.planId;})[0];
    PS8R_assert_(active&&active.activeHash===s.snapshotHash&&
      Number(active.slotCount)===19060&&Number(active.activeRevision)===1,
      'duplicate commit had no matching persisted active snapshot');
  }else PS8R_assert_(r.entries===19060,'commit entries mismatch');
  s.timings.commitMs=Date.now()-t0;s.status='COMMITTED';PS8R_saveState_(s);
  return PS8R_log_('commit',{planId:s.planId,entries:19060,duplicate:!!r.duplicate,days:r.days,
    activeRevision:r.activeRevision,commitMs:s.timings.commitMs,next:'PS8R_verify'});
}
function PS8R_verify(){
  PS8R_check_();
  var s=PS8R_getState_();
  PS8R_assert_(s.status==='COMMITTED'||s.status==='VERIFIED','commit not done');
  var start=Date.now(),r=PS3_get_('studyPlans',{},PS8R_AUTH_);
  var meta=r.plans.filter(function(p){return p.planId===s.planId;})[0];
  PS8R_assert_(meta&&meta.activeHash===s.snapshotHash,'active plan/hash mismatch');
  PS8R_assert_(meta.slotCount===19060&&meta.dayCount===100&&meta.activeRevision===1,'summary counts');
  var expected=PS8R_chunks_(PS8R_plan_(s.planId)),all=[],offset=0,pages=0;
  do{
    var page=PS3_get_('studyPlanSchedule',{planId:s.planId,revision:1,
      offset:offset,limit:40},PS8R_AUTH_);
    PS8R_assert_(page.hash===s.snapshotHash,'schedule hash');
    all=all.concat(page.chunks);pages++;
    if(!page.hasMore)break;
    PS8R_assert_(page.nextOffset>offset,'pagination stuck');
    offset=page.nextOffset;
  }while(pages<100);
  var present={};
  all.forEach(function(c){
    PS8R_assert_(!present[c.chunkKey],'duplicate chunk key');
    PS8R_assert_(PS3_sha_(c.payloadJson)===c.chunkHash,'chunk SHA');
    present[c.chunkKey]=JSON.stringify(c);
  });
  expected.chunks.forEach(function(c){
    PS8R_assert_(PS8R_chunksEquivalent_(JSON.parse(present[c.chunkKey]),c),'chunk mismatch '+c.chunkKey);
  });
  PS8R_assert_(all.length===expected.chunks.length,'incomplete download');
  var elapsedMs=Date.now()-start;
  s.timings.verifyMs=elapsedMs;s.status='VERIFIED';PS8R_saveState_(s);
  var totalRequestBytes=s.timings.puts.reduce(function(n,x){return n+x.requestBytes;},0);
  var maxRequestBytes=Math.max.apply(Math,s.timings.puts.map(function(x){return x.requestBytes;}));
  var totalMs=s.timings.beginMs+s.timings.puts.reduce(function(n,x){return n+x.elapsedMs;},0)
     +s.timings.commitMs+elapsedMs;
  return PS8R_log_('verify',{planId:s.planId,slots:meta.slotCount,chunks:all.length,pages:pages,
    snapshotSha256:s.snapshotHash,requestCount:{begin:1,put:s.timings.puts.length,commit:1,gets:1+pages},
    requestBytes:{totalPostChunks:totalRequestBytes,maxPostChunk:maxRequestBytes},
    measuredMs:{begin:s.timings.beginMs,puts:s.timings.puts.map(function(x){return x.elapsedMs;}),
      commit:s.timings.commitMs,readVerify:elapsedMs,total:totalMs},
    next:'PS8R_progress; Actual HMAC and nonce remain NOT_TESTED'});
}
function PS8R_progress(){
  PS8R_check_();
  var s=PS8R_getState_();PS8R_assert_(s.status==='VERIFIED','plan not verified');
  if(s.progressChecked)return PS8R_log_('progress-already-done',{planId:s.planId});
  var date='2026-11-16',op='s8rpr_'+Utilities.getUuid().replace(/-/g,'').slice(0,24);
  var sample={operationId:op,planId:s.planId,date:date,topicId:'T0001',status:'done',
    expectedRowRevision:0,planRevisionAtWrite:1,clientAt:'2026-11-16T00:00:00.000Z'};
  var t=Date.now(),first=PS3_post_('saveStudyProgress',{changes:[sample]},PS8R_AUTH_);
  PS8R_assert_(first.applied&&first.applied.length===1,'progress write');
  var duplicate=PS3_post_('saveStudyProgress',{changes:[sample]},PS8R_AUTH_);
  PS8R_assert_(duplicate.duplicate&&duplicate.duplicate.length===1,'operationId replay');
  var conflict=PS3_post_('saveStudyProgress',{changes:[{
    operationId:'s8rpr_'+Utilities.getUuid().replace(/-/g,'').slice(0,24),
    planId:s.planId,date:date,topicId:'T0001',status:'miss',
    expectedRowRevision:0,planRevisionAtWrite:1,clientAt:sample.clientAt}]},PS8R_AUTH_);
  PS8R_assert_(conflict.conflicts&&conflict.conflicts.length===1,'CAS conflict');
  var reset=PS3_post_('saveStudyProgress',{changes:[{
    operationId:'s8rpr_'+Utilities.getUuid().replace(/-/g,'').slice(0,24),
    planId:s.planId,date:date,topicId:'T0001',status:'todo',
    expectedRowRevision:1,planRevisionAtWrite:1,clientAt:sample.clientAt}]},PS8R_AUTH_);
  PS8R_assert_(reset.applied&&reset.applied.length===1,'explicit todo');
  var p=PS3_get_('studyProgress',{planId:s.planId,afterSeq:0,limit:10},PS8R_AUTH_);
  PS8R_assert_(p.events.length===2&&p.highWatermark===2&&p.events[1].status==='todo',
    'server highWatermark/todo');
  s.progressChecked=true;PS8R_saveState_(s);
  return PS8R_log_('progress',{planId:s.planId,applied:2,duplicates:1,conflicts:1,
    highWatermark:2,elapsedMs:Date.now()-t});
}

/**
 * One editor click: starts or resumes the 19,060-slot REAL Sheets probe.
 * Time-limited per invocation (3 minutes) to avoid Apps Script 6m quota.
 * May be run again if PAUSED. Requires private local PS8R_setupLocalIsolated()
 * on first invocation. Never touches the operating Script or MASTER.
 */
function PS8R_runEditorBatch(){
  var started=Date.now(),safeBudgetMs=180000;
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty('PLANNER_SYNC_MODE')!=='ISOLATED_TEST'||
     !props.getProperty('PLANNER_SYNC_TEST_SPREADSHEET_ID')){
    if(typeof PS8R_setupLocalIsolated!=='function')throw new Error(
      'BLOCKED: local isolated setup helper missing');
    PS8R_setupLocalIsolated();
  }
  PS8R_preflight();
  if(!props.getProperty(PS8R_STATE_KEY_))PS8R_begin();
  var state=PS8R_getState_();
  var uploadsThisRun=0;
  while(state.status==='STAGING'&&Date.now()-started<safeBudgetMs){
    PS8R_upload();uploadsThisRun++;
    state=PS8R_getState_();
  }
  if(state.status==='READY'&&Date.now()-started<safeBudgetMs){
    PS8R_commit();state=PS8R_getState_();
  }
  if(state.status==='COMMITTED'&&Date.now()-started<safeBudgetMs){
    PS8R_verify();state=PS8R_getState_();
  }
  return PS8R_log_('editorBatch',{
    status:state.status,planId:state.planId,
    nextOffset:state.nextOffset,chunks:state.chunkCount,
    uploadsThisRun:uploadsThisRun,elapsedMs:Date.now()-started,
    next:state.status==='VERIFIED'?'PS8R_progress for separate progress test':
      'Run PS8R_runEditorBatch again to resume the same isolated plan'
  });
}
