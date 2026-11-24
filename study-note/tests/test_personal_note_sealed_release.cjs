'use strict';
/* Synthetic only: sealed one-time activation may run ONLY behind verified ACTIVE.
 * Real operating script ID and Google Drive folder data are NEVER accessed.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync(path.resolve(__dirname,'../backend/personal-note-sync-isolated.addon.gs'),'utf8');
const id='PN1_PRIVATE_RELEASE_FOLDER_abcdef0123456789';
const script='PN1_SYNTHETIC_OPERATING_SCRIPT_0123456789';
const props={};
let setCount=0,scriptLocks=0,driveReads=0;
const mark={getBlob:()=>({getDataAsString:()=> 'PERSONAL_NOTE_PRODUCTION_ONLY'})};
let markers=[mark], wrongMarker=false;
const folder={
 getName:()=>wrongMarker?'WRONG_FOLDER':'PeExamPersonalNotesProduction',
 getFilesByName:name=>{
  const list=name==='PERSONAL_NOTE_PRODUCTION_ONLY'?markers:[];let i=0;
  return {hasNext:()=>i<list.length,next:()=>list[i++]};
 }
};
const ctx={JSON,Math,Date,Number,Object,Array,String,RegExp,Error,parseInt,isFinite,
 ScriptApp:{getScriptId:()=>script},
 PropertiesService:{getScriptProperties:()=>({
   getProperty:k=>props[k]||'',
   setProperties:(pairs,deleteOthers)=>{
     assert.equal(deleteOthers,false);setCount++;Object.assign(props,pairs);
   }
 })},
 LockService:{getScriptLock:()=>({waitLock(){scriptLocks++},releaseLock(){scriptLocks--}})},
 DriveApp:{getFolderById:fid=>{driveReads++;assert.equal(fid,id);return folder;}},
 Utilities:{DigestAlgorithm:{SHA_256:'SHA'},Charset:{UTF_8:'UTF8'},
   computeDigest:(_alg,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest())},
 SpreadsheetApp:new Proxy({}, {get(){throw Error('FORBIDDEN_MASTER_ACCESS')}})
};
vm.createContext(ctx);vm.runInContext(source,ctx);
const auth={status:'ACTIVE',deviceId:'ACTIVE_SYNTHETIC_DEVICE_20261124'};
const read=()=>ctx.PN1_get_('personalnotestatus',{},auth);
const fail=(code)=>assert.throws(read,e=>e.code===code);
fail('DISABLED');assert.equal(setCount,0);
ctx.PN1_SEALED_RELEASE_CONFIG_={approved:true,folderId:id,expectedScriptId:'WRONG_SCRIPT_ID_abcdef0123456789'};
fail('RELEASE_BLOCKED');assert.equal(setCount,0);
ctx.PN1_SEALED_RELEASE_CONFIG_.expectedScriptId=script;
assert.throws(()=>ctx.PN1_get_('personalnotestatus',{}, {status:'PENDING',deviceId:auth.deviceId}),e=>e.code==='AUTH_REQUIRED');
assert.equal(setCount,0);
markers=[];fail('FOLDER_NOT_APPROVED');assert.equal(setCount,0);
markers=[mark];wrongMarker=true;fail('FOLDER_NOT_APPROVED');assert.equal(setCount,0);
wrongMarker=false;
const result=read();assert.equal(result.personalNoteSyncReady,true);
assert.equal(props.PERSONAL_NOTE_SYNC_MODE,'PRODUCTION');
assert.equal(props.PERSONAL_NOTE_SYNC_FOLDER_ID,id);
assert.equal(props.PERSONAL_NOTE_SYNC_READY,'READY:'+id);
assert.equal(props.PERSONAL_NOTE_SYNC_PRODUCTION_APPROVED,'APPROVED:'+id);
assert.equal(props.PERSONAL_NOTE_SYNC_WRITE_ENABLED,'ENABLED:'+id);
assert.equal(setCount,1);assert.equal(scriptLocks,0);
assert.equal(read().personalNoteSyncReady,true);assert.equal(setCount,1);
props.PERSONAL_NOTE_SYNC_WRITE_ENABLED='PAUSED';fail('RELEASE_BLOCKED');
props.PERSONAL_NOTE_SYNC_WRITE_ENABLED='ENABLED:'+id;
props.PERSONAL_NOTE_SYNC_MODE='DISABLED';fail('DISABLED');assert.equal(setCount,1);
delete props.PERSONAL_NOTE_SYNC_MODE;
fail('RELEASE_BLOCKED');assert.equal(setCount,1);assert.equal(scriptLocks,0);
console.log('PERSONAL_NOTE_SEALED_RELEASE_SYNTHETIC_PASS '+JSON.stringify({
 inactiveUntilApproved:true,scriptIdBound:true,pendingDenied:true,
 exactMarkerRequired:true,atomicOneTimeBootstrap:true,manualPauseHonored:true,
 partialPropertiesNotOverwritten:true,liveMasterWrites:0,realDriveTest:false
}));
