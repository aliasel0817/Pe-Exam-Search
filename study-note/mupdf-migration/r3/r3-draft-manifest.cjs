'use strict';
// Generate SANITIZED planning metadata from a private local provenance audit.
// Produces NO deployable package; contains public git SHAs, never source bytes.
const fs=require('node:fs');
const path=require('node:path');
const expected='20061bd45183f5a2bff8f43675e4da91e5ac2901';
function generate(evidence){
 if(evidence?.upstream?.commit!==expected)throw Error('Incorrect MuPDF release');
 if(evidence.upstream.gitlinks.length!==18)throw Error('Unexpected submodule count');
 const missing=evidence.upstream.gitlinks.filter(x=>x.status!=='READY'||!x.checkoutMatches);
 return {
  schema:'r3-corresponding-source-draft-v1',
  purpose:'PRIVATE_REVIEW_AND_COUNSEL_INPUT_ONLY',
  sourceOfferStatus:'NOT_OFFERED_NO_PUBLIC_RELEASE',
  legalReviewStatus:'ARTIFEX_OR_QUALIFIED_COUNSEL_WRITTEN_DECISION_REQUIRED',
  operatorApprovalStatus:'NOT_GRANTED',
  mupdf:{
   package:'mupdf@1.28.1',
   upstream:'https://github.com/ArtifexSoftware/mupdf',
   tag:'1.28.1',commit:evidence.upstream.commit,
   license:'AGPL-3.0-or-later',
   recommendedSdk:'emsdk 4.0.8 on Linux',
   nodeLts:'22',buildCommand:'cd platform/wasm && npm run prepack',
   buildScriptSha256:evidence.upstream.buildShSha256,
   packageJsonSha256:evidence.upstream.packageJsonSha256,
   featureSettings:evidence.recipe.settings,
   submodules:evidence.upstream.gitlinks.map(x=>({path:x.path,commit:x.commit,privateCheckoutVerified:x.status==='READY'&&x.checkoutMatches})),
   initializedSubmoduleCount:18-missing.length,
   npmArtifactMatchingM2Lock:evidence.packaging.npmFilesMatchM2Lock.status,
   actualWasmRebuildCompleted:false,
   actualWasmReproducible:false,
  },
  candidateCorrespondingSourceScopes:[
   {item:'MuPDF C source, platform/wasm JS/TS/C sources, tools and exact submodules',scope:'IN_PRIVATE_CHECKOUT'},
   {item:'mupdf 1.28.1 dependency/source notices and build scripts',scope:'DRAFT_INVENTORY'},
   {item:'study-note HTML, service worker, PDF viewer adapters, annotation UI, tests',scope:'POTENTIAL_COVERED_APP_SOURCE_LEGAL_REVIEW'},
   {item:'Google Apps Script Code.js and referencePdfContent helper',scope:'LEGAL_COUPLING_SCOPE_UNRESOLVED'},
   {item:'Third-party licenses / fonts / fonts data / CJK maps / ICC profiles',scope:'INVENTORY_AND_NOTICE_REVIEW_REQUIRED'},
  ],
  neverPublish:[
   'Script Properties, actual OAuth credentials, HMAC/session keys and signed URLs',
   '.clasp.json, private .env, downloaded production Code.js snapshots, backup files',
   'Google Sheets LIVE MASTER rows and device registry',
   'Original Drive PDFs, images, attachments, personal annotations and user data',
   'Private wasm build output or npm package until legal/approval gate is resolved',
  ],
  requiredBeforeOffer:[
   'Artifex or qualified counsel written determination of AGPL front-end and Apps Script coupling',
   'Actual Linux emsdk 4.0.8 C-to-WASM build and provenance evidence',
   'Complete dependency licenses and compliant source/notice mapping',
   'Private data and credentials exclusion review',
   'User explicit approval of publication and production deployment',
  ],
  deployAllowed:false,publicBinaryReleaseAllowed:false,
 };
}
if(require.main===module){
 try{
  const src=process.argv[2],dst=process.argv[3];
  if(!src||!dst||!src.includes('.r3-private')||!dst.endsWith('.json'))
    throw Error('Usage: node r3-draft-manifest.cjs <ignored-.r3-private/evidence.json> <r3-draft-source-manifest.json>');
  const out=generate(JSON.parse(fs.readFileSync(src,'utf8')));
  fs.writeFileSync(dst,JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({status:'SOURCE_OFFER_DRAFT_WRITTEN',submodules:out.mupdf.initializedSubmoduleCount,
   npmArtifactsMatchLock:out.mupdf.npmArtifactMatchingM2Lock,releaseAllowed:false},null,2));
 }catch(e){console.error('R3 manifest generation rejected: '+e.message);process.exitCode=3;}
}
module.exports={generate};
