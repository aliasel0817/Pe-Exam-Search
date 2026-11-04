'use strict';
// Compare read-only Apps Script snapshots without exposing any source or secret.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const files=['Code.js','referencePdfContent.js','appsscript.json'];
const fingerprint=(dir,name)=>{
 const file=path.join(dir,name);
 return fs.existsSync(file)?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
};
function compare(first,second){
 const snapshots=files.map(name=>{
  const a=fingerprint(first,name),b=fingerprint(second,name);
  return {file:name,sourceAExists:!!a,sourceBExists:!!b,identical:!!a&&a===b,
    sourceASha:a,sourceBSha:b};
 });
 return {schema:'mupdf-m1-apps-script-source-compare-v1',snapshots,
  allPresentAndEqual:snapshots.every(x=>x.identical),noSourcePrinted:true};
}
if(require.main===module){
 const [a,b]=process.argv.slice(2);
 if(!a||!b)throw Error('Usage: node m1-source-compare.cjs <private-head-dir> <private-v21-dir>');
 console.log(JSON.stringify(compare(a,b),null,2));
}
module.exports={compare};
