'use strict';
/*
 * Safely create a REVIEW-ONLY Apps Script package for operating planner sync.
 *
 * Does not connect, deploy or write to operating Script/Sheets. The source and
 * approved v21 immutable evidence remain unchanged. Output directory must be
 * a NEW absolute directory OUTSIDE this git repository.
 *
 * Example: node build-planner-sync-stage9-release-package.cjs --output "C:\Temp\pe-sync-stage9-review"
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildSignedPlannerHost}=require('./build-planner-sync-stage9-host-candidate.cjs');
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--output')throw Error('Usage: node build-planner-sync-stage9-release-package.cjs --output ABSOLUTE_NEW_DIRECTORY');
const target=path.resolve(args[1]),projectRoot=path.resolve(__dirname,'../..');
if(!path.isAbsolute(args[1])||target===projectRoot||target.startsWith(projectRoot+path.sep))
 throw Error('Output must be a NEW absolute directory outside the repository');
if(fs.existsSync(target))throw Error('Output already exists; refusing to overwrite or reuse');
const src=relative=>fs.readFileSync(path.join(__dirname,relative),'utf8');
const baseline=src('../mupdf-migration/r5/source/Code.js');
const built=buildSignedPlannerHost(baseline);
const contents={
  'Code.gs':built.source,
  'PlannerSyncBackend.gs':src('planner-sync-stage3-isolated.addon.gs'),
  'PlannerSyncSignedBridge.gs':src('planner-sync-stage9-production-bridge.addon.gs'),
  'appsscript.json':src('../mupdf-migration/r5/source/appsscript.json')
};
const dig=x=>crypto.createHash('sha256').update(x,'utf8').digest('hex');
const manifest={
  kind:'STAGE9_CODE_REVIEW_ONLY',
  releaseReady:false,
  baselineV21Sha256:built.baselineSha256,
  candidateCodeSha256:built.candidateSha256,
  files:Object.fromEntries(Object.entries(contents).map(([n,body])=>[n,dig(body)])),
  requiredBeforeDeploy:[
    'Actual isolated Apps Script HMAC/nonce/ACTIVE API PASS',
    'Actual 19,060-slot Google Sheets load/recovery/quotas PASS',
    'Current operating Script Code.gs and deployment version reconciled',
    'LIVE MASTER complete backup, original deployment rollback ready',
    'New planner-only tabs verified and separately approved',
    'Explicit main merge and operating Apps Script deployment gate'
  ],
  productionConfiguration:{
    mode:'PLANNER_SYNC_MODE=PRODUCTION',
    readyProperty:'PLANNER_SYNC_PRODUCTION_READY=READY:<STUDY_NOTE_SPREADSHEET_ID>',
    firstUserMigration:'OFF until individual backups and user approval'
  }
};
fs.mkdirSync(target,{recursive:false});
for(const [name,body] of Object.entries(contents))fs.writeFileSync(path.join(target,name),body,'utf8');
fs.writeFileSync(path.join(target,'RELEASE-GATE-READ-ME.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
console.log('STAGE9_REVIEW_PACKAGE_CREATED',JSON.stringify({
 target,
 fileCount:Object.keys(contents).length,
 baselineV21Sha256:built.baselineSha256,
 releaseReady:false,
 noProductionActions:true
}));
