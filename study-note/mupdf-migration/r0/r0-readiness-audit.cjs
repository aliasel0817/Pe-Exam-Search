'use strict';
// R0 offline, read-only, public-safe state audit. No Apps Script, Drive or network requests.
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..');
const M7='acf1f173ba143b441cee120180f044e2bc9bb5e2';
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
function git(args){
 return cp.execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:15000}).trim();
}
function unchangedSinceM7(rel){
 try {return read(rel).replace(/\r\n/g,'\n').trimEnd()===git(['show',M7+':'+rel]).replace(/\r\n/g,'\n').trimEnd();}
 catch (_) {return false;}
}
function audit(){
 const gate=JSON.parse(read('study-note/mupdf-migration/m2/m2-publication-gate.json'));
 const lock=JSON.parse(read('study-note/mupdf-migration/m2/m2-asset-lock.json'));
 const scope=JSON.parse(read('study-note/mupdf-migration/m1/m1-source-publication-manifest.json'));
 const sw=read('study-note/service-worker.js');
 const html=read('study-note/study-note.html');
 const evidence=JSON.parse(read('study-note/mupdf-migration/r0/R0-UPSTREAM-PROVENANCE.json'));
 const tracked=git(['ls-files']).split(/\r?\n/);
 const controls={
  releaseGateClosed:gate.gate==='BLOCKED_PENDING_ARTIFEX_LEGAL_REVIEW' &&
   gate.productionDeploymentAllowed===false &&
   gate.publicMuPdfBinaryDistributionAllowed===false,
  licenseReviewStillRequired:gate.legalReviewRequired===true &&
   gate.appsScriptCouplingOpinion==='UNRESOLVED' &&
   gate.correspondingSourceCompleteness==='UNVERIFIED',
  packagePinned:lock.package?.name==='mupdf'&&lock.package?.version==='1.28.1' &&
   lock.package?.license==='AGPL-3.0-or-later',
  // R9 release transition: allow only the audited official 1.28.1 WASM;
  // R0's historical legal decision remains an archival prelaunch snapshot.
  noPublicWasmTracked:!tracked.some(p=>(/\.wasm$/i.test(p)&&
   p!=='study-note/vendor/mupdf/1.28.1/mupdf-wasm.wasm')||/(^|\/)\.m[2-7]-private\//.test(p)),
  serviceWorkerUnchanged:unchangedSinceM7('study-note/service-worker.js'),
  backendAddonUnchanged:unchangedSinceM7('study-note/backend/referencePdfContent.addon.gs'),
  serviceWorkerOnlyCachesShell:/!isStudyNoteHtml && !isManifest && !isPlannerAsset && !isImageOptimizerAsset/.test(sw)
    && /if \(url\.origin !== self\.location\.origin\) return;/.test(sw)
    && !/pdfBytes|referencePdfContent|mediaContent|signedUrl/i.test(sw),
  annotationSchemaIntact:/const ANNOTATION_SCHEMA_VERSION = 3;/.test(html),
  sourceBoundaryStillPending:scope.status==='LEGAL_REVIEW_REQUIRED_NO_DEPLOY',
  sourceTagMatchedNpmGitHead:evidence.npmGitHead===evidence.upstreamTagCommit &&
   /^[0-9a-f]{40}$/.test(evidence.npmGitHead),
  wasmRebuildUnverified:evidence.exactWasmRebuildVerified===false,
  legalOpinionUnverified:evidence.artifexLegalOpinionObtained===false,
 };
 return Object.freeze({
  schema:'mupdf-r0-readiness-v1',
  sourceBaseline:M7,
  auditScope:'local source and public package metadata; no credentialed API and no physical device tests',
  controls,
  passedControls:Object.values(controls).filter(Boolean).length,
  totalControls:Object.keys(controls).length,
  releaseDecision:'NO_GO',
  unfinished:['AGPL_SERVER_COUPLING','WASM_REBUILD','LIVE_APPS_SCRIPT_SOURCE_IDENTITY',
   'ACTIVE_DEVICE_GET','PHYSICAL_TABLET_SPEN','PHYSICAL_IPHONE_SAFARI','REAL_INK_PERSISTENCE'],
 });
}
if(require.main===module){
 try{
  const result=audit();
  console.log(JSON.stringify(result,null,2));
  if(result.passedControls!==result.totalControls || result.releaseDecision!=='NO_GO')process.exitCode=2;
 }catch(e){console.error('R0_AUDIT_FAILED',e.code||e.message);process.exitCode=2;}
}
module.exports={audit,unchangedSinceM7};
