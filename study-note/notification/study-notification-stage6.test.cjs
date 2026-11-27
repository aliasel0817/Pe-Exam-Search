'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),builder=require('./build-notification-gas.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),copy=v=>JSON.parse(JSON.stringify(v));
const master='synthetic-master-000000000000',privateId='synthetic-private-00000000000',scriptId='synthetic-script-0000000000000',qaId='synthetic-qa-0000000000000000';
const name=require('./study-notification-host.js').NAME,date=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const headers=['transactionId','index','count','key','payloadJson','sha256'],planHeaders=['planId','name','start','end','rounds','activeRevision','nextRevision','activeHash','dayCount','slotCount','groupCount','progressSeq','status','createdAt','updatedAt','schemaVersion'],chunkHeaders=['planId','revision','chunkKey','kind','date','round','partIndex','partCount','payloadJson','chunkHash','stageId','createdAt'];
const canonical={id:'synthetic-plan',name,start:date,end:date,rounds:3,groups:[['A','Group A']],days:[{date,round:1,entries:[['T0001','A']]}]};
const planRow=[canonical.id,name,date,date,3,1,2,sha(JSON.stringify(canonical)),1,1,1,0,'ACTIVE','','',1];
function chunk(kind,dt,round,items){const payload=JSON.stringify(items);return [canonical.id,1,(kind==='GROUPS'?'GROUPS:':'DAY:'+dt+':')+'000',kind,dt,round,0,1,payload,sha(payload),'synthetic',''];}
const chunks=[chunk('GROUPS','',null,canonical.groups),chunk('DAY',date,1,canonical.days[0].entries)];
const props=new Map(Object.entries({PE_NOTIFICATION_PROJECT_MODE:'DEDICATED_NOTIFICATION',PE_NOTIFICATION_HTTP_APPROVED:'NO',PE_NOTIFICATION_RELEASE_APPROVED:'NO',PE_NOTIFICATION_SCHEDULER_APPROVED:'NO',PE_NOTIFICATION_TEST_APPROVED:'NO',PE_NOTIFICATION_EXPECTED_SCRIPT_ID:scriptId,PE_NOTIFICATION_MASTER_ID:master,PE_NOTIFICATION_PRIVATE_STORE_ID:privateId}));
const p={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)};
let locked=false,creates=0,writes=0,uuid=0;
function sheet(initial,writable=false){
 let rows=copy(initial),max=1000;
 return {getLastColumn:()=>rows[0]?.length||0,getLastRow:()=>rows.length,getMaxRows:()=>max,insertRowsAfter(_n,k){assert.equal(writable,true);max+=k;},setName(){assert.equal(writable,true);},getRange(start,col,count,width){assert.equal(col,1);return {getValues:()=>copy(rows.slice(start-1,start-1+count).map(r=>r.slice(0,width))),setValues(values){assert.equal(writable,true);writes++;values.forEach((r,i)=>rows[start-1+i]=copy(r));}}},data:()=>copy(rows)};
}
const privateSheet=sheet([headers]),planSheet=sheet([planHeaders,planRow]),chunkSheet=sheet([chunkHeaders,...chunks]),qaSheet=sheet([],true);
const books=new Map([[master,{getName:()=> 'topic_study_data',getSheetByName:n=>n==='학습계획'?planSheet:n==='학습계획일정'?chunkSheet:n==='암기장'?{}:null,getSpreadsheetTimeZone:()=> 'Asia/Seoul'}],[privateId,{getName:()=> 'PeExamStudyNotificationPrivate',getSheets:()=>[privateSheet],getSheetByName:()=>privateSheet}],[qaId,{getId:()=>qaId,getName:()=> 'PeExamStudyNotificationQA',getSheets:()=>[qaSheet],getSheetByName:()=>qaSheet}]]);
const gas={PropertiesService:{getScriptProperties:()=>p},ScriptApp:{getScriptId:()=>scriptId},SpreadsheetApp:{openById:id=>{assert.ok(books.has(id));return books.get(id);},create:n=>{assert.equal(n,'PeExamStudyNotificationQA');creates++;return books.get(qaId);},flush(){}},Utilities:{DigestAlgorithm:{SHA_256:'sha'},Charset:{UTF_8:'utf8'},computeDigest:(_a,v)=>[...Buffer.from(sha(v),'hex')],getUuid:()=>crypto.randomUUID(),newBlob:s=>({getBytes:()=>[...Buffer.from(s)]})},LockService:{getScriptLock:()=>({tryLock(){if(locked)return false;locked=true;return true;},releaseLock(){locked=false;}})},console:{log(){}}};
vm.createContext(gas);vm.runInContext(builder.combine(builder.dedicated),gas);
const before=JSON.stringify(privateSheet.data()),planBefore=JSON.stringify(planSheet.data());
let r=gas.notificationStagingReadiness();
assert.equal(r.plans.verifiedCount,1);assert.equal(r.plans.candidates[0].todayAssigned,1);assert.equal(r.plans.configuredPlanVerified,false);assert.equal(r.configurationComplete,false);
assert.equal(creates,0);assert.equal(writes,0);
props.set('PE_NOTIFICATION_TARGET_PLAN_ID',canonical.id);
props.set('PE_NOTIFICATION_KAKAO_CLIENT_SECRET','synthetic-do-not-log');
props.set('PE_NOTIFICATION_KAKAO_REDIRECT_URI','https://wrong.invalid/callback');
r=gas.notificationStagingReadiness();assert.equal(r.plans.configuredPlanVerified,true);assert.ok(r.invalidProperties.includes('KAKAO_REDIRECT_URI'));assert.ok(!JSON.stringify(r).includes('synthetic-do-not-log'));
props.set('PE_NOTIFICATION_TEST_APPROVED','YES');assert.throws(()=>gas.notificationStagingJournalQa(),/disabled/);assert.equal(creates,0);
props.set('PE_NOTIFICATION_TEST_APPROVED','NO');
r=gas.notificationStagingJournalQa();assert.equal(r.rowsWritten,1002);assert.equal(r.uniqueKeys,1001);assert.equal(creates,1);assert.equal(qaSheet.data().length,1003);assert.equal(props.get('PE_NOTIFICATION_QA_STATUS'),'PASS');assert.equal(locked,false);
assert.throws(()=>gas.notificationStagingJournalQa(),/already started/);assert.equal(creates,1);
assert.equal(JSON.stringify(privateSheet.data()),before);assert.equal(JSON.stringify(planSheet.data()),planBefore);
assert.throws(()=>gas.StudyNotificationGasStore.create(qaId).exclusive(()=>true),/not notification-only/);
assert.throws(()=>gas.StudyNotificationGasStore.createQa(privateId).exclusive(()=>true),/not notification-only/);
assert.equal(locked,false);
console.log('PASS: Stage 6 exact plan discovery, configuration redaction, disabled one-shot QA, isolation and durable replay (simulated GAS)');
if(process.argv[2]){
 const original=fs.readFileSync(process.argv[2],'utf8'),hash=process.argv[3],patched=builder.patchMain(original,hash);
 assert.equal(sha(original),hash);
 const inserted="\n      else if (typeof PN4_isNotificationPost_ === 'function' && PN4_isNotificationPost_(action)) result = PN4_verifiedNotificationPost_(action, verified, envelope);";
 assert.equal(patched.split(inserted).length,2);assert.equal(patched.replace(inserted,''),original);
 new vm.Script(original);new vm.Script(patched);new vm.Script(builder.combine(builder.bridge));
 const extract=(source,name)=>{const start=source.indexOf('function '+name+'(');assert.ok(start>=0);const end=source.indexOf('\nfunction ',start+1);assert.ok(end>start);return source.slice(start,end);};
 let claims=[],audits=[],verified=0,notifications=0,polls=[];
 const mock={parsePostPayload_:x=>x,clean_:x=>String(x??'').trim(),claimMutationRequest_:()=>null,validateSignedMutation_(e,statuses){verified++;assert.equal(statuses[0],'ACTIVE');if(e.auth?.status!=='ACTIVE')throw Error('auth rejected');return {auth:e.auth,data:e.data||{}};},jsonOutput_:x=>x,setMutationStatus_:(_id,_poll,v)=>polls.push(v),appendSecurityAudit_:(_a,action,target,status,detail)=>audits.push({action,target,status,detail}),updateTopic_:()=>({topicId:'synthetic'}),renameSecurityDevice_:()=>({status:'renamed'}),PS9_isPlannerPost_:a=>a==='studyplans',PS9_verifiedPlannerPost_:()=>({plannerSyncVersion:1}),PN1_isPost_:a=>a==='personalnotesave',PN1_verifiedPost_:()=>({personalNoteVersion:1}),console:{error(){}}};
 vm.createContext(mock);vm.runInContext(extract(patched,'doPost')+'\n'+extract(original,'auditTargetForAction_')+'\n'+extract(original,'auditDetailForAction_'),mock);
 const send=(action,status='ACTIVE')=>mock.doPost({requestId:'synthetic-req',pollKey:'p'.repeat(32),action,auth:{status},data:{code:'synthetic-do-not-audit'}});
 // Missing addon must leave preexisting routes untouched.
 assert.equal(send('studyplans').plannerSyncVersion,1);assert.equal(send('personalnotesave').personalNoteVersion,1);
 assert.equal(send('renamedevice').status,'renamed');assert.equal(send('notificationsnapshot').ok,false);
 mock.PN4_isNotificationPost_=a=>a==='notificationsnapshot';
 mock.PN4_verifiedNotificationPost_=(a,v,e)=>{notifications++;assert.equal(a,'notificationsnapshot');assert.equal(v.auth.status,'ACTIVE');assert.equal(e.auth.status,'ACTIVE');return {notificationVersion:1,notificationResult:{ok:false,reason:'settings-conflict'}};};
 assert.equal(send('notificationsnapshot','PENDING').ok,false);assert.equal(notifications,0);
 const result=send('notificationsnapshot');assert.equal(result.ok,true);assert.equal(result.done,true);assert.equal(result.notificationResult.reason,'settings-conflict');assert.equal(notifications,1);assert.equal(polls.at(-1).done,true);assert.ok(!JSON.stringify(audits).includes('synthetic-do-not-audit'));
 assert.equal(send('studyplans').plannerSyncVersion,1);assert.equal(send('personalnotesave').personalNoteVersion,1);
 console.log('PASS: exact readback v25 Code.js one-insertion parity, syntax, actual doPost routing with mocked verifier, legacy routes and nested poll/audit behavior');
}
