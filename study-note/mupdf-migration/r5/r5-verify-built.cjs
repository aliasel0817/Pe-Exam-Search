'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const lock=require('../m2/m2-asset-lock.json');
const manifest=require('../r3/r3-draft-source-manifest.json');
function verify(dir){
 const result=lock.files.filter(f=>f.name!=='LICENSE').map(f=>{
  const p=path.join(dir,f.name);
  if(!fs.existsSync(p))return {name:f.name,exists:false};
  const bytes=fs.readFileSync(p);const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  return {name:f.name,exists:true,size:bytes.length,sha256,bytesIdenticalToNpm:sha256===f.sha256};
 });
 return {schema:'r5-rebuilt-wasm-evidence-v1',sourceCommit:manifest.mupdf.commit,
  toolchainTarget:'emsdk-4.0.8',files:result,buildOutputComplete:result.every(x=>x.exists),
  byteIdenticalToNpm:result.every(x=>x.bytesIdenticalToNpm===true),
  note:'Byte identity is an engineering diagnostic, not a standalone AGPL legal requirement; no files or bytes distributed',
  legalClearance:false,productionDeployAllowed:false};
}
if(require.main===module){
 try{
  if(process.argv.length!==3||!path.resolve(process.argv[2]).includes('r5-private'))throw Error('Only private dist directory allowed');
  const result=verify(process.argv[2]);console.log(JSON.stringify(result,null,2));
  if(!result.buildOutputComplete)process.exitCode=3;
 }catch(e){console.error('R5_REBUILD_VERIFICATION_FAILED '+e.message);process.exitCode=2;}
}
module.exports={verify};
