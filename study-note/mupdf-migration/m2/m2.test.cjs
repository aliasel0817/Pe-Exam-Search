'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {compute,run,STAGE,ASSET_LOCK,ROOT,sha256}=require('./m2-stage-assets.cjs');
const {verify}=require('./m2-verify-assets.cjs');
const {stateCheck}=require('./m2-release-gate.cjs');
const {createServer,PREFIX}=require('./m2-local-http-contract.cjs');
const RUNTIME=require('./m2-runtime-paths.json');
const LOCK=require('./package-lock.json');
test('npm lock is exactly pinned and AGPL licensed',()=>{
 assert.equal(require('./package.json').private,true);
 assert.equal(require('./package.json').dependencies.mupdf,'1.28.1');
 assert.equal(LOCK.packages['node_modules/mupdf'].version,'1.28.1');
 assert.match(LOCK.packages['node_modules/mupdf'].integrity,/^sha512-/);
 assert.equal(LOCK.packages['node_modules/mupdf'].license,'AGPL-3.0-or-later');
});
test('asset lock SHA-256 corresponds byte-for-byte to downloaded npm package',()=>{
 const a=compute(),b=JSON.parse(fs.readFileSync(ASSET_LOCK,'utf8'));
 assert.deepEqual(a,b);
 assert.equal(a.files.length,4);
 assert(a.files.some(x=>x.name==='mupdf-wasm.wasm'&&x.size>1000000));
});
test('stage is repeatable and copy checksum verification passes',()=>{
 const s=run();
 assert.equal(s.stagedFiles,4);
 assert.equal(s.allChecksumsMatch,true);
 assert.equal(verify().result,'PASS');
});
test('license file copied from official npm package unchanged',()=>{
 const a=fs.readFileSync(path.join(__dirname,'licenses','AGPL-3.0.txt'));
 const b=fs.readFileSync(path.join(__dirname,'node_modules','mupdf','LICENSE'));
 assert.equal(sha256(a),sha256(b));
 assert(a.includes(Buffer.from('GNU AFFERO GENERAL PUBLIC LICENSE')));
});
test('reproduction never stages tracked public assets or secrets',()=>{
 assert(STAGE.startsWith(path.join(ROOT,'.m2-private')+path.sep));
 const ig=fs.readFileSync(path.join(ROOT,'.gitignore'),'utf8');
 assert(ig.includes('**/.m2-private/'));
 assert(ig.includes('**/node_modules/'));
 for(const x of fs.readdirSync(STAGE))assert(!x.endsWith('.pdf')&&!x.endsWith('.env'));
});
test('actual runtime script imports the sibling WASM module',()=>{
 const a=fs.readFileSync(path.join(STAGE,'mupdf.js'),'utf8');
 const b=fs.readFileSync(path.join(STAGE,'mupdf-wasm.js'),'utf8');
 assert(a.includes('from "./mupdf-wasm.js"'));
 assert(b.includes('mupdf-wasm.wasm'));
 assert.equal(RUNTIME.version,'1.28.1');
});
test('private localhost server serves correct MIME, immutable versioned JS/WASM paths',async()=>{
 const srv=createServer();
 await new Promise((resolve,reject)=>srv.once('error',reject).listen(0,'127.0.0.1',resolve));
 try{
  const port=srv.address().port,base='http://127.0.0.1:'+port;
  for(const [name,mime] of Object.entries(RUNTIME.staticMimes)){
   const res=await fetch(base+PREFIX+name,{method:'HEAD'});
   assert.equal(res.status,200,name);
   assert.equal(res.headers.get('content-type'),mime);
   assert.equal(res.headers.get('x-content-type-options'),'nosniff');
   assert.match(res.headers.get('cache-control'),/immutable/);
   assert.equal(res.headers.get('x-m2-nonproduction'),'true');
  }
 }finally{await new Promise(resolve=>srv.close(resolve));}
});
test('localhost server refuses non-assets, signed URLs and unsafe paths',async()=>{
 const srv=createServer();
 await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+srv.address().port;
  for(const url of [
   '/?action=referencepdfcontent',
   PREFIX+'document.pdf',
   PREFIX+'mupdf.js?signature=example',
   PREFIX+'%2e%2e/private.key',
   PREFIX+'mupdf.js/../.clasp.json'
  ]){
   const res=await fetch(base+url);
   assert.equal(res.status,404,url);
  }
  assert.equal((await fetch(base+PREFIX+'mupdf.js',{method:'POST'})).status,405);
 }finally{await new Promise(resolve=>srv.close(resolve));}
});
test('release gate blocks public MuPDF and operating deployment',()=>{
 const x=stateCheck();
 assert.equal(x.status,'BLOCKED');
 assert.equal(x.assetBinaryReleasePermitted,false);
 assert.equal(x.productionDeployPermitted,false);
});
test('source offer is template only and not linked from production viewer',()=>{
 const html=fs.readFileSync(path.join(__dirname,'m2-source-offer-ui.template.html'),'utf8');
 const production=fs.readFileSync(path.join(ROOT,'study-note','study-note.html'),'utf8');
 assert(html.includes('REPLACE_WITH_VERIFIED_RELEASE_SOURCE_URL'));
 assert(!production.includes('REPLACE_WITH_VERIFIED_RELEASE_SOURCE_URL'));
 assert(!production.includes('mupdf-m2'));
});
