'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const lock=require('../m2/m2-asset-lock.json');
function sha256(b){return crypto.createHash('sha256').update(b).digest('hex');}
function compareDist(dist){
 const files=lock.files.filter(f=>f.name!=='LICENSE').map(entry=>{
  const file=path.join(dist,entry.name);
  if(!fs.existsSync(file))return {name:entry.name,exists:false,bytesEqual:false};
  const stat=fs.statSync(file),hash=sha256(fs.readFileSync(file));
  return {name:entry.name,exists:true,actualSize:stat.size,actualSha256:hash,
   bytesEqual:stat.size===entry.size&&hash===entry.sha256};
 });
 return {schema:'r3-private-build-comparison-v1',files,
  status:files.every(x=>x.exists&&x.bytesEqual)?'BINARY_IDENTICAL':
   files.some(x=>x.exists)?'NOT_BINARY_IDENTICAL':'NO_BUILD_OUTPUT',
  notes:'This is not legal or release approval; only use after an actual local build',
  legalApproval:false,publicReleasePermitted:false};
}
if(require.main===module){
 try{
  const dir=process.argv[2],output=process.argv[3];
  if(!dir||!output||!path.resolve(output).includes('.r3-private'))
   throw Error('Usage: node r3-compare-built.cjs <private-dist> <private-result.json>');
  const v=compareDist(dir);
  fs.writeFileSync(output,JSON.stringify(v,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({status:v.status,files:v.files.map(x=>({name:x.name,exists:x.exists,bytesEqual:x.bytesEqual})),
   releasePermitted:false},null,2));
  if(v.status!=='BINARY_IDENTICAL')process.exitCode=3;
 }catch(e){console.error('R3 build evidence error: '+e.message);process.exitCode=2;}
}
module.exports={compareDist};
