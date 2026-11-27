/* Dedicated Apps Script PROJECT ONLY; never concatenate into the existing
 * study-note backend. Default closed. No trigger creation or writes on load.
 */
var PN4Dedicated=(function(){
 'use strict';
 const must=(v,m)=>{if(!v)throw Error(m);};
 function cfg(){
  const p=PropertiesService.getScriptProperties(),get=k=>StudyNotificationRelayGas.requireProp(p,k);
  must(p.getProperty('PE_NOTIFICATION_PROJECT_MODE')==='DEDICATED_NOTIFICATION','dedicated project required');
  return {p,get,owner:get('OWNER_ID')};
 }
 function host(c,verified){
  const source=c.get('MASTER_ID');
  // The identity object exists only inside this server invocation.
  const marker=Object.freeze({});
  const h=StudyNotificationHostFactory(StudyNotificationCore,StudyNotificationServiceFactory(StudyNotificationCore)).create(
    {ownerId:c.owner,targetPlanId:c.get('TARGET_PLAN_ID')},{
     store:StudyNotificationGasStore.create(()=>StudyNotificationGasStore.activeId(c.p,source)),
     reader:StudyNotificationPlanReader.createGasReader(source),
     now:()=>Date.now(),
     releaseApproved:owner=>owner===c.owner&&c.p.getProperty('PE_NOTIFICATION_RELEASE_APPROVED')==='YES',
     testApproved:owner=>owner===c.owner&&c.p.getProperty('PE_NOTIFICATION_TEST_APPROVED')==='YES',
     createProvider:StudyNotificationKakaoGas.create,
     verifySignedRequest:request=>verified&&request===marker?verified.ctx:null
    });
  return {host:h,marker};
 }
 function output(value){
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
 }
 function post(e){
  let r=null,relay=null,verified=null;
  try{
   const c=cfg();
   must(c.p.getProperty('PE_NOTIFICATION_HTTP_APPROVED')==='YES','notification HTTP disabled');
   const raw=e?.postData?.contents;
   must(typeof raw==='string'&&raw.length<=40000,'invalid relay request');
   r=JSON.parse(raw);relay=StudyNotificationRelayGas.create(c.p,true);
   verified=relay.verify(r);
   const h=host(c,verified);
   const value=h.host.dispatch(verified.action,h.marker,verified.data);
   return output(relay.response(r,value));
  }catch(_){
   // A signed generic failure is returned only after successful relay auth.
   // Do not reveal source records, request body, OAuth data or credentials.
   return output(verified?relay.response(r,{ok:false,reason:'notification-request-failed'}):{ok:false});
  }
 }
 function tick(){
  const c=cfg();
  if(c.p.getProperty('PE_NOTIFICATION_RELEASE_APPROVED')!=='YES'||
     c.p.getProperty('PE_NOTIFICATION_SCHEDULER_APPROVED')!=='YES')return {reason:'disabled'};
  const n=StudyNotificationCore.kst(Date.now());
  if(n.minute<510||n.minute>=1200)return {reason:'outside-window'};
  return host(c,null).host.tick();
 }
 // Editor-only read-only preflight. The actual private workbook is created
 // separately and must be explicitly adopted; never create a duplicate.
 function preflight(){
  const p=PropertiesService.getScriptProperties(),get=k=>StudyNotificationRelayGas.requireProp(p,k);
  must(p.getProperty('PE_NOTIFICATION_PROJECT_MODE')==='DEDICATED_NOTIFICATION','dedicated project required');
  must(['HTTP_APPROVED','RELEASE_APPROVED','SCHEDULER_APPROVED','TEST_APPROVED'].every(k=>p.getProperty('PE_NOTIFICATION_'+k)==='NO'),'explicit disabled flags required');
  must(ScriptApp.getScriptId()===get('EXPECTED_SCRIPT_ID'),'script project mismatch');
  const master=get('MASTER_ID'),target=get('PRIVATE_STORE_ID');
  must(master!==target&&/^[A-Za-z0-9_-]{20,}$/.test(master)&&/^[A-Za-z0-9_-]{20,}$/.test(target),'distinct explicit spreadsheet IDs required');
  must(!p.getProperty('PE_NOTIFICATION_STORE_MANIFEST'),'existing generation manifest requires review');
  const source=SpreadsheetApp.openById(master);
  must(source.getName()==='topic_study_data'&&source.getSheetByName('암기장')&&source.getSheetByName('학습계획')&&source.getSheetByName('학습계획일정'),'MASTER identity mismatch');
  const store=StudyNotificationGasStore.create(()=>StudyNotificationGasStore.activeId(p,master));
  const result=store.exclusive(tx=>({ok:true,projectVerified:true,masterReadOnly:true,privateJournalVerified:true,recordCount:tx.list('').length,allSendFlagsDisabled:true}));
  // Only non-sensitive status. No secret, account or user study content logged.
  console.log(JSON.stringify(result));return result;
 }
 // All tools in this section are editor-run, never registered as HTTP actions.
 function disabledContext(){
  const p=PropertiesService.getScriptProperties(),get=k=>StudyNotificationRelayGas.requireProp(p,k);
  must(p.getProperty('PE_NOTIFICATION_PROJECT_MODE')==='DEDICATED_NOTIFICATION','dedicated project required');
  must(ScriptApp.getScriptId()===get('EXPECTED_SCRIPT_ID'),'script project mismatch');
  must(['HTTP_APPROVED','RELEASE_APPROVED','SCHEDULER_APPROVED','TEST_APPROVED'].every(k=>p.getProperty('PE_NOTIFICATION_'+k)==='NO'),'explicit disabled flags required');
  const master=get('MASTER_ID'),target=get('PRIVATE_STORE_ID');
  must(master!==target&&!p.getProperty('PE_NOTIFICATION_STORE_MANIFEST'),'distinct unmodified journal required');
  return {p,get,master,target};
 }
 function readiness(){
  preflight();const c=disabledContext();
  const keys=['OWNER_ID','TARGET_PLAN_ID','STATE_SECRET','RELAY_SECRET','KAKAO_CLIENT_ID','KAKAO_CLIENT_SECRET','KAKAO_APP_ID','KAKAO_REDIRECT_URI','LINK_URL','DAILY_BUDGET','MONTHLY_BUDGET'];
  const read=k=>c.p.getProperty('PE_NOTIFICATION_'+k)||'';
  const missing=keys.filter(k=>!read(k)),invalid=[];
  const check=(key,ok)=>{if(read(key)&&!ok)invalid.push(key);};
  check('KAKAO_APP_ID',/^[1-9]\d{0,19}$/.test(read('KAKAO_APP_ID')));
  check('KAKAO_REDIRECT_URI',read('KAKAO_REDIRECT_URI')==='https://aliasel0817.github.io/Pe-Exam-Search/study-note/notification/kakao-callback.html');
  check('LINK_URL',read('LINK_URL')==='https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html');
  check('STATE_SECRET',/^[a-f0-9]{64,128}$/i.test(read('STATE_SECRET')));
  check('RELAY_SECRET',/^[a-f0-9]{64}$/i.test(read('RELAY_SECRET'))&&read('RELAY_SECRET')!==read('STATE_SECRET'));
  const day=Number(read('DAILY_BUDGET')),month=Number(read('MONTHLY_BUDGET'));
  check('DAILY_BUDGET',Number.isSafeInteger(day)&&day>=1&&day<=30000);
  check('MONTHLY_BUDGET',Number.isSafeInteger(month)&&month>=1&&month<=3000000&&(!read('DAILY_BUDGET')||month>=day));
  const reader=StudyNotificationPlanReader.createGasReader(c.master),date=StudyNotificationCore.kst(Date.now()).date;
  const name=StudyNotificationHostFactory(StudyNotificationCore,StudyNotificationServiceFactory(StudyNotificationCore)).NAME;
  const plans=reader.inspectExactPlans(read('OWNER_ID'),name,read('TARGET_PLAN_ID'),date);
  const result={ok:true,readOnly:true,date,plans,missingProperties:missing,invalidProperties:invalid,configurationComplete:missing.length===0&&invalid.length===0&&plans.configuredPlanVerified,actualOAuthVerified:false,actualRelayVerified:false,sendFlagsDisabled:true};
  console.log(JSON.stringify(result));return result;
 }
 function journalQa(){
  // Only synthetic values. One explicit editor run. No writes to MASTER or
  // actual journal; interrupted creation/run is held for owner review.
  preflight();const c=disabledContext(),props=c.p;
  const key='PE_NOTIFICATION_QA_STATUS',idKey='PE_NOTIFICATION_QA_STORE_ID';
  const lock=LockService.getScriptLock();must(lock.tryLock(1000),'notification lock busy');
  let id;
  try{
   disabledContext();
   must(!props.getProperty(key)&&!props.getProperty(idKey),'QA already started; inspect saved state, never recreate');
   props.setProperty(key,'CREATING');
   must(props.getProperty(key)==='CREATING','QA state not saved');
   const ss=SpreadsheetApp.create('PeExamStudyNotificationQA');id=ss.getId();
   must(id!==c.master&&id!==c.target,'QA spreadsheet identity mismatch');
   props.setProperty(idKey,id);must(props.getProperty(idKey)===id,'QA ID not saved');
   const sh=ss.getSheets()[0];sh.setName('NotificationJournal');
   sh.getRange(1,1,1,6).setValues([['transactionId','index','count','key','payloadJson','sha256']]);SpreadsheetApp.flush();
   props.setProperty(key,'RUNNING');must(props.getProperty(key)==='RUNNING','QA run state not saved');
  }finally{lock.releaseLock();}
  const qa=StudyNotificationGasStore.createQa(()=>{
   const x=disabledContext();
   must(x.master===c.master&&x.target===c.target&&props.getProperty(idKey)===id&&id!==x.master&&id!==x.target&&props.getProperty(key)==='RUNNING','QA isolation lost');
   return id;
  });
  const start=Date.now(),count=1000;
  qa.exclusive(tx=>{
   must(tx.list('').length===0,'QA journal not empty');
   tx.commit(Array.from({length:count},(_,i)=>({key:'qa|row|'+String(i).padStart(5,'0'),value:{synthetic:true,version:1,index:i}})));
   must(tx.list('qa|row|').length===count&&tx.get('qa|row|00999').index===999,'QA index mismatch');
  });
  const writeMs=Date.now()-start,readStart=Date.now();
  qa.exclusive(tx=>{
   const rows=tx.list('qa|row|');must(rows.length===count&&rows.every((r,i)=>r.value.synthetic===true&&r.value.index===i&&r.value.version===1),'QA durable replay mismatch');
   tx.commit([{key:'qa|row|00000',value:{synthetic:true,index:0,version:2}},{key:'qa|extra',value:{synthetic:true,version:1}}]);
   must(tx.list('qa|').length===count+1&&tx.list('qa|extra').length===1,'QA new key index mismatch');
  });
  const updateMs=Date.now()-readStart,verifyStart=Date.now();
  qa.exclusive(tx=>{
   must(tx.list('').length===count+1&&tx.get('qa|row|00000').version===2&&tx.get('qa|extra').synthetic===true,'QA final readback mismatch');
  });
  const result={ok:true,syntheticOnly:true,rowsWritten:count+2,uniqueKeys:count+1,writeMs,readUpdateMs:updateMs,finalReadMs:Date.now()-verifyStart,qaStoreId:id};
  props.setProperty(key,'PASS');must(props.getProperty(key)==='PASS','QA final status not saved');
  console.log(JSON.stringify(result));return result;
 }
 function initializeJournal(){return preflight();}
 function compact(){const c=cfg();return StudyNotificationGasStore.compactDisabledProject(c.p,c.get('MASTER_ID'));}
 return Object.freeze({post,tick,initializeJournal,preflight,readiness,journalQa,compact});
})();
function doPost(e){return PN4Dedicated.post(e);}
function doGet(){return ContentService.createTextOutput('{"ok":false}').setMimeType(ContentService.MimeType.JSON);}
// Explicit editor-run only; installable trigger must be separately approved.
function notificationScheduledTick(){return PN4Dedicated.tick();}
function initializeNotificationPrivateJournal(){return PN4Dedicated.initializeJournal();}

function compactNotificationPrivateJournal(){return PN4Dedicated.compact();}

function notificationStagingPreflight(){return PN4Dedicated.preflight();}

function notificationStagingReadiness(){return PN4Dedicated.readiness();}
function notificationStagingJournalQa(){return PN4Dedicated.journalQa();}
