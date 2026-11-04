'use strict';
// Deliberate release blocker. Requires separately approved AGPL/Apps Script plan;
// No automated flag can bypass this restriction.
const fs=require('node:fs'),path=require('node:path');
const state=path.join(__dirname,'m2-publication-gate.json');
function stateCheck(){
 const v=JSON.parse(fs.readFileSync(state,'utf8'));
 if(v.gate!=='BLOCKED_PENDING_ARTIFEX_LEGAL_REVIEW')throw Error('M2 release state changed; independent legal review required');
 return {status:'BLOCKED',reason:v.gate,assetBinaryReleasePermitted:false,productionDeployPermitted:false};
}
if(require.main===module){
 console.log(JSON.stringify(stateCheck(),null,2));
 process.exitCode=3;
}
module.exports={stateCheck};
