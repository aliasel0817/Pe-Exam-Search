/*
 * Editor-only production activation/pause helpers.
 * NOT registered in doGet/doPost. Invocation is restricted to an editor of
 * this Apps Script project through Google's built-in Apps Script permissions.
 * No topic, legacy learning record, annotation, attachment or planner row writes.
 */
function PS9_editorEnableProduction() {
 var lock=LockService.getScriptLock();
 lock.waitLock(15000);
 var props=PropertiesService.getScriptProperties();
 var beforeMode=props.getProperty('PLANNER_SYNC_MODE');
 var beforeReady=props.getProperty('PLANNER_SYNC_PRODUCTION_READY');
 var wroteFlags=false;
 try {
  if(typeof PS3_TABS_!=='object'||typeof PS3_HEADERS_!=='object'||typeof PS3_context_!=='function')
   throw new Error('PS9_DEPLOYMENT_INCOMPLETE');
  var id=props.getProperty('STUDY_NOTE_SPREADSHEET_ID');
  if(!id)throw new Error('STUDY_NOTE_SPREADSHEET_ID_MISSING');
  var ready='READY:'+id;
  if(beforeMode==='PRODUCTION'&&beforeReady===ready){
   if(PS3_context_().getId()!==id)throw new Error('PRODUCTION_CONTEXT_MISMATCH');
   Logger.log('PS9_EDITOR_PRODUCTION_ALREADY_ACTIVE_PASS');
   return {ok:true,alreadyEnabled:true,writeToLearningData:false};
  }
  if(beforeMode&&beforeMode!=='DISABLED')
   throw new Error('EXISTING_PLANNER_MODE_UNEXPECTED');
  if(beforeReady&&beforeReady!==ready)
   throw new Error('PRODUCTION_READY_FOR_DIFFERENT_SPREADSHEET');
  var ss=SpreadsheetApp.openById(id);
  if(ss.getName()!=='topic_study_data'||!ss.getSheetByName('암기장'))
   throw new Error('MASTER_ID_OR_TITLE_MISMATCH');
  ['학습정보','첨부자료','관리기기','주석동기화'].forEach(function(name){
   if(!ss.getSheetByName(name))throw new Error('PROTECTED_ORIGINAL_TAB_MISSING');
  });
  Object.keys(PS3_TABS_).forEach(function(kind){
   var s=ss.getSheetByName(PS3_TABS_[kind]),h=PS3_HEADERS_[kind];
   if(!s)throw new Error('NEW_PLANNER_TAB_MISSING:'+kind);
   if(JSON.stringify(s.getRange(1,1,1,h.length).getValues()[0])!==JSON.stringify(h))
    throw new Error('NEW_PLANNER_TAB_HEADER_MISMATCH:'+kind);
  });
  props.setProperty('PLANNER_SYNC_PRODUCTION_READY',ready);
  props.setProperty('PLANNER_SYNC_MODE','PRODUCTION');
  wroteFlags=true;
  if(PS3_context_().getId()!==id)throw new Error('PRODUCTION_CONTEXT_VERIFY_FAILED');
  Logger.log('PS9_EDITOR_PRODUCTION_ACTIVATION_PASS '+
   JSON.stringify({ok:true,plannerTabs:4,originalTabsPreserved:true,userDataMigrated:false}));
  return {ok:true,plannerTabs:4,originalTabsPreserved:true,userDataMigrated:false};
 }catch(error){
  if(wroteFlags){
   if(beforeMode)props.setProperty('PLANNER_SYNC_MODE',beforeMode);
   else props.deleteProperty('PLANNER_SYNC_MODE');
   if(beforeReady)props.setProperty('PLANNER_SYNC_PRODUCTION_READY',beforeReady);
   else props.deleteProperty('PLANNER_SYNC_PRODUCTION_READY');
  }
  throw error;
 }finally{lock.releaseLock();}
}
function PS9_editorPauseProduction() {
 var props=PropertiesService.getScriptProperties();
 props.setProperty('PLANNER_SYNC_MODE','DISABLED');
 Logger.log('PS9_EDITOR_PLANNER_WRITES_PAUSED_PASS');
 return {ok:true,plannerMode:'DISABLED',legacyLearningUnaffected:true};
}
