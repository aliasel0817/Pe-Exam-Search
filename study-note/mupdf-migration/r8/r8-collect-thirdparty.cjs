'use strict';
// R8 original-licence collector. Reads R3's exact upstream source read-only,
// writes ONLY this independent R8 checkout. No third-party licence text is changed.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const crypto=require('node:crypto');
const here=__dirname,repo=path.resolve(here,'../../..');
const manifest=JSON.parse(fs.readFileSync(path.resolve(here,'../r3/r3-draft-source-manifest.json')));
const upstream=process.env.R8_UPSTREAM_READONLY;
if(!upstream||!fs.statSync(upstream).isDirectory())throw Error('R8_UPSTREAM_READONLY_REQUIRED');
const git=dir=>cp.execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(git(upstream)!==manifest.mupdf.commit)throw Error('MUPDF_UPSTREAM_SOURCE_MISMATCH');
const files={
 brotli:['LICENSE'], 'cmark-gfm':['COPYING'],curl:['COPYING'],extract:['COPYING'],
 freeglut:['COPYING'],freetype:['LICENSE.TXT','docs/FTL.TXT'],
 'gumbo-parser':['COPYING'],harfbuzz:['COPYING'],jbig2dec:['LICENSE','COPYING'],
 lcms2:['LICENSE'],leptonica:['src/environ.h'],libjpeg:['README'],
 mujs:['COPYING'],openjpeg:['LICENSE'],tesseract:['LICENSE'],
 zint:['LICENSE'],zlib:['LICENSE'],'zxing-cpp':['LICENSE']
};
const dest=path.join(here,'third-party-licenses');
if(fs.existsSync(dest))throw Error('R8_NO_OVERWRITE_EXISTING_LICENSE_BUNDLE');
const records=[];
for(const mod of manifest.mupdf.submodules){
 const name=mod.path.split('/').pop(),source=path.join(upstream,...mod.path.split('/'));
 if(git(source)!==mod.commit)throw Error('SUBMODULE_SHA_MISMATCH_'+name);
 const paths=files[name];if(!paths)throw Error('UNLISTED_LICENSE_'+name);
 for(const relative of paths){
  const f=path.join(source,...relative.split('/'));
  if(!fs.existsSync(f))throw Error('LICENSE_TEXT_MISSING_'+name+'_'+relative);
  const bytes=fs.readFileSync(f);
  const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  const target=path.join(dest,name,...relative.split('/'));
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,bytes);
  if(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==sha)
   throw Error('LICENSE_COPY_MISMATCH_'+name);
  records.push({component:mod.path,sourceCommit:mod.commit,local:'third-party-licenses/'+name+'/'+relative,
    bytes:bytes.length,sha256:sha});
 }
}
const out=path.join(here,'R8-UPSTREAM-LICENSE-MANIFEST.json');
fs.writeFileSync(out,JSON.stringify({schema:'mupdf-r8-licenses-v1',coreCommit:manifest.mupdf.commit,
 modules:manifest.mupdf.submodules.length,files:records,updatedFromThirdParty:false,legalInterpretation:false},null,2)+'\n');
console.log(JSON.stringify({status:'PASS_COPIED_UNALTERED_UPSTREAM_NOTICES',modules:manifest.mupdf.submodules.length,files:records.length,bytes:records.reduce((s,x)=>s+x.bytes,0)}));
