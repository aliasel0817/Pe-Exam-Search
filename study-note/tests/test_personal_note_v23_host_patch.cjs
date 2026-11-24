'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createCandidate,writeCandidate,sha256,CONFIRMED_V23_SHA256}=
 require('../backend/tools/patch_personal_note_v23_host.cjs');
const orig=[
 'function doGet(e) {',
 "    if (typeof PS9_isPlannerGet_ === 'function' && PS9_isPlannerGet_(action)) {",
 "      return jsonOutput_(PS9_signedPlannerGet_(params));",
 "    }",
 "    if (action === 'mutationstatus') return jsonOutput_(getMutationStatus_(params.requestId, params.pollKey));",
 '}',
 'function doPost(e) {',
 "      const verified = validateSignedMutation_(envelope, ['ACTIVE']);",
 "      else if (typeof PS9_isPlannerPost_ === 'function' && PS9_isPlannerPost_(action)) {",
 "        result = PS9_verifiedPlannerPost_(action, verified);",
 "      }",
 "      else throw new Error('UNKNOWN');",
 "      if (!['savelearningstates','saveannotations'].includes(action)) audit('success');",
 "      if (!['savelearningstates','saveannotations'].includes(action)) audit('failure');",
 '}',
 'function validateSignedGet_(params, allowedStatuses) {}',
 'function validateSignedMutation_(envelope, allowedStatuses) {}'
].join('\n');
const patched=createCandidate(orig);
assert.equal((patched.match(/PN1_isGet_/g)||[]).length,1);
assert.equal((patched.match(/PN1_isPost_/g)||[]).length,1);
assert.equal((patched.match(/validateSignedMutation_/g)||[]).length,3); // existing function, call, comment
assert.equal((patched.match(/'personalnotepart'\]\.includes/g)||[]).length,2);
assert.ok(patched.indexOf("PN1_verifiedPost_(action, verified)")>patched.indexOf('PS9_verifiedPlannerPost_'));
assert.equal(patched.match(/function doPost\(e\)/g).length,1);
assert.equal(patched.match(/function doGet\(e\)/g).length,1);
assert.throws(()=>createCandidate(patched),/already modified/);
assert.throws(()=>createCandidate(orig.replace("function doGet(e) {","function badGet(e) {")) ,/anchor absent/);
assert.throws(()=>createCandidate(orig+'\n'+orig),/unexpected anchor count/);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pn1-v23-'));
try {
 const inPath=path.join(root,'input.js'),outPath=path.join(root,'output.js');
 fs.writeFileSync(inPath,orig);
 assert.notEqual(sha256(Buffer.from(orig)),CONFIRMED_V23_SHA256);
 assert.throws(()=>writeCandidate(inPath,outPath),/SHA-256 differs/);
 assert.equal(fs.existsSync(outPath),false);
 assert.throws(()=>writeCandidate(inPath,inPath),/must differ/);
 assert.equal(fs.readFileSync(inPath,'utf8'),orig);
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('PERSONAL_NOTE_V23_HOST_PATCH_SYNTHETIC_PASS',JSON.stringify({
 oldHostActionsPreserved:true,signedHostAnchorsRequired:true,
 uniqueAddition:true,sourceShaPinned:true,outputExclusive:true,
 productionScriptDownloadedToCI:false,operatingWrites:0
}));
