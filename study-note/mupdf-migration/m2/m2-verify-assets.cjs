'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {compute,sha256,STAGE,ASSET_LOCK}=require('./m2-stage-assets.cjs');
function verify(){
 const m=compute();
 const l=JSON.parse(fs.readFileSync(ASSET_LOCK,'utf8'));
 if(JSON.stringify(m)!==JSON.stringify(l))throw Error('asset lock does not match npm installation');
 for(const file of l.files){
   const p=path.join(STAGE,file.name);
   if(!fs.existsSync(p))throw Error('stage asset missing: '+file.name);
   const b=fs.readFileSync(p);
   if(b.length!==file.size || sha256(b)!==file.sha256)throw Error('stage asset tampered: '+file.name);
 }
 const gitignore=fs.readFileSync(path.join(__dirname,'../../../.gitignore'),'utf8');
 if(!gitignore.includes('**/.m2-private/')||!gitignore.includes('**/node_modules/'))
   throw Error('M2 staged assets must be gitignored');
 return {result:'PASS',filesVerified:l.files.length,packageVersion:l.package.version,
   binaryPublished:false,privateStageVerified:true};
}
if(require.main===module){
 try{console.log(JSON.stringify(verify(),null,2));}catch(e){console.error('M2_VERIFY_FAILED:',e.message);process.exitCode=1;}
}
module.exports={verify};
