'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const r7=path.resolve(__dirname,'..'),migration=path.resolve(r7,'..'),study=path.resolve(migration,'..'),repo=path.resolve(study,'..');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>fs.readFileSync(path.join(r7,p),'utf8');
const prov=JSON.parse(read('R7-CODE-PROVENANCE.json'));
const modules=JSON.parse(read('R7-THIRD-PARTY-EVIDENCE.json'));
const scan=require('../../r5/r5-private-source-scan.cjs');
const a=require('../r7-private-release-assemble.cjs');
test('R7 secure Apps Script candidate is derived from immutable version21 and no secrets found',()=>{
 assert.equal(sha(path.join(migration,'r5','source','Code.js')),prov.originalSha256);
 assert.equal(sha(path.join(r7,'source','Code.js')),prov.sha256);
 assert.equal(prov.appScriptDeployed,false);
 assert.equal(scan.audit(path.join(r7,'source','Code.js')).pass,true);
 const text=read('source/Code.js');
 assert.match(text,/r7ClaimVerifiedSignedMutation_\(envelope, requestId, pollKey\)/);
 assert.match(text,/r7Claimed && requestId && pollKey/);
 assert.match(text,/registerDeviceFromGoogle_\(data, identity\)/);
});
test('official MuPDF 1.28.1 core and all 18 thirdparty SHA verified via read-only evidence',()=>{
 const source=JSON.parse(fs.readFileSync(path.join(migration,'r3','r3-draft-source-manifest.json'),'utf8'));
 assert.equal(source.mupdf.commit,modules.coreCommit);
 assert.equal(modules.submodulesVerified,18);
 for(const mod of source.mupdf.submodules){
  const match=modules.thirdParty.find(x=>x.path===mod.path);
  assert.equal(match.sha,mod.commit);
  assert(match.rootLicensingEvidence.length>0);
 }
 assert.equal(modules.legalSignoff,false);
});
test('locked private build assets verify and new release can never publish by accident',()=>{
 const {binaries,serverSource,agplSha256}=a.inputs();
 assert.equal(binaries.length,7);
 assert.equal(serverSource.sha256,prov.sha256);
 assert.equal(agplSha256,'57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6');
 assert.throws(()=>{delete process.env.R7_ACK_PRIVATE_ASSEMBLY;a.assemblePrivate()},/PRIVATE_ASSEMBLY_ACK_REQUIRED/);
 assert.equal(JSON.parse(fs.readFileSync(path.join(migration,'m2','m2-publication-gate.json')).toString()).publicMuPdfBinaryDistributionAllowed,false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(migration,'r4','r4-approval-state.json')).toString()).productionReleasePermitted,false);
 const tracked=cp.execFileSync('git',['-C',repo,'ls-files'],{encoding:'utf8'});
 assert(!tracked.split(/\r?\n/).some(x=>/\.wasm$/.test(x)||x.includes('.r7-private')));
 const ignore=fs.readFileSync(path.join(repo,'.gitignore'),'utf8');
 assert.match(ignore,/\*\*\/\.r7-private\//);
});
test('legal scope docs remain clearly marked review-only, no false public offer',()=>{
 for(const file of ['R7-LICENSE-AND-THIRD-PARTY-NOTICES.md',
   'R7-USER-ACCEPTANCE-PDF-AND-DEVICES.md']){
  assert(fs.existsSync(path.join(r7,file)));
 }
 const legal=read('R7-LICENSE-AND-THIRD-PARTY-NOTICES.md');
 assert.match(legal,/NOT FINAL DISTRIBUTION NOTICE/);
 assert.match(legal,/leptonica/);
 assert.match(legal,/libjpeg/);
 const acceptance=read('R7-USER-ACCEPTANCE-PDF-AND-DEVICES.md');
 assert.match(acceptance,/DEFERRED_TO_USER/);
 assert.match(acceptance,/BLOCKED_UNTIL_PILOT/);
});
