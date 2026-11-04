'use strict';
// One-time, exact-string R6 integration patch. Refuses to change unexpected bases.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
function patch(rel, edits){
 const target=path.join(root,rel),before=fs.readFileSync(target,'utf8');
 const useCRLF=before.includes('\r\n');
 let content=before.replace(/\r\n/g,'\n');
 for(const [oldText,newText] of edits){
   const matches=content.split(oldText).length-1;
   if(matches!==1)throw Error('R6 patch refuses '+rel+' count '+matches+' for '+oldText.slice(0,66));
   content=content.replace(oldText,newText);
 }
 if(content===before.replace(/\r\n/g,'\n'))throw Error('No change '+rel);
 fs.writeFileSync(target,useCRLF?content.replace(/\n/g,'\r\n'):content,'utf8');
 console.log('PATCHED '+rel+' bytes '+before.length+' -> '+content.length);
}
const htmlEdits=[
[
'  <script src="./image-upload-optimizer.js"></script>\n  <script>',
'  <script src="./image-upload-optimizer.js"></script>\n'
+'  <!-- R6_RELEASE_SCRIPTS_BEGIN: inert until a separately audited release -->\n'
+'  <script src="./mupdf-migration/r6/r6-release-config.js"></script>\n'
+'  <script src="./mupdf-migration/r6/r6-release-policy.js"></script>\n'
+'  <!-- R6_RELEASE_SCRIPTS_END -->\n  <script>'
],
[
'// M4 private integration gate: NEVER ship MuPDF binaries to the public Pages site.\nconst M4_REFERENCE_DEV_ENABLED',
'// R6: retain the original loopback flag; only an independently reviewed release can opt in.\n'
+'const R6_PRODUCTION_RELEASE_ENABLED = window.PE_R6_POLICY?.isProductionRelease(\n'
+'  window.PE_R6_RELEASE, window.location.href) === true;\n'
+'// M4 private integration gate: NEVER ship MuPDF binaries to the public Pages site.\n'
+'const M4_REFERENCE_DEV_ENABLED'
],
["  && new URLSearchParams(window.location.search).get('m4-local') === '1';",
 "  && new URLSearchParams(window.location.search).get('m4-local') === '1'\n  || R6_PRODUCTION_RELEASE_ENABLED;"],
["  && new URLSearchParams(window.location.search).get('m5-local') === '1';",
 "  && (new URLSearchParams(window.location.search).get('m5-local') === '1'\n      || R6_PRODUCTION_RELEASE_ENABLED);"],
["  && new URLSearchParams(window.location.search).get('m6-local') === '1';",
 "  && (new URLSearchParams(window.location.search).get('m6-local') === '1'\n      || R6_PRODUCTION_RELEASE_ENABLED);"],
[
"    m4ReferenceEnginePromise = import('./mupdf-migration/m4/m4-reference-adapter.mjs')",
"    // R6_RELEASE_RUNTIME_M4_BEGIN: separate public route; local M4 remains untouched.\n"
+"    if (R6_PRODUCTION_RELEASE_ENABLED) {\n"
+"      m4ReferenceEnginePromise = import('./mupdf-migration/r6/r6-production-renderer.mjs')\n"
+"        .then(async module => {\n"
+"          m4ReferenceModule = module;\n"
+"          return module.createR6ReferenceEngine(window.PE_R6_RELEASE);\n"
+"        }).catch(error => { m4ReferenceEnginePromise = null; throw error; });\n"
+"      return m4ReferenceEnginePromise;\n"
+"    }\n"
+"    // R6_RELEASE_RUNTIME_M4_END\n"
+"    m4ReferenceEnginePromise = import('./mupdf-migration/m4/m4-reference-adapter.mjs')"
],
[
"if (M4_REFERENCE_DEV_ENABLED) {\n  window.__M4_REFERENCE_QA__",
"if (M4_REFERENCE_DEV_ENABLED && !R6_PRODUCTION_RELEASE_ENABLED) {\n  window.__M4_REFERENCE_QA__"
],
[
"  privateR4Notice.src = './mupdf-migration/r4/r4-license-notice.js';\n  document.body.appendChild(privateR4Notice);",
"  privateR4Notice.src = './mupdf-migration/r4/r4-license-notice.js';\n"
+"  if (R6_PRODUCTION_RELEASE_ENABLED) {\n"
+"    privateR4Notice.addEventListener('load', () => {\n"
+"      window.PE_R4_NOTICE?.mount(document, {\n"
+"        approved:true,gate:'OPEN',sourceUrl:window.PE_R6_RELEASE.sourceUrl,production:true\n"
+"      });\n"
+"    }, {once:true});\n"
+"  }\n"
+"  document.body.appendChild(privateR4Notice);"
]
];
patch('study-note.html',htmlEdits);
patch('mupdf-migration/m5/m5-attachment-ui.js',[
[
"    m5AttachmentRuntimePromise = import('./m5-attachment-adapter.mjs')",
"    // R6_RELEASE_RUNTIME_M5_BEGIN: production adapter reuses M5 geometry/ink.\n"
+"    if (typeof R6_PRODUCTION_RELEASE_ENABLED!=='undefined' && R6_PRODUCTION_RELEASE_ENABLED) {\n"
+"      m5AttachmentRuntimePromise = import('../r6/r6-production-renderer.mjs')\n"
+"        .then(async mod => {\n"
+"          m5AttachmentModule = mod;\n"
+"          return mod.createR6AttachmentEngine(window.PE_R6_RELEASE);\n"
+"        }).catch(e => { m5AttachmentRuntimePromise = null; throw e; });\n"
+"      return m5AttachmentRuntimePromise;\n"
+"    }\n"
+"    // R6_RELEASE_RUNTIME_M5_END\n"
+"    m5AttachmentRuntimePromise = import('./m5-attachment-adapter.mjs')"
],
[
"if (M5_ATTACHMENT_DEV_ENABLED) {\n  window.__M5_ATTACHMENT_QA__",
"if (M5_ATTACHMENT_DEV_ENABLED && !R6_PRODUCTION_RELEASE_ENABLED) {\n  window.__M5_ATTACHMENT_QA__"
]
]);
patch('mupdf-migration/m6/m6-runtime.js',[
[
"  if(!policy.isM6LocalOptIn(window.location.href))throw Error('M6 private-only origin gate');",
"  if(!policy.isM6LocalOptIn(window.location.href)\n"
+"    && !window.PE_R6_POLICY?.isProductionRelease(window.PE_R6_RELEASE,window.location.href))\n"
+"    throw Error('M6 renderer origin/release gate');"
],
[
"  window.__M6_QA__=Object.freeze({",
"  if(policy.isM6LocalOptIn(window.location.href))window.__M6_QA__=Object.freeze({"
]
]);
patch('mupdf-migration/r4/r4-license-notice.js',[
[
"    summary.textContent='오픈소스 고지 (비운영 미리보기)';",
"    summary.textContent=settings.production===true?'오픈소스 고지':'오픈소스 고지 (비운영 미리보기)';"
],
[
"  const api={isPrivateLoopback,safeSourceOffer,model,mount};",
"  const api={isPrivateLoopback,safeSourceOffer,model,mount};\n"
+"  if(typeof window!=='undefined')window.PE_R4_NOTICE=api;"
]
]);
