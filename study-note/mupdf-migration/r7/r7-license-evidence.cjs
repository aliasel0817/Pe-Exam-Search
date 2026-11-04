'use strict';
/* Reads pre-existing R3 upstream checkout only: no file writes or Git commands there. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const here=__dirname,expected=JSON.parse(fs.readFileSync(path.join(here,'../r3/r3-draft-source-manifest.json')));
const source=process.env.R7_UPSTREAM_READONLY_PATH;
if(!source||!fs.existsSync(source))throw Error('EXISTING_UPSTREAM_READONLY_PATH_REQUIRED');
const allowed=['LICENSE','LICENCE','COPYING','COPYRIGHT','NOTICE','PATENTS','README'];
function findEvidence(folder){
 let out=[],entries=[];
 try{entries=fs.readdirSync(folder,{withFileTypes:true});}catch{return out}
 for(const e of entries){
  if(e.isFile()&&allowed.some(k=>e.name.toUpperCase().startsWith(k)))
   out.push({file:e.name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,e.name))).digest('hex')});
 }
 return out;
}
function commit(folder){try{return cp.execFileSync('git',['-C',folder,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return null}}
const base=commit(source);
if(base!==expected.mupdf.commit)throw Error('UPSTREAM_SOURCE_SHA_MISMATCH');
const thirdParty=expected.mupdf.submodules.map(m=>{
 const directory=path.join(source,...m.path.split('/'));
 if(!fs.existsSync(directory))throw Error('MISSING_SUBMODULE_'+m.path);
 const head=commit(directory);
 if(head!==m.commit)throw Error('UPSTREAM_SUBMODULE_SHA_MISMATCH_'+m.path);
 const root=findEvidence(directory);
 const embedded=[];
 if(root.length===0){
  for(const e of fs.readdirSync(directory,{withFileTypes:true})){
   if(!e.isDirectory()||e.name==='build'||e.name==='test'||e.name==='.git')continue;
   const child=findEvidence(path.join(directory,e.name));
   if(child.length)embedded.push(...child.slice(0,5).map(c=>({subdir:e.name,...c})));
   if(embedded.length>=20)break;
  }
 }
 return {path:m.path,sha:head,rootLicensingEvidence:root,embeddedLicensingEvidence:embedded.slice(0,20),
    manualFileByFileReviewNeeded:true};
});
const report={schema:'r7-third-party-provenance-readonly-v1',time:new Date().toISOString(),
 coreCommit:base,submodulesVerified:thirdParty.length,thirdParty,
 legalSignoff:false,licensesFromFilenamesNotLegalDetermination:true};
fs.writeFileSync(path.join(here,'R7-THIRD-PARTY-EVIDENCE.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'PASS_READ_ONLY_SOURCE_REVISION',commit:base,
 submodules:thirdParty.length,rootEvidence:thirdParty.filter(x=>x.rootLicensingEvidence.length>0).length,
 nestedOnly:thirdParty.filter(x=>x.rootLicensingEvidence.length===0&&x.embeddedLicensingEvidence.length>0).map(x=>x.path),
 unlocated:thirdParty.filter(x=>x.rootLicensingEvidence.length===0&&x.embeddedLicensingEvidence.length===0).map(x=>x.path),
 legalSignoff:false},null,2));
