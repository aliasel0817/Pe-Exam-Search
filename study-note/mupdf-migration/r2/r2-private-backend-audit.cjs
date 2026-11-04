'use strict';
// R2 LOCAL READ-ONLY source identity / security evidence auditor.
// Private Code.js, Script IDs, properties and user data must stay off GitHub/CI.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const dirs=process.argv.slice(2);
if(dirs.length!==4){
  console.error('Usage: node r2-private-backend-audit.cjs <cloned-head> <cloned-version> <local-candidate> <tracked-addon>');
  process.exit(2);
}
const [headDir,versionDir,candidateDir,trackedAddon]=dirs;
function raw(file){return fs.readFileSync(file);}
const head=raw(path.join(headDir,'Code.js'));
const release=raw(path.join(versionDir,'Code.js'));
const candidate=raw(path.join(candidateDir,'Code.js'));
const helper=raw(path.join(versionDir,'referencePdfContent.js'));
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const current=release.toString('utf8');
const range=(start,end)=>{
  const a=current.indexOf(start);
  const b=current.indexOf(end,a+start.length);
  if(a<0||b<=a)throw Error('Expected backend function boundary not found');
  return current.slice(a,b);
};
const pdfRoute=range("if (action === 'referencepdfcontent')","if (action === 'mediacontent')");
const auth=range('function validateDeviceSignature_(','function touchSecurityDevice_(');
const register=range('function registerDeviceFromGoogle_(','function issueDeviceSession_(');
const post=range('function doPost(e) {','function buildHealth_()');
const health=range('function buildHealth_() {','function ');
const touch=range('function touchSecurityDevice_(','function validateRecoveryPinWithRateLimit_(');
const checks={
  headCodeMatchesVersion21:digest(head)===digest(release),
  version21CodeMatchesCandidate:digest(release)===digest(candidate),
  version21HelperMatchesTrackedAddon:digest(helper)===digest(raw(trackedAddon)),
  signedReferenceRouteRequiresActive:/validateSignedGet_\(params,\s*\['ACTIVE'\]\)/.test(pdfRoute),
  routeUsesVerifiedPayload:pdfRoute.includes('verified.data')&&!pdfRoute.includes('params.pageToken'),
  healthAdvertisesRegisteredPdf:health.includes('referencePdfContentReady'),
  timestampNonceSignatureAndReplayGuard:auth.includes('SECURITY_AUTH_SKEW_SECONDS')
    &&auth.includes('nonce')&&auth.includes('constantTimeEquals_')
    &&auth.includes('security-nonce:'),
  ownerSubCheckedDuringRegistration:register.includes('identity.sub !== ownerSub'),
  preAuthClaimNeedsReview:post.indexOf('claimMutationRequest_')>=0
    &&post.indexOf('claimMutationRequest_')<post.indexOf('validateSignedMutation_'),
  signedReadMayUpdateLastAccess:auth.includes('touchSecurityDevice_')
    &&touch.includes('setValue('),
};
console.log(JSON.stringify({
 schema:'r2-private-readonly-evidence-v1',
 codeIdentity:'CLONED_HEAD_AND_VERSION_21',
 checks,
 actualActiveSignedPdfGet:'NOT_VERIFIED',
 actualOwnerOnlyMutationAttempt:'NOT_PERFORMED',
 releaseDecision:'NO_GO_PENDING_LEGAL_AND_ACCEPTANCE',
 privateSourceOrIdsPrinted:false,
},null,2));
if(Object.values(checks).slice(0,8).some(v=>v!==true))process.exitCode=1;
