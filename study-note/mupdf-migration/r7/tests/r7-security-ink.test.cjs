'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../source/Code.js'),'utf8');
function fixture(){
 const store=new Map();const activity={mutations:0,auth:0,owner:0,claims:0,audit:0};
 const owner='SYNTHETIC-OWNER',deviceId='AAAAAAAAAAAAAAAAAAAAAAAA';
 const env={store,activity,owner,deviceId,console:{error(){}},Date,JSON,Math,
   LockService:{getScriptLock(){return{waitLock(ms){assert(ms<=20000);},releaseLock(){}}}},
   PropertiesService:{getScriptProperties(){return {getProperty(k){
      return k==='STUDY_NOTE_SECURITY_OWNER_SUB'?owner:owner;
   }}}},
   CacheService:{getScriptCache(){return{
     get(key){return store.get(key)||null;},put(key,v){store.set(key,v);},
     remove(key){store.delete(key)}
   }}}
 };
 const ctx=vm.createContext(env);
 vm.runInContext(source,ctx,{filename:'r7-isolated-Code.js'});
 // Avoid Apps Script network/sheet use for request/auth tests: every dependency
 // is explicit synthetic and no data leaves the V8 isolate.
 vm.runInContext(`
 parsePostPayload_ = e => e.body;
 jsonOutput_ = data => data;
 getMutationStatusRaw_ = (id,key) => store.get(id+'|'+key) || null;
 setMutationStatus_ = (id,key,data) => {activity.claims++;store.set(id+'|'+key,data);};
 validateSignedMutation_ = envelope => {
   activity.auth++;
   if(envelope.invalid || envelope.status!=='ACTIVE')throw Error('DENIED_SIGNED');
   return {auth:{googleSub:envelope.owner || owner,deviceId},data:envelope.data||{}};
 };
 authenticateGoogleCode_ = envelope => {
   activity.auth++;
   if(envelope.invalid)throw Error('DENIED_GOOGLE');
   return {sub:owner,email:'test@example.invalid'};
 };
 registerDeviceFromGoogle_ = (data,identity) => {activity.mutations++;return {action:'registerDevice',status:'PENDING'};};
 saveAnnotationDocuments_ = (payload,auth) => {activity.mutations++;return {action:'saveAnnotations',savedCount:1};};
 appendSecurityAudit_ = () => {activity.audit++;};
 `,ctx);
 return {ctx,store,activity,owner,deviceId,run:e=>vm.runInContext('doPost({body: e})',vm.createContext({...env,e}),{timeout:5000})};
}
function setup(){
 const f=fixture();
 return {...f,call(body){
   f.ctx.__R7_BODY=body;
   return vm.runInContext('doPost({body: __R7_BODY})',f.ctx,{timeout:5000});
 }};
}
const key='x'.repeat(40);
test('malformed and unsigned writes NEVER reserve cache or mutate ink',()=>{
 const f=setup();
 for(const data of [
   {requestId:'q1',pollKey:key,action:'saveannotations',invalid:true,status:'ACTIVE'},
   {requestId:'q2',pollKey:key,action:'saveannotations',status:'PENDING'},
   {requestId:'q3',pollKey:key,action:'saveannotations',status:'REVOKED'}
 ]){
   const r=f.call(data);assert.equal(r.ok,false);assert.equal(f.store.size,0);
 }
 assert.equal(f.activity.mutations,0);assert.equal(f.activity.claims,0);
});
test('signed ACTIVE owner success, duplicate reuse and zero second mutation',()=>{
 const f=setup(),input={requestId:'ok',pollKey:key,action:'saveannotations',status:'ACTIVE'};
 const first=f.call(input),again=f.call({...input,invalid:true});
 assert.equal(first.ok,true);assert.equal(first.savedCount,1);
 assert.equal(again.duplicateDelivery,true);assert.equal(again.ok,true);
 assert.equal(f.activity.mutations,1);assert.equal(f.activity.auth,1);
});
test('valid nonowner ACTIVE cannot reserve or mutate',()=>{
 const f=setup();
 const r=f.call({requestId:'wrongowner',pollKey:key,action:'saveannotations',status:'ACTIVE',owner:'NOT-OWNER'});
 assert.equal(r.ok,false);assert.equal(f.activity.mutations,0);assert.equal(f.store.size,0);
});
test('Google registration invalid authorization does not poison mutation cache',()=>{
 const f=setup();
 const r=f.call({requestId:'regbad',pollKey:key,action:'registerdevice',data:{invalid:true}});
 assert.equal(r.ok,false);assert.equal(f.store.size,0);assert.equal(f.activity.mutations,0);
});
test('valid Google registration receives session without duplicate registration mutation',()=>{
 const f=setup(),v={requestId:'regok',pollKey:key,action:'registerdevice',data:{}};
 const r=f.call(v),dup=f.call(v);
 assert.equal(r.ok,true);assert.equal(dup.duplicateDelivery,true);
 assert.equal(f.activity.mutations,1);
});
test('actual source signed validator rejects PENDING, REVOKED, TTL, invalid HMAC and nonce replay',()=>{
 const context=vm.createContext({Date,console:{error(){}},Math,JSON});
 vm.runInContext(source,context);
 const cache=new Map();
 const secret='SYNTHETIC-SESSION-KEY-NO-PRODUCTION';
 const device='A'.repeat(24),nonce='B'.repeat(20);
 const record={status:'ACTIVE',sessionKeyHash:crypto.createHash('sha256').update(secret).digest('hex'),
  sessionExpiresAt:new Date(Date.now()+600000).toISOString(),deviceId:device,
  deviceName:'test',googleSub:'SYNTHETIC-OWNER',email:'test@example.invalid'};
 Object.assign(context,{
  syntheticCache:cache,record,secret,
  LockService:{getScriptLock(){return {waitLock(){},releaseLock(){}}}},
  CacheService:{getScriptCache(){return {get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v)}}},
  PropertiesService:{getScriptProperties(){return {getProperty(){return secret;}}}},
  shaTest:s=>crypto.createHash('sha256').update(s).digest('hex'),
  hmacTest:(s,k)=>crypto.createHmac('sha256',k).update(s).digest('hex')
 });
 vm.runInContext(`
 readSecurityDeviceTable_ = () => ({sheet:{},headerIndex:{},rows:[]});
 findSecurityDeviceRow_ = () => ({row:[],sheetRow:2});
 securityDeviceRowObject_ = () => record;
 securityDeviceKeyPropertyName_ = () => 'SYNTHETIC_DEVICE_KEY';
 sha256Hex_ = shaTest;
 hmacSha256Hex_ = hmacTest;
 touchSecurityDevice_ = () => {};
 `,context);
 const ts=String(Date.now());
 function signed(n=nonce,stamp=ts) {
  const canonical='GET\\nreferencepdfcontent\\n'+device+'\\n'+stamp+'\\n'+n+'\\nauthpayload';
  return {deviceId:device,timestamp:stamp,nonce:n,signature:crypto.createHmac('sha256',secret).update(canonical).digest('hex'),canonical};
 }
 function call(s,statuses=['ACTIVE']){
  context.__signed=s;context.__statuses=statuses;
  return vm.runInContext('validateDeviceSignature_(__signed.deviceId,__signed.timestamp,__signed.nonce,__signed.signature,__signed.canonical,__statuses)',context);
 }
 assert.equal(call(signed()).status,'ACTIVE');
 assert.throws(()=>call(signed()),/이미 사용된|nonce/i);
 record.status='PENDING';assert.throws(()=>call(signed('C'.repeat(20))),/대기 중/);
 record.status='REVOKED';assert.throws(()=>call(signed('D'.repeat(20))),/차단/);
 record.status='ACTIVE';record.sessionExpiresAt=new Date(Date.now()-120000).toISOString();
 assert.throws(()=>call(signed('E'.repeat(20))),/만료/);
 record.sessionExpiresAt=new Date(Date.now()+120000).toISOString();
 const wrong=signed('F'.repeat(20));wrong.signature='a'.repeat(64);
 assert.throws(()=>call(wrong),/서명/);
 assert.throws(()=>call(signed('G'.repeat(20),String(Date.now()-3600000))),/시간/);
});
test('real schema 3 annotation server store/restore/conflict and backup uses synthetic sheet only',()=>{
 const env={console:{error(){}},Date,JSON,Math};
 const ctx=vm.createContext(env);
 vm.runInContext(source,ctx);
 const stored=[];
 const fakeSheet={rows:stored,
   getLastRow(){return this.rows.length+1;},
   getRange(_r,_c,_nr,_nc){return {clearContent:()=>{this.rows.splice(0);},
     setValues:rows=>{this.rows.splice(0,this.rows.length,...rows.map(r=>r.slice()))}};}
 };
 const lock={waitLock(){},releaseLock(){}};
 Object.assign(ctx,{
   mockSheet:fakeSheet,
   LockService:{getScriptLock(){return lock}},
   shaTest:s=>crypto.createHash('sha256').update(s).digest('hex'),
 });
 vm.runInContext(`
 sha256Hex_ = shaTest;
 readAnnotationSyncRows_ = () => ({sheet:mockSheet,rows:mockSheet.rows.map(r=>r.slice())});
 `,ctx);
 const docs=[
  {key:'reference-pdf:서브노트:123',kind:'reference-pdf',schemaVersion:3,
   coordinateSpace:'normalized-0-1',objects:[{id:'stroke',tool:'pen',points:[{x:.2,y:.3,p:.5}]}],updatedAt:new Date().toISOString()},
  {key:'attachment-pdf:M5-QA-ABCDE:1',kind:'attachment-pdf',schemaVersion:3,
   coordinateSpace:'normalized-0-1',objects:[{id:'highlight',tool:'highlighter',points:[{x:.4,y:.8}]}],updatedAt:new Date().toISOString()},
 ];
 ctx.__docs=docs;
 const first=vm.runInContext('saveAnnotationDocuments_({documents:__docs},{deviceId:"AAAAAAAAAAAAAAAAAAAAAAAA"})',ctx);
 assert.equal(first.savedCount,2);
 const backup=JSON.stringify(stored);
 const restored=vm.runInContext('buildAnnotationSyncPayload_({cursor:0,limit:20})',ctx);
 assert.equal(restored.documents.length,2);
 assert.deepEqual([...restored.documents.map(x=>x.schemaVersion)], [3,3]);
 assert(restored.documents.every(x=>x.coordinateSpace==='normalized-0-1'));
 assert(restored.documents.some(x=>x.key.startsWith('reference-pdf:')));
 assert(restored.documents.some(x=>x.key.startsWith('attachment-pdf:')));
 const conflict=vm.runInContext('saveAnnotationDocuments_({documents:__docs},{deviceId:"AAAAAAAAAAAAAAAAAAAAAAAA"})',ctx);
 assert.equal(conflict.savedCount,0);assert.equal(conflict.conflictCount,2);
 assert.equal(JSON.stringify(stored),backup,'conflict must not change sheet');
 stored.splice(0);
 assert.equal(stored.length,0);
 stored.push(...JSON.parse(backup));
 const after=vm.runInContext('buildAnnotationSyncPayload_({cursor:0,limit:20})',ctx);
 assert.equal(JSON.stringify(after.documents),JSON.stringify(restored.documents));
 assert.equal(after.warnings.length,0);
});
