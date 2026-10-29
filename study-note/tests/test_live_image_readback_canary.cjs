"use strict";
// Read-only production endpoint canary. Never send mutations, credentials or payloads to the logs.
// This integration QA canary is intentionally scoped to one image.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const html=fs.readFileSync(path.resolve(__dirname,"../study-note.html"),"utf8");
const match=html.match(/const DEFAULT_API_URL\s*=\s*'([^']+)'/);
assert(match,"No production API URL configured");
const api=match[1],topicId="T0595",attachmentId="A000278";
async function get(action,more){
 const url=new URL(api); url.searchParams.set("action",action);
 for(const [k,v] of Object.entries(more||{}))url.searchParams.set(k,v);
 const response=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(30000)});
 assert.equal(response.ok,true,action+" returned HTTP "+response.status);
 const body=await response.json();
 assert.equal(body?.ok,true,action+" did not return ok:true");
 return body;
}
(async()=>{
 const listed=await get("attachments",{topicId});
 const rec=(listed.attachments||[]).find(x=>String(x.attachmentId)===attachmentId);
 assert(rec,"Live server omitted canary attachment");
 assert.equal(String(rec.driveFileId),"1uksq5_xOaQPxguUSS-E9ZgqDjkCk0Wbr","Drive link changed");
 assert.equal(String(rec.mime),"image/webp","Live sheet MIME mismatch");
 assert.equal(Number(rec.size),429716,"Live sheet size mismatch");
 assert.equal(String(rec.fileName),"T0595_I_1.webp","Live sheet file name mismatch");
 const media=await get("mediaContent",{attachmentId});
 const bytes=Buffer.from(media.base64||"","base64");
 assert.equal(bytes.length,429716,"Live media bytes mismatch");
 assert.equal(bytes.subarray(0,4).toString("ascii"),"RIFF","Live media RIFF header mismatch");
 assert.equal(bytes.subarray(8,12).toString("ascii"),"WEBP","Live media WebP header mismatch");
 assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),
   "345db1f5a2ed72c6b8ecb2a2fbb6ec60387d1eeaaa8693c698cf43c9e060fc6b",
   "Live media checksum mismatch");
 const full=await get("attachments",{});
 const activeImages=(full.attachments||[]).filter(x=>String(x.type).toUpperCase()==="I");
 assert(activeImages.length>=88,"Unexpectedly few live images");
 const oversized=activeImages.filter(x=>Number(x.size)>=1048576);
 assert.equal(oversized.length,0,"Live attachment list still contains 1MiB+ images");
 const sampleChecks=[
   ["A000087","1wnm_OCIYdjMgJ0ogC9D-bviciL7DOs1f","T4039_I_2.webp",880428,"7797e73dace5a687706f3d5f90bb651f8a107a72ea54655cd9e9c49355dcbad9"],
   ["A000098","1M80M8qqG3sBQOirReEkk2dB03GSVfNdQ","T1223_I_4.webp",639970,"6f6381c766053f49497d563cbed0d274f319fbbf4ecd78bb3dbdf4847632b09d"],
   ["A000238","14APkTbAZaBtb53ZIpeSHQmH1D-dCiPKI","T4051_I_1.webp",370988,"2f4a40bf5951f14200e11d28aef00e1464e0cfd45ac3d0a44501ad7570a506e1"]
 ];
 for(const [id,driveId,name,size,checksum] of sampleChecks){
   const record=(full.attachments||[]).find(x=>String(x.attachmentId)===id);
   assert(record,"Additional attachment not returned");
   assert.equal(String(record.driveFileId),driveId);
   assert.equal(String(record.fileName),name);
   assert.equal(String(record.mime),"image/webp");
   assert.equal(Number(record.size),size);
   const payload=await get("mediaContent",{attachmentId:id});
   const raw=Buffer.from(payload.base64||"","base64");
   assert.equal(raw.length,size);
   assert.equal(raw.subarray(0,4).toString("ascii"),"RIFF");
   assert.equal(raw.subarray(8,12).toString("ascii"),"WEBP");
   assert.equal(crypto.createHash("sha256").update(raw).digest("hex"),checksum);
 }
 console.log("LIVE_IMAGE_READBACK_CANARY_PASS",JSON.stringify({validatedMedia:1+sampleChecks.length,images:activeImages.length,oversizedRemaining:oversized.length,linked:true}));
})().catch(err=>{console.error("LIVE_IMAGE_READBACK_CANARY_FAIL",String(err?.message||err).slice(0,230));process.exitCode=1});
