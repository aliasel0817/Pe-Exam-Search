'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const cp=require('node:child_process');
const r6=path.resolve(__dirname,'..'),migration=path.resolve(r6,'..');
const study=path.resolve(migration,'..'),root=path.resolve(study,'..');
const policy=require('../r6-release-policy.js');
const html=fs.readFileSync(path.join(study,'study-note.html'),'utf8');
const configSrc=fs.readFileSync(path.join(r6,'r6-release-config.js'),'utf8');
const fake={window:{}};
vm.runInNewContext(configSrc,fake);
const config=fake.window.PE_R6_RELEASE;
const HOST='https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html';
const SHA='2501f9bb64bcad9ef31aa85c87b82cf67633d59f';
const approved=()=>({
 schema:policy.SCHEMA,status:'RELEASED',enabled:true,releaseCommit:SHA,
 mupdfVersion:'1.28.1',mupdfCommit:policy.CORE,wasmSha256:policy.WASM,
 sourceUrl:'https://github.com/aliasel0817/Pe-Exam-Search/tree/'+SHA+'/study-note',
 review:{rights:true,source:true,security:true,devices:true,operator:true}
});
test('Public release remains disabled on all real/default study-note URLs',()=>{
 assert.equal(config.enabled,false);
 assert.equal(config.status,'BLOCKED');
 for(const u of [HOST,HOST+'?m4-local=1&m5-local=1&m6-local=1',
    'http://localhost:8080/study-note.html?m4-local=1',
    'https://evil.example/Pe-Exam-Search/study-note/study-note.html']) {
  assert.equal(policy.isProductionRelease(config,u),false,u);
 }
});
test('Exact immutable source commit, official provenance and five reviews required',()=>{
 assert.equal(policy.isProductionRelease(approved(),HOST),true);
 for(const field of ['rights','source','security','devices','operator']){
  const a=approved();a.review[field]=false;
  assert.equal(policy.isProductionRelease(a,HOST),false,field);
 }
 for(const key of ['enabled','status','releaseCommit','mupdfVersion',
    'mupdfCommit','wasmSha256','sourceUrl']){
  const a=approved();a[key]='BAD';
  assert.equal(policy.isProductionRelease(a,HOST),false,key);
 }
});
test('Public release cannot be switched on by a query or an impostor host',()=>{
 const a=approved();
 for(const u of ['https://evil.example/Pe-Exam-Search/study-note/study-note.html',
    'https://aliasel0817.github.io.evil.com/Pe-Exam-Search/study-note/study-note.html',
    'http://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html',
    'https://aliasel0817.github.io/Other/study-note/study-note.html',
    'http://localhost:8080/study-note.html']) {
  assert.equal(policy.isProductionRelease(a,u),false,u);
 }
});
test('Only fixed same-origin versioned module and worker assets can load',()=>{
 const u=policy.productionAssetUrls(approved(),HOST);
 assert.equal(u.mupdfURL,'https://aliasel0817.github.io/Pe-Exam-Search/study-note/vendor/mupdf/1.28.1/mupdf.js');
 assert.equal(u.pdfjsURL,'https://aliasel0817.github.io/Pe-Exam-Search/study-note/vendor/pdfjs/6.5.438/pdf.mjs');
 assert.equal(u.pdfjsWorkerURL,'https://aliasel0817.github.io/Pe-Exam-Search/study-note/vendor/pdfjs/6.5.438/pdf.worker.mjs');
 assert.throws(()=>policy.productionAssetUrls(config,HOST),/R6_RELEASE_NOT_AUTHORIZED/);
});
test('Proposed production adapter fails closed, without importing private or public WASM',async()=>{
 const priorLocation=globalThis.location,priorPolicy=globalThis.PE_R6_POLICY;
 try{
  globalThis.location={href:HOST};
  globalThis.PE_R6_POLICY=policy;
  const mod=await import('../r6-production-renderer.mjs');
  await assert.rejects(()=>mod.createR6ReferenceEngine(config),{code:'R6_PUBLIC_GATE_CLOSED'});
  await assert.rejects(()=>mod.createR6AttachmentEngine(config),{code:'R6_PUBLIC_GATE_CLOSED'});
 }finally{
  if(priorLocation===undefined)delete globalThis.location;else globalThis.location=priorLocation;
  if(priorPolicy===undefined)delete globalThis.PE_R6_POLICY;else globalThis.PE_R6_POLICY=priorPolicy;
 }
});
test('Original signed fetch, media content, annotations and API are not altered',()=>{
 assert.match(html,/buildSignedGetUrl\(getApiUrl\(\), 'referencePdfContent'/);
 assert.match(html,/fetchMediaContent\(getApiUrl\(\), item\.attachmentId/);
 assert.match(html,/const ANNOTATION_SCHEMA_VERSION = 3;/);
 assert.match(html,/coordinateSpace: 'normalized-0-1'/);
 assert.match(html,/referencePdfSourceAbort\?\.abort\(\)/);
 const m5=fs.readFileSync(path.join(migration,'m5','m5-attachment-ui.js'),'utf8');
 assert.match(m5,/m5AttachmentModule = mod/);
 assert.match(m5,/!R6_PRODUCTION_RELEASE_ENABLED/);
 const m6=fs.readFileSync(path.join(migration,'m6','m6-runtime.js'),'utf8');
 assert.match(m6,/isProductionRelease\(window\.PE_R6_RELEASE/);
 assert.match(m6,/isM6LocalOptIn\(window\.location\.href\)\)window\.__M6_QA__/);
});
test('R4 actual license notice reused and production link requires verified release',()=>{
 const notice=require('../../r4/r4-license-notice.js');
 assert.equal(notice.model({approved:false}).sourceOffer,null);
 assert.equal(notice.model({approved:true,gate:'OPEN',sourceUrl:approved().sourceUrl}).sourceOffer,approved().sourceUrl);
 assert.match(html,/R4_LICENSE_NOTICE_PRIVATE_START/);
 assert.match(html,/window\.PE_R4_NOTICE\?\.mount/);
 assert.match(html,/production:true/);
 assert.match(configSrc,/enabled:false/);
});
test('Unapproved release never reaches user content caches or tracked private binary',()=>{
 const sw=fs.readFileSync(path.join(study,'service-worker.js'),'utf8');
 assert.doesNotMatch(sw,/mupdf-wasm\.wasm|referencePdfContent|authorization|signedUrl/i);
 const tracked=cp.execFileSync('git',['-C',root,'ls-files'],{encoding:'utf8'});
 assert(!tracked.split(/\r?\n/).some(p=>(p.endsWith('.wasm')&&p!=='study-note/vendor/mupdf/1.28.1/mupdf-wasm.wasm')||p.includes('/.r6-private/')));
 const m2=JSON.parse(fs.readFileSync(path.join(migration,'m2','m2-publication-gate.json'),'utf8'));
 const r4=JSON.parse(fs.readFileSync(path.join(migration,'r4','r4-approval-state.json'),'utf8'));
 assert.equal(m2.publicMuPdfBinaryDistributionAllowed,false);
 assert.equal(r4.productionReleasePermitted,false);
});
test('Release frontend/Workers keep strict prior behavior outside new route',()=>{
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
   .map(m=>m[1]).filter(Boolean).filter(s=>s.trim());
 scripts.forEach((s,i)=>assert.doesNotThrow(()=>new vm.Script(s,{filename:'inline-'+i})));
 for(const f of ['m5/m5-attachment-ui.js','m6/m6-runtime.js','r4/r4-license-notice.js',
   'r6/r6-release-policy.js','r6/r6-release-config.js']){
  assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(migration,f),'utf8')));
 }
});
test('MuPDF rebuilt binary pin agrees with R5 verified package asset lock',()=>{
 const lock=JSON.parse(fs.readFileSync(path.join(migration,'m2','m2-asset-lock.json'),'utf8'));
 assert.equal(lock.package.version,'1.28.1');
 assert.equal(lock.files.find(f=>f.name==='mupdf-wasm.wasm').sha256,policy.WASM);
 assert.equal(lock.files.find(f=>f.name==='mupdf-wasm.wasm').size,10409826);
});
