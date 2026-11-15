'use strict';
/* Pure Node CI verifies isolated Apps Script real-Sheets fixture payloads match the
 * production-intended Stage4 client encoding. Does NOT access Google servers.
 */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {createHash,webcrypto} = require('node:crypto');
Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
const client=require('../study-planner-sync.js');
const source=fs.readFileSync(path.join(__dirname,'../backend/planner-sync-stage8-real-gas-probe.gs'),'utf8');
const sha = s=>createHash('sha256').update(s).digest('hex');
const sandbox={
 Date, Math, JSON, Number, String, Array, Object, Error, Logger:{log:()=>{}},
 Utilities:{newBlob:s=>({getBytes:()=>[...Buffer.from(String(s),'utf8')]})},
 PS3_sha_:sha
};
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'stage8-real-gas-probe.gs'});
(async()=>{
 const id='s8r_CI_FIXTURE_001';
 const plan=JSON.parse(JSON.stringify(sandbox.PS8R_plan_(id)));
 const realFixture=sandbox.PS8R_chunks_(plan);
 const standard=await client.planChunks(plan);
 assert.equal(plan.days.length,100);
 assert.equal(plan.days.reduce((n,d)=>n+d.ids.length,0),19060);
 assert.equal(new Set(plan.days.flatMap(d=>d.ids)).size,3812);
 assert.equal(plan.rounds,5);
 assert.equal(realFixture.chunks.length,standard.chunks.length);
 assert.equal(realFixture.snapshotHash,standard.snapshotHash);
 assert.equal(sandbox.PS8R_canonical_(plan),client.canonicalPlan(plan));
 for(let i=0;i<standard.chunks.length;i++){
   const a=realFixture.chunks[i],b=standard.chunks[i];
   assert.equal(JSON.stringify(a),JSON.stringify(b),'chunk '+i);
   assert(Buffer.byteLength(a.payloadJson,'utf8')<=8192);
 }
 // Real SpreadsheetApp.getValues converts blank GROUPS round from null to ''.
 const group=standard.chunks.find(x=>x.kind==='GROUPS');
 assert(group&&group.round===null);
 assert.equal(sandbox.PS8R_chunksEquivalent_({...group,round:''},group),true);
 assert.equal(sandbox.PS8R_chunksEquivalent_({...group,chunkHash:'0'.repeat(64)},group),false);
 const day=standard.chunks.find(x=>x.kind==='DAY');
 assert(day);
 assert.equal(sandbox.PS8R_chunksEquivalent_({...day,round:day.round+1},day),false);
 assert.equal(standard.chunks.length,101);
 assert.match(source,/PS3_context_\(\)/);
 assert.match(source,/ISOLATED_TEST/);
 assert.doesNotMatch(source,/function\s+do(Get|Post)\s*\(/);
 assert.doesNotMatch(source,/\.deleteSheet\s*\(/);
 console.log('STAGE8_REAL_SHEETS_FIXTURE_SYNTHETIC_PASS',JSON.stringify({
   days:100,rounds:5,uniqueTopics:3812,slots:19060,chunks:standard.chunks.length,
   sha256:standard.snapshotHash,
   canRunEditorOnly:true,
   actualGAS:'UNVERIFIED',actualSheets:'UNVERIFIED',actualHMAC:'UNVERIFIED',
   productionMutation:'NONE'
 }));
})().catch(e=>{console.error('STAGE8_REAL_SHEETS_FIXTURE_SYNTHETIC_FAIL',e.stack||e);process.exitCode=1;});
