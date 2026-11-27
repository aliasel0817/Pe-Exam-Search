'use strict';
// Produces new local directories only. No clasp config, secret, live write or deploy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const root=__dirname;
const dedicated=['study-notification-core.js','study-notification-service.js','study-notification-plan-reader.js','study-notification-gas-store.gs','study-notification-kakao.js','study-notification-kakao-gas.gs','study-notification-host.js','study-notification-relay.js','study-notification-relay-gas.gs','study-notification-dedicated.entry.gs'];
const bridge=['study-notification-relay.js','study-notification-relay-gas.gs','study-notification-main-bridge.addon.gs'];
function combine(files){return files.map(f=>'// FILE: '+f+'\n'+fs.readFileSync(path.join(root,f),'utf8')).join('\n;\n');}
function patchMain(source,approvedSha){
 if(!/^[a-f0-9]{64}$/.test(approvedSha||'')||sha(source)!==approvedSha)throw Error('Exact approved live source hash required');
 const validation="const verified = validateSignedMutation_(envelope, ['ACTIVE']);";
 const anchor="else if (action === 'renamedevice') result = renameSecurityDevice_(payload, authContext);";
 if(source.split(validation).length!==2||source.split(anchor).length!==2||source.indexOf(validation)>=source.indexOf(anchor)||source.includes('PN4_verifiedNotificationPost_'))throw Error('Current host structure requires manual review');
 // Existing auth and signed poll flow remain in place. The exact live host,
 // verified owner/session accessor and audit/poll behavior require review.
 return source.replace(anchor,anchor+"\n      else if (PN4_isNotificationPost_(action)) result = PN4_verifiedNotificationPost_(action, verified);");
}
function build(outDir,mainPath,approvedSha){
 if(fs.existsSync(outDir))throw Error('New output directory required');
 let patched=null;
 if(mainPath)patched=patchMain(fs.readFileSync(mainPath,'utf8'),approvedSha);
 const code=combine(dedicated),addon=combine(bridge);
 const manifest={timeZone:'Asia/Seoul',exceptionLogging:'NONE',runtimeVersion:'V8',
  oauthScopes:['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/script.external_request']};
 fs.mkdirSync(outDir,{recursive:false});fs.mkdirSync(path.join(outDir,'dedicated'));fs.mkdirSync(path.join(outDir,'main-addon'));
 fs.writeFileSync(path.join(outDir,'dedicated','Code.gs'),code);
 fs.writeFileSync(path.join(outDir,'dedicated','appsscript.json'),JSON.stringify(manifest,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'main-addon','NotificationBridge.gs'),addon);
 if(patched!==null)fs.writeFileSync(path.join(outDir,'main-addon','Code.candidate.js'),patched);
 return {dedicatedSha256:sha(code),bridgeSha256:sha(addon),mainPatched:patched!==null,mainCandidateSha256:patched===null?null:sha(patched)};
}
if(require.main===module){
 if(![3,5].includes(process.argv.length))throw Error('usage: node build-notification-gas.cjs <new output dir> [<verified live Code.js> <approved SHA256>]');
 console.log(JSON.stringify(build(process.argv[2],process.argv[3],process.argv[4])));
}
module.exports={build,patchMain,dedicated,bridge,combine};
