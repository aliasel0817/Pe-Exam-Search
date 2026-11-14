'use strict';
/* Stage6 independent status evidence tests. Uses synthetic IndexedDB, never LIVE. */
const assert=require('node:assert/strict');
const {indexedDB}=require('../../.qa-browser/node_modules/fake-indexeddb');
Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:indexedDB});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
const UX=require('../study-planner-sync-ux.js');
const check=(v,needle)=>assert(String(v||'').includes(needle),v+' missing '+needle);
(async()=>{
 const disabled=UX.formatSyncStatus({enabled:false,migration:'required',pending:4,conflicts:1},{state:'not-run'});
 check(disabled.plans.label,'로컬');assert.equal(disabled.plans.state,'disabled');
 assert.notEqual(disabled.plans.state,'confirmed');
 const before=UX.formatSyncStatus({enabled:true,migration:'required'},{state:'not-run'});
 assert.equal(before.progress.state,'migration-required');
 const waiting=UX.formatSyncStatus({enabled:true,migration:'ready',planPending:2,progressPending:1,
  planConflicts:1,progressConflicts:0,pending:3,conflicts:1,lastSuccess:'2026-11-13T15:01:00.000Z'},{state:'unverified'});
 assert.equal(waiting.plans.state,'conflict');assert.equal(waiting.progress.state,'pending');
 check(waiting.legacy.label,'미확인');
 assert.notEqual(waiting.progress.state,'confirmed');
 const verified=UX.formatSyncStatus({enabled:true,migration:'ready',planPending:0,progressPending:0,pending:0,conflicts:0,
  planResult:{state:'confirmed',at:'2026-11-13T14:05:00.000Z'},
  progressResult:{state:'confirmed',at:'2026-11-13T14:05:00.000Z'}
 },{state:'confirmed',at:'2026-11-13T14:05:00.000Z'});
 assert.equal(verified.plans.state,'confirmed');assert.equal(verified.progress.state,'confirmed');
 assert.equal(verified.legacy.state,'confirmed');
 assert.equal(UX.localTime('2026-11-13T14:05:00.000Z').includes('23:05'),true,'KST zone conversion');
 assert.equal(UX.formatSyncStatus({enabled:true,migration:'ready'},{state:'unverified'}).legacy.state,'unverified');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false}});
 assert.equal(UX.formatSyncStatus({enabled:true,migration:'ready'},{state:'offline'}).plans.state,'offline');
 assert.equal((await UX.syncLegacySafely(()=>Promise.resolve())).state,'offline');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
 function writeDb(){
  return new Promise((resolve,reject)=>{
   const r=indexedDB.open('pe-study-note-db',1);
   r.onupgradeneeded=()=>r.result.createObjectStore('meta',{keyPath:'key'});
   r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
 }
 const db=await writeDb();
 const clean=await UX.syncLegacySafely(async()=>{});
 assert.equal(clean.state,'unverified','legacy swallows errors; lack of new persisted receipt is not success');
 const successful=await UX.syncLegacySafely(async()=>{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({key:'lastLearningSyncAt',value:'2026-11-13T14:08:00.000Z'});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
 });
 assert.equal(successful.state,'confirmed','fresh persisted legacy receipt proves success');
 const repeated=await UX.syncLegacySafely(async()=>{});
 assert.equal(repeated.state,'unverified','stale receipt is not fresh success');
 const failed=await UX.syncLegacySafely(async()=>{throw Error('unauthorized')});
 assert.equal(failed.state,'error');
 check(UX.classifyError(Error('HMAC invalid')),'신뢰기기');
 check(UX.classifyError(Error('backup SHA 해시 mismatch')),'JSON');
 check(UX.classifyError(Error('QuotaExceededError')),'저장 공간');
 check(UX.classifyError(Error('ACK timeout')),'작업 ID');
 db.close();
 console.log('STAGE6_SYNC_UX_PASS',JSON.stringify({disabledSafe:true,legacyReceiptVerified:true,legacyStaleNotSuccess:true,
  planProgressSeparated:true,partialNotReportedSuccess:true,offlineSafe:true,recoveryGuidance:true,kstFormatting:true}));
})().catch(e=>{console.error('STAGE6_SYNC_UX_FAIL',e.stack||e);process.exitCode=1;});
