'use strict';
/* Synthetic gate test. No real Drive/Scripts/Sheets/Auth/credentials. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const src=fs.readFileSync(path.resolve(__dirname,'../backend/personal-note-sync-isolated.addon.gs'),'utf8');
const id='PN1_NEW_INDEPENDENT_FOLDER_1234567890',testMarker='PERSONAL_NOTE_ISOLATED_TEST_ONLY';
const prodMarker='PERSONAL_NOTE_PRODUCTION_ONLY';
const props={};
const files=new Map();
const folder={
 name:'PeExamPersonalNotesProduction',
 getName(){return this.name;},
 getFilesByName(name){
   const rows=files.get(name)||[];let i=0;return {hasNext:()=>i<rows.length,next:()=>rows[i++]};
 }
};
const file=(content)=>({getBlob:()=>({getDataAsString:()=>content})});
const ctx={JSON,Math,Date,Object,Array,Number,String,RegExp,Error,parseInt,isFinite,
 DriveApp:{getFolderById:given=>{assert.equal(given,id);return folder;}},
 SpreadsheetApp:new Proxy({}, {get(){throw Error('FORBIDDEN_SHEETS_ACCESS');}}),
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||''})},
 Utilities:{DigestAlgorithm:{SHA_256:'SHA'},Charset:{UTF_8:'UTF8'},
 computeDigest:(_alg,s)=>Array.from(crypto.createHash('sha256').update(String(s)).digest())}
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const active={status:'ACTIVE',deviceId:'ACTIVEDEVICE123456'};
const status=()=>ctx.PN1_get_('personalnotestatus',{},active);
const fails=(code)=>assert.throws(status,e=>e.code===code);
fails('DISABLED');
Object.assign(props,{PERSONAL_NOTE_SYNC_MODE:'PRODUCTION',
 PERSONAL_NOTE_SYNC_FOLDER_ID:id,PERSONAL_NOTE_SYNC_READY:'READY:'+id});
fails('RELEASE_BLOCKED');
props.PERSONAL_NOTE_SYNC_PRODUCTION_APPROVED='APPROVED:'+id;
fails('RELEASE_BLOCKED');
props.PERSONAL_NOTE_SYNC_WRITE_ENABLED='ENABLED:'+id;
fails('FOLDER_NOT_APPROVED');
folder.name='topic';files.set(prodMarker,[file(prodMarker)]);
fails('FOLDER_NOT_APPROVED');
folder.name='PeExamPersonalNotesProduction';
files.set(testMarker,[file('TEST')]);fails('FOLDER_NOT_APPROVED');
files.delete(testMarker);
files.set(prodMarker,[file('WRONG CONTENT')]);fails('FOLDER_NOT_APPROVED');
files.set(prodMarker,[file(prodMarker),file(prodMarker)]);fails('FOLDER_NOT_APPROVED');
files.set(prodMarker,[file(prodMarker)]);
assert.equal(status().personalNoteSyncReady,true);
assert.throws(()=>ctx.PN1_get_('personalnotestatus',{}, {status:'REVOKED',deviceId:'ACTIVEDEVICE123456'}),e=>e.code==='AUTH_REQUIRED');
props.STUDY_NOTE_SPREADSHEET_ID=id;
fails('WRONG_FOLDER');
delete props.STUDY_NOTE_SPREADSHEET_ID;
props.PERSONAL_NOTE_SYNC_WRITE_ENABLED='DISABLED';
fails('RELEASE_BLOCKED');
props.PERSONAL_NOTE_SYNC_MODE='ISOLATED_TEST';
files.set(testMarker,[file('ISOLATED TEST')]);
assert.equal(status().personalNoteSyncReady,true);
delete props.PERSONAL_NOTE_SYNC_MODE;
fails('DISABLED');
console.log('PERSONAL_NOTE_PRODUCTION_GATE_SYNTHETIC_PASS',JSON.stringify({
 productionDefaultDisabled:true,explicitApprovalRequired:true,
 separateDriveFolderRequired:true,markerAndExactContentRequired:true,
 activeAuthRequired:true,originalIsolatedModePreserved:true,
 noLiveDriveWrites:true,noMasterWrites:true
}));
