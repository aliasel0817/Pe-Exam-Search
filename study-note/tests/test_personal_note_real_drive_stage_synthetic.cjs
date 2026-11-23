'use strict';
/* Run the exact Apps Script staging function against fake Google services only.
 * Verifies isolation identity, read/write roundtrip, CAS, and cleanup in failure paths.
 * No Google credentials, live Drive, MASTER, or operating scripts are accessed.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const content=name=>fs.readFileSync(path.join(root,name),'utf8');
const script=content('backend/personal-note-sync-isolated.addon.gs')+'\n'+
  content('backend/tests/personal-note-stage-real-drive-selftest.gs');
const scriptId='FAKE_ISOLATED_SCRIPT_20261123_ABC';
const store=new Map([['UNRELATED_USER_SETTING','PRESERVE']]);
const created=[],messages=[];
let seq=0;
class File {
  constructor(name,body){this.name=name;this.body=body;this.trash=false;}
  getBlob(){return {getDataAsString:()=>this.body};}
  setContent(body){this.body=body;return this;}
  setTrashed(t){this.trash=t;return this;}
}
class Folder {
  constructor(name){this.name=name;this.id='TEST_FOLDER_'+(++seq)+'_abcdefghij0123456789012345';this.files=[];this.trash=false;}
  getId(){return this.id;}
  getName(){return this.name;}
  createFile(name,content){const f=new File(name,content);this.files.push(f);return f;}
  getFilesByName(name){const files=this.files.filter(f=>!f.trash&&f.name===name);
    let i=0;return {hasNext:()=>i<files.length,next:()=>files[i++]};}
  setTrashed(t){this.trash=t;return this;}
}
const props={
 getProperty:k=>store.get(k)||'',
 setProperties:(values,deleteAllOthers)=>{
   assert.equal(deleteAllOthers,false);
   for(const [k,v] of Object.entries(values))store.set(k,v);
 },
 deleteProperty:k=>{store.delete(k);}
};
let userLockTaken=false,scriptLockTaken=false;
const lock=(which)=>({waitLock:()=>{
  if(which==='user'){assert.equal(userLockTaken,false);userLockTaken=true;}
  else {assert.equal(scriptLockTaken,false);scriptLockTaken=true;}
},releaseLock:()=>{
  if(which==='user')userLockTaken=false;else scriptLockTaken=false;
}});
const ctx={console:{log:(message)=>messages.push(String(message))},JSON,Math,Date,Number,String,Array,Object,RegExp,Error,parseInt,isNaN,isFinite,
 MimeType:{PLAIN_TEXT:'text/plain'},ScriptApp:{getScriptId:()=>scriptId},
 DriveApp:{
   createFolder:name=>{assert.match(name,/^PERSONAL_NOTE_ISOLATED_TEST_ONLY_/);const x=new Folder(name);created.push(x);return x;},
   getFolderById:id=>{const x=created.find(f=>f.id===id&&!f.trash);if(!x)throw Error('CROSS_DRIVE_ACCESS');return x;}
 },
 LockService:{getUserLock:()=>lock('user'),getScriptLock:()=>lock('script')},
 PropertiesService:{getScriptProperties:()=>props},
 Utilities:{
   DigestAlgorithm:{SHA_256:'sha'},Charset:{UTF_8:'utf8'},
   getUuid:()=>crypto.randomUUID(),
   computeDigest:(_method,value)=>Array.from(crypto.createHash('sha256').update(String(value),'utf8').digest()),
   base64EncodeWebSafe:s=>Buffer.from(String(s),'utf8').toString('base64url'),
   base64DecodeWebSafe:s=>Buffer.from(s,'base64url'),
   newBlob:bytes=>({getDataAsString:()=>Buffer.from(bytes).toString('utf8')})
 }};
vm.createContext(ctx);
vm.runInContext("var PN1_ISOLATED_SCRIPT_ID_='"+scriptId+"';\n"+script,ctx);
const r=ctx.PN1_stageRealDriveSelfTest();
assert.equal(r.success,true);
assert.equal(r.roundtrip,true);
assert.equal(r.invalidStatusDenied,true);
assert.equal(r.casConflict,true);
assert.equal(r.cleanup,true);
assert.match(messages.join('\n'),/PERSONAL_NOTE_STAGE_REAL_DRIVE_PASS/);
assert.equal(created.length,1);
assert.equal(created[0].trash,true);
assert.equal(created[0].files.filter(x=>!x.trash&&x.name.startsWith('pn1-doc-')).length,4);
assert.equal(store.get('UNRELATED_USER_SETTING'),'PRESERVE');
for(const key of ['PERSONAL_NOTE_SYNC_MODE','PERSONAL_NOTE_SYNC_FOLDER_ID','PERSONAL_NOTE_SYNC_READY'])
  assert.equal(store.has(key),false);
assert.equal(userLockTaken,false);assert.equal(scriptLockTaken,false);
vm.runInContext("PN1_ISOLATED_SCRIPT_ID_='WRONG_SCRIPT_ID';",ctx);
assert.throws(()=>ctx.PN1_stageRealDriveSelfTest(),/ABORT/);
assert.equal(created.length,1);
vm.runInContext("PN1_ISOLATED_SCRIPT_ID_='"+scriptId+"';",ctx);
store.set('PERSONAL_NOTE_SYNC_MODE','OPERATING');
assert.throws(()=>ctx.PN1_stageRealDriveSelfTest(),/ABORT/);
assert.equal(store.get('PERSONAL_NOTE_SYNC_MODE'),'OPERATING');
assert.equal(created.length,1);
assert.equal(userLockTaken,false);
console.log('PERSONAL_NOTE_STAGING_DRIVE_SYNTHETIC_PASS',JSON.stringify({
 exactScriptIdRequired:true,preconfiguredScriptRefused:true,
 twoSimulatedDevices:true,realGoogle:false,
 driveRoundtrip:true,casConflict:true,removesOnlyOwnTestFolder:true,
 unrelatedPropertiesPreserved:true,operatingWrites:0
}));
