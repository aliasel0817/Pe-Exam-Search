'use strict';
/* R9 release staging only, never deploys. Restricted to exact pinned npm files. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const here=__dirname,root=path.resolve(here,'../../..'),migration=path.resolve(here,'..');
const source=require('./r9-source-bundle.cjs');
const policy=require('../r6/r6-release-policy.js');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function stage(){
 if(process.env.R9_ACK_AGPL_PUBLIC_STAGING!=='YES')throw Error('R9_PUBLIC_STAGING_ACK_REQUIRED');
 source.verify();
 const lock=JSON.parse(fs.readFileSync(path.join(migration,'m2','m2-asset-lock.json'),'utf8'));
 const pdfLock=JSON.parse(fs.readFileSync(path.join(migration,'m3','package-lock.json'),'utf8'));
 if(lock.package.version!=='1.28.1'||pdfLock.packages?.['node_modules/pdfjs-dist']?.version!=='6.5.438')
  throw Error('R9_DEPENDENCY_VERSIONS_NOT_PINNED');
 const list=[];
 for(const f of lock.files){
  const relative='study-note/vendor/mupdf/1.28.1/'+f.name;
  const original=path.join(migration,'m2','node_modules','mupdf',f.name==='LICENSE'?'LICENSE':'dist/'+f.name);
  const bytes=fs.readFileSync(original);
  if(bytes.length!==f.size||hash(bytes)!==f.sha256)throw Error('R9_MUPDF_ASSET_HASH_MISMATCH_'+f.name);
  list.push({path:relative,source:original,size:bytes.length,sha256:f.sha256});
 }
 for(const name of ['pdf.mjs','pdf.worker.mjs','LICENSE']){
  const original=path.join(migration,'m3','node_modules','pdfjs-dist',name==='LICENSE'?'LICENSE':'build/'+name);
  const bytes=fs.readFileSync(original);
  list.push({path:'study-note/vendor/pdfjs/6.5.438/'+name,source:original,size:bytes.length,sha256:hash(bytes)});
 }
 if(!list.some(x=>x.path.endsWith('mupdf-wasm.wasm')&&x.sha256===policy.WASM))
  throw Error('R9_WASM_SOURCE_LOCK_INCONSISTENT');
 for(const f of list){
  const dest=path.join(root,...f.path.split('/'));
  if(fs.existsSync(dest))throw Error('R9_REFUSE_OVERWRITE_PUBLIC_FILE_'+f.path);
 }
 for(const f of list){
  const dest=path.join(root,...f.path.split('/'));
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(f.source,dest);
  if(hash(fs.readFileSync(dest))!==f.sha256)throw Error('R9_FINAL_ASSET_COPY_HASH_MISMATCH');
 }
 const audit={schema:'r9-mupdf-public-vendor-v1',
  mupdfCoreCommit:policy.CORE,mupdfVersion:'1.28.1',pdfjsVersion:'6.5.438',
  sourceArchiveSha256:source.expectedSha,assets:list.map(({path,size,sha256})=>({path,size,sha256})),
  releaseTag:policy.RELEASE_TAG, userDocumentDataBundled:false,
  buildSourceIncludedInSameCommit:true};
 fs.writeFileSync(path.join(here,'R9-PUBLIC-ASSET-MANIFEST.json'),JSON.stringify(audit,null,2)+'\n');
 console.log(JSON.stringify({status:'PINNED_RELEASE_ASSETS_STAGED_NOT_DEPLOYED',files:list.length,
  wasmSha256:policy.WASM,completeCSourceArchive:source.expectedSha,operatingChanged:false},null,2));
}
if(require.main===module)try{stage();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={stage};
