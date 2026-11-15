'use strict';
/* Stage9 release candidate: synthetic only; never accesses user/Google data. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const get=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const gs=get('backend/planner-sync-stage3-isolated.addon.gs');
const bridge=get('backend/planner-sync-stage9-production-bridge.addon.gs');
const approvedHost=get('mupdf-migration/r5/source/Code.js');
const build=require('../backend/build-planner-sync-stage9-host-candidate.cjs');
const {source:host,baselineSha256,candidateSha256}=build.buildSignedPlannerHost(approvedHost);
assert.equal(baselineSha256,build.APPROVED_V21_SHA256);
assert.notEqual(candidateSha256,baselineSha256);
const planner=get('study-planner.js'),ui=get('study-planner-migration-ui.js');
const csrc=get('study-planner-sync.js');
assert(host.includes("if (typeof PS9_isPlannerGet_ === 'function' && PS9_isPlannerGet_(action))"));
assert(host.includes("PS9_signedPlannerGet_(params)"));
assert(host.includes("PS9_verifiedPlannerPost_(action, verified)"));
assert(host.indexOf("validateSignedMutation_(envelope, ['ACTIVE'])")<host.indexOf("PS9_verifiedPlannerPost_(action, verified)"));
for(const key of ['health','learningstates','annotationsync','referencepdfcontent','mutationstatus']){
 assert(host.includes("action === '"+key+"'"),'legacy GET missing '+key);
}
for(const key of ['addtopic','uploadattachment','savelearningstates','saveannotations','revokedevice']){
 assert(host.includes("action === '"+key+"'"),'legacy POST missing '+key);
}
const tableValues={PRODUCTION:'PRODUCTION'};
const props={};let sheetName='topic_study_data',missing='',wrongHeader='',reads=0,signatureChecks=0,writeCalls=0;
let env={console,JSON,String,Object,Array,Error,Number,Date,RegExp,
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>props[key]||''})},
 SpreadsheetApp:{openById:id=>{
  reads++;
  if(id!=='stage9-synthetic-id')throw Error('unexpected spreadsheet');
  return {getName:()=>sheetName,getSheetByName:name=>{
   if(name==='암기장')return {};
   const kind=Object.keys(env.PS3_TABS_).find(x=>env.PS3_TABS_[x]===name);
   if(!kind||kind===missing)return null;
   return {getRange:()=>({getValues:()=>[kind===wrongHeader?['broken']:env.PS3_HEADERS_[kind]]})};
  }};
 }},
 validateSignedGet_:(_params,statuses)=>{
  signatureChecks++;assert.deepEqual(Array.from(statuses),['ACTIVE']);
  return {status:'ACTIVE',deviceId:'stage9synthetic1',data:{},email:'invalid@test.example'};
 },
 PS3_get_:(action,data,auth)=>({ok:true,action,auth:auth.status}),
 PS3_post_:(action,data,auth)=>{writeCalls++;return {ok:true,action,auth:auth.status};}
};
vm.createContext(env);
const a=gs.indexOf('function PS3_context_(){'),b=gs.indexOf('function PS3_table_(ss,kind){');
assert(a>0&&b>a,'production context missing');
vm.runInContext(gs.slice(0,a)+gs.slice(a,b),env);
vm.runInContext(bridge,env);
const mustThrow=(fn,code)=>assert.throws(fn,e=>e.code===code||String(e.message).includes(code));
mustThrow(()=>env.PS3_context_(),'ISOLATION_REQUIRED');
props.PLANNER_SYNC_MODE='PRODUCTION';
mustThrow(()=>env.PS3_context_(),'RELEASE_BLOCKED');
props.STUDY_NOTE_SPREADSHEET_ID='stage9-synthetic-id';
mustThrow(()=>env.PS3_context_(),'RELEASE_BLOCKED');
props.PLANNER_SYNC_PRODUCTION_READY='READY:stage9-synthetic-id';
assert(env.PS3_context_());
sheetName='not-the-master';
mustThrow(()=>env.PS3_context_(),'RELEASE_BLOCKED');
sheetName='topic_study_data';
missing='schedule';
mustThrow(()=>env.PS3_context_(),'SCHEMA_MISSING');
missing='';wrongHeader='progress';
mustThrow(()=>env.PS3_context_(),'SCHEMA_MISMATCH');
wrongHeader='';
assert(env.PS3_context_());
for(const bad of ['constructor','toString','__proto__','deleteall']){
 assert(!env.PS9_isPlannerGet_(bad),'GET allowlist '+bad);
 assert(!env.PS9_isPlannerPost_(bad),'POST allowlist '+bad);
}
assert(env.PS9_isPlannerGet_('STUDYPLANS'));
assert(env.PS9_isPlannerPost_('SAVEStudyProgress'));
let signed=env.PS9_signedPlannerGet_({action:'studyPlans'});
assert.equal(signed.ok,true);
assert.equal(signatureChecks,1);
assert.equal(env.PS9_verifiedPlannerPost_('saveStudyProgress',{auth:{status:'ACTIVE',deviceId:'stage9synthetic1'},data:{}}).ok,true);
assert.equal(writeCalls,1);
mustThrow(()=>env.PS9_verifiedPlannerPost_('saveStudyProgress',{auth:{status:'PENDING',deviceId:'stage9synthetic1'},data:{}}),'AUTH_REQUIRED');
props.PLANNER_SYNC_MODE='DISABLED';
mustThrow(()=>env.PS9_signedPlannerGet_({action:'studyPlans'}),'RELEASE_BLOCKED');
mustThrow(()=>env.PS9_verifiedPlannerPost_('saveStudyProgress',{auth:{status:'ACTIVE',deviceId:'stage9synthetic1'},data:{}}),'RELEASE_BLOCKED');
assert.equal(writeCalls,1);
assert(csrc.includes('function productionEnabled()'));
assert(csrc.includes("root.PE_PLANNER_SYNC_SERVER_VERIFIED===true"));
assert(csrc.includes("root.location?.hostname==='aliasel0817.github.io'"));
assert(csrc.includes('if(!enabled())return'));
assert(planner.includes("const result=await transport.get('studyPlans',{})"));
assert(planner.includes('await connectProductionPlannerTransport()'));
assert(planner.includes('loadStage5FirstMigrationAddon()'));
assert(planner.includes("if(!client?.enabled()||document.getElementById('plannerFirstSyncWizard'))return;"));
assert(planner.includes("if(!client?.enabled()||!window.PEPlannerSyncUX"));
assert(ui.includes('root.PE_PLANNER_SYNC_PRODUCTION_TRANSPORT'));
const oldLocation=globalThis.location,oldVerified=globalThis.PE_PLANNER_SYNC_SERVER_VERIFIED,
 oldTransport=globalThis.PE_PLANNER_SYNC_PRODUCTION_TRANSPORT;
globalThis.location={hostname:'aliasel0817.github.io'};
globalThis.PE_PLANNER_SYNC_SERVER_VERIFIED=false;
globalThis.PE_PLANNER_SYNC_PRODUCTION_TRANSPORT={get:()=>{},post:()=>{}};
const client=require('../study-planner-sync.js');
assert.equal(client.enabled(),false,'production enablement must fail closed before signed GET');
globalThis.PE_PLANNER_SYNC_SERVER_VERIFIED=true;
assert.equal(client.enabled(),true,'signed GET confirmation may enable transport');
globalThis.location={hostname:'example.invalid'};
assert.equal(client.enabled(),false,'host must be allowlisted');
globalThis.location=oldLocation;
globalThis.PE_PLANNER_SYNC_SERVER_VERIFIED=oldVerified;
globalThis.PE_PLANNER_SYNC_PRODUCTION_TRANSPORT=oldTransport;
console.log('STAGE9_PRODUCTION_GUARDS_SYNTHETIC_PASS',JSON.stringify({
 productionModeRequiresReadyFlag:true,masterNameAndPlanTabsVerified:true,
 signedRouteGuards:true,oldActionsPreserved:true,hostGatedClient:true,
 readProbesOnlyBeforeMigration:true,syntheticReads:reads,syntheticWrites:writeCalls,
 actualAppsScript:'UNVERIFIED',actualHmacNonce:'UNVERIFIED',
 actualUserData:'NOT_TOUCHED',operatingDeployment:'NOT_PERFORMED'
}));
