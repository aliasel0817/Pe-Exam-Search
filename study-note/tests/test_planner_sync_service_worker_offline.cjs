'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.resolve(__dirname,'../service-worker.js'),'utf8');
const events={},cache=new Map();
const currentCache=code.match(/const CACHE_NAME = '([^']+)'/)[1];
const hostname='https://aliasel0817.github.io';
let fetches=0,skipWaitingCalls=0,claimCalls=0,deleted=[];
const self={location:{origin:hostname},clients:{claim:async()=>{claimCalls++}},skipWaiting:async()=>{skipWaitingCalls++},
 addEventListener:(name,fn)=>{events[name]=fn}};
const caches={open:async name=>({
 addAll:async paths=>{for(const p of paths)cache.set(hostname+'/Pe-Exam-Search/study-note/'+p.replace('./',''),{status:200,cached:true})},
 put:async(req,value)=>{cache.set(typeof req==='string'?req:req.url,value)}
}),keys:async()=>['pe-study-note-shell-OLD',currentCache],
 delete:async k=>{deleted.push(k);return true},
 match:async(req,{ignoreSearch}={})=>{
   const uri=typeof req==='string'?req:req.url;
   if(cache.has(uri))return cache.get(uri);
   if(ignoreSearch){for(const [k,v] of cache)if(k.split('?')[0]===uri.split('?')[0])return v}
   return null;
 }};
vm.runInNewContext(code,{self,caches,URL,fetch:async()=>{fetches++;throw Error('offline')},console,Promise}, {filename:'service-worker.js'});
const expect=['learning-sync-v2.js','study-planner.js','study-planner-sync.js','study-planner-sync-ux.js',
 'study-planner-migration.js','study-planner-migration-ui.js','study-plans/pe141-100days.json'];
const install={waitUntil(p){this.ready=p}};events.install(install);
(async()=>{
 await install.ready;
 for(const f of expect)assert(cache.has(hostname+'/Pe-Exam-Search/study-note/'+f),'Offline cache missing '+f);
 assert.equal(skipWaitingCalls,1);
 const activate={waitUntil(p){this.ready=p}};events.activate(activate);await activate.ready;
 assert.deepEqual(deleted,['pe-study-note-shell-OLD']);
 assert.equal(claimCalls,1);
 for(const name of expect){
  let response=null;const e={request:{url:hostname+'/Pe-Exam-Search/study-note/'+name+'?v=20261115',method:'GET'},respondWith:p=>response=p};
  events.fetch(e);assert(response,'offline planner request not intercepted '+name);
  const r=await response;assert.equal(r.status,200);
 }
 for(const request of [
  {url:hostname+'/Pe-Exam-Search/study-note/pdf/attachment.pdf',method:'GET'},
  {url:hostname+'/Pe-Exam-Search/study-note/study-planner-sync.js',method:'POST'},
  {url:'https://script.google.com/macros/s/example/exec?action=studyPlans',method:'GET'}
 ]){
  let intercepted=false;events.fetch({request,respondWith:()=>intercepted=true});
  assert.equal(intercepted,false,'Non-planner route intercepted '+request.url);
 }
 console.log('PLANNER_OFFLINE_CACHE_REGRESSION_PASS',JSON.stringify({
  version:currentCache,storedModules:expect.length,
  offlineNetworkFallback:true,existingPdfRequestsUnaffected:true,
  externalSignedApiNotIntercepted:true,mutationsNotIntercepted:true,
  previousShellEvicted:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
