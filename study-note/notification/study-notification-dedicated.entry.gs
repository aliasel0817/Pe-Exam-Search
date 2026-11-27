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
 function initializeJournal(){
  const c=cfg();
  must(c.p.getProperty('PE_NOTIFICATION_HTTP_APPROVED')!=='YES'&&c.p.getProperty('PE_NOTIFICATION_RELEASE_APPROVED')!=='YES'&&c.p.getProperty('PE_NOTIFICATION_SCHEDULER_APPROVED')!=='YES','initialization requires disabled project');
  const lock=LockService.getScriptLock();must(lock.tryLock(1000),'notification lock busy');
  try{
   must(!c.p.getProperty('PE_NOTIFICATION_PRIVATE_STORE_ID')&&!c.p.getProperty('PE_NOTIFICATION_STORE_MANIFEST'),'private journal already configured; never replace');
   const ss=SpreadsheetApp.create('PeExamStudyNotificationPrivate');
   const sh=ss.getSheets()[0];sh.setName('NotificationJournal');
   const header=['transactionId','index','count','key','payloadJson','sha256'];
   sh.getRange(1,1,1,header.length).setValues([header]);SpreadsheetApp.flush();
   must(ss.getId()!==c.p.getProperty('PE_NOTIFICATION_MASTER_ID')&&JSON.stringify(sh.getRange(1,1,1,header.length).getValues()[0])===JSON.stringify(header),'private initialization verification failed');
   c.p.setProperty('PE_NOTIFICATION_PRIVATE_STORE_ID',ss.getId());
   must(c.p.getProperty('PE_NOTIFICATION_PRIVATE_STORE_ID')===ss.getId(),'private journal ID not saved');
   return {ok:true,privateStoreCreated:true};
  }finally{lock.releaseLock();}
 }
 function compact(){const c=cfg();return StudyNotificationGasStore.compactDisabledProject(c.p,c.get('MASTER_ID'));}
 return Object.freeze({post,tick,initializeJournal,compact});
})();
function doPost(e){return PN4Dedicated.post(e);}
function doGet(){return ContentService.createTextOutput('{"ok":false}').setMimeType(ContentService.MimeType.JSON);}
// Explicit editor-run only; installable trigger must be separately approved.
function notificationScheduledTick(){return PN4Dedicated.tick();}
function initializeNotificationPrivateJournal(){return PN4Dedicated.initializeJournal();}

function compactNotificationPrivateJournal(){return PN4Dedicated.compact();}
