'use strict';
/* Actual client protocol + actual GAS candidate in VM. Only fake Drive/Auth; NO Google or MASTER calls. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const serverCode=read('backend/personal-note-sync-isolated.addon.gs')+'\n'+read('backend/personal-note-sync-signed-bridge.addon.gs');
const clientCode=read('personal-note-cloud.js');
const memory=new Map(),folderId='test-private-folder-abcdef0123456789',props={
 PERSONAL_NOTE_SYNC_MODE:'ISOLATED_TEST',PERSONAL_NOTE_SYNC_FOLDER_ID:folderId,PERSONAL_NOTE_SYNC_READY:'READY:'+folderId
};
class FakeFile{
 constructor(name,body){this.name=name;this.body=body;this.trashed=false;}
 getBlob(){return {getDataAsString:()=>this.body};}
 setContent(body){this.body=body;return this;}
 setTrashed(state){this.trashed=state;return this;}
}
const folder={
 getFilesByName(name){const list=[...memory.values()].filter(x=>!x.trashed&&x.name===name);
   let i=0;return {hasNext:()=>i<list.length,next:()=>list[i++]};},
 createFile(name,body){const x=new FakeFile(name,body);memory.set(name,x);return x;}
};
folder.createFile('PERSONAL_NOTE_ISOLATED_TEST_ONLY','SYNTHETIC MARKER');
const server={JSON,Math,Date,String,Number,Object,Array,RegExp,Set,Error,parseInt,isNaN,isFinite,
 Utilities:{DigestAlgorithm:{SHA_256:'SHA'},Charset:{UTF_8:'UTF-8'},
 computeDigest:(_alg,s)=>Array.from(crypto.createHash('sha256').update(String(s),'utf8').digest()),
 base64DecodeWebSafe:s=>Buffer.from(s,'base64url'),newBlob:bytes=>({getDataAsString:()=>Buffer.from(bytes).toString('utf8')}),
 getUuid:()=>crypto.randomUUID()},
 DriveApp:{getFolderById:id=>{if(id!==folderId)throw Error('CROSS_FOLDER_ACCESS');return folder;}},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||''})},
 SpreadsheetApp:new Proxy({}, {get(){throw Error('SHEETS_ACCESS_PROHIBITED');}}),
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 validateSignedGet_:(p,allowed)=>{
  if(p.token!=='VALID_TEST_SIGNATURE'||!allowed.includes(p.status))throw Error('SIGNED_ACTIVE_REQUIRED');
  return {status:p.status,deviceId:p.deviceId,data:p.data};
 }};
vm.createContext(server);vm.runInContext(serverCode,server);
function device(deviceId){
 const navigator={onLine:true};
 const buildSignedGetUrl=async(_url,action,data)=>{
  const p=new URL('https://test.invalid/?token=VALID_TEST_SIGNATURE&status=ACTIVE');
  p.searchParams.set('deviceId',deviceId);
  p.searchParams.set('action',action);
  p.searchParams.set('data',JSON.stringify(data));
  return p.toString();
 };
 const sandbox={window:{},navigator,crypto:crypto.webcrypto,TextEncoder,TextDecoder,
 btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
 hasActiveSecuritySession:()=>true,getApiUrl:()=>'https://test.invalid',buildSignedGetUrl,
 fetch:async url=>{
  const u=new URL(url);
  const data=JSON.parse(u.searchParams.get('data')||'{}');
  const result=server.PN1_signedGet_({action:u.searchParams.get('action'),data,token:u.searchParams.get('token'),status:u.searchParams.get('status'),deviceId:u.searchParams.get('deviceId')});
  return {ok:true,json:async()=>result};
 },
 sendSecureMutation:async(_url,action,data)=>server.PN1_verifiedPost_(action,{auth:{status:'ACTIVE',deviceId},data}),
 console,JSON,Math,String,Number,Array,Set,Error,URL};
 vm.createContext(sandbox);vm.runInContext(clientCode,sandbox);
 return {cloud:sandbox.window.PEPersonalNoteCloud,navigator};
}
const dA=device('DEVICE_A0123456789'),dB=device('DEVICE_B0123456789');
const topic='T4321',background='./assets/personal-note-answer-sheet-a4.svg';
const pic='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8HgAAAABJRU5ErkJggg==';
const first=[{id:'page-a',objects:[
 {id:'pen-a',type:'stroke',points:[{x:0.1,y:0.2},{x:0.6,y:0.7}],color:'#000000',width:3},
 {id:'text-a',type:'text',text:'기술사 메모',x:0.2,y:0.3,size:20},
 {id:'img-a',type:'image',src:pic,x:0.1,y:0.1,w:0.4,h:0.2}
]}];
(async()=>{
 const savedA=await dA.cloud.push(topic,first,background,true,{});
 assert.equal(savedA.available,true);
 const pulledB=await dB.cloud.pull(topic,null,null,{});
 assert.equal(pulledB.available,true);
 assert.equal(pulledB.conflict,false);
 assert.equal(pulledB.pages.length,1);
 assert.equal(pulledB.pages[0].objects[2].src,pic);
 assert.equal(pulledB.background,background);
 const updated=JSON.parse(JSON.stringify(pulledB.pages));
 updated.push({id:'page-b',objects:[{id:'shape-b',type:'shape',shape:'rect',start:{x:.1,y:.1},end:{x:.8,y:.8}}]});
 const savedB=await dB.cloud.push(topic,updated,background,false,pulledB.meta);
 assert.equal(savedB.available,true);
 const currentA=await dA.cloud.pull(topic,{topicId:topic,pages:first},{background,enabled:true},savedA.meta);
 assert.equal(currentA.conflict,false);
 assert.equal(currentA.pages.length,2);
 assert.equal(currentA.enabled,false);
 const offline=JSON.parse(JSON.stringify(first));
 offline[0].objects.push({id:'new-note',type:'text',text:'오프라인',x:.5,y:.5,size:19});
 dA.navigator.onLine=false;
 assert.equal((await dA.cloud.push(topic,offline,background,true,savedA.meta)).available,false);
 dA.navigator.onLine=true;
 await assert.rejects(dA.cloud.push(topic,offline,background,true,savedA.meta),e=>e.conflict===true);
 const stillSaved=await dB.cloud.pull(topic,null,null,{});
 assert.equal(stillSaved.pages.length,2);
 assert.equal(stillSaved.background,background);
 assert.throws(()=>server.PN1_signedGet_({action:'personalnotestatus',status:'REVOKED',token:'VALID_TEST_SIGNATURE',deviceId:'DEVICE_A0123456789',data:{}}),/SIGNED_ACTIVE_REQUIRED/);
 props.PERSONAL_NOTE_SYNC_MODE='DISABLED';
 assert.equal(await dA.cloud.available(),false);
 console.log('PERSONAL_NOTE_CLIENT_SERVER_CONTRACT_PASS',JSON.stringify({
  backend:'synthetic DriveApp',auth:'synthetic signed ACTIVE',twoDevices:true,images:true,
  multiPage:true,sharedBackground:true,casConflict:true,offlineHoldsLocal:true,
  realAppsScript:'NOT_TESTED',liveMasterWrites:0
 }));
})().catch(e=>{console.error('PERSONAL_NOTE_CLIENT_SERVER_CONTRACT_FAIL',e.stack||e);process.exitCode=1;});
