'use strict';
/* R7 private build/input provenance assembly. DOES NOT authorize public distribution.
 * No LIVE MASTER/Apps Script calls, no files outside ignored .r7-private, no secrets logged.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const migration=path.resolve(__dirname,'..'),study=path.resolve(migration,'..');
const repo=path.resolve(study,'..'),m2=path.join(migration,'m2'),m3=path.join(migration,'m3');
const r7=__dirname,privateDir=path.join(repo,'.r7-private');
const r5Scan=require('../r5/r5-private-source-scan.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const readJSON=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const oldLock=readJSON(path.join(m2,'m2-asset-lock.json'));
const sourceProv=readJSON(path.join(r7,'R7-CODE-PROVENANCE.json'));
const m3Lock=readJSON(path.join(m3,'package-lock.json'));
const m2Lock=readJSON(path.join(m2,'package-lock.json'));
const mupdfCommit='20061bd45183f5a2bff8f43675e4da91e5ac2901';
const manifest=readJSON(path.join(migration,'r3','r3-draft-source-manifest.json'));
const licenseSha='57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6';
function inputs(){
 if(manifest.mupdf.commit!==mupdfCommit||manifest.mupdf.submodules.length!==18
  ||manifest.mupdf.submodules.some(x=>!/^[a-f0-9]{40}$/.test(x.commit)))throw Error('CORE_SOURCE_OR_SUBMODULES_UNVERIFIED');
 if(oldLock.package.version!=='1.28.1'
   ||m2Lock.packages?.['node_modules/mupdf']?.version!=='1.28.1'
   ||m3Lock.packages?.['node_modules/pdfjs-dist']?.version!=='6.5.438')throw Error('NPM_LOCK_VERSION_MISMATCH');
 const serverFile=path.join(r7,'source','Code.js');
 const result=r5Scan.audit(serverFile);
 if(!result.pass||result.sha256!==sourceProv.sha256||sourceProv.originalSha256
  !=='e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f')
   throw Error('SERVER_SOURCE_UNVERIFIED');
 const agpl=fs.readFileSync(path.join(migration,'r4','licenses','AGPL-3.0.txt'));
 if(sha(agpl)!==licenseSha)throw Error('OFFICIAL_AGPL_LICENSE_CHANGED');
 const binaries=[];
 for(const f of oldLock.files){
  const abs=path.join(m2,'node_modules','mupdf',f.name==='LICENSE'?'LICENSE':'dist/'+f.name);
  const bytes=fs.readFileSync(abs);
  if(bytes.length!==f.size||sha(bytes)!==f.sha256)throw Error('MUPDF_BINARY_MISMATCH_'+f.name);
  binaries.push({component:'mupdf',name:f.name,abs,sha256:f.sha256,bytes:bytes.length});
 }
 for(const name of ['pdf.mjs','pdf.worker.mjs','LICENSE']){
  const abs=path.join(m3,'node_modules','pdfjs-dist',name==='LICENSE'?'LICENSE':'build/'+name);
  const bytes=fs.readFileSync(abs);if(!bytes.length)throw Error('MISSING_PDFJS_'+name);
  binaries.push({component:'pdfjs',name,abs,sha256:sha(bytes),bytes:bytes.length});
 }
 return {binaries,serverSource:{path:'study-note/mupdf-migration/r7/source/Code.js',
   bytes:result.bytes,sha256:result.sha256},agplSha256:licenseSha};
}
function assemblePrivate(){
 if(process.env.R7_ACK_PRIVATE_ASSEMBLY!=='YES')throw Error('PRIVATE_ASSEMBLY_ACK_REQUIRED');
 const info=inputs();
 if(fs.existsSync(privateDir))throw Error('PRIVATE_DIR_ALREADY_EXISTS_REFUSE_OVERWRITE');
 if(!privateDir.startsWith(repo+path.sep))throw Error('INVALID_PRIVATE_PATH');
 const commit=cp.execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(!/^[a-f0-9]{40}$/.test(commit))throw Error('INVALID_GIT_SHA');
 fs.mkdirSync(privateDir,{recursive:true});
 const files=[];
 for(const f of info.binaries){
  const relative='study-note/vendor/'+f.component+'/'+(f.component==='mupdf'?'1.28.1':'6.5.438')+'/'+f.name;
  const dest=path.join(privateDir,'site',...relative.split('/'));
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(f.abs,dest);
  if(sha(fs.readFileSync(dest))!==f.sha256)throw Error('COPY_VERIFICATION_FAILED');
  files.push({path:relative,bytes:f.bytes,sha256:f.sha256});
 }
 const notices=path.join(r7,'R7-LICENSE-AND-THIRD-PARTY-NOTICES.md');
 const noticesBytes=fs.readFileSync(notices);
 const noticesPath=path.join(privateDir,'site','study-note','vendor','THIRD-PARTY-NOTICES.md');
 fs.writeFileSync(noticesPath,noticesBytes);
 files.push({path:'study-note/vendor/THIRD-PARTY-NOTICES.md',
   bytes:noticesBytes.length,sha256:sha(noticesBytes)});
 const data={schema:'mupdf-r7-private-assembly-v1',publication:'NOT_APPROVED',
  runtimeInstalled:false,productionMainMerged:false,liveAppsScriptModified:false,
  sourceCandidateCommit:commit,sourceCandidateUrl:'https://github.com/aliasel0817/Pe-Exam-Search/tree/'+commit+'/study-note',
  productionSourceOffer:false,
  upstreamCoreCommit:mupdfCommit,upstreamSubmodules:manifest.mupdf.submodules.length,
  expectedOfficialWasmSha:oldLock.files.find(f=>f.name==='mupdf-wasm.wasm').sha256,
  customAppsScriptSource:info.serverSource,
  thirdPartyNoticesStatus:'REVIEW_REQUIRED',
  componentFiles:files,containsUserData:false,containsSecrets:false};
 fs.writeFileSync(path.join(privateDir,'PRIVATE-ASSEMBLY-MANIFEST.json'),JSON.stringify(data,null,2)+'\n');
 return {status:'PASS_PRIVATE_ASSEMBLED_NO_DEPLOY',assetCount:files.length,
   wasmSha256:data.expectedOfficialWasmSha,sourceCandidateOnly:true,legalSignoff:false};
}
if(require.main===module){try{
 const result=process.argv.includes('--assemble-private')?assemblePrivate():{
  status:'PASS_PINNED_INPUTS',files:inputs().binaries.length,publicReleaseAllowed:false};
 console.log(JSON.stringify(result,null,2));
}catch(e){console.error('R7_ASSEMBLY_BLOCKED',String(e.message).slice(0,120));process.exitCode=1;}}
module.exports={inputs,assemblePrivate};
