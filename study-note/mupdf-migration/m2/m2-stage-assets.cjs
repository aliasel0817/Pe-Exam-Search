'use strict';
/**
 * M2 private-only pinned asset packaging. Does NOT publish files.
 * Requires exact npm lock + installed official mupdf package.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..');
const PKG_DIR=path.join(__dirname,'node_modules','mupdf');
const STAGE=path.join(ROOT,'.m2-private','staged','mupdf','1.28.1');
const ASSET_LOCK=path.join(__dirname,'m2-asset-lock.json');
const VERSION='1.28.1';
const FILES=[
 ['dist/mupdf.js','mupdf.js','text/javascript; charset=utf-8'],
 ['dist/mupdf-wasm.js','mupdf-wasm.js','text/javascript; charset=utf-8'],
 ['dist/mupdf-wasm.wasm','mupdf-wasm.wasm','application/wasm'],
 ['LICENSE','LICENSE','text/plain; charset=utf-8']
];
function sha256(data){return crypto.createHash('sha256').update(data).digest('hex');}
function safePackageLock(){
 const p=require(path.join(__dirname,'package.json'));
 const l=require(path.join(__dirname,'package-lock.json'));
 const installed=require(path.join(PKG_DIR,'package.json'));
 const dep=l.packages?.['node_modules/mupdf'];
 if(!p.private||p.dependencies?.mupdf!==VERSION)throw Error('M2 requires private=true and exact pinned version');
 if(installed.name!=='mupdf'||installed.version!==VERSION||installed.license!=='AGPL-3.0-or-later')throw Error('unexpected npm package');
 if(dep?.version!==VERSION||!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(dep.integrity??'')||dep.license!=='AGPL-3.0-or-later')throw Error('npm lock invalid');
 if(l.packages?.['']?.dependencies?.mupdf!==VERSION)throw Error('npm root lock not pinned');
 return {version:VERSION,registryIntegrity:dep.integrity,license:dep.license};
}
function compute(){
 const meta=safePackageLock();
 return {schema:'mupdf-m2-asset-lock-v1',distribution:'LOCAL_STAGING_ONLY_NO_PUBLIC_BINARY',
   package:{name:'mupdf',...meta},
   files:FILES.map(([from,to,mime])=>{
     const data=fs.readFileSync(path.join(PKG_DIR,from));
     return {name:to,source:'node_modules/mupdf/'+from,size:data.length,sha256:sha256(data),mime};
   })
 };
}
function compare(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function run({init=false}={}){
 const expected=compute();
 if(init){
   if(fs.existsSync(ASSET_LOCK))throw Error('asset lock exists: refuse overwrite; use explicit review to update');
   fs.writeFileSync(ASSET_LOCK,JSON.stringify(expected,null,2)+'\n','utf8');
 }
 if(!fs.existsSync(ASSET_LOCK))throw Error('asset lock missing; initialize with --init-asset-lock');
 const locked=JSON.parse(fs.readFileSync(ASSET_LOCK,'utf8'));
 if(!compare(locked,expected))throw Error('MuPDF asset hash/package integrity mismatch');
 // Static assets are local only; no public source path is used.
 if(!STAGE.includes(path.sep+'.m2-private'+path.sep))throw Error('unsafe stage directory');
 fs.mkdirSync(STAGE,{recursive:true});
 for(const [from,to] of FILES){
   fs.copyFileSync(path.join(PKG_DIR,from),path.join(STAGE,to));
   if(sha256(fs.readFileSync(path.join(STAGE,to)))!==locked.files.find(a=>a.name===to)?.sha256){
     throw Error('post-copy checksum mismatch: '+to);
   }
 }
 fs.writeFileSync(path.join(STAGE,'asset-manifest.json'),JSON.stringify(locked,null,2)+'\n');
 fs.writeFileSync(path.join(STAGE,'package.json'),JSON.stringify({type:'module',private:true})+'\n');
 return {version:VERSION,stagedFiles:FILES.length,allChecksumsMatch:true,
   distribution:'private-staging-only',assetLock:'study-note/mupdf-migration/m2/m2-asset-lock.json'};
}
if(require.main===module){
 try{console.log(JSON.stringify(run({init:process.argv.includes('--init-asset-lock')}),null,2));}
 catch(e){console.error('M2_STAGE_FAILED:',e.message);process.exitCode=1;}
}
module.exports={run,compute,sha256,FILES,STAGE,ROOT,ASSET_LOCK};
