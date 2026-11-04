'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),cp=require('node:child_process');
const here=path.resolve(__dirname,'..'),migration=path.resolve(here,'..'),study=path.resolve(migration,'..'),repo=path.resolve(study,'..');
const policy=require('../../r6/r6-release-policy.js'),assets=require('../r9-audit-public-binaries.cjs');
const source=require('../r9-source-bundle.cjs');
const evidence=JSON.parse(fs.readFileSync(path.join(here,'R9-RELEASE-EVIDENCE.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(here,'R9-PUBLIC-ASSET-MANIFEST.json'),'utf8'));
const host='https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html';
test('exactly one official public wasm and seven immutable vendor assets',()=>{
 const a=assets.audit();
 assert.equal(a.assetFiles,7);
 assert.equal(a.wasmPath,'study-note/vendor/mupdf/1.28.1/mupdf-wasm.wasm');
 assert.equal(manifest.releaseTag,policy.RELEASE_TAG);
 assert.equal(a.sourceSha256,source.expectedSha);
});
test('complete 93,863,687 byte MuPDF official source included via three pinned chunks',()=>{
 const data=source.verify();
 assert.equal(data.pieces,3);
 assert.equal(data.bytes,93863687);
 assert.equal(data.sha256,'328c12b65cbdfffc2ad803bd14d9fb526496937575c14fac4634d9968461de15');
});
test('R6 fail-closed fallback and R9 source-tag production selector are auditable',()=>{
 const src=fs.readFileSync(path.join(here,'r9-release-config.js'),'utf8');
 const blocked={window:{location:{href:host},PE_R6_POLICY:policy,PE_R6_RELEASE:{enabled:false,status:'BLOCKED'}}};
 vm.runInNewContext(src,blocked);
 assert.equal(blocked.window.PE_R6_RELEASE.enabled,true);
 assert.equal(blocked.window.PE_R6_RELEASE.releaseCommit,policy.RELEASE_TAG);
 assert.equal(blocked.window.PE_R6_RELEASE.sourceUrl,
  'https://github.com/aliasel0817/Pe-Exam-Search/tree/'+policy.RELEASE_TAG+'/study-note');
 const evil={window:{location:{href:'https://aliasel0817.github.io.evil.com/Pe-Exam-Search/study-note/study-note.html'},
  PE_R6_POLICY:policy,PE_R6_RELEASE:{enabled:false,status:'BLOCKED'}}};
 vm.runInNewContext(src,evil);
 assert.equal(evil.window.PE_R6_RELEASE.enabled,false);
 const html=fs.readFileSync(path.join(study,'study-note.html'),'utf8');
 const i=html.indexOf('r6-release-config.js'),j=html.indexOf('r6-release-policy.js'),k=html.indexOf('r9-release-config.js');
 assert(i>0&&j>i&&k>j);
 const sw=fs.readFileSync(path.join(study,'service-worker.js'),'utf8');
 assert.doesNotMatch(sw,/referencePdfContent|mupdf-wasm\.wasm|signedUrl/i);
});
test('User witnessed real isolated cloud ink PASS without production data writes',()=>{
 assert.equal(evidence.security.isolatedGoogleCloudInkTestUserWitnessed,true);
 for(const key of ['isolatedScript','saveReadback','versionConflictProtected','backupChecksumVerified',
  'existingSignedGETAndUserOriginalPDFTested'])assert.equal(evidence.security[key],true,key);
 for(const key of ['productionSheetWritten','productionScriptWritten','actualDestructiveBackupRestoreTested'])
  assert.equal(evidence.security[key],false,key);
 assert.equal(evidence.security.backendDeploymentVersion,21);
 assert.equal(evidence.security.backendSourceSHA256,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(migration,'r5/source/Code.js'))).digest('hex'));
});
test('Physical devices explicitly user-delegated: risk accepted but no fabricated PASS',()=>{
 assert.equal(evidence.devices.physicalTabS11Executed,false);
 assert.equal(evidence.devices.physicalIPhone16ProExecuted,false);
 assert.equal(evidence.devices.physicalDeviceRiskDelegatedAndAcceptedByUser,true);
 assert.equal(evidence.devices.physicalDevicePASSClaimed,false);
});
test('Original signed media/annotation schema remains preserved',()=>{
 const html=fs.readFileSync(path.join(study,'study-note.html'),'utf8');
 assert.match(html,/buildSignedGetUrl\(getApiUrl\(\), 'referencePdfContent'/);
 assert.match(html,/fetchMediaContent\(getApiUrl\(\), item\.attachmentId/);
 assert.match(html,/const ANNOTATION_SCHEMA_VERSION = 3;/);
 assert.match(html,/coordinateSpace: 'normalized-0-1'/);
});
