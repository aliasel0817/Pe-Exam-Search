'use strict';
// REVIEW ONLY. Not an approval / deployment command. Never imports credentials
// or calls Apps Script or uploads JS/WASM/PDF/ink to any server.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {scanGitIndex}=require('../r3/r3-source-export-audit.cjs');
const root=path.resolve(__dirname,'../../..'); // repository root
const migration=path.resolve(__dirname,'..');
const statePath=path.join(__dirname,'r4-approval-state.json');
function audit({repoRoot=root,stateFile=statePath}={}){
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 const m2=JSON.parse(fs.readFileSync(path.join(migration,'m2','m2-publication-gate.json'),'utf8'));
 const lock=JSON.parse(fs.readFileSync(path.join(migration,'m2','m2-asset-lock.json'),'utf8'));
 const html=fs.readFileSync(path.join(repoRoot,'study-note','study-note.html'),'utf8');
 const licenceFile=path.join(__dirname,'licenses','AGPL-3.0.txt');
 const licence=fs.readFileSync(licenceFile);
 const licenceExpected=lock.files.find(x=>x.name==='LICENSE');
 const sha256=crypto.createHash('sha256').update(licence).digest('hex');
 const privateIndex=scanGitIndex(repoRoot);
 const markers={
  m2GateStillClosed:m2.gate==='BLOCKED_PENDING_ARTIFEX_LEGAL_REVIEW' &&
    !m2.productionDeploymentAllowed&&!m2.publicMuPdfBinaryDistributionAllowed,
  r4ApprovalDefaultClosed:state.productionReleasePermitted===false&&
    state.publicMuPdfBinaryDistributionPermitted===false,
  licenseTextMatchesOfficialM2PinnedNpm:licenceExpected.size===licence.length&&
    licenceExpected.sha256===sha256,
  noPrivateBinOrCredentialInTrackedGit:privateIndex.pass,
  noticeOnlyOnLoopback:html.includes("if (typeof M4_REFERENCE_DEV_ENABLED !== 'undefined' && M4_REFERENCE_DEV_ENABLED) {")&&
    html.includes("privateR4Notice.src = './mupdf-migration/r4/r4-license-notice.js'")&&
    html.includes('R4_LICENSE_NOTICE_PRIVATE_START'),
  oldAnnotationSchemaPreserved:html.includes('const ANNOTATION_SCHEMA_VERSION = 3;')&&html.includes("coordinateSpace: 'normalized-0-1'"),
  branchContainsNoUnexpectedPublicMupdfBinaries:privateIndex.blockedPaths.length===0,
 };
 const licenseDecision=state.licenseChoice;
 const licensed=licenseDecision==='AGPL'?
   state.legal.agplCorrespondingSourceScopeResolved&&state.legal.frontendAndAppsScriptRightsReviewed
    &&state.source.actualCorrespondingSourceComplete
    &&state.source.buildAndInstallScriptsComplete
    &&state.source.thirdPartyNoticesReviewed
    &&state.source.noSensitiveDataVerified
    &&state.source.realPublicSourceOfferVerified:
  licenseDecision==='COMMERCIAL'?
   state.legal.commercialContractSigned:false;
 const blockers=[];
 if(!licensed)blockers.push('LICENSE_RIGHTS_AND_SOURCE_OFFER');
 if(!state.build.actualLinuxBuildCompleted)blockers.push('C_SOURCE_TO_WASM_BUILD_NOT_EXECUTED');
 if(!state.build.distributionBuildProvenanceVerified)blockers.push('WASM_SOURCE_PROVENANCE_NOT_COMPLETE');
 if(!state.security.activeSignedGetAccepted)blockers.push('ACTIVE_PDF_NOT_ACCEPTED');
 if(!state.security.ownerOnlyPolicyAccepted)blockers.push('OWNER_ONLY_NOT_ACCEPTED');
 if(!state.security.isolatedInkPersistenceAccepted)blockers.push('INK_PERSISTENCE_NOT_ACCEPTED');
 if(!state.devices.galaxyTabS11PhysicalAccepted)blockers.push('GALAXY_TAB_NOT_TESTED');
 if(!state.devices.iPhone16ProSafariPhysicalAccepted)blockers.push('IPHONE_SAFARI_NOT_TESTED');
 if(!state.operations.operatorMergeApproval||
    !state.operations.operatorAppsScriptApproval||
    !state.operations.operatorPagesApproval||
    !state.operations.operatorBinaryPublicationApproval)blockers.push('EXPLICIT_OPERATING_APPROVAL_MISSING');
 if(!Object.values(markers).every(Boolean))blockers.push('SOURCE_INTEGRITY_OR_RELEASE_GATE_FAILED');
 // R4 is deliberately a no-deploy preparation branch, even if a local file
 // claims all evidence is approved; never unlock the inherited M2 release gate.
 return {
  schema:'mupdf-r4-readiness-v1',decision:'NO_GO_R4_PRELAUNCH_NO_DEPLOY',
  markers,licenseChoice:licenseDecision,releasePermitted:false,
  publicBinaryDistributionPermitted:false,actualActiveTestRun:false,
  licenseTextSha256MatchesM2:markers.licenseTextMatchesOfficialM2PinnedNpm,
  sourceOfferPublished:false,noticeCurrentlyPrivate:true,
  actualBrowserAndDeviceResultsMustBeReportedSeparately:true,
  blockers,trackedFilesScanned:privateIndex.trackedFiles,
 };
}
if(require.main===module){
 try{
  const result=audit();
  console.log(JSON.stringify(result,null,2));
  if(!Object.values(result.markers).every(Boolean))process.exitCode=2;
 }catch(e){console.error('R4 readiness audit failed: '+e.message);process.exitCode=3;}
}
module.exports={audit};
