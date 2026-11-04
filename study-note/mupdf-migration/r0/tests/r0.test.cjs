'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {audit,unchangedSinceM7}=require('../r0-readiness-audit.cjs');
const base=path.resolve(__dirname,'../../..');
const data=audit();

test('R0 preserves M7 production API addon and service worker source',()=>{
 assert.equal(unchangedSinceM7('study-note/service-worker.js'),true);
 assert.equal(unchangedSinceM7('study-note/backend/referencePdfContent.addon.gs'),true);
 assert.equal(data.controls.backendAddonUnchanged,true);
});
test('AGPL release gate remains closed and no MuPDF WASM is publicly tracked',()=>{
 assert.equal(data.controls.releaseGateClosed,true);
 assert.equal(data.controls.licenseReviewStillRequired,true);
 assert.equal(data.controls.noPublicWasmTracked,true);
 assert.equal(data.releaseDecision,'NO_GO');
});
test('service worker only caches known shell assets and annotation schema stays v3',()=>{
 assert.equal(data.controls.serviceWorkerOnlyCachesShell,true);
 assert.equal(data.controls.annotationSchemaIntact,true);
});
test('npm gitHead matches upstream tag but no WASM rebuild or legal decision is claimed',()=>{
 const e=JSON.parse(fs.readFileSync(path.join(base,'mupdf-migration','r0','R0-UPSTREAM-PROVENANCE.json'),'utf8'));
 assert.match(e.npmGitHead,/^[a-f0-9]{40}$/);
 assert.equal(e.npmGitHead,e.upstreamTagCommit);
 assert.equal(e.exactWasmRebuildVerified,false);
 assert.equal(e.artifexLegalOpinionObtained,false);
 assert.equal(data.controls.sourceTagMatchedNpmGitHead,true);
});
test('R0 audit returns explicit unfinished blockers without user PDF or secret data',()=>{
 assert.equal(data.totalControls,data.passedControls);
 assert(data.unfinished.includes('ACTIVE_DEVICE_GET'));
 assert(data.unfinished.includes('PHYSICAL_IPHONE_SAFARI'));
 assert(data.unfinished.includes('REAL_INK_PERSISTENCE'));
 const safe=JSON.stringify(data);
 assert(!/base64|scriptProperties|signedUrl|password|Bearer\s+/i.test(safe));
});
