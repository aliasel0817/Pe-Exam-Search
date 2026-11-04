/* MuPDF R9 public release selector: limited to exact official
 * GitHub Pages host, pinned vendor hashes, release tag and vetted evidence.
 * The R6 BLOCKED default remains operational if this script fails to load.
 */
(function (root) {
 'use strict';
 if(!root||!root.PE_R6_POLICY||!root.location)return;
 const policy=root.PE_R6_POLICY;
 const release=Object.freeze({
  schema:'pe-study-note-r6-mupdf-release-v1',
  status:'RELEASED',enabled:true,
  releaseCommit:'pe-study-note-mupdf-1.28.1-r8-20261104',
  mupdfVersion:'1.28.1',
  mupdfCommit:'20061bd45183f5a2bff8f43675e4da91e5ac2901',
  wasmSha256:'5a30ef7b027f541ea8fc54e7c73f16414b0b59940741a12efe5e55f1fd0a99d7',
  sourceUrl:'https://github.com/aliasel0817/Pe-Exam-Search/tree/pe-study-note-mupdf-1.28.1-r8-20261104/study-note',
  review:Object.freeze({rights:true,source:true,security:true,devices:true,operator:true}),
  deviceEvidence:Object.freeze({windowsChrome:true,tabletPhysical:'USER_ACCEPTED_PENDING',
    iphonePhysical:'USER_ACCEPTED_PENDING'}),
  license:'AGPL-3.0-or-later'
 });
 if(policy.isProductionRelease(release,root.location.href))
  root.PE_R6_RELEASE=release;
})(typeof window==='object'?window:null);
