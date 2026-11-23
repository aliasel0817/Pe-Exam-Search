'use strict';
/* Synthetic DriveApp + ACTIVE host context only. NO real Google Apps Script/Drive calls. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const addon=fs.readFileSync(path.join(root,'backend/personal-note-sync-isolated.addon.gs'),'utf8');
const bridge=fs.readFileSync(path.join(root,'backend/personal-note-sync-signed-bridge.addon.gs'),'utf8');
const files=new Map();
const folderId='test-folder-abcdefgh1234567890';
const marker='PERSONAL_NOTE_ISOLATED_TEST_ONLY';
const properties={
 PERSONAL_NOTE_SYNC_MODE:'DISABLED',PERSONAL_NOTE_SYNC_FOLDER_ID:folderId,PERSONAL_NOTE_SYNC_READY:'READY:'+folderId
};
class FakeFile {
 constructor(name,content){this.name=name;this.content=content;this.trash=false;}
 getBlob(){return {getDataAsString:()=>this.content};}
 setContent(s){this.content=s;return this;}
 setTrashed(t){this.trash=t;return this;}
}
const folder={
 getFilesByName(name){
  const rows=[...files.values()].filter(f=>f.name===name&&!f.trash);
  let index=0;return {hasNext:()=>index<rows.length,next:()=>rows[index++]};
 },
 createFile(name,content){const f=new FakeFile(name,content);files.set(name,f);return f;}
};
folder.createFile(marker,'TEST ONLY');
const digest=s=>crypto.createHash('sha256').update(String(s),'utf8').digest('hex');
const hostActive={status:'ACTIVE',deviceId:'SYNTHETICDEVICETOKEN123456'};
const ctx={
 console,Math,JSON,String,Number,Array,Object,RegExp,Date,Error,parseInt,isNaN,
 Utilities:{DigestAlgorithm:{SHA_256:'sha'},Charset:{UTF_8:'utf8'},
 computeDigest:(_,text)=>Array.from(crypto.createHash('sha256').update(String(text),'utf8').digest()),
 getUuid:()=>crypto.randomUUID(),base64DecodeWebSafe:s=>Buffer.from(s,'base64url'),
 newBlob:bytes=>({getDataAsString:()=>Buffer.from(bytes).toString('utf8')})},
 DriveApp:{getFolderById:id=>{if(id!==folderId)throw Error('WRONG_FOLDER');return folder;}},
 SpreadsheetApp:new Proxy({}, {get(){throw Error('SHEETS_ACCESS_FORBIDDEN');}}),
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]||''})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 validateSignedGet_:(params,allowed)=>{
  if(params.token!=='VALID_SYNTHETIC_SIGNED'||!allowed.includes(params.status||'ACTIVE'))throw Error('HOST_SIGNATURE_OR_STATUS_REQUIRED');
  return {...hostActive,status:params.status||'ACTIVE',data:params.data};
 }
};
vm.createContext(ctx);vm.runInContext(addon+'\n'+bridge,ctx);
const signed=(action,data={},device={})=>ctx.PN1_signedGet_({action,data,token:'VALID_SYNTHETIC_SIGNED',...device});
assert.throws(()=>signed('personalnotestatus'),/격리 시험용으로 활성화되지/);
properties.PERSONAL_NOTE_SYNC_MODE='ISOLATED_TEST';
assert.equal(signed('personalnotestatus').personalNoteSyncReady,true);
assert.throws(()=>signed('personalnotestatus',{}, {status:'PENDING'}),/HOST_SIGNATURE_OR_STATUS_REQUIRED/);
assert.throws(()=>ctx.PN1_verifiedPost_('personalnotebegin',{auth:{...hostActive,status:'REVOKED'},data:{}}),/HOST_AUTH_MISSING/);
assert.throws(()=>signed('unexpected',{}),/허용하지 않은/);
assert.equal(ctx.PN1_isPost_('constructor'),false);
const hashId=digest('T9991');
const key='index:'+hashId;
const doc={key,schemaVersion:1,topicId:'T9991',pageIds:['page-a','page-b']};
const encoded=Buffer.from(JSON.stringify(doc)).toString('base64url');
const sha=digest(encoded),n=Math.ceil(encoded.length/ctx.PN1_CHUNK_SIZE_);
const auth={auth:hostActive,data:null};
const call=(action,d)=>ctx.PN1_verifiedPost_(action,{auth:hostActive,data:d});
const begin=call('personalnotebegin',{key,baseRevision:0,hash:sha,totalChunks:n,length:encoded.length});
assert(begin.uploadId);
for(let i=0;i<n;i++){
 const chunk=encoded.slice(i*ctx.PN1_CHUNK_SIZE_,(i+1)*ctx.PN1_CHUNK_SIZE_);
 assert.equal(call('personalnotepart',{uploadId:begin.uploadId,index:i,chunk}).index,i);
}
const committed=call('personalnotecommit',{uploadId:begin.uploadId});
assert.equal(committed.revision,1);
const meta=signed('personalnotedoc',{key,mode:'meta'});
assert.equal(meta.hash,sha);
let joined='';
for(let i=0;i<meta.totalChunks;i++)joined+=signed('personalnotedoc',{key,mode:'chunk',revision:meta.revision,index:i}).chunk;
assert.equal(digest(joined),sha);
assert.deepEqual(JSON.parse(Buffer.from(joined,'base64url').toString('utf8')),doc);
assert.equal(call('personalnotebegin',{key,baseRevision:0,hash:sha,totalChunks:n,length:encoded.length}).conflict,true);
assert.throws(()=>signed('personalnotedoc',{key,mode:'chunk',revision:0,index:0}),/REVISION_CHANGED/);
const replacement={...doc,pageIds:['page-a']};
const encoded2=Buffer.from(JSON.stringify(replacement)).toString('base64url');
const sha2=digest(encoded2),n2=Math.ceil(encoded2.length/ctx.PN1_CHUNK_SIZE_);
function start(base){return call('personalnotebegin',{key,baseRevision:base,hash:sha2,totalChunks:n2,length:encoded2.length});}
const race1=start(1),race2=start(1);
for(const session of [race1,race2])for(let i=0;i<n2;i++)call('personalnotepart',{uploadId:session.uploadId,index:i,chunk:encoded2.slice(i*ctx.PN1_CHUNK_SIZE_,(i+1)*ctx.PN1_CHUNK_SIZE_)});
assert.equal(call('personalnotecommit',{uploadId:race1.uploadId}).revision,2);
assert.equal(call('personalnotecommit',{uploadId:race2.uploadId}).conflict,true);
assert.equal(signed('personalnotedoc',{key,mode:'meta'}).revision,2);
const wrong=start(2);assert(wrong.uploadId);
for(let i=0;i<n2;i++)call('personalnotepart',{uploadId:wrong.uploadId,index:i,chunk:encoded2.slice(i*ctx.PN1_CHUNK_SIZE_,(i+1)*ctx.PN1_CHUNK_SIZE_)});
const fake='A'+encoded2.slice(1);
assert.throws(()=>call('personalnotepart',{uploadId:wrong.uploadId,index:0,chunk:fake}),/CHUNK_CONFLICT/);
assert.throws(()=>ctx.PN1_signedGet_({action:'personalnotedoc',data:{key},token:'BAD'}),/HOST_SIGNATURE_OR_STATUS_REQUIRED/);
console.log('PERSONAL_NOTE_ISOLATED_SERVER_PASS',JSON.stringify({
 mode:'ISOLATED_TEST',backend:'synthetic',liveSheetWrites:0,activeRequired:true,
 shaValidated:true,concurrentCASProtected:true,chunkStorage:true,production:'NOT_TESTED'
}));
