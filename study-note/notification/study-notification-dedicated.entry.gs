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
 function initializeJournal(){return preflight();}
 function compact(){const c=cfg();return StudyNotificationGasStore.compactDisabledProject(c.p,c.get('MASTER_ID'));}
 return Object.freeze({post,tick,initializeJournal,preflight,compact});
})();
function doPost(e){return PN4Dedicated.post(e);}
function doGet(){return ContentService.createTextOutput('{"ok":false}').setMimeType(ContentService.MimeType.JSON);}
// Explicit editor-run only; installable trigger must be separately approved.
function notificationScheduledTick(){return PN4Dedicated.tick();}
function initializeNotificationPrivateJournal(){return PN4Dedicated.initializeJournal();}

function compactNotificationPrivateJournal(){return PN4Dedicated.compact();}

function notificationStagingPreflight(){return PN4Dedicated.preflight();}
