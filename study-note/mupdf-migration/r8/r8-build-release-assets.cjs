'use strict';
/* R8 deterministic OFFLINE assembly. Never deploys/pushes binary source or secrets.
 * Release config may be enabled ONLY with a separately provided, ignored,
 * evidence-backed approval document. Default --private creates BLOCKED config.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const here=__dirname,repo=path.resolve(here,'../../..'),migration=path.resolve(here,'..');
const privateRoot=path.join(repo,'.r8-private');
const tag='pe-study-note-mupdf-1.28.1-r8-20261104';
const sourceUrl='https://github.com/aliasel0817/Pe-Exam-Search/tree/'+tag+'/study-note';
const schema='pe-study-note-r6-mupdf-release-v1';
const core='20061bd45183f5a2bff8f43675e4da91e5ac2901';
const wasm='5a30ef7b027f541ea8fc54e7c73f16414b0b59940741a12efe5e55f1fd0a99d7';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const lock=JSON.parse(fs.readFileSync(path.join(migration,'m2','m2-asset-lock.json')));
const files=[];
for(const f of lock.files){
 const p=path.join(migration,'m2','node_modules','mupdf',f.name==='LICENSE'?'LICENSE':'dist/'+f.name);
 const b=fs.readFileSync(p);
 if(b.length!==f.size||sha(b)!==f.sha256)throw Error('R8_PINNED_MUPDF_ASSET_MISMATCH_'+f.name);
 files.push({component:'mupdf',version:'1.28.1',name:f.name,source:p,sha256:f.sha256});
}
const pdfjsLock=JSON.parse(fs.readFileSync(path.join(migration,'m3','package-lock.json')));
if(pdfjsLock.packages['node_modules/pdfjs-dist'].version!=='6.5.438')throw Error('R8_PDFJS_LOCK_MISMATCH');
for(const name of ['pdf.mjs','pdf.worker.mjs','LICENSE']){
 const p=path.join(migration,'m3','node_modules','pdfjs-dist',name==='LICENSE'?'LICENSE':'build/'+name);
 files.push({component:'pdfjs',version:'6.5.438',name,source:p,sha256:sha(fs.readFileSync(p))});
}
function config(approval){
 const permitted=approval&&approval.schema==='r8-operator-release-approval-v1'
   &&approval.tag===tag &&approval.legalRightsReviewed===true
   &&approval.correspondingSourcePublic===true
   &&approval.cloudInkAccepted===true
   &&approval.deviceRiskExplicitlyAccepted===true
   &&approval.operatorAuthorizedMainAndPages===true
   &&approval.backupAndRollbackReady===true;
 if(approval&&!permitted)throw Error('R8_RELEASE_APPROVAL_INCOMPLETE');
 const flags={
 rights:!!permitted,source:!!permitted,security:!!permitted,
 devices:!!permitted,operator:!!permitted
 };
 return `/* R8 generated from tag: ${tag}. DO NOT hand-edit generated output. */
window.PE_R6_RELEASE=Object.freeze(${JSON.stringify({
 schema,status:permitted?'RELEASED':'BLOCKED',enabled:!!permitted,
 releaseCommit:permitted?tag:null,mupdfVersion:'1.28.1',
 mupdfCommit:core,wasmSha256:wasm,sourceUrl:permitted?sourceUrl:null,
 review:flags,physicalDeviceTestStatus:'NOT_VERIFIED_USER_RISK_ACCEPTED_ONLY'
},null,2)});
`;
}
function assemble({approvalPath}={}){
 if(process.env.R8_ACK_PRIVATE_BUILD!=='YES')throw Error('R8_PRIVATE_BUILD_ACK_REQUIRED');
 const target=path.join(privateRoot,'r8-offline-site');
 if(fs.existsSync(target))throw Error('R8_PRIVATE_TARGET_EXISTS_REFUSE_OVERWRITE');
 let approval=null;
 if(approvalPath){
  const actual=path.resolve(approvalPath);
  if(!actual.startsWith(privateRoot+path.sep)||!fs.existsSync(actual))
    throw Error('R8_APPROVAL_MUST_BE_IGNORED_PRIVATE_FILE');
  approval=JSON.parse(fs.readFileSync(actual,'utf8'));
 }
 const builtConfig=config(approval); // refuse incomplete approval BEFORE any writes
 fs.mkdirSync(target,{recursive:true});
 const entries=[];
 for(const f of files){
  const relative='study-note/vendor/'+f.component+'/'+f.version+'/'+f.name;
  const dest=path.join(target,...relative.split('/'));
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(f.source,dest);
  if(sha(fs.readFileSync(dest))!==f.sha256)throw Error('R8_ASSEMBLED_HASH_MISMATCH_'+f.name);
  entries.push({relative,sha256:f.sha256});
 }
 const configRelative='study-note/mupdf-migration/r6/r6-release-config.js';
 const configDest=path.join(target,...configRelative.split('/'));
 fs.mkdirSync(path.dirname(configDest),{recursive:true});
 fs.writeFileSync(configDest,builtConfig,'utf8');
 entries.push({relative:configRelative,sha256:sha(Buffer.from(builtConfig))});
 const result={schema:'r8-offline-source-correspondence-v1',tag,sourceUrl,
  sourceReferenceForBuild:tag,offlineOnly:true,publicDistributionPerformed:false,
  artifactStatus:approval?'RELEASE_CANDIDATE_PRIVATE_ONLY':'BLOCKED_PRIVATE_ONLY',
  physicalDevicesActuallyTested:false,files:entries};
 fs.writeFileSync(path.join(target,'R8-PRIVATE-PACKAGE-MANIFEST.json'),JSON.stringify(result,null,2)+'\n');
 return {status:result.artifactStatus,assets:entries.length,siteFolder:'.r8-private/r8-offline-site',published:false};
}
if(require.main===module){
 try{const approvalFlag=process.argv.indexOf('--approval-file');
  console.log(JSON.stringify(assemble({approvalPath:approvalFlag>=0?process.argv[approvalFlag+1]:null}),null,2));
 }catch(e){console.error('R8_BUILD_BLOCKED '+e.message);process.exitCode=2;}
}
module.exports={tag,sourceUrl,files,config,assemble};
