'use strict';
// Detect root-level LICENSE/COPYING/NOTICE candidates. NOT a legal classification.
const fs=require('node:fs');
const path=require('node:path');
const {parseGitlinks}=require('./r3-upstream-provenance.cjs');
const cp=require('node:child_process');
function inventory(source){
 const links=parseGitlinks(cp.execFileSync('git',['-C',source,'ls-tree','-r','HEAD','thirdparty'],{encoding:'utf8'}));
 return {
  schema:'r3-thirdparty-notices-draft-v1',
  scope:'UPSTREAM_MUPDF_1_28_1_EXACT_GITLINKS_ONLY',
  copyrightAndTermsStillNeedManualReview:true,
  modules:links.map(entry=>{
   const dir=path.join(source,...entry.path.split('/'));
   const files=fs.readdirSync(dir,{withFileTypes:true})
    .filter(x=>x.isFile()&&/^(LICENSE|LICEN[SC]E|COPYING|NOTICE)(\.|$)/i.test(x.name))
    .map(x=>x.name).sort();
   return {module:entry.path,commit:entry.commit,rootLicenseCandidates:files,
    manualLegalReviewRequired:true};
  }),
  sourceOfferApproved:false,
 };
}
if(require.main===module){
 try{
  const src=process.argv[2],target=process.argv[3];
  if(!src||!target||!target.endsWith('.json'))throw Error('Usage: <private-source> <draft-inventory.json>');
  const result=inventory(src);
  fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({modules:result.modules.length,
   modulesWithoutRootLicenseFile:result.modules.filter(x=>!x.rootLicenseCandidates.length).map(x=>x.module),
   legalApproval:false},null,2));
 }catch(e){console.error('Thirdparty inventory failed: '+e.message);process.exitCode=2;}
}
module.exports={inventory};
