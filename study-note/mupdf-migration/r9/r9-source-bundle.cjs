'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const here=__dirname,root=path.resolve(here,'../../..');
const dir=path.join(here,'source');
const archive='mupdf-1.28.1-complete-source.tar.gz';
const original=path.join(dir,archive);
const manifestPath=path.join(here,'R9-SOURCE-ARCHIVE-MANIFEST.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const expectedSha='328c12b65cbdfffc2ad803bd14d9fb526496937575c14fac4634d9968461de15';
const expectedSize=93863687;
const CHUNK=32*1024*1024;
const getPartName=i=>archive+'.part'+String(i+1).padStart(2,'0');
function create(){
 if(!fs.existsSync(original))throw Error('R9_ORIGINAL_SOURCE_ARCHIVE_MISSING');
 const originalBytes=fs.readFileSync(original);
 if(originalBytes.length!==expectedSize||hash(originalBytes)!==expectedSha)throw Error('R9_UNVERIFIED_SOURCE_ARCHIVE');
 const out=[];
 for(let i=0;i<Math.ceil(originalBytes.length/CHUNK);i++){
  const name=getPartName(i),abs=path.join(dir,name);
  if(fs.existsSync(abs))throw Error('R9_REFUSE_OVERWRITE_SOURCE_PART');
  const bytes=originalBytes.subarray(i*CHUNK,(i+1)*CHUNK);
  fs.writeFileSync(abs,bytes);
  if(hash(fs.readFileSync(abs))!==hash(bytes))throw Error('R9_PART_WRITE_FAILURE');
  out.push({name,size:bytes.length,sha256:hash(bytes)});
 }
 const m={schema:'mupdf-r9-immutable-corresponding-source-v1',
   upstreamCoreCommit:'20061bd45183f5a2bff8f43675e4da91e5ac2901',
   upstreamSubmodules:18,archiveName:archive,archiveSha256:expectedSha,
   archiveBytes:expectedSize,parts:out,
   note:'Git source includes all chunks and rebuild scripts; private original is NOT tracked.'};
 fs.writeFileSync(manifestPath,JSON.stringify(m,null,2)+'\n');
 return m;
}
function verify(){
 const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 if(m.archiveSha256!==expectedSha||m.archiveBytes!==expectedSize||m.parts.length!==3)
  throw Error('R9_ARCHIVE_MANIFEST_UNKNOWN');
 const dig=crypto.createHash('sha256');let size=0;
 for(const part of m.parts){
  const b=fs.readFileSync(path.join(dir,part.name));
  if(b.length!==part.size||hash(b)!==part.sha256)throw Error('R9_CORRUPT_SOURCE_PART_'+part.name);
  size+=b.length;dig.update(b);
 }
 if(size!==expectedSize||dig.digest('hex')!==expectedSha)throw Error('R9_ARCHIVE_REASSEMBLY_MISMATCH');
 return {status:'PASS_IMMUTABLE_COMPLETE_SOURCE_ARCHIVE',pieces:m.parts.length,bytes:size,sha256:expectedSha};
}
if(require.main===module){try{if(process.argv.includes('--create'))create(); console.log(JSON.stringify(verify(),null,2));}
 catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={verify,expectedSha,expectedSize};
