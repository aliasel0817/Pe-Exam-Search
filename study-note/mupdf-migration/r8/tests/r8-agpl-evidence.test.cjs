'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const r8=path.resolve(__dirname,'..'),migration=path.resolve(r8,'..'),study=path.resolve(migration,'..'),repo=path.resolve(study,'..');
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const read=p=>fs.readFileSync(path.join(r8,p));
const info=JSON.parse(read('R8-UPSTREAM-LICENSE-MANIFEST.json'));
const original=require('../../r3/r3-draft-source-manifest.json');
const policy=require('../../r6/r6-release-policy.js');
const sourceSha='e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f';
const hosting='https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html';
test('App AGPL and npm 1.28.1 original licence texts preserved exactly',()=>{
 const r4=fs.readFileSync(path.join(migration,'r4/licenses/AGPL-3.0.txt'));
 assert.equal(hash(r4),'57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6');
 assert.deepEqual(fs.readFileSync(path.join(study,'LICENSE')),r4);
 const apache=read('licenses/Apache-2.0.txt').toString();
 assert.match(apache,/Apache License/);
 const mit=read('licenses/pdf-lib-MIT.txt').toString();
 assert.match(mit,/MIT License|Permission is hereby granted/);
});
test('18 exact submodules each have unaltered licence or original copyright evidence',()=>{
 assert.equal(info.modules,18);
 assert.equal(info.coreCommit,'20061bd45183f5a2bff8f43675e4da91e5ac2901');
 assert.equal(info.files.length,20);
 const set=new Set(info.files.map(x=>x.component));
 for(const mod of original.mupdf.submodules){
  assert(set.has(mod.path),mod.path);
  for(const file of info.files.filter(x=>x.component===mod.path)){
   assert.equal(file.sourceCommit,mod.commit);
   const data=read(file.local);
   assert.equal(hash(data),file.sha256,file.local);
   assert.equal(data.length,file.bytes,file.local);
  }
 }
 assert.equal(info.updatedFromThirdParty,false);
});
test('Current deployed Apps Script version21 source candidate remains unchanged',()=>{
 const tracked=fs.readFileSync(path.join(migration,'r5','source','Code.js'));
 assert.equal(hash(tracked),sourceSha);
 const r7=JSON.parse(fs.readFileSync(path.join(migration,'r7','R7-CODE-PROVENANCE.json')));
 assert.equal(r7.originalSha256,sourceSha);
 assert.equal(r7.appScriptDeployed,false);
});
test('Every required runtime thirdparty attribution is linked in published notice',()=>{
 const notice=fs.readFileSync(path.join(study,'THIRD_PARTY_NOTICES.md'),'utf8').replace(/\s+/g,' ');
 for(const text of ['Artifex','SheetJS Community Edition','SheetJS LLC','Apache-2.0',
  'MIT','Independent JPEG Group','FreeType','leptonica','libjpeg','18']){
  assert(notice.includes(text),text);
 }
 assert.match(notice,/LIVE MASTER/);
 for(const f of info.files)assert(notice.includes('third-party-licenses/'+f.local.split('/')[1]+'/') ||
   notice.includes('third-party-licenses/'+f.component.split('/').pop()+'/'));
 const r4=fs.readFileSync(path.join(migration,'r4','r4-license-notice.js'),'utf8');
 assert.match(r4,/THIRD_PARTY_NOTICES\.md/);
});
test('Exact source release tag support is narrow and invalid servers/tags rejected',()=>{
 assert.equal(policy.RELEASE_TAG,'pe-study-note-mupdf-1.28.1-r8-20261104');
 const c={
   schema:policy.SCHEMA,status:'RELEASED',enabled:true,
   releaseCommit:policy.RELEASE_TAG,mupdfVersion:'1.28.1',
   mupdfCommit:policy.CORE,wasmSha256:policy.WASM,
   sourceUrl:'https://github.com/aliasel0817/Pe-Exam-Search/tree/'+policy.RELEASE_TAG+'/study-note',
   review:{rights:true,source:true,security:true,devices:true,operator:true}
 };
 assert(policy.isProductionRelease(c,hosting));
 assert(!policy.isProductionRelease({...c,releaseCommit:'mupdf-next'},hosting));
 assert(!policy.isProductionRelease({...c,sourceUrl:'https://another.example/tag'},hosting));
 assert(!policy.isProductionRelease(c,'https://attacker.example/study-note/study-note.html'));
 const config=fs.readFileSync(path.join(migration,'r6','r6-release-config.js'),'utf8');
 assert.match(config,/enabled:false/);
 assert.match(config,/status:'BLOCKED'/);
});
test('Publication cannot accidentally include source docs/user data as binary',()=>{
 const paths=cp.execFileSync('git',['-C',repo,'ls-files','--','study-note'],{encoding:'utf8'}).split(/\r?\n/);
 assert(!paths.some(p=>/\.pdf$/i.test(p)||/\.xlsx$/i.test(p)));
 assert(!paths.some(p=>/\.r8-private|\.clasprc|\.clasp\.json/i.test(p)||(p.endsWith('.wasm')&&p!=='study-note/vendor/mupdf/1.28.1/mupdf-wasm.wasm')));
 const closure=read('R8-AGPL-CLOSURE-DECISION.md').toString('utf8');
 assert.match(closure,/no indefinite|No perpetual legal-review loop/i);
});
