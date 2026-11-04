// M2 JavaScript/WASM module load smoke. NO document opens or rendering.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(dir,'../../..');
const stage=path.join(repo,'.m2-private','staged','mupdf','1.28.1');
const meta=JSON.parse(fs.readFileSync(path.join(stage,'asset-manifest.json'),'utf8'));
if(meta.package.version!=='1.28.1')throw Error('Unexpected MuPDF version');
const mod=await import(pathToFileURL(path.join(stage,'mupdf.js')).href);
const value=mod.default;
if(!value || !value.Document || typeof value.Document.openDocument!=='function')
  throw Error('MuPDF browser-facing ESM entrypoint did not initialize');
console.log(JSON.stringify({
  result:'PASS',
  esmModuleLoaded:true,
  wasmInitialized:true,
  version:meta.package.version,
  pdfDocumentOpened:false,
  publicDeployment:false
},null,2));
