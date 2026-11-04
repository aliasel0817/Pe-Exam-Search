'use strict';
// Sanitized file-path & SHA inventory, NOT a corresponding source offer or package.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const cp=require('node:child_process');
const repo=path.resolve(__dirname,'../../..');
function classify(filename){
 const normalized=filename.replaceAll('\\','/');
 if(normalized==='study-note/study-note.html')return 'FRONTEND_INTEGRATION_SOURCE';
 if(normalized.startsWith('study-note/backend/'))return 'BACKEND_ADDON_TRACKED_NOT_DEPLOYED_CODE';
 if(normalized.startsWith('study-note/mupdf-migration/'))return 'MUPDF_ADAPTER_AND_REVIEW_SOURCE';
 if(normalized.startsWith('study-note/')&&/\.(?:js|mjs|cjs|ts|css|html)$/.test(normalized))return 'OTHER_FRONTEND_SOURCE_REVIEW';
 if(normalized.startsWith('.github/workflows/'))return 'BUILD_CI_SCRIPTS';
 return 'OTHER_SOURCE_OR_ASSET_REQUIRES_MANUAL_REVIEW';
}
function catalog(root=repo){
 const files=cp.execFileSync('git',['-C',root,'ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean)
  .filter(x=>x.replaceAll('\\','/')!=='study-note/mupdf-migration/r4/R4-SOURCE-CATALOG-DRAFT.json');
 const risks=[];
 const entries=[];
 for(const file of files){
  const p=path.join(root,file);
  if(!fs.existsSync(p))continue;
  const stat=fs.lstatSync(p);
  if(!stat.isFile()){risks.push({path:file,issue:'NON_REGULAR_FILE'});continue;}
  const ext=path.extname(file).toLowerCase();
  const privateEntry=/(^|\/)\.(?:r[0-9]+|m[0-9]+)-private\//.test(file) || /\.wasm$|\.pdf$|(^|\/)\.clasp\.json$/i.test(file);
  if(privateEntry)risks.push({path:file,issue:'SENSITIVE_OR_BINARY_CANDIDATE'});
  const sha256=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  entries.push({path:file.replaceAll('\\','/'),sha256,bytes:stat.size,classification:classify(file)});
 }
 const categories={};for(const e of entries)categories[e.classification]=(categories[e.classification]||0)+1;
 return {
  schema:'r4-sanitized-source-catalog-v1',purpose:'PRIVATE_RELEASE_PLANNING_ONLY',
  isCompleteCorrespondingSource:false,sourceOfferPubliclyAccessible:false,
  appsScriptLiveCodeIncluded:false,mupdfCoreCSourceIncluded:false,
  publicBinaryReleaseAllowed:false,
  notes:'Catalog is only a list of existing tracked files and checksums, not a legal licence or source offer.',
  entryCount:entries.length,categories,unresolved:[
    'Artifex written decision on Apps Script coupling and rights of third-party materials',
    'Backend deployed Code.js not automatically included and not copied',
    'Exact MuPDF C source and 18 gitlink modules held ONLY in private R3 checkout',
    'Complete third-party licenses, font/CMap notices and build/install instructions',
    'No public source URL published or approved'
  ],risks,entries,
 };
}
if(require.main===module){
 try{
  const out=process.argv[2];
  if(!out||!path.resolve(out).startsWith(__dirname))throw Error('Must write into R4 source folder');
  const m=catalog();
  fs.writeFileSync(out,JSON.stringify(m,null,2)+'\n');
  console.log(JSON.stringify({status:'DRAFT_CATALOG_ONLY',trackedFiles:m.entryCount,
    classifications:m.categories,flagged:m.risks.length,ready:false},null,2));
 }catch(e){console.error('R4 catalog failure: '+e.message);process.exitCode=2;}
}
module.exports={catalog,classify};
