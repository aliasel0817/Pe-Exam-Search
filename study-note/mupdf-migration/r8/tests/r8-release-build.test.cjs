'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const here=path.resolve(__dirname,'..'),migration=path.resolve(here,'..'),repo=path.resolve(migration,'../..');
const build=require('../r8-build-release-assets.cjs');
const policy=require('../../r6/r6-release-policy.js');
test('tagged source URL and package assets are exact and no live distribution occurs',()=>{
 assert.equal(build.tag,policy.RELEASE_TAG);
 assert.equal(build.sourceUrl,'https://github.com/aliasel0817/Pe-Exam-Search/tree/'+policy.RELEASE_TAG+'/study-note');
 assert.equal(build.files.length,7);
 assert(build.files.some(f=>f.name==='mupdf-wasm.wasm'&&f.sha256===policy.WASM));
});
test('default release config is BLOCKED and no spoofed approval accepted',()=>{
 const defaultText=build.config();
 assert(defaultText.includes('"status": "BLOCKED"'));
 assert(defaultText.includes('"enabled": false'));
 assert(!defaultText.includes('"enabled": true'));
 const partial={schema:'r8-operator-release-approval-v1',tag:build.tag,legalRightsReviewed:true,
   correspondingSourcePublic:true,cloudInkAccepted:false,deviceRiskExplicitlyAccepted:true,
   operatorAuthorizedMainAndPages:true,backupAndRollbackReady:true};
 assert.throws(()=>build.config(partial),/R8_RELEASE_APPROVAL_INCOMPLETE/);
});
test('simulation can construct well-formed release config but must not write it into Git',()=>{
 const approved={schema:'r8-operator-release-approval-v1',tag:build.tag,legalRightsReviewed:true,
   correspondingSourcePublic:true,cloudInkAccepted:true,deviceRiskExplicitlyAccepted:true,
   operatorAuthorizedMainAndPages:true,backupAndRollbackReady:true};
 const data=build.config(approved);
 assert(data.includes('"status": "RELEASED"'));
 assert(data.includes(build.sourceUrl));
 const current=fs.readFileSync(path.join(migration,'r6/r6-release-config.js'),'utf8');
 assert.match(current,/enabled:false/);
 assert.match(current,/status:'BLOCKED'/);
 const tracked=cp.execFileSync('git',['-C',repo,'ls-files'],{encoding:'utf8'});
 assert(!tracked.includes('.r8-private'));
});
test('private script and secrets never belong to corresponding source or release artifact',()=>{
 assert(!fs.existsSync(path.join(repo,'study-note/mupdf-migration/r8/source/.clasp.json')));
 // The isolated QA Script ID exists on the authorized PC only; CI must not
 // require, reveal or fetch the private .clasp.json file.
 const tracked=cp.execFileSync('git',['-C',repo,'ls-files'],{encoding:'utf8'});
 assert(!tracked.includes('.clasp.json'));
 assert(fs.readFileSync(path.join(repo,'.gitignore'),'utf8').includes('**/.r8-private/'));
 const sourceDoc=fs.readFileSync(path.join(here,'R8-SOURCE-AND-BUILD.md'),'utf8');
 assert(sourceDoc.includes('pe-study-note-mupdf-1.28.1-r8-20261104'));
 assert(sourceDoc.includes('Script Properties'));
});
