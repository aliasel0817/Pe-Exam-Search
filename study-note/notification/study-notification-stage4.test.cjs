'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),os=require('node:os'),path=require('node:path');
const relay=require('./study-notification-relay.js'),client=require('./study-notification-client.js'),core=require('./study-notification-core.js'),hostFactory=require('./study-notification-host.js'),builder=require('./build-notification-gas.cjs');
const copy=v=>JSON.parse(JSON.stringify(v)),sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const mac=v=>crypto.createHmac('sha256','synthetic-relay-secret').update(v).digest('hex');
const start=Date.parse('2026-11-27T08:30:00+09:00'),owner='synthetic-owner',id='synthetic-plan';
let n=start,i=0;const used=new Set();
const r=relay.create({owner,now:()=>n,nonce:()=>sha('nonce-'+(++i)),mac,consume:key=>{if(used.has(key))return false;used.add(key);return true;}});
const req=r.request('snapshot',sha('session'),{});
assert.equal(r.verify(req).ctx.ownerId,owner);assert.throws(()=>r.verify(req),/replay/);
const req2=r.request('save',sha('session'),{expectedVersion:0});
for(const patch of [{action:'disconnect'},{owner:'other'},{binding:sha('other')},{payload:'{}'},{mac:'a'.repeat(64)}])assert.throws(()=>r.verify({...req2,...patch}),/authentication/);
assert.throws(()=>r.request('tick',sha('session'),{}));
const resp=r.response(req2,{ok:false,reason:'settings-conflict'});
assert.equal(r.verifyResponse(req2,resp).reason,'settings-conflict');
assert.throws(()=>r.verifyResponse(req2,{...resp,payload:'{}'}),/authentication/);
n+=91000;assert.throws(()=>r.verify(req2),/authentication/);n=start;
// Combined GAS source must load with no network, properties or spreadsheet I/O.
const code=builder.combine(builder.dedicated),addon=builder.combine(builder.bridge);
const inert={};vm.createContext(inert);vm.runInContext(code,inert);
assert.equal(typeof inert.doPost,'function');assert.equal(typeof inert.notificationScheduledTick,'function');
assert.equal(typeof inert.compactNotificationPrivateJournal,'function');
const fake="function doPost(e){ const verified = validateSignedMutation_(envelope, ['ACTIVE']); if(false){} else if (action === 'renamedevice') result = renameSecurityDevice_(payload, authContext); }";
assert.throws(()=>builder.patchMain(fake,'a'.repeat(64)),/hash/);
assert.ok(builder.patchMain(fake,sha(fake)).includes('PN4_verifiedNotificationPost_(action, verified)'));
assert.throws(()=>builder.patchMain(fake.replace('renamedevice','different'),sha(fake.replace('renamedevice','different'))),/structure/);
// Mock existing ACTIVE verifier output and actual relay helpers.
const props=new Map([['PE_NOTIFICATION_BRIDGE_ENABLED','YES'],['PE_NOTIFICATION_OWNER_ID',owner],['PE_NOTIFICATION_OWNER_GOOGLE_SUB','synthetic-google-sub'],['PE_NOTIFICATION_RELAY_SECRET','a'.repeat(64)],['PE_NOTIFICATION_RELAY_URL','https://script.google.com/macros/s/SYNTHETIC/exec'],['device-key','synthetic-key']]);
const gasMac=(text,key)=>crypto.createHmac('sha256',key).update(text).digest('hex');
let fetches=0,reply=null;
const gas={PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null})},
 Utilities:{Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(v,k)=>[...Buffer.from(gasMac(v,k),'hex')],getUuid:()=>crypto.randomUUID(),newBlob:s=>({getBytes:()=>[...Buffer.from(s)]})},
 securityDeviceKeyPropertyName_:()=> 'device-key',
 UrlFetchApp:{fetch(url,options){
  fetches++;
  if(url.startsWith('https://script.google.com/')){
   const request=JSON.parse(options.payload),receive=relay.create({owner,now:()=>Date.now(),nonce:()=>sha('x'),mac:v=>gasMac(v,'a'.repeat(64)),consume:()=>true});
   const checked=receive.verify(request);assert.equal(checked.ctx.ownerId,owner);assert.equal(checked.action,'snapshot');
   reply=receive.response(request,{settingsVersion:0,settings:null});
   return {getResponseCode:()=>302,getHeaders:()=>({Location:'https://script.googleusercontent.com/macros/echo?synthetic'})};
  }
  assert.equal(options.method,'get');assert.equal(options.payload,undefined);
  return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(reply)};
 }}};
vm.createContext(gas);vm.runInContext(addon,gas);
const verified={auth:{status:'ACTIVE',deviceId:'synthetic-device',googleSub:'synthetic-google-sub'},data:{}};
assert.throws(()=>gas.PN4_verifiedNotificationPost_('notificationSnapshot',{...verified,auth:{...verified.auth,status:'PENDING'}}));
assert.throws(()=>gas.PN4_verifiedNotificationPost_('notificationSnapshot',{...verified,auth:{...verified.auth,googleSub:'other'}}));
assert.equal(fetches,0);
assert.equal(gas.PN4_verifiedNotificationPost_('notificationSnapshot',verified).notificationResult.settingsVersion,0);
assert.equal(fetches,2);
props.set('PE_NOTIFICATION_BRIDGE_ENABLED','NO');assert.throws(()=>gas.PN4_verifiedNotificationPost_('notificationSnapshot',verified));assert.equal(fetches,2);
// Test host: no auto-arm; fixed test authorization, durable once/day and history.
const rows=new Map(),store={exclusive:f=>f({get:k=>rows.has(k)?copy(rows.get(k)):null,list:p=>[...rows].filter(([k])=>k.startsWith(p)).map(([key,value])=>({key,value:copy(value)})),commit:cs=>cs.forEach(c=>rows.set(c.key,copy(c.value)))})};
let testApproved=false,calls=0,armed=false;
const plan={id,name:hostFactory.NAME,verified:true,rounds:3,activeRevision:1,activeHash:'a'.repeat(64),days:[{date:'2026-11-27',round:1,ids:['T0001']}]};
const h=hostFactory.create({ownerId:owner,targetPlanId:id},{store,now:()=>n,releaseApproved:()=>false,testApproved:()=>testApproved,
 verifySignedRequest:x=>x==='verified'?{verified:true,ownerId:owner,sessionBinding:'synthetic'}:null,
 reader:{loadVerifiedPlan:()=>plan,isPlanCurrent:()=>true,loadTopic:()=>({topicId:'T0001',topicName:'synthetic'}),isTopicEligible:()=>true},
 createProvider:bridge=>({status:()=>({connected:true,armed,refreshExpired:false}),arm:(_ctx,on)=>{armed=on;},ready:()=>false,sendTest:(_ctx,_deadline,guard)=>{assert.equal(bridge.assertLocked(),true);assert.equal(guard(),true);calls++;return {httpStatus:200,body:{result_code:0}};}})});
const call=(a,d)=>h.dispatch(a,'verified',d);
assert.equal(call('snapshot').testReady,false);
assert.throws(()=>call('test',{expectedVersion:0,confirm:true}),/gate/);assert.equal(calls,0);
testApproved=true;assert.equal(call('snapshot').testReady,true);
assert.throws(()=>call('test',{expectedVersion:0,confirm:false}),/confirmation/);
assert.equal(call('test',{expectedVersion:1,confirm:true}).reason,'settings-conflict');
assert.equal(call('test',{expectedVersion:0,confirm:true}).confirmed,true);
assert.equal(armed,false);assert.equal(calls,1);
assert.equal(call('test',{expectedVersion:0,confirm:true}).reason,'test-already-attempted');assert.equal(calls,1);
assert.equal(call('snapshot').testReady,false);assert.equal(call('history',{date:'2026-11-27'}).total,0);
assert.throws(()=>h.dispatch('test',{verified:true,ownerId:owner},{confirm:true,expectedVersion:0}),/authenticated/);
// The callback must scrub the query before posting to the exact origin.
const html=fs.readFileSync(path.join(__dirname,'kakao-callback.html'),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
let scrubbed=false,posted=0;
const cb={URLSearchParams,location:{origin:client.ORIGIN,pathname:'/callback',search:'?state='+sha('s')+'&code=synthetic'},
 history:{replaceState(){scrubbed=true;}},window:{opener:{postMessage(data,origin){assert.equal(scrubbed,true);assert.equal(origin,client.ORIGIN);assert.equal(data.code,'synthetic');posted++;}}},document:{getElementById:()=>({textContent:''})}};
vm.runInNewContext(script,cb);assert.equal(posted,1);
cb.location.origin='https://example.invalid';vm.runInNewContext(script,cb);assert.equal(posted,1);
(async()=>{
 let api='https://script.google.com/macros/s/SYNTHETIC/exec',sent=0,active=true,origin=client.ORIGIN;
 const t=client.createTransport({defaultApiUrl:api,location:()=>({origin,pathname:client.PATH}),getApiUrl:()=>api,ensureActive:async()=>active,
 sendSecureMutation:async(url,action,data)=>{sent++;assert.equal(url,api);assert.equal(action,'notificationSnapshot');return {notificationVersion:1,notificationResult:{settingsVersion:0}};}});
 assert.equal((await t.snapshot()).settingsVersion,0);assert.equal(sent,1);
 active=false;await assert.rejects(t.snapshot());active=true;
 origin='https://example.invalid';await assert.rejects(t.snapshot());origin=client.ORIGIN;
 api='https://script.google.com/macros/s/OTHER/exec';await assert.rejects(t.snapshot());assert.equal(sent,1);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pe-notification-package-')),out=path.join(temp,'candidate');
 const build=builder.build(out);assert.equal(build.mainPatched,false);
 assert.equal(fs.existsSync(path.join(out,'dedicated','Code.gs')),true);
 assert.equal(fs.existsSync(path.join(out,'main-addon','.clasp.json')),false);
 assert.throws(()=>builder.build(out),/New output/);
 console.log('PASS: Stage 4 relay auth/replay, main bridge owner gate, redirect, inert GAS build, callback cleanup, fixed test gate and signed client assertions');
})().catch(e=>{console.error(e);process.exitCode=1;});
