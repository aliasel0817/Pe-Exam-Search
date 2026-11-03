'use strict';
// M1 Apps Script source audit: reports action names and boolean checks only.
// Production code is read-only; no source, credentials or user data are printed.
const fs=require('node:fs'), crypto=require('node:crypto'), path=require('node:path');
const READ_PUBLIC=new Set(['health','topics','topic','attachments','pdfpagelinks','pdfpagefiles','mediacontent']);
const READ_SIGNED=new Set(['referencepdfpagecatalog','referencepdfpageinfo','referencepdfregistrationplan','referencepdfcontent','learningstates','securitystatus','securitydevices','annotationsync']);
const WRITE_SIGNED=new Set(['updatetopic','addtopic','deactivatetopic','uploadattachment',
  'uploadreferencepdfpage','replacereferencepdfpage','deleteattachment',
  'savelearningstates','saveannotations','approvedevice','revokedevice','renamedevice']);
const WRITE_REGISTER=new Set(['registerdevice']);
function functionSpan(source,name) {
  const start=source.search(new RegExp('^function\\s+'+name+'\\s*\\(','m'));
  if(start<0)return '';
  const next=/^function\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/gm;
  next.lastIndex=start+9;const m=next.exec(source);
  return source.slice(start,m?m.index:source.length);
}
function actionNames(body) {
  return [...new Set([...body.matchAll(/action\s*===\s*['"]([a-z0-9_-]+)['"]/g)].map(x=>x[1]))].sort();
}
function auditBackendText(source) {
  const get=functionSpan(source,'doGet');
  const post=functionSpan(source,'doPost');
  const sig=functionSpan(source,'validateDeviceSignature_');
  const reg=functionSpan(source,'registerDeviceFromGoogle_');
  const mut=functionSpan(source,'validateSignedMutation_');
  const issues=[];
  if(!get||!post)issues.push('MISSING_DISPATCHER');
  const getters=actionNames(get),posters=actionNames(post);
  const unknownGet=getters.filter(a=>!READ_PUBLIC.has(a)&&!READ_SIGNED.has(a)&&a!=='mutationstatus');
  const unknownPost=posters.filter(a=>!WRITE_SIGNED.has(a)&&!WRITE_REGISTER.has(a));
  if(unknownGet.length)issues.push('REVIEW_UNKNOWN_GET_ACTIONS');
  if(unknownPost.length)issues.push('REVIEW_UNKNOWN_POST_ACTIONS');
  const referenceBranch=get.match(/if\s*\(\s*action\s*===\s*['"]referencepdfcontent['"]\s*\)\s*\{([\s\S]*?)\n\s*\}/);
  const controls={
    signedGetOnOriginalPdf:!!referenceBranch && /validateSignedGet_\s*\(\s*params\s*,\s*\[\s*['"]ACTIVE['"]/.test(referenceBranch[1]),
    verifiedPageIdentifiersUsed:!!referenceBranch && /verified\.data/.test(referenceBranch[1]),
    signedMutationDispatcher:/validateSignedMutation_\s*\(\s*envelope\s*,\s*\[\s*['"]ACTIVE['"]/.test(post),
    signedMutationCallsDeviceVerifier:/validateDeviceSignature_/.test(mut),
    statusMustBeAllowed:/allowedStatuses\.includes\s*\(\s*device\.status\s*\)/.test(sig),
    signedHmacComparison:/constantTimeEquals_\s*\(\s*expected\s*,\s*signature\s*\)/.test(sig),
    nonceReplayCheck:/cache\.get\s*\(\s*replayKey\s*\)/.test(sig),
    expiryCheck:/device\.sessionExpiresAt/.test(sig),
    ownerEmailAtRegistration:/identity\.email\s*!==\s*allowedEmail/.test(reg),
    ownerSubAtRegistration:/identity\.sub\s*!==\s*ownerSub/.test(reg),
    ownerSubAtEveryWrite:/auth\.googleSub\s*!==\s*ownerSub/.test(mut)||/auth\.googleSub\s*!==\s*ownerSub/.test(post),
    preAuthIdempotencyClaim:post.indexOf('claimMutationRequest_')>=0 && post.indexOf('claimMutationRequest_')<post.indexOf('validateSignedMutation_')
  };
  for(const key of ['signedGetOnOriginalPdf','verifiedPageIdentifiersUsed','signedMutationDispatcher',
    'signedMutationCallsDeviceVerifier','statusMustBeAllowed','signedHmacComparison','nonceReplayCheck',
    'expiryCheck','ownerEmailAtRegistration','ownerSubAtRegistration']){
    if(!controls[key])issues.push('MISSING_OR_REVIEW_'+key);
  }
  if(!controls.ownerSubAtEveryWrite)issues.push('DEFENSE_IN_DEPTH_OWNER_CHECK_NOT_DIRECTLY_VISIBLE');
  if(controls.preAuthIdempotencyClaim)issues.push('REVIEW_PRE_AUTH_CACHE_CLAIM');
  return {schema:'mupdf-m1-appsscript-audit-v1',sourceHash:crypto.createHash('sha256').update(source).digest('hex'),
    publicReadActions:getters.filter(x=>READ_PUBLIC.has(x)),
    signedReadActions:getters.filter(x=>READ_SIGNED.has(x)),
    otherReadActions:getters.filter(x=>!READ_PUBLIC.has(x)&&!READ_SIGNED.has(x)),
    signedWriteActions:posters.filter(x=>WRITE_SIGNED.has(x)),
    exceptionalRegistrationActions:posters.filter(x=>WRITE_REGISTER.has(x)),
    unknownGet,unknownPost,controls,reviewFindings:issues,
    caveat:'Static evidence only. Runtime permissions, deployed revision and end-to-end authorization are not proven.'};
}
function main(args) {
  const idx=args.indexOf('--backend');
  if(idx<0||!args[idx+1])throw Error('Usage: node m1-api-audit.cjs --backend <read-only Code.js>');
  const file=path.resolve(args[idx+1]);
  const data=fs.readFileSync(file,'utf8');
  const result=auditBackendText(data);
  result.backendFilename=path.basename(file);
  console.log(JSON.stringify(result,null,2));
  if(result.reviewFindings.some(x=>x.startsWith('MISSING_')))process.exitCode=2;
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){console.error('M1_API_AUDIT_ERROR:',e.message);process.exitCode=2;}}
module.exports={auditBackendText,functionSpan,READ_PUBLIC,READ_SIGNED,WRITE_SIGNED};
