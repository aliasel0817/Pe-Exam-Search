'use strict';
// R3: read-only, version-pinned MuPDF source and npm dist provenance auditor.
// This is evidence collection, NOT a license determination or a release tool.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const EXPECTED_COMMIT='20061bd45183f5a2bff8f43675e4da91e5ac2901';
const EXPECTED_SDK='4.0.8';
const expectedLock=path.resolve(__dirname,'../m2/m2-asset-lock.json');
const lock=JSON.parse(fs.readFileSync(expectedLock,'utf8'));
function digest(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}
function runGit(root,args){
 return cp.execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:45000,maxBuffer:6*1024*1024}).replace(/\s+$/,'');
}
function parseGitlinks(text){
 return text.split(/\r?\n/).filter(line=>line.startsWith('160000 commit ')).map(line=>{
   const m=/^160000 commit ([0-9a-f]{40})\t(thirdparty\/[A-Za-z0-9_-]+)$/.exec(line);
   if(!m)throw Error('Unexpected source gitlink record');
   return {path:m[2],commit:m[1]};
 });
}
function parseSubmoduleStatus(text){
 const result=new Map();
 for(const line of text.split(/\r?\n/).filter(Boolean)){
   const m=/^([-+U ])([0-9a-f]{40}) (thirdparty\/[A-Za-z0-9_-]+)(?:\s|$)/.exec(line);
   if(m)result.set(m[3],{checkout:m[2],marker:m[1]});
 }
 return result;
}
function resolveCommand(cmd){
 const r=cp.spawnSync(process.platform==='win32'?'where':'which',[cmd],{encoding:'utf8',timeout:5000,windowsHide:true});
 return r.status===0;
}
function packageComparisons(tgz){
 if(!tgz)return {status:'NOT_VERIFIED',files:[]};
 if(!fs.existsSync(tgz))return {status:'BLOCKED_NO_PACKAGE_TARBALL',files:[]};
 const outputs=[];
 for(const entry of lock.files){
   const target='package/dist/'+entry.name;
   const tarTarget=entry.name==='LICENSE'?'package/LICENSE':target;
   const r=cp.spawnSync('tar',['-xOf',tgz,tarTarget],
      {encoding:null,timeout:45000,maxBuffer:16*1024*1024,windowsHide:true});
   const actual=r.status===0?r.stdout:null;
   outputs.push({name:entry.name,exists:Boolean(actual),
     matchesPinnedSize:Boolean(actual&&actual.length===entry.size),
     matchesPinnedSha256:Boolean(actual&&digest(actual)===entry.sha256)});
 }
 return {status:outputs.every(x=>x.exists&&x.matchesPinnedSize&&x.matchesPinnedSha256)?'PASS':'FAIL',files:outputs};
}
function buildAudit(sourceDir,tgz){
 if(!sourceDir||!fs.existsSync(sourceDir))throw Error('Private upstream source checkout unavailable');
 const head=runGit(sourceDir,['rev-parse','HEAD']);
 const pjPath=path.join(sourceDir,'platform','wasm','package.json');
 const shPath=path.join(sourceDir,'platform','wasm','tools','build.sh');
 const mdPath=path.join(sourceDir,'platform','wasm','BUILDING.md');
 const pj=JSON.parse(fs.readFileSync(pjPath,'utf8'));
 const script=fs.readFileSync(shPath,'utf8');
 const readme=fs.readFileSync(mdPath,'utf8');
 const gitlinks=parseGitlinks(runGit(sourceDir,['ls-tree','-r','HEAD','thirdparty']));
 const statuses=parseSubmoduleStatus(runGit(sourceDir,['submodule','status']));
 const submodules=gitlinks.map(x=>{
   const state=statuses.get(x.path);
   return {...x,checkoutMatches:Boolean(state&&state.checkout===x.commit),
     initialized:Boolean(state&&state.marker===' '),
     status:state?.marker===' '?'READY':state?.marker==='+'?'MISMATCH':'MISSING'};
 });
 const flags={
   packageVersion1_28_1:pj.name==='mupdf'&&pj.version==='1.28.1',
   upstreamCommitPinned:head===EXPECTED_COMMIT,
   prepackIncludesBuildAndCompress:pj.scripts?.prepack==='bash tools/build.sh && bash tools/compress.sh',
   emsdk408:script.includes('emsdk install 4.0.8')&&script.includes('emsdk activate 4.0.8')
     &&readme.includes('4.0.8'),
   defaultCFlags:script.includes('-DTOFU -DTOFU_CJK_EXT -DFZ_ENABLE_HYPHEN=0'),
   defaultFeatureExclusions:script.includes('brotli=no mujs=no extract=no xps=no svg=no html=no'),
   wasmExceptionsAndEsModule:script.includes('-fwasm-exceptions')
     &&script.includes('-sEXPORT_ES6=1')&&script.includes('-sMODULARIZE=1'),
   allGitlinkShasMatched:submodules.length===18&&submodules.every(x=>x.checkoutMatches&&x.initialized),
 };
 const tools={emcc:resolveCommand('emcc'),bash:resolveCommand('bash'),
   make:resolveCommand('make'),node:process.version,nodeMajor:Number(process.versions.node.split('.')[0]),
   hostOS:process.platform,officialBuildTestedOnLinux:process.platform==='linux'};
 const pkg=packageComparisons(tgz);
 return {
   schema:'mupdf-r3-source-provenance-v1',upstream:{commit:head,
     expectedCommit:EXPECTED_COMMIT,gitlinks:submodules,
     buildShSha256:digest(Buffer.from(script)),packageJsonSha256:digest(fs.readFileSync(pjPath)),
     exactReleaseTagEvidence:true},
   packaging:{npmPackageName:pj.name,npmVersion:pj.version,license:pj.license,
     npmFilesMatchM2Lock:pkg,registryIntegrityPinned:lock.package.registryIntegrity},
   recipe:{emsdkVersion:EXPECTED_SDK,nodeJsRecommendedMajor:22,
     command:'cd platform/wasm && npm run prepack',
     settings:'BUILD=small; SUFFIX empty; FEATURES=brotli=no mujs=no extract=no xps=no svg=no html=no; DEFINES=-DTOFU -DTOFU_CJK_EXT -DFZ_ENABLE_HYPHEN=0',
     exactScriptFromRelease:true},
   tools,flags,
   checkoutReadyForBuild:flags.allGitlinkShasMatched&&flags.upstreamCommitPinned,
   toolchainReadyForBuild:tools.emcc&&tools.bash&&tools.make&&tools.officialBuildTestedOnLinux,
   wasmRebuiltInThisAudit:false,
   wasmBinaryReproduced:false,
   releasePermitted:false,
   missing:(!flags.allGitlinkShasMatched?['UPSTREAM_SUBMODULES_NOT_READY']:[])
     .concat(!(tools.emcc&&tools.bash&&tools.make&&tools.officialBuildTestedOnLinux)?['VERIFIED_LINUX_EMSDK_TOOLCHAIN_UNAVAILABLE']:[])
     .concat(pkg.status!=='PASS'?['NPM_BINARY_CHECKSUM_UNVERIFIED']:[])
     .concat(['NO_ACTUAL_WASM_REBUILD','AGPL_LEGAL_SCOPE_UNRESOLVED']),
 };
}
if(require.main===module){
 const argv=process.argv.slice(2);
 const source=argv[0],tgz=argv[1]&&argv[1]!=='-'?argv[1]:null,output=argv[2];
 try{
   const audit=buildAudit(source,tgz);
   if(output){
     const target=path.resolve(output);
     if(!target.includes('.r3-private'))throw Error('Audit evidence must be saved inside ignored .r3-private');
     fs.mkdirSync(path.dirname(target),{recursive:true});
     fs.writeFileSync(target,JSON.stringify(audit,null,2)+'\n',{flag:'w',mode:0o600});
   }
   console.log(JSON.stringify({status:'READ_ONLY_AUDIT_COMPLETE',revision:audit.upstream.commit,
     gitlinkCount:audit.upstream.gitlinks.length,
     readySubmodules:audit.upstream.gitlinks.filter(x=>x.status==='READY').length,
     npmPackageChecksumStatus:audit.packaging.npmFilesMatchM2Lock.status,
     buildToolchainAvailable:audit.toolchainReadyForBuild,
     wasmActuallyRebuilt:false,releasePermitted:false,unresolved:audit.missing},null,2));
   if(!audit.flags.upstreamCommitPinned||!audit.flags.packageVersion1_28_1)process.exitCode=3;
 }catch(e){console.error('R3 provenance audit failed: '+e.message);process.exitCode=2;}
}
module.exports={digest,parseGitlinks,parseSubmoduleStatus,buildAudit,packageComparisons};
