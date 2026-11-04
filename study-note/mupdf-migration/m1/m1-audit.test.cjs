'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {scanText,isRiskFile,audit}=require('./m1-secret-scan.cjs');
const {auditBackendText}=require('./m1-api-audit.cjs');
const {inventoryText}=require('./m1-license-inventory.cjs');
const SAMPLE=[
  "function doGet(e) {",
  " const params=e.parameter; const action=params.action;",
  " if(action === 'health') return {};",
  " if(action === 'topics') return {};",
  " if(action === 'referencepdfcontent') {",
  " const verified=validateSignedGet_(params,['ACTIVE']);",
  " return jsonOutput_(readReferencePdfPageForSignedGet_(verified.data));",
  " }",
  "}",
  "function doPost(e) {",
  " let action = e.action; const envelope=e;",
  " if(action === 'registerdevice') registerDeviceFromGoogle_(e);",
  " else { const verified=validateSignedMutation_(envelope,['ACTIVE']);",
  " if(action === 'updatetopic') updateTopic_(verified.data); }",
  "}",
  "function registerDeviceFromGoogle_(data) {",
  " if(identity.email !== allowedEmail) throw Error('deny');",
  " if(identity.sub !== ownerSub) throw Error('deny');",
  "}",
  "function validateSignedMutation_(envelope,allowedStatuses) {",
  " const auth=validateDeviceSignature_(1,2,3,4,5,allowedStatuses); return {auth};",
  "}",
  "function validateDeviceSignature_(deviceId,timestamp,nonce,signature,canonical,allowedStatuses) {",
  " if(!allowedStatuses.includes(device.status)) throw Error('status');",
  " const expires=device.sessionExpiresAt;",
  " const expected='x'; if(!constantTimeEquals_(expected,signature))throw Error('hmac');",
  " if(cache.get(replayKey))throw Error('replay');",
  "}"
].join('\n');
test('recognized signed/public read paths and signed write paths',()=>{
 const out=auditBackendText(SAMPLE);
 assert.equal(out.controls.signedGetOnOriginalPdf,true);
 assert.equal(out.controls.verifiedPageIdentifiersUsed,true);
 assert.equal(out.controls.signedMutationDispatcher,true);
 assert.equal(out.controls.ownerSubAtRegistration,true);
 assert.deepEqual(out.signedWriteActions,['updatetopic']);
 assert(out.publicReadActions.includes('topics'));
});
test('unsigned original PDF handler is reported unsafe',()=>{
 const out=auditBackendText(SAMPLE.replace("const verified=validateSignedGet_(params,['ACTIVE']);","const verified={ data: params };"));
 assert.equal(out.controls.signedGetOnOriginalPdf,false);
 assert(out.reviewFindings.includes('MISSING_OR_REVIEW_signedGetOnOriginalPdf'));
});
test('write authorization must not silently fall back to untrusted payload',()=>{
 const modified=SAMPLE.replace("validateSignedMutation_(envelope,['ACTIVE'])","{auth:{},data:envelope}");
 const out=auditBackendText(modified);
 assert.equal(out.controls.signedMutationDispatcher,false);
});
test('credential scanner reports kind/line and never actual value',()=>{
 const fake='AIza'+'a'.repeat(35);
 const found=scanText('const example = "'+fake+'";','fake.js');
 assert.equal(found.length,1);
 assert.equal(found[0].type,'google-api-key');
 assert(!JSON.stringify(found).includes(fake));
});
test('credential filename is sensitive even without a matching pattern',()=>{
 assert.equal(isRiskFile('C:\\tmp\\.env.production'),true);
 assert.equal(isRiskFile('C:\\tmp\\.env.example'),false);
 assert.equal(isRiskFile('C:\\tmp\\.clasp.json'),true);
});
test('scanner works on isolated synthetic fixtures',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m1-audit-'));
 try{
  fs.writeFileSync(path.join(dir,'.env.production'),'EXAMPLE_PASSWORD=not-a-real-credential');
  fs.writeFileSync(path.join(dir,'public.js'),'const ok=1;');
  const result=audit(dir);
  assert(result.findings.some(f=>f.type==='sensitive-filename'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('dependency list distinguishes planned MuPDF from existing CDN imports',()=>{
 const result=inventoryText("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js\n"+
 "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js\n"+
 "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
 assert.deepEqual(result.dependencies.map(x=>x.id),['pdfjs','pdf-lib','xlsx','mupdf']);
 assert.equal(result.dependencies.at(-1).status,'planned-not-shipped');
});
test('owner-only candidate rejects non-owner, pending and absent owner',()=>{
 const code=fs.readFileSync(path.join(__dirname,'m1-owner-guard-candidate.gs'),'utf8');
 const props={getProperty:()=> 'trusted-owner-sub'};
 const ctx={PropertiesService:{getScriptProperties:()=>props},
  STUDY_NOTE_CONFIG:{SECURITY_OWNER_SUB_PROPERTY:'STUDY_NOTE_SECURITY_OWNER_SUB'}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 assert.equal(ctx.requireCurrentOwnerForWrite_({googleSub:'trusted-owner-sub',status:'ACTIVE'}),true);
 assert.throws(()=>ctx.requireCurrentOwnerForWrite_({googleSub:'other-sub',status:'ACTIVE'}));
 assert.throws(()=>ctx.requireCurrentOwnerForWrite_({googleSub:'trusted-owner-sub',status:'PENDING'}));
 props.getProperty=()=>'';assert.throws(()=>ctx.requireCurrentOwnerForWrite_({googleSub:'trusted-owner-sub',status:'ACTIVE'}));
});

test('PDF.js fallback candidate mitigates eval in both production document loaders',()=>{
 const patch=fs.readFileSync(path.join(__dirname,'m1-pdfjs-disable-eval.patch'),'utf8');
 const changed=patch.split(/\r?\n/).filter(x=>x.startsWith('+')&&!x.startsWith('+++'));
 assert.equal(changed.length,2);
 assert(changed.every(x=>x.includes('isEvalSupported: false')));
 assert(changed.every(x=>x.includes('pdfjsLib.getDocument')));
});
test('Apps Script snapshot checker detects identical or divergent local snapshots without source exposure',()=>{
 const {compare}=require('./m1-source-compare.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'m1-clasp-'));
 const a=path.join(root,'a'),b=path.join(root,'b');
 fs.mkdirSync(a);fs.mkdirSync(b);
 try {
  for(const name of ['Code.js','referencePdfContent.js','appsscript.json']) {
   fs.writeFileSync(path.join(a,name),'TEST_ONLY');
   fs.writeFileSync(path.join(b,name),'TEST_ONLY');
  }
  assert.equal(compare(a,b).allPresentAndEqual,true);
  fs.writeFileSync(path.join(b,'Code.js'),'DIFFERENT_TEST_ONLY');
  const result=compare(a,b);
  assert.equal(result.allPresentAndEqual,false);
  assert.equal('content' in result.snapshots[0],false);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
