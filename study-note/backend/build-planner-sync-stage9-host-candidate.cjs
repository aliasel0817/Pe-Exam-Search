'use strict';
/*
 * Review-only builder for the Stage9 signed operating Apps Script candidate.
 * Does NOT write to protected R5 version21 Code.js, operate clasp or deploy.
 * Use the output only after integrated real GAS/SHEETS/HMAC and rollback gate.
 */
const crypto=require('node:crypto');
const APPROVED_V21_SHA256='e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f';
function one(input,oldText,newText,label){
 const i=input.indexOf(oldText);
 if(i<0||input.indexOf(oldText,i+oldText.length)!==-1)throw Error('Unexpected host source: '+label);
 return input.slice(0,i)+newText+input.slice(i+oldText.length);
}
function buildSignedPlannerHost(protectedCode){
 const digest=crypto.createHash('sha256').update(protectedCode,'utf8').digest('hex');
 if(digest!==APPROVED_V21_SHA256)throw Error('Immutable v21 host SHA mismatch. Reverify live backend; no auto overwrite.');
 let out=one(protectedCode,
  "    if (action === 'mutationstatus') return jsonOutput_(getMutationStatus_(params.requestId, params.pollKey));",
  "    if (typeof PS9_isPlannerGet_ === 'function' && PS9_isPlannerGet_(action)) {\n"+
  "      return jsonOutput_(PS9_signedPlannerGet_(params));\n"+
  "    }\n"+
  "    if (action === 'mutationstatus') return jsonOutput_(getMutationStatus_(params.requestId, params.pollKey));",
  'GET bridge');
 out=one(out,
  "      else if (action === 'renamedevice') result = renameSecurityDevice_(payload, authContext);",
  "      else if (action === 'renamedevice') result = renameSecurityDevice_(payload, authContext);\n"+
  "      else if (typeof PS9_isPlannerPost_ === 'function' && PS9_isPlannerPost_(action)) {\n"+
  "        result = PS9_verifiedPlannerPost_(action, verified);\n"+
  "      }",
  'signed POST bridge');
 return {source:out,baselineSha256:digest,candidateSha256:crypto.createHash('sha256').update(out,'utf8').digest('hex')};
}
module.exports={APPROVED_V21_SHA256,buildSignedPlannerHost};
