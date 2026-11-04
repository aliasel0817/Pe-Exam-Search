'use strict';
/* R6 isolated binary provenance & private packaging; NEVER a release/deployment tool.
 * It writes ONLY ignored .r6-private and refuses mismatched npm artifact hashes.
 */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const crypto=require('node:crypto');
const migration=path.resolve(__dirname,'..'),study=path.resolve(migration,'..');
const repo=path.resolve(study,'..');
const privateDir=path.join(repo,'.r6-private');
const m2=path.join(migration,'m2'),m3=path.join(migration,'m3');
const expected=JSON.parse(fs.readFileSync(path.join(m2,'m2-asset-lock.json'),'utf8'));
const getHash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const readJSON=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function verifyInputs(){
 const mupdfPkg=readJSON(path.join(m2,'node_modules','mupdf','package.json'));
 const pdfPkg=readJSON(path.join(m3,'node_modules','pdfjs-dist','package.json'));
 if(mupdfPkg.version!=='1.28.1'||pdfPkg.version!=='6.5.438')
   throw Error('UNPINNED_VENDOR_VERSION');
 const pdfLock=readJSON(path.join(m3,'package-lock.json'));
 if(pdfLock.packages?.['node_modules/pdfjs-dist']?.version!=='6.5.438')
   throw Error('UNPINNED_PDFJS_LOCK');
 const assets=[];
 for(const record of expected.files){
  const name=record.name;
  const source=path.join(m2,'node_modules','mupdf',name==='LICENSE'?'LICENSE':'dist/'+name);
  const bytes=fs.readFileSync(source);
  if(bytes.length!==record.size||getHash(bytes)!==record.sha256)
   throw Error('MUPDF_ASSET_INTEGRITY_REJECTED_'+name);
  assets.push({component:'mupdf',name,bytes:bytes.length,sha256:record.sha256,source});
 }
 for(const name of ['pdf.mjs','pdf.worker.mjs','LICENSE']){
  const source=path.join(m3,'node_modules','pdfjs-dist',name==='LICENSE'?'LICENSE':'build/'+name);
  const bytes=fs.readFileSync(source);
  if(!bytes.length)throw Error('EMPTY_PDFJS_ASSET_'+name);
  assets.push({component:'pdfjs',name,bytes:bytes.length,sha256:getHash(bytes),source});
 }
 return assets;
}
function packagePrivate(){
 if(process.env.R6_ACK_PRIVATE_STAGE!=='YES')throw Error('PRIVATE_STAGE_ACK_REQUIRED');
 const assets=verifyInputs();
 if(!privateDir.endsWith(path.sep+'.r6-private')||!privateDir.startsWith(repo+path.sep))
   throw Error('PRIVATE_STAGE_DIRECTORY_REJECTED');
 const commit=cp.execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(!/^[0-9a-f]{40}$/.test(commit))throw Error('INVALID_SOURCE_COMMIT');
 const report={schema:'r6-private-release-inputs-v1',status:'NOT_RELEASED',commit,
   officialMupdfBuildAlreadyVerifiedInR5CI:true,
   packagingInputs:assets.map(({component,name,bytes,sha256})=>({component,name,bytes,sha256})),
   correspondingSourceCandidate:'https://github.com/aliasel0817/Pe-Exam-Search/tree/'+commit+'/study-note',
   note:'NOT an approved or complete source offer; never publish this private directory.'};
 const stage=path.join(privateDir,'site','study-note','vendor');
 for(const file of assets){
  const destination=path.join(stage,file.component,file.component==='mupdf'?'1.28.1':'6.5.438',file.name);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.copyFileSync(file.source,destination);
  if(getHash(fs.readFileSync(destination))!==file.sha256)
    throw Error('PRIVATE_STAGED_ASSET_HASH_MISMATCH_'+file.name);
 }
 fs.mkdirSync(privateDir,{recursive:true});
 fs.writeFileSync(path.join(privateDir,'source-inputs-manifest.json'),JSON.stringify(report,null,2)+'\n','utf8');
 return {status:report.status,files:assets.length,privateFolder:'.r6-private',sourceCandidateOnly:true};
}
if(require.main===module){
 try{
  const run=process.argv.includes('--stage-private')?packagePrivate():{
    status:'INPUTS_ONLY',inputs:verifyInputs().map(x=>({component:x.component,name:x.name,sha256:x.sha256}))
  };
  console.log(JSON.stringify(run,null,2));
 }catch(e){console.error('R6_PACKAGING_BLOCKED',e.message);process.exitCode=1;}
}
module.exports={verifyInputs,packagePrivate};
