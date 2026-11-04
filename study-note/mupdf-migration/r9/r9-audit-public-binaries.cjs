'use strict';
/** R9 audited public release asset scan. Supports both R9 publication and
 * historical pre-release tests without treating other WASM binaries as safe.
 */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const here=__dirname,repo=path.resolve(here,'../../..');
const wasmRel='study-note/vendor/mupdf/1.28.1/mupdf-wasm.wasm';
const manifestRel='study-note/mupdf-migration/r9/R9-PUBLIC-ASSET-MANIFEST.json';
const source=require('./r9-source-bundle.cjs');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function audit(){
 const files=cp.execFileSync('git',['-C',repo,'ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean).map(x=>x.replaceAll('\\','/'));
 const forbidden=files.filter(f=>/\.(?:pdf|p12|pfx|pem|key|sqlite|db)$/i.test(f)&&!f.endsWith('LICENSE')
    ||/(^|\/)\.clasp\.json$|(^|\/)\.env(?:\.|$)|(^|\/)\.r[0-9]+-private\//i.test(f));
 if(forbidden.length)throw Error('R9_PUBLIC_FILE_REJECTED: '+forbidden.join(',').slice(0,250));
 const wasm=files.filter(f=>f.endsWith('.wasm'));
 if(wasm.length!==1||wasm[0]!==wasmRel)throw Error('R9_UNAPPROVED_WASM_PATHS '+wasm.join(','));
 const manifest=JSON.parse(fs.readFileSync(path.join(repo,manifestRel),'utf8'));
 const lock=JSON.parse(fs.readFileSync(path.join(repo,'study-note/mupdf-migration/m2/m2-asset-lock.json'),'utf8'));
 if(manifest.releaseTag!=='pe-study-note-mupdf-1.28.1-r8-20261104'
     ||manifest.assets.length!==7||manifest.sourceArchiveSha256!==source.expectedSha)
     throw Error('R9_REBUILT_ASSET_MANIFEST_MISMATCH');
 const verified=[];
 for(const entry of manifest.assets){
  if(!files.includes(entry.path))throw Error('R9_MISSING_TRACKED_VENDOR_FILE_'+entry.path);
  const actual=fs.readFileSync(path.join(repo,...entry.path.split('/')));
  if(actual.length!==entry.size||digest(actual)!==entry.sha256)throw Error('R9_CORRUPT_VENDOR_FILE_'+entry.path);
  verified.push(entry.path);
 }
 if(manifest.assets.find(x=>x.path===wasmRel)?.sha256!==lock.files.find(x=>x.name==='mupdf-wasm.wasm')?.sha256)
  throw Error('R9_WASM_UNPINNED');
 const src=source.verify();
 for(const part of JSON.parse(fs.readFileSync(path.join(here,'R9-SOURCE-ARCHIVE-MANIFEST.json'))).parts) {
  if(!files.includes('study-note/mupdf-migration/r9/source/'+part.name))throw Error('R9_COMPLETE_SOURCE_PART_NOT_TRACKED');
 }
 const lic=fs.readFileSync(path.join(repo,'study-note/LICENSE'));
 const orig=fs.readFileSync(path.join(repo,'study-note/mupdf-migration/r4/licenses/AGPL-3.0.txt'));
 if(!lic.equals(orig))throw Error('R9_LICENSE_CORRUPTION');
 const notice=fs.readFileSync(path.join(repo,'study-note/THIRD_PARTY_NOTICES.md'),'utf8');
 if(!notice.includes('18 pinned third-party modules'))throw Error('R9_NOTICES_MISSING');
 return {status:'PASS_AUDITED_PUBLIC_MUPDF_ASSETS',wasmPath:wasmRel,assetFiles:verified.length,
   fullSourceBytes:src.bytes,sourceSha256:src.sha256,noUserDataOrSecrets:true};
}
if(require.main===module)try{console.log(JSON.stringify(audit(),null,2));}
 catch(e){console.error(e.message);process.exitCode=2;}
module.exports={audit,wasmRel};
