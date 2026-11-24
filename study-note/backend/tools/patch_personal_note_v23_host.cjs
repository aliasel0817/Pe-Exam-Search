'use strict';
/**
 * Non-deploying, SHA-256 pinned patch generator for CONFIRMED v23 Code.js.
 * Usage: node patch_personal_note_v23_host.cjs <original-Code.js> <new-output.js>
 * Never calls clasp, Drive, Sheets or a remote service. INPUT is not changed;
 * OUTPUT is a new file only and MUST NOT be committed with private source.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const CONFIRMED_V23_SHA256='5cecf67ada6a5b330e3ce3dc4185e8ee337e6c18e02e06766998cde90701dfa2';
const getBefore=[
"    if (typeof PS9_isPlannerGet_ === 'function' && PS9_isPlannerGet_(action)) {",
"      return jsonOutput_(PS9_signedPlannerGet_(params));",
"    }"
].join('\n');
const getAfter=getBefore+'\n'+[
"    // v23 additive route: bridge uses existing ACTIVE signed GET validation.",
"    if (typeof PN1_isGet_ === 'function' && PN1_isGet_(action)) {",
"      return jsonOutput_(PN1_signedGet_(params));",
"    }"
].join('\n');
const postBefore=[
"      else if (typeof PS9_isPlannerPost_ === 'function' && PS9_isPlannerPost_(action)) {",
"        result = PS9_verifiedPlannerPost_(action, verified);",
"      }"
].join('\n');
const postAfter=postBefore+'\n'+[
"      // The verified context comes from validateSignedMutation_(envelope,['ACTIVE']).",
"      else if (typeof PN1_isPost_ === 'function' && PN1_isPost_(action)) {",
"        result = PN1_verifiedPost_(action, verified);",
"      }"
].join('\n');
const auditBefore="!['savelearningstates','saveannotations'].includes(action)";
const auditAfter="!['savelearningstates','saveannotations','personalnotepart'].includes(action)";
function exactReplace(source,before,after,wanted,label){
  const count=source.split(before).length-1;
  if(count!==wanted)throw Error('REFUSE: '+label+' unexpected anchor count '+count+' (wanted '+wanted+')');
  return source.replaceAll(before,after);
}
function createCandidate(source){
  if(typeof source!=='string'||source.includes('PN1_isGet_')||source.includes('PN1_isPost_'))
    throw Error('REFUSE: host already modified or source is not text');
  for(const required of ['function doGet(e) {','function doPost(e) {',
    "const verified = validateSignedMutation_(envelope, ['ACTIVE']);",
    "function validateSignedGet_(params, allowedStatuses) {",
    "function validateSignedMutation_(envelope, allowedStatuses) {"]){
    if(!source.includes(required))throw Error('REFUSE: v23 safety anchor absent: '+required);
  }
  let out=exactReplace(source,getBefore,getAfter,1,'GET');
  out=exactReplace(out,postBefore,postAfter,1,'POST');
  // Avoid audit explosion: not one row per 16KB photo chunk.
  // Existing action exemptions are unchanged, begin/commit still audited.
  out=exactReplace(out,auditBefore,auditAfter,2,'audit');
  if(out===source)throw Error('REFUSE: no patch');
  return out;
}
function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function writeCandidate(input,output){
  const inputPath=path.resolve(input),outputPath=path.resolve(output);
  if(inputPath===outputPath)throw Error('REFUSE: input/output paths must differ');
  const sourceBytes=fs.readFileSync(inputPath),sha=sha256(sourceBytes);
  if(sha!==CONFIRMED_V23_SHA256)
    throw Error('REFUSE: source SHA-256 differs from confirmed deployed v23; no file written');
  if(fs.existsSync(outputPath))throw Error('REFUSE: output already exists');
  const candidate=createCandidate(sourceBytes.toString('utf8'));
  // Exclusive create; do not overwrite current source, old candidates or tests.
  fs.writeFileSync(outputPath,candidate,{encoding:'utf8',flag:'wx'});
  return {sourceSHA256:sha,candidateSHA256:sha256(Buffer.from(candidate,'utf8')),
    routes:['personalnotestatus','personalnotedoc','personalnotebegin','personalnotepart','personalnotecommit'],
    output:outputPath,operatingWrites:0};
}
if(require.main===module){
  try{
    if(process.argv.length!==4)throw Error('Usage: node patch_personal_note_v23_host.cjs <input> <new-output>');
    console.log(JSON.stringify(writeCandidate(process.argv[2],process.argv[3])));
  }catch(error){console.error(String(error.message||error));process.exitCode=1;}
}
module.exports={createCandidate,writeCandidate,sha256,CONFIRMED_V23_SHA256};
