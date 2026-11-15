/**
 * Test-only resumption controller for 19,060-slot editor benchmark.
 *
 * Install this file ONLY in the existing isolated Stage8 test Apps Script.
 * It does not create/modify a production deployment or production sheets.
 * It does not call PS8R_begin: only resumes the existing synthetic plan.
 *
 * Run PS8R_autoStart ONCE in Apps Script editor (Google permissions may be
 * required); then the independent Google time trigger runs PS8R_autoTick,
 * verifies and runs PS8R_progress exactly once, and removes its own trigger.
 *
 * All errors stop the trigger and preserve all existing sheets/state.
 * PS8R_autoStatus is read-only. PS8R_autoStop stops only this handler.
 */
var PS8R_AUTO_HANDLER_ = 'PS8R_autoTick';
var PS8R_AUTO_KEY_ = 'PS8R_AUTO_CONTROL_V1';
var PS8R_AUTO_MAX_TICKS_ = 48;
var PS8R_AUTO_MAX_AGE_MS_ = 8 * 60 * 60 * 1000;

function PS8R_autoRead_() {
  var raw=PropertiesService.getScriptProperties().getProperty(PS8R_AUTO_KEY_);
  return raw?JSON.parse(raw):null;
}
function PS8R_autoWrite_(s) {
  PropertiesService.getScriptProperties().setProperty(PS8R_AUTO_KEY_,JSON.stringify(s));
}
function PS8R_autoOwnTriggers_() {
  return ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === PS8R_AUTO_HANDLER_;
  });
}
function PS8R_autoClearOwnTriggers_() {
  PS8R_autoOwnTriggers_().forEach(function(t) { ScriptApp.deleteTrigger(t); });
}
function PS8R_autoSafeState_(s) {
  var p=PS8R_getState_();
  if(!s || s.planId!==p.planId || s.operationId!==p.operationId)
    throw new Error('AUTO_RUN_ID_MISMATCH: existing synthetic run was replaced');
  return p;
}
function PS8R_autoStart() {
  var sp=PropertiesService.getScriptProperties();
  if(sp.getProperty('PLANNER_SYNC_MODE')!=='ISOLATED_TEST')
    throw new Error('AUTO_ISOLATION_REQUIRED');
  if(sp.getProperty('STUDY_NOTE_SPREADSHEET_ID') ||
     sp.getProperty('PLANNER_SYNC_PRODUCTION_SPREADSHEET_ID'))
    throw new Error('AUTO_LIVE_CONTEXT_BLOCKED');
  PS8R_preflight(); // checks TEST ONLY workbook, four tab schemas, separate ID
  var plan=PS8R_getState_();
  if(['STAGING','READY','COMMITTED','VERIFIED'].indexOf(plan.status)<0)
    throw new Error('AUTO_NO_RESUMABLE_SYNTHETIC_PLAN');
  var prev=PS8R_autoRead_(),existing=PS8R_autoOwnTriggers_();
  if(existing.length>1)throw new Error('AUTO_DUPLICATE_TRIGGER_BLOCKED');
  if(existing.length===1) {
    if(prev&&prev.status==='RUNNING'&&prev.planId===plan.planId)
      return PS8R_autoStatus(); // idempotent start, never create a second trigger
    throw new Error('AUTO_TRIGGER_OWNERSHIP_CONFLICT');
  }
  if(prev&&prev.status==='RUNNING'&&prev.planId!==plan.planId)
    throw new Error('AUTO_DIFFERENT_RUN_ALREADY_ACTIVE');
  if(plan.status==='VERIFIED'&&plan.progressChecked)
    return {status:'COMPLETED',planId:plan.planId,verified:true,progressChecked:true};
  var control={status:'RUNNING',planId:plan.planId,operationId:plan.operationId,
    startedAt:new Date().toISOString(),ticks:0,nextOffset:plan.nextOffset,
    maxTicks:PS8R_AUTO_MAX_TICKS_,lastError:'',updatedAt:new Date().toISOString()};
  PS8R_autoWrite_(control);
  try {
    // Google executes later, without requiring an open ChatGPT/Chrome session.
    ScriptApp.newTrigger(PS8R_AUTO_HANDLER_).timeBased().everyMinutes(1).create();
  }catch(e) {
    control.status='FAILED';control.lastError='TRIGGER_INSTALL_FAILED';
    PS8R_autoWrite_(control);throw e;
  }
  Logger.log('PS8R_AUTO_SCHEDULED '+JSON.stringify({
    planId:plan.planId,nextOffset:plan.nextOffset,expectedChunks:plan.chunkCount,
    status:'RUNNING',productionData:false,hmacNonce:'NOT_TESTED'}));
  return {status:'RUNNING',planId:plan.planId,nextOffset:plan.nextOffset,
    next:'No repeated manual PS8R_runEditorBatch needed; inspect PS8R_autoStatus later'};
}
function PS8R_autoTick() {
  var lock=LockService.getUserLock();
  if(!lock.tryLock(1000)) {
    Logger.log('PS8R_AUTO_BUSY_SKIP: another isolated trigger is running');
    return {status:'SKIPPED_LOCKED'};
  }
  var ctl=null;
  try {
    ctl=PS8R_autoRead_();
    if(!ctl||ctl.status!=='RUNNING') return {status:'PAUSED'};
    var state=PS8R_autoSafeState_(ctl);
    var age=Date.now()-new Date(ctl.startedAt).getTime();
    if(ctl.ticks>=PS8R_AUTO_MAX_TICKS_ || !Number.isFinite(age) ||
       age<0 || age>PS8R_AUTO_MAX_AGE_MS_)
      throw new Error('AUTO_LIMIT_REACHED: no unbounded retries');
    ctl.ticks++;
    ctl.updatedAt=new Date().toISOString();
    PS8R_autoWrite_(ctl);
    if(state.status!=='VERIFIED') {
      // Each invocation is bounded by the existing ~3-minute safe execution
      // budget and persists nextOffset after every acknowledged PUT.
      PS8R_runEditorBatch();
      state=PS8R_autoSafeState_(ctl);
    }
    if(state.status==='VERIFIED'&&!state.progressChecked) {
      // On unexpected error, stop. Never automatically retry a partially
      // written progress change without checking operation history.
      PS8R_progress();
      state=PS8R_autoSafeState_(ctl);
    }
    ctl.nextOffset=state.nextOffset;
    ctl.lastPlanStatus=state.status;
    ctl.progressChecked=!!state.progressChecked;
    ctl.updatedAt=new Date().toISOString();
    if(state.status==='VERIFIED' && state.progressChecked){
      ctl.status='COMPLETED';
      PS8R_autoWrite_(ctl);
      PS8R_autoClearOwnTriggers_();
      Logger.log('PS8R_AUTO_COMPLETED '+JSON.stringify({
        planId:state.planId,chunks:state.chunkCount,status:'VERIFIED',
        progressChecked:true,actualHmacNonce:'NOT_TESTED',releaseReady:false}));
      return {status:'COMPLETED',planId:state.planId,
        verified:true,progressChecked:true};
    }
    PS8R_autoWrite_(ctl);
    Logger.log('PS8R_AUTO_CONTINUE '+JSON.stringify({
      planId:state.planId,status:state.status,
      received:state.nextOffset,total:state.chunkCount,ticks:ctl.ticks}));
    return {status:'RUNNING',nextOffset:state.nextOffset,total:state.chunkCount};
  }catch(e){
    if(ctl){
      ctl.status='FAILED';ctl.lastError=String(e&&e.message||e).slice(0,500);
      ctl.updatedAt=new Date().toISOString();PS8R_autoWrite_(ctl);
    }
    PS8R_autoClearOwnTriggers_();
    Logger.log('PS8R_AUTO_FAILED '+JSON.stringify({
      message:String(e&&e.message||e).slice(0,500),resumeRequiresReview:true}));
    throw e;
  }finally {
    lock.releaseLock();
  }
}
function PS8R_autoStatus() {
  var c=PS8R_autoRead_(),state=PropertiesService.getScriptProperties()
    .getProperty(PS8R_STATE_KEY_);
  var p=state?JSON.parse(state):null;
  var result={automation:c?c.status:'NOT_STARTED',
    autoTicks:c?c.ticks:0,
    planId:p?p.planId:null,stage:p?p.status:null,
    receivedChunks:p?p.nextOffset:0,totalChunks:p?p.chunkCount:0,
    progressChecked:!!(p&&p.progressChecked),
    lastError:c&&c.lastError||'',
    hmacNonce:'NOT_TESTED',productionReleased:false};
  Logger.log('PS8R_AUTO_STATUS '+JSON.stringify(result));
  return result;
}
function PS8R_autoStop() {
  var c=PS8R_autoRead_();
  if(c&&c.status==='RUNNING'){
    c.status='PAUSED';c.updatedAt=new Date().toISOString();
    PS8R_autoWrite_(c);
  }
  PS8R_autoClearOwnTriggers_();
  Logger.log('PS8R_AUTO_STOPPED: only this isolated handler trigger removed');
  return PS8R_autoStatus();
}
