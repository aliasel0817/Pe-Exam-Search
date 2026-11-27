'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const kakao=require('./study-notification-kakao.js'),core=require('./study-notification-core.js'),svc=require('./study-notification-service.js'),panel=require('./study-notification-panel.js');
const copy=v=>JSON.parse(JSON.stringify(v)),sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const start=Date.parse('2026-11-27T08:30:00+09:00'),end=Date.parse('2026-11-27T20:00:00+09:00');
const config={ownerId:'synthetic-owner',clientId:'synthetic-client',clientSecret:'synthetic-secret',appId:'1234',redirectUri:'https://example.invalid/callback',linkUrl:'https://example.invalid/study',dailyBudget:100,monthlyBudget:3000};
const ctx={verified:true,ownerId:config.ownerId,sessionBinding:'synthetic-session'},other={...ctx,sessionBinding:'other-session'};
function fixture(overrides={}){
 let value=null,now=start,seq=0,approved=false,locked=true,account=123456,consent=true,rotate=false,fail=false,uncertain=false;
 const calls=[];
 const request=r=>{
  calls.push(copy(r));
  if(r.url.endsWith('/oauth/token')){
   if(fail)return {httpStatus:400,body:{error:'invalid_grant'}};
   if(r.body.includes('grant_type=refresh_token'))return {httpStatus:200,body:{token_type:'bearer',access_token:'refreshed',expires_in:3600,...(rotate?{refresh_token:'rotated',refresh_token_expires_in:7200}:{})}};
   return {httpStatus:200,body:{token_type:'bearer',access_token:'initial',expires_in:3600,refresh_token:'refresh',refresh_token_expires_in:7200}};
  }
  if(r.url.endsWith('/access_token_info'))return {httpStatus:200,body:{app_id:1234,id:account}};
  if(r.url.includes('/user/scopes?'))return {httpStatus:200,body:{id:account,scopes:[{id:'talk_message',agreed:consent}]}};
  if(r.url.endsWith('/default/send'))return uncertain?{httpStatus:0,body:null}:{httpStatus:200,body:{result_code:0}};
  if(r.url.endsWith('/user/unlink'))return {httpStatus:200,body:{id:account}};
  throw Error('unexpected URL');
 };
 const deps={now:()=>now,randomState:()=>sha('synthetic-state-'+(++seq)),sha256:sha,request,sleep:ms=>{now+=ms;},approved:()=>approved,assertLocked:()=>locked,vault:{read:()=>value&&copy(value),write:(_id,v)=>{value=copy(v);}}};
 const api=kakao.create({...config,...overrides},deps);
 function startAuth(){return new URL(api.begin(ctx).authorizationUrl).searchParams.get('state');}
 function finishAuth(){return api.finish(ctx,{state:startAuth(),code:'synthetic-code'});}
 function connect(){const r=finishAuth();assert.equal(r.ok,true);api.confirm(ctx,{confirm:true,accountId:r.accountId});}
 return {api,calls,startAuth,finishAuth,connect,setNow:n=>now=n,now:()=>now,approve:v=>approved=v,lock:v=>locked=v,setAccount:v=>account=v,setConsent:v=>consent=v,setRotate:v=>rotate=v,setFail:v=>fail=v,setUncertain:v=>uncertain=v,vault:()=>copy(value),sendCalls:()=>calls.filter(c=>c.url.endsWith('/default/send'))};
}
const f=fixture();
f.lock(false);assert.throws(()=>f.api.begin(ctx),/lock/);f.lock(true);
assert.throws(()=>f.api.begin({...ctx,verified:false}),/authenticated/);
assert.throws(()=>f.api.begin({...ctx,ownerId:'another'}),/authenticated/);
const state=f.startAuth();
assert.throws(()=>f.api.finish(other,{state,code:'x'}),/state\/session/);
assert.throws(()=>f.api.finish(ctx,{state:'bad',code:'x'}),/state\/session/);
const res=f.api.finish(ctx,{state,code:'synthetic-code'});
assert.equal(res.accountId,'123456');assert.equal(res.needsConfirmation,true);
assert.ok(!JSON.stringify(res).includes('initial'));
assert.throws(()=>f.api.finish(ctx,{state,code:'synthetic-code'}),/state\/session/);
assert.throws(()=>f.api.confirm(other,{confirm:true,accountId:'123456'}),/confirmation/);
assert.throws(()=>f.api.confirm(ctx,{confirm:true,accountId:'999'}),/confirmation/);
assert.equal(f.api.confirm(ctx,{confirm:true,accountId:'123456'}).armed,false);
assert.equal(f.api.ready(config.ownerId),false);
assert.throws(()=>f.api.arm(ctx,true),/approval/);
f.approve(true);assert.equal(f.api.arm(ctx,true).armed,true);
assert.throws(()=>f.api.sendSelf('different','message',end,()=>true),/invalid self/);
assert.equal(f.api.sendSelf(config.ownerId,'message',end,()=>false).notAttempted,true);
assert.equal(f.sendCalls().length,0);
assert.equal(f.api.sendSelf(config.ownerId,'학습 테스트',end,()=>true).body.result_code,0);
const sent=f.sendCalls()[0],payload=JSON.parse(new URLSearchParams(sent.body).get('template_object'));
assert.equal(payload.text,'학습 테스트');assert.equal(payload.link.web_url,config.linkUrl);
assert.equal(sent.headers.Authorization,'Bearer initial');
assert.ok(!sent.body.includes('receiver_uuids'));
assert.throws(()=>f.api.sendSelf(config.ownerId,'가'.repeat(201),end,()=>true),/invalid self/);
f.setNow(start+3500000);f.setRotate(true);
assert.equal(f.api.sendSelf(config.ownerId,'refresh test',end,()=>true).body.result_code,0);
assert.equal(f.vault().token.refreshToken,'rotated');
assert.equal(f.sendCalls().at(-1).headers.Authorization,'Bearer refreshed');
f.setUncertain(true);assert.equal(f.api.sendSelf(config.ownerId,'uncertain',end,()=>true).httpStatus,0);
assert.equal(f.sendCalls().length,3);f.setUncertain(false);
f.setNow(end);assert.equal(f.api.sendSelf(config.ownerId,'late',end+60000,()=>true).notAttempted,true);
assert.equal(f.sendCalls().length,3);
const disconnected=f.api.disconnect(ctx);assert.equal(disconnected.connected,false);assert.equal(f.vault().token,null);assert.equal(f.api.ready(config.ownerId),false);
f.setAccount(999);assert.equal(f.finishAuth().reason,'account-or-consent-mismatch');
const denied=fixture();denied.setConsent(false);assert.equal(denied.finishAuth().reason,'account-or-consent-mismatch');
const expired=fixture();const st=expired.startAuth();expired.setNow(start+600001);assert.throws(()=>expired.api.finish(ctx,{state:st,code:'x'}),/expired/);
const quota=fixture({dailyBudget:4,monthlyBudget:10});quota.connect();quota.approve(true);quota.api.arm(ctx,true);
assert.equal(quota.api.sendSelf(config.ownerId,'last allowed',end,()=>true).body.result_code,0);
assert.equal(quota.api.sendSelf(config.ownerId,'over limit',end,()=>true).notAttempted,true);
assert.equal(quota.sendCalls().length,1);
const rejected=fixture();rejected.connect();rejected.approve(true);rejected.api.arm(ctx,true);rejected.setNow(start+3500000);rejected.setFail(true);
assert.equal(rejected.api.sendSelf(config.ownerId,'never sent',end,()=>true).notAttempted,true);
assert.equal(rejected.api.status(ctx).connected,false);assert.equal(rejected.sendCalls().length,0);
// New service behavior: certified no-send remains pending, not unknown; deleted
// source cannot resume; final guard is passed with a finite slot deadline.
const records=new Map(),store={exclusive:fn=>fn({get:k=>records.has(k)?copy(records.get(k)):null,list:p=>[...records].filter(([k])=>k.startsWith(p)).map(([key,value])=>({key,value:copy(value)})),commit:rows=>rows.forEach(r=>records.set(r.key,copy(r.value)))})};
const id='synthetic-plan',settings={...core.DEFAULTS,enabled:true,planId:id};
svc.saveSettings(store,config.ownerId,0,settings);
let now=start,eligible=true,count=0;
const plan={id,rounds:3,verified:true,activeRevision:1,activeHash:'a'.repeat(64),days:[{date:'2026-11-27',round:1,ids:['T0001']}]};
const dep={now:()=>now,ready:()=>true,loadVerifiedPlan:()=>plan,isPlanCurrent:()=>true,loadTopic:()=>({topicId:'T0001',topicName:'synthetic',concept:'concept'}),isTopicEligible:()=>eligible,sendSelf:(_id,msg,deadline,guard)=>{count++;assert.equal(deadline,now+300000);assert.equal(guard(),true);return {notAttempted:true};}};
assert.equal(svc.runTick(store,config.ownerId,dep).attempted,0);
assert.equal(svc.status(store,config.ownerId,'2026-11-27').pending,1);
eligible=false;now+=300000;svc.runTick(store,config.ownerId,dep);assert.equal(count,1);
assert.equal(svc.status(store,config.ownerId,'2026-11-27').unknown,0);
// A quota debit can make the provider not-ready exactly at its last allowed
// attempt. The final guard still verifies only the slot/plan/topic identity.
now+=300000;eligible=true;let readyAfterDebit=true;
const lastAttempt=svc.runTick(store,config.ownerId,{...dep,ready:()=>readyAfterDebit,sendSelf:(_id,_msg,_deadline,guard)=>{readyAfterDebit=false;assert.equal(guard(),true);return {httpStatus:200,body:{result_code:0}};}});
assert.equal(lastAttempt.attempted,1);
assert.equal(svc.status(store,config.ownerId,'2026-11-27',{round:1,ids:[]}).confirmed,0);
assert.equal(svc.status(store,config.ownerId,'2026-11-27',{round:1,ids:['T0001']}).confirmed,1);
// Exact plan name and cloud verification, never fallback to another schedule.
assert.deepEqual(panel.availablePlans({plans:[{id:'wrong',name:panel.PLAN_NAME,rounds:5,verified:true},{id:'local',name:panel.PLAN_NAME,rounds:3,verified:false},{id:'right',name:panel.PLAN_NAME,rounds:3,verified:true}]}).map(p=>p.id),['right']);
// Host verifies the signed-context adapter instead of trusting request payloads.
const hostFactory=require('./study-notification-host.js');
const hRecords=new Map();let held=false;
const hStore={exclusive(fn){assert.equal(held,false);held=true;try{return fn({get:k=>hRecords.has(k)?copy(hRecords.get(k)):null,list:p=>[...hRecords].filter(([k])=>k.startsWith(p)).map(([key,value])=>({key,value:copy(value)})),commit:rows=>rows.forEach(r=>hRecords.set(r.key,copy(r.value)))});}finally{held=false;}}};
let hPlan=null,hApproved=false,hArmed=false,hCalls=0;
const host=hostFactory.create({ownerId:config.ownerId,targetPlanId:id},{
 store:hStore,now:()=>start,releaseApproved:()=>hApproved,verifySignedRequest:req=>req==='synthetic-verified-envelope'?ctx:null,
 reader:{loadVerifiedPlan:()=>hPlan,isPlanCurrent:()=>true,loadTopic:()=>({topicId:'T0001',topicName:'synthetic'}),isTopicEligible:()=>true},
 createProvider:bridge=>({
  status:()=>{assert.equal(bridge.assertLocked(),true);return {connected:true,armed:hArmed,refreshExpired:false};},
  arm:(_ctx,on)=>{assert.equal(bridge.assertLocked(),true);if(on)assert.equal(bridge.approved(config.ownerId),true);hArmed=on;return {ok:true};},
  ready:()=>hArmed,sendSelf:()=>{hCalls++;return {httpStatus:200,body:{result_code:0}};}
 })
});
const dispatch=(a,d)=>host.dispatch(a,'synthetic-verified-envelope',d);
assert.throws(()=>host.dispatch('snapshot',{verified:true,ownerId:config.ownerId,sessionBinding:'forged'}),/authenticated/);
assert.equal(dispatch('snapshot').plans.length,0);
assert.throws(()=>dispatch('save',{expectedVersion:0,settings}),/enable gate/);
hPlan={...plan,name:'Wrong plan'};assert.equal(dispatch('snapshot').plans.length,0);
hPlan={...plan,name:hostFactory.NAME};assert.equal(dispatch('snapshot').plans.length,1);
assert.throws(()=>dispatch('save',{expectedVersion:0,settings}),/enable gate/);
hApproved=true;assert.equal(dispatch('save',{expectedVersion:0,settings}).ok,true);assert.equal(hArmed,true);
assert.equal(dispatch('save',{expectedVersion:0,settings}).reason,'settings-conflict');
assert.equal(dispatch('preview',settings).parts.length,1);
assert.equal(host.tick().attempted,1);assert.equal(hCalls,1);
hPlan=null;assert.equal(dispatch('save',{expectedVersion:1,settings:{...settings,enabled:false}}).ok,true);assert.equal(hArmed,false);
assert.equal(host.tick().reason,'disabled');
console.log('PASS: Stage 3 host owner gate, exact plan, shared lock, configuration CAS and activation assertions');
console.log('PASS: Stage 3 OAuth state/session/replay, account consent/binding, refresh, quota, cutoff, no-send, source eligibility and plan selection assertions');
