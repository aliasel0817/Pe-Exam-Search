'use strict';
/* Synthetic two-device cloud protocol only: no actual network, authentication or Drive writes. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.resolve(__dirname,'../personal-note-cloud.js'),'utf8');
const live=new Map(),uploads=new Map();
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),cs=16384;
let seq=0;
const response=v=>({ok:true,...v});
const fetchFake=async url=>{
 const u=new URL(url),action=u.searchParams.get('action').toLowerCase(),data=JSON.parse(u.searchParams.get('data')||'{}');
 let value;
 if(action==='personalnotestatus')value=response({personalNoteSyncReady:true,schemaVersion:1,chunkSize:cs});
 else if(action==='personalnotedoc'){
  const doc=live.get(data.key);
  if(!doc)value=response({exists:false,revision:0});
  else if(data.mode==='meta')value=response({exists:true,revision:doc.revision,hash:doc.hash,length:doc.encoded.length,totalChunks:Math.ceil(doc.encoded.length/cs)});
  else if(data.revision!==doc.revision)value={ok:false,message:'REVISION_CHANGED'};
  else value=response({revision:doc.revision,index:data.index,totalChunks:Math.ceil(doc.encoded.length/cs),chunk:doc.encoded.slice(data.index*cs,(data.index+1)*cs)});
 } else value={ok:false,message:'NO_ACTION'};
 return {ok:true,json:async()=>value};
};
const postFake=async (_,action,d)=>{
 const a=action.toLowerCase();
 if(a==='personalnotebegin'){
  const rev=live.get(d.key)?.revision||0;
  if(rev!==d.baseRevision)return response({conflict:true,serverRevision:rev});
  const uploadId='test-'+(++seq);
  uploads.set(uploadId,{...d,chunks:[]});return response({uploadId});
 }
 if(a==='personalnotepart'){
  const job=uploads.get(d.uploadId);assert(job);job.chunks[d.index]=d.chunk;return response({received:job.chunks.filter(Boolean).length});
 }
 if(a==='personalnotecommit'){
  const job=uploads.get(d.uploadId);assert(job);const encoded=job.chunks.join(''),current=live.get(job.key);
  if(encoded.length!==job.length||sha(encoded)!==job.hash)throw Error('HASH_FAIL');
  if((current?.revision||0)!==job.baseRevision)return response({conflict:true,serverRevision:current?.revision||0});
  const revision=(current?.revision||0)+1;
  live.set(job.key,{encoded,hash:job.hash,revision});uploads.delete(d.uploadId);
  return response({committed:true,revision,hash:job.hash});
 }
 throw Error('Unsupported mutation '+action);
};
function device(){
 const sandbox={window:{},navigator:{onLine:true},crypto:crypto.webcrypto,TextEncoder,TextDecoder,
 btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
 hasActiveSecuritySession:()=>true,getApiUrl:()=> 'https://mock.invalid',
 buildSignedGetUrl:async (_url,action,data)=>'https://mock.invalid/?action='+encodeURIComponent(action)+'&data='+encodeURIComponent(JSON.stringify(data)),
 fetch:fetchFake,sendSecureMutation:postFake,console,URL,JSON,Array,Set,Math,Number,String,Error};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 return sandbox.window.PEPersonalNoteCloud;
}
(async()=>{
 const a=device(),b=device(),topicId='T100';
 const pages=[{id:'page-a',objects:[{id:'stroke-a',type:'stroke',points:[{x:.1,y:.2}]}]}];
 const bg='data:image/png;base64,RkFLRQ==';
 const first=await a.push(topicId,pages,bg,true,{});
 assert.equal(first.available,true);
 const incoming=await b.pull(topicId,null,null,{});
 assert.equal(incoming.conflict,false);
 assert.equal(incoming.pages.length,1);
 assert.equal(incoming.background,bg);
 assert.equal(incoming.pages[0].objects[0].id,'stroke-a');
 const changed=JSON.parse(JSON.stringify(incoming.pages));
 changed[0].objects.push({id:'shape-b',type:'shape',shape:'rect',start:{x:0,y:0},end:{x:.5,y:.5}});
 const pushed=await b.push(topicId,changed,bg,true,incoming.meta);
 assert.equal(pushed.available,true);
 const pulled=await a.pull(topicId,{topicId,pages},{background:bg,enabled:true},first.meta);
 assert.equal(pulled.conflict,false);
 assert.equal(pulled.pages[0].objects.length,2);
 const localChanged=JSON.parse(JSON.stringify(pages));
 localChanged[0].objects.push({id:'stroke-unpushed',type:'stroke',points:[{x:.9,y:.9}]});
 const held=await a.pull(topicId,{topicId,pages:localChanged},{background:bg,enabled:true},first.meta);
 assert.equal(held.conflict,true);
 await assert.rejects(a.push(topicId,localChanged,bg,true,first.meta),/다른 기기|수정/);
 console.log('PERSONAL_NOTE_TWO_DEVICE_SYNTHETIC_PASS',JSON.stringify({
 remoteDocs:live.size,signedProtocolMock:true,pullNewDevice:true,mergeServerChange:true,
 unsyncedLocalHeld:true,casConflict:true,realDevice:'NOT_TESTED'}));
})().catch(e=>{console.error('PERSONAL_NOTE_TWO_DEVICE_SYNTHETIC_FAIL',e.stack||e);process.exitCode=1;});
