'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const backend=fs.readFileSync(path.resolve(__dirname,'../backend/planner-sync-stage3-isolated.addon.gs'),'utf8');
const control=fs.readFileSync(path.resolve(__dirname,'../backend/planner-sync-stage9-release-control.addon.gs'),'utf8');
const bridge=fs.readFileSync(path.resolve(__dirname,'../backend/planner-sync-stage9-production-bridge.addon.gs'),'utf8');
assert(!bridge.includes('PS9_editorEnableProduction'), 'Production activation must not be remotely routable');
const make=(opts={})=>{
 const id='test-only-live-master-id';
 const props={STUDY_NOTE_SPREADSHEET_ID:id,...opts.properties},writes=[],logs=[];
 const property={
  getProperty:k=>Object.prototype.hasOwnProperty.call(props,k)?props[k]:null,
  setProperty:(k,v)=>{props[k]=v;writes.push(k)},
  deleteProperty:k=>{delete props[k];writes.push(k)}
 };
 const context={
  PropertiesService:{getScriptProperties:()=>property},
  Logger:{log:s=>logs.push(String(s))},
  LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
  SpreadsheetApp:{openById:x=>{
   if(x!==id)throw Error('Wrong simulated Sheet');
   return ss;
  }}
 };
 vm.createContext(context);vm.runInContext(backend+'\n'+control,context);
 const h=context.PS3_HEADERS_,titles=context.PS3_TABS_;
 const sheets={};
 for(const name of ['암기장','학습정보','첨부자료','관리기기','주석동기화'])sheets[name]={getRange:()=>({getValues:()=>[[]]})};
 for(const [kind,name] of Object.entries(titles)){
  const header=Array.from(h[kind]);
  sheets[name]={getRange:()=>({getValues:()=>[opts.corruptKind===kind?['BAD',...header.slice(1)]:header]})};
 }
 if(opts.missingTab)delete sheets[opts.missingTab];
 const ss={getId:()=>id,getName:()=>opts.masterTitle||'topic_study_data',
  getSheetByName:name=>sheets[name]||null};
 return {context,props,writes,logs};
};
const good=make();
const result=good.context.PS9_editorEnableProduction();
assert.equal(result.ok,true);assert.equal(result.plannerTabs,4);
assert.equal(good.props.PLANNER_SYNC_MODE,'PRODUCTION');
assert.equal(good.props.PLANNER_SYNC_PRODUCTION_READY,'READY:test-only-live-master-id');
assert.equal(good.context.PS9_editorEnableProduction().alreadyEnabled,true);
assert.equal(good.context.PS9_editorPauseProduction().plannerMode,'DISABLED');
assert.equal(good.props.PLANNER_SYNC_MODE,'DISABLED');
assert.equal(good.props.PLANNER_SYNC_PRODUCTION_READY,'READY:test-only-live-master-id');
const failures=[
 {opts:{masterTitle:'different'},type:'MASTER_ID_OR_TITLE_MISMATCH'},
 {opts:{missingTab:'암기장'},type:'MASTER_ID_OR_TITLE_MISMATCH'},
 {opts:{missingTab:'학습계획진도'},type:'NEW_PLANNER_TAB_MISSING'},
 {opts:{missingTab:'주석동기화'},type:'PROTECTED_ORIGINAL_TAB_MISSING'},
 {opts:{corruptKind:'schedule'},type:'NEW_PLANNER_TAB_HEADER_MISMATCH'},
 {opts:{properties:{PLANNER_SYNC_MODE:'ISOLATED_TEST'}},type:'EXISTING_PLANNER_MODE_UNEXPECTED'},
 {opts:{properties:{PLANNER_SYNC_PRODUCTION_READY:'READY:different'}},type:'PRODUCTION_READY_FOR_DIFFERENT_SPREADSHEET'},
 {opts:{properties:{STUDY_NOTE_SPREADSHEET_ID:''}},type:'STUDY_NOTE_SPREADSHEET_ID_MISSING'}
];
for(const test of failures){
 const r=make(test.opts);
 assert.throws(()=>r.context.PS9_editorEnableProduction(),new RegExp(test.type));
 assert.notEqual(r.props.PLANNER_SYNC_MODE,'PRODUCTION');
 assert.equal(r.writes.length,0,'bad schema must not write release properties');
}
assert(!/function\s+doGet\s*\(|function\s+doPost\s*\(/.test(control),'activation helper must be editor only');
console.log('STAGE9_EDITOR_ONLY_PRODUCTION_CONTROL_SYNTHETIC_PASS',JSON.stringify({
 noPublicRoute:true,writeOnlyTwoScriptProperties:true,originalTabsChecked:true,
 fourNewSchemaHeadersChecked:true,allNegativeCases:failures.length,
 repeatSafe:true,pauseSafe:true,syntheticOnly:true,operatingDataWritten:false}));
