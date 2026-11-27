'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const core=require('./study-notification-core.js'),svc=require('./study-notification-service.js'),reader=require('./study-notification-plan-reader.js');
const copy=v=>JSON.parse(JSON.stringify(v));
function memory(){
 const state=new Map();let locked=false;
 return {state,exclusive(work){
   assert.equal(locked,false);locked=true;
   try{return work({
     get:k=>state.has(k)?copy(state.get(k)):null,
     list:p=>[...state].filter(([k])=>k.startsWith(p)).map(([key,value])=>({key,value:copy(value)})),
     commit:changes=>{const seen=new Set();for(const c of changes){assert.ok(!seen.has(c.key));seen.add(c.key);state.set(c.key,copy(c.value));}}
   });}finally{locked=false;}
 }};
}
const owner='synthetic-owner',id='synthetic-3-rounds';
const settings={...core.DEFAULTS,enabled:true,planId:id,maxMessagesPerSlot:2,maxTopicsPerSlot:1};
const start=Date.parse('2026-11-27T08:30:00+09:00');
const plan={id,rounds:3,verified:true,activeRevision:1,activeHash:'a'.repeat(64),days:[{date:'2026-11-27',round:1,ids:['T0001']}]};
const topic={topicId:'T0001',topicName:'Synthetic',concept:'가😀'.repeat(180),keywords:'K',mnemonic:'M'};
const prepared=core.prepareTopic(topic,settings);
assert.ok(prepared.parts.length>2);
const store=memory(),sent=[];
let now=start,ready=true,current=true,p=plan;
const deps={now:()=>now,ready:()=>ready,loadVerifiedPlan:()=>p,isPlanCurrent:()=>current,loadTopic:()=>topic,sendSelf:(_owner,msg)=>{sent.push(msg);return {httpStatus:200,body:{result_code:0}};}};
assert.equal(svc.saveSettings(store,owner,0,settings).version,1);
assert.equal(svc.saveSettings(store,owner,0,settings).reason,'settings-conflict');
assert.equal(svc.readSettings(store,owner).version,1);
assert.equal(svc.readSettings(store,'another-owner').version,0);
ready=false;assert.equal(svc.runTick(store,owner,deps).reason,'not-ready');assert.equal(sent.length,0);
ready=true;p=null;assert.equal(svc.runTick(store,owner,deps).reason,'plan-unavailable');
p=plan;current=false;assert.equal(svc.runTick(store,owner,deps).reason,'plan-changed');current=true;
assert.equal(svc.runTick(store,owner,deps).attempted,2);
assert.equal(svc.status(store,owner,'2026-11-27').pending,1);
assert.equal(svc.runTick(store,owner,deps).reason,'rate-held');
assert.equal(svc.saveSettings(store,owner,1,{...settings,fields:[]}).version,2);
now+=60000;assert.equal(svc.runTick(store,owner,deps).reason,'rate-held');
while(svc.status(store,owner,'2026-11-27').pending){now+=5*60000;svc.runTick(store,owner,deps);assert.ok(now<start+3600000);}
assert.deepEqual(sent,prepared.parts.map(x=>x.message)); // settings edit did not alter original reserved parts
assert.equal(svc.status(store,owner,'2026-11-27').confirmed,1);
now+=5*60000;assert.equal(svc.runTick(store,owner,deps).reason,'nothing-to-send');
assert.equal(svc.status(store,'another-owner','2026-11-27').reserved,0);
// A crash after request but before outcome persistence leaves 'sending': never resend.
const crashed=memory();svc.saveSettings(crashed,owner,0,settings);
now=start;let called=0;
const orig=crashed.exclusive;
let failed=false;
crashed.exclusive=function(work){return orig.call(crashed,tx=>work({...tx,commit(changes){
 if(!failed&&changes.some(x=>x.value.state==='confirmed')){failed=true;throw Error('simulated process crash');}
 tx.commit(changes);
}}));};
assert.throws(()=>svc.runTick(crashed,owner,{...deps,sendSelf:()=>{called++;return {httpStatus:200,body:{result_code:0}};}}),/simulated process crash/);
assert.equal(called,1);
assert.equal(svc.status(crashed,owner,'2026-11-27').unknown,1);
now+=5*60000;svc.runTick(crashed,owner,{...deps,sendSelf:()=>{called++;return {httpStatus:200,body:{result_code:0}};}});
assert.equal(called,1);
assert.equal(svc.status(crashed,owner,'2026-11-27').unknown,1);
// End-window check occurs between each request.
const boundary=memory();svc.saveSettings(boundary,owner,0,settings);
now=Date.parse('2026-11-27T19:55:00+09:00');let boundaryCalls=0;
svc.runTick(boundary,owner,{...deps,sendSelf:()=>{boundaryCalls++;now=Date.parse('2026-11-27T20:00:00+09:00');return {httpStatus:200,body:{result_code:0}};}});
assert.equal(boundaryCalls,1);
assert.equal(svc.runTick(boundary,owner,deps).reason,'outside-window');
assert.equal(svc.status(boundary,owner,'2026-11-27').pending,1);
// Verify planner protocol against a canonical synthetic snapshot.
const sha=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const canonical={id,name:'Synthetic only',start:'2026-11-27',end:'2026-11-28',rounds:3,groups:[['A','Group A']],days:[{date:'2026-11-27',round:1,entries:[['T0001','A']]},{date:'2026-11-28',round:2,entries:[['T0001','A']]}]};
const prow=[id,canonical.name,canonical.start,canonical.end,3,1,2,sha(JSON.stringify(canonical)),2,2,1,0,'ACTIVE','','',1];
const chunk=(kind,date,round,entries)=>{const payload=JSON.stringify(entries);return [id,1,(kind==='GROUPS'?'GROUPS:':'DAY:'+date+':')+'000',kind,date,round,0,1,payload,sha(payload),'synthetic',''];};
const chunks=[chunk('GROUPS','',null,canonical.groups),...canonical.days.map(d=>chunk('DAY',d.date,d.round,d.entries))];
const meta=reader.metadata([prow],id);
assert.equal(reader.metadata([],id),null);
assert.throws(()=>reader.metadata([[...prow.slice(0,4),5,...prow.slice(5)]],id));
const verified=reader.verifySnapshot(meta,chunks,sha);
assert.equal(verified.verified,true);assert.equal(verified.days[1].ids[0],'T0001');
assert.throws(()=>reader.verifySnapshot(meta,chunks.slice(0,-1),sha));
const corrupted=copy(chunks);corrupted[1][8]='[]';assert.throws(()=>reader.verifySnapshot(meta,corrupted,sha),/SHA-256/);
assert.throws(()=>reader.verifySnapshot({...meta,activeHash:'b'.repeat(64)},chunks,sha),/SHA-256/);
// Apps Script journal adapter, simulated API and durable replay.
const headers=['transactionId','index','count','key','payloadJson','sha256'];
let sheetRows=[headers.slice()],held=false,uuid=0,maxRows=1;
const sheet={getLastColumn:()=>6,getLastRow:()=>sheetRows.length,getMaxRows:()=>maxRows,insertRowsAfter:(_n,count)=>{maxRows+=count;},getRange(start,_col,count){
 return {getValues:()=>copy(sheetRows.slice(start-1,start-1+count)),setValues(rows){for(let i=0;i<rows.length;i++)sheetRows[start-1+i]=copy(rows[i]);}};
}};
const context={Utilities:{DigestAlgorithm:{SHA_256:'sha'},Charset:{UTF_8:'utf8'},computeDigest:(_alg,s)=>[...crypto.createHash('sha256').update(s,'utf8').digest()],getUuid:()=>String(++uuid)},SpreadsheetApp:{openById:()=>({getName:()=>'PeExamStudyNotificationPrivate',getSheets:()=>[sheet],getSheetByName:()=>sheet}),flush:()=>{}},LockService:{getScriptLock:()=>({tryLock(){if(held)return false;held=true;return true;},releaseLock(){held=false;}})}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'study-notification-gas-store.gs'),'utf8'),context);
const gs=context.StudyNotificationGasStore.create('syntheticPrivateId0000000000');
assert.equal(svc.saveSettings(gs,owner,0,settings).version,1);
assert.equal(svc.readSettings(gs,owner).version,1);
assert.equal(svc.saveSettings(gs,owner,1,{...settings,enabled:false}).version,2);
assert.equal(svc.readSettings(gs,owner).settings.enabled,false);
assert.equal(held,false);
sheetRows[sheetRows.length-1][4]='{}';
assert.throws(()=>svc.readSettings(gs,owner),/integrity/);
assert.equal(held,false);
console.log('PASS: Stage 2 CAS, durable reservation, partial resume, unknown hold, time boundary, planner hash and simulated GAS journal assertions');
