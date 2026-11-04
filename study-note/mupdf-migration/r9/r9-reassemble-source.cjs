'use strict';
/** Reconstruct the complete audited MuPDF 1.28.1 source tarball
 * from the three immutable files provided with the AGPL Corresponding Source.
 * Usage: node r9-reassemble-source.cjs /path/to/output-directory
 * Refuses overwrite and checks final SHA/size before success.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const here=__dirname,source=require('./r9-source-bundle.cjs');
function restore(outDir){
 const m=source.verify();
 if(!outDir||!path.isAbsolute(outDir))throw Error('R9_ABSOLUTE_OUTPUT_DIRECTORY_REQUIRED');
 if(!fs.existsSync(outDir)||!fs.statSync(outDir).isDirectory())throw Error('R9_OUTPUT_DIRECTORY_MISSING');
 const dest=path.join(outDir,'mupdf-1.28.1-complete-source.tar.gz');
 if(fs.existsSync(dest))throw Error('R9_REFUSE_OVERWRITE_SOURCE_ARCHIVE');
 const json=JSON.parse(fs.readFileSync(path.join(here,'R9-SOURCE-ARCHIVE-MANIFEST.json'),'utf8'));
 let fd;
 try{
  fd=fs.openSync(dest,'wx');
  for(const part of json.parts){
   const bytes=fs.readFileSync(path.join(here,'source',part.name));
   fs.writeSync(fd,bytes);
  }
 }finally{if(fd!==undefined)fs.closeSync(fd);}
 const digest=crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
 if(digest!==m.sha256){fs.unlinkSync(dest);throw Error('R9_REASSEMBLED_ARCHIVE_SHA_MISMATCH');}
 return {status:'PASS',archive:dest,bytes:m.bytes,sha256:digest};
}
if(require.main===module){try{const result=restore(process.argv[2]);console.log(JSON.stringify(result));}
 catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={restore};
