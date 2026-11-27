'use strict';
// Synthetic two-device, real IndexedDB API and actual Apps Script merge logic.
// No network requests, credentials or LIVE data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
let indexedDB;try{({indexedDB}=require('fake-indexeddb'));}catch(_){({indexedDB}=require('../../.qa-browser/node_modules/fake-indexeddb'));}
Object.defineProperty(globalThis,'crypto',{value:crypto.webcrypto,configurable:true});
const client=require('../learning-sync-v2.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const headers=['통합ID','즐겨찾기','학습상태','개인메모','최종학습일시','복습횟수','미암기횟수','업데이트일시','수정버전','최종미암기일시'];
const toRow=s=>[s.topicId,s.favorite,s.studyStatus,s.personalMemo,s.lastStudiedAt,s.reviewCount,s.missCount,s.updatedAt,s.revision,s.lastMissedAt];
let writes=0,locked=false;
const data=[headers.slice()];
const sheet={
 getLastRow:()=>data.length,getMaxColumns:()=>26,getMaxRows:()=>999,insertRowsAfter:()=>{throw Error('unexpected insert');},
 getRange:(r,c,n=1,m=1)=>{
  const values=()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[r-1+i]?.[c-1+j]??''));
  const put=rows=>{assert(locked,'writes must hold ScriptLock');writes++;rows.forEach((row,i)=>{data[r-1+i]??=[];row.forEach((v,j)=>{data[r-1+i][c-1+j]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v;});});};
  return {getValues:values,getDisplayValue:()=>String(values()[0][0]),getFormula:()=>'',getFormulas:()=>values().map(row=>row.map(()=>'')),setValue:v=>put([[v]]),setValues:put};
 }
};
const ctx={console,LEARNING_HEADERS:headers,clean_:v=>String(v??'').trim(),
 learningTimestampText_:v=>v instanceof Date?v.toISOString():String(v??'').trim(),
 learningStateToRow_:toRow,ensureLearningSheet_:()=>sheet,getStudySheet_:()=>({sheet:{}}),
 readTable_:()=>({headerIndex:{'통합ID':0},rows:Array.from({length:20},(_,i)=>['T'+String(i+1).padStart(4,'0')])}),
 LockService:{getScriptLock:()=>({waitLock:()=>{assert(!locked);locked=true;},releaseLock:()=>{assert(locked);locked=false;}})},
 SpreadsheetApp:{flush:()=>{}},
 Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
  computeDigest:(_alg,s)=>Array.from(crypto.createHash('sha256').update(s,'utf8').digest()),
  formatDate:d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../backend/learning-sync-v2.addon.gs'),'utf8'),ctx);
const getState=id=>{const r=data.find((row,i)=>i>0&&row[0]===id);return r?clone(ctx.LS2_fromRow_(r)):null;};
const transport={get:async()=>({version:2,rows:data.slice(1).filter(r=>r[0]).map(r=>clone(ctx.LS2_fromRow_(r)))}),
 post:async payload=>clone({ok:true,...ctx.LS2_saveLearningChanges_(payload)})};
const seed=(id,patch={})=>{const s={...client.blank(id),updatedAt:'2026-11-25T00:00:00.000Z',revision:5,...patch};data.push(toRow(s));return s;};
function open(name){return new Promise((resolve,reject)=>{const req=indexedDB.open(name,1);req.onupgradeneeded=()=>req.result.createObjectStore('learningStates',{keyPath:'topicId'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function put(db,row){return new Promise((resolve,reject)=>{const tx=db.transaction('learningStates','readwrite');tx.objectStore('learningStates').put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function local(db,id){return (await client.readRows(db)).find(r=>r.topicId===id);}
const sync=db=>client.sync(db,transport);
const study=(db,id,result,at)=>client.queue(db,id,s=>client.progressPatch(s,result,at));
(async()=>{
 const baseAt='2026-11-25T00:00:00.000Z',dayA='2026-11-26T01:00:00.000Z',dayB='2026-11-27T01:00:00.000Z',dayB2='2026-11-27T02:00:00.000Z';
 seed('T0001',{personalMemo:'original'});
 seed('T0002',{studyStatus:'암기',lastStudiedAt:baseAt,reviewCount:1});
 seed('T0003',{studyStatus:'암기',lastStudiedAt:baseAt,reviewCount:1});
 seed('T0004',{studyStatus:'암기',lastStudiedAt:baseAt,reviewCount:1});
 seed('T0005',{personalMemo:'cloud newer'});
 const a=await open('device-a'),b=await open('device-b');
 assert.throws(()=>ctx.LS2_saveLearningChanges_({states:[{}]}),/최신 버전/);
 assert.equal(writes,0);
 assert.equal((await sync(a)).state,'synced');assert.equal((await sync(b)).state,'synced');
 assert.equal(writes,0,'initial download must not mutate sheet');
 // Disjoint edits from stale devices preserve both values.
 await client.queue(a,'T0001',{personalMemo:'=not a formula'});
 await client.queue(b,'T0001',{favorite:true});
 assert.equal((await sync(a)).state,'synced');assert.equal((await sync(b)).state,'synced');
 assert.equal(getState('T0001').personalMemo,'=not a formula');
 assert.equal(getState('T0001').favorite,'Y');
 assert.equal(data[0][10],'학습동기화메타V2');
 assert.equal(JSON.parse(data.find(r=>r[0]==='T0001')[10]).receipts.length,2);
 // Repeated same-day study across devices does not add two reviews or misses.
 await study(a,'T0002','미암기',dayB);await study(b,'T0002','미암기',dayB2);
 await sync(a);await sync(b);
 assert.equal(getState('T0002').reviewCount,2);assert.equal(getState('T0002').missCount,1);
 await sync(a);await study(a,'T0002','암기','2026-11-27T03:00:00.000Z');await sync(a);
 assert.equal(getState('T0002').reviewCount,2);assert.equal(getState('T0002').missCount,1);
 // Distinct new dates merge once. Lost ACK retries retain the exact operation ID.
 await study(a,'T0003','암기',dayA);await study(b,'T0003','미암기',dayB);
 await sync(a);let lost=null;
 await assert.rejects(client.sync(b,{get:transport.get,post:async payload=>{lost=clone(payload);await transport.post(payload);throw Error('simulated lost ACK');}}),/lost ACK/);
 assert.equal(getState('T0003').reviewCount,3);assert.equal(getState('T0003').missCount,1);
 const pending=await local(b,'T0003');assert(pending.dirty);assert.equal(pending.syncV2.attempt.operationId,lost.changes[0].operationId);
 await sync(b);assert.equal(getState('T0003').reviewCount,3);assert.equal((await local(b,'T0003')).dirty,false);
 // Conflicting same-day status changes are never silently selected.
 await sync(a);await sync(b);
 await study(a,'T0004','암기',dayB);await study(b,'T0004','미암기',dayB2);
 await sync(a);const partial=await sync(b);assert.equal(partial.state,'partial');assert(partial.conflicts>=1);
 const held=await local(b,'T0004');assert.equal(held.studyStatus,'미암기');assert.equal(held.syncV2.conflict.remote.studyStatus,'암기');
 assert.equal(getState('T0004').studyStatus,'암기');
 await client.resolveConflict(b,'T0004','server',held.syncV2.conflict.remote,transport,client.snapshot(held));
 assert.equal((await local(b,'T0004')).syncV2.backup.studyStatus,'미암기');assert.equal((await local(b,'T0004')).studyStatus,'암기');
 // Legacy dirty snapshots with unknown ancestry are held, not pushed.
 const c=await open('old-device');await put(c,{...client.blank('T0005'),favorite:false,personalMemo:'old offline memo',dirty:true,revision:2,updatedAt:baseAt});
 const beforeLegacy=writes;const legacy=await sync(c);assert(legacy.conflicts>=1);assert.equal(writes,beforeLegacy);
 const legacyHeld=await local(c,'T0005');assert.equal(legacyHeld.personalMemo,'old offline memo');assert.equal(getState('T0005').personalMemo,'cloud newer');
 // Edits made during a request are rebased on its exact ACK, not erased.
 await sync(a);await client.queue(a,'T0001',{personalMemo:'first'});
 let first=true;
 await client.sync(a,{get:transport.get,post:async payload=>{
  const reply=await transport.post(payload);
  if(first){first=false;await client.queue(a,'T0001',{favorite:false});}
  return reply;
 }});
 const waiting=await local(a,'T0001');assert(waiting.dirty);assert.equal(waiting.favorite,false);assert.equal(waiting.personalMemo,'first');
 await sync(a);assert.equal(getState('T0001').favorite,'N');assert.equal(getState('T0001').personalMemo,'first');
 // A replay of an already accepted operation cannot undo an explicit later reset.
 await sync(b);await client.queue(b,'T0003',{studyStatus:'미학습',lastStudiedAt:'',lastMissedAt:'',reviewCount:0,missCount:0});
 await sync(b);assert.equal(getState('T0003').reviewCount,0);
 const duplicate=await transport.post(lost);assert.equal(duplicate.results[0].duplicate,true);assert.equal(getState('T0003').reviewCount,0);
 // The metadata column guard fails closed on any unexpected preexisting header.
 const header=data[0][10];data[0][10]='other existing column';
 const change={topicId:'T0006',operationId:'ls2-'+crypto.randomUUID(),base:null,desired:{...client.blank('T0006'),favorite:'Y',updatedAt:dayB,revision:1}};
 const beforeGuard=writes;assert.throws(()=>ctx.LS2_saveLearningChanges_({protocolVersion:2,changes:[change]}),/K열/);assert.equal(writes,beforeGuard);
 data[0][10]=header;
 // Unsupported capability must never invoke mutation.
 let unexpectedPost=0;await assert.rejects(client.sync(a,{get:async()=>({version:0,rows:[]}),post:async()=>{unexpectedPost++;}}),/서버가 확인되지/);assert.equal(unexpectedPost,0);
 assert.equal(locked,false);
 a.close();b.close();c.close();
 console.log('LEARNING_SYNC_V2_PASS '+JSON.stringify({twoDevices:true,fieldMerge:true,sameDayDedup:true,distinctDayMerge:true,lostAckReplay:true,conflictPreservation:true,legacyGuard:true,inFlightEdit:true,resetReplayProtection:true,metadataGuard:true,legacyWriteBlocked:true,liveRequests:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
