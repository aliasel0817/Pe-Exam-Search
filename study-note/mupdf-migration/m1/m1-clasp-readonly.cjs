'use strict';
// List-only Apps Script deployment version check. No IDs, URLs or source printed.
// Never invokes clasp push, deploy, undeploy or version creation.
const cp=require('node:child_process'),path=require('node:path');
function probe(projectDir){
 const cmd=process.platform==='win32'?'cmd.exe':'sh';
 const args=process.platform==='win32'?['/d','/s','/c','clasp deployments --json']:['-c','clasp deployments --json'];
 const r=cp.spawnSync(cmd,args,{cwd:path.resolve(projectDir),encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});
 if(r.error)return {status:'unavailable',reason:r.error.code||'CLI_ERROR'};
 if(r.status!==0)return {status:'unavailable',reason:'CLI_EXIT_'+r.status};
 let data;try{data=JSON.parse(r.stdout);}catch(_){return {status:'unavailable',reason:'UNRECOGNIZED_FORMAT'};}
 const list=Array.isArray(data)?data:Array.isArray(data.deployments)?data.deployments:[];
 const versions=list.map(x=>Number(x.versionNumber ?? x.version ?? x.version?.versionNumber)).filter(Number.isFinite);
 return {status:'read-only-ok',deploymentCount:list.length,versions:[...new Set(versions)].sort((a,b)=>a-b),
   highestVersion:versions.length?Math.max(...versions):null,
   caveat:'Deployment metadata only; a version number alone cannot prove source equality to local backup.'};
}
if(require.main===module){
 const idx=process.argv.indexOf('--project-dir');
 if(idx<0||!process.argv[idx+1])throw Error('Usage: node m1-clasp-readonly.cjs --project-dir <private-existing-directory>');
 console.log(JSON.stringify(probe(process.argv[idx+1]),null,2));
}
module.exports={probe};
