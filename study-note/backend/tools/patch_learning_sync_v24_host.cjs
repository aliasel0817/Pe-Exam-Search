'use strict';
// Create a candidate from the exact confirmed deployed v24 host. No clasp or live writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const APPROVED_V24_SHA256='819d975c2957948b87d51a265437c4c0b3afc4fb59273d673d2c346120809626';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function buildCandidate(source){
 if(sha(Buffer.from(source,'utf8'))!==APPROVED_V24_SHA256)throw Error('Unexpected v24 host SHA; refuse to overwrite.');
 const anchors=[
  ['return jsonOutput_(buildLearningStatesPayload_());','return jsonOutput_({ ...buildLearningStatesPayload_(), learningSyncVersion: 2 });'],
  ["else if (action === 'savelearningstates') result = saveLearningStates_(payload);",
   "else if (action === 'savelearningstates') result = LS2_saveLearningChanges_(payload);"]
 ];
 let out=source;
 for(const [before,after] of anchors){if(out.split(before).length!==2)throw Error('Host routing anchor mismatch');out=out.replace(before,after);}
 if(out.indexOf("validateSignedMutation_(envelope, ['ACTIVE'])")>out.indexOf('result = LS2_saveLearningChanges_(payload)'))
  throw Error('ACTIVE authentication ordering mismatch');
 return out;
}
function assemble(from,to,addon){
 if(fs.existsSync(to))throw Error('Candidate destination already exists; no overwrite');
 const source=fs.readFileSync(path.join(from,'Code.js'),'utf8'),candidate=buildCandidate(source);
 const allowed=['.clasp.json','appsscript.json','Code.js','PersonalNoteReleaseConfig.js','PersonalNoteServer.js',
  'PersonalNoteSignedBridge.js','PlannerSyncBackend.js','PlannerSyncReleaseControl.js','PlannerSyncSignedBridge.js','referencePdfContent.js'];
 const files=fs.readdirSync(from).filter(n=>fs.statSync(path.join(from,n)).isFile()).sort();
 if(JSON.stringify(files)!==JSON.stringify(allowed.slice().sort()))throw Error('Unexpected v24 files; refuse to assemble.');
 fs.mkdirSync(to,{recursive:false});
 for(const file of allowed)fs.copyFileSync(path.join(from,file),path.join(to,file));
 fs.writeFileSync(path.join(to,'Code.js'),candidate,'utf8');
 fs.copyFileSync(addon,path.join(to,'LearningSyncV2.js'));
 return {baseline:APPROVED_V24_SHA256,candidate:sha(candidate),addon:sha(fs.readFileSync(addon)),preserved:allowed.filter(x=>x!=='Code.js').length};
}
if(require.main===module){
 if(process.argv.length!==5)throw Error('usage: node patch_learning_sync_v24_host.cjs <v24 readback> <new candidate dir> <addon.gs>');
 console.log(JSON.stringify(assemble(...process.argv.slice(2))));
}
module.exports={APPROVED_V24_SHA256,buildCandidate,assemble};
