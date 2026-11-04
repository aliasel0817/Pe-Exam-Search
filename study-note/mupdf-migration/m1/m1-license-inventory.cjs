'use strict';
// Static public dependency inventory. Does not download third-party code or show API URLs.
const fs=require('node:fs'),path=require('node:path');
const DEFINITIONS=[
  {id:'pdfjs',pattern:/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/([0-9.]+)/g,name:'PDF.js',license:'Apache-2.0 (verify bundled notices)',status:'existing'},
  {id:'pdf-lib',pattern:/cdn\.jsdelivr\.net\/npm\/pdf-lib@([0-9.]+)/g,name:'pdf-lib',license:'MIT (verify bundled notices)',status:'existing'},
  {id:'xlsx',pattern:/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\/([0-9.]+)/g,name:'SheetJS xlsx',license:'Apache-2.0 (confirm 0.18.5 bundle notices)',status:'existing'},
];
const MUPDF={id:'mupdf',name:'MuPDF.js',version:'1.28.1',license:'AGPL-3.0-or-later',status:'planned-not-shipped',
  source:'https://www.npmjs.com/package/mupdf'};
function inventoryText(text){
  const detected=[];
  for(const dep of DEFINITIONS){
    const match=dep.pattern.exec(text);dep.pattern.lastIndex=0;
    if(match)detected.push({id:dep.id,name:dep.name,version:match[1],license:dep.license,status:dep.status});
  }
  return {schema:'mupdf-m1-dependency-inventory-v1',dependencies:detected.concat([MUPDF]),
    unresolved:detected.filter(d=>d.license.includes('confirmation')||d.license.includes('verify')).map(d=>d.id),
    caveat:'Scans known HTML imports only; other transitive/runtime dependencies need M2 SBOM validation.'};
}
function run(root){
  const html=fs.readFileSync(path.join(root,'study-note','study-note.html'),'utf8');
  return inventoryText(html);
}
if(require.main===module){
  let idx=process.argv.indexOf('--root');
  const root=idx<0?path.resolve(__dirname,'../../..'):path.resolve(process.argv[idx+1]);
  console.log(JSON.stringify(run(root),null,2));
}
module.exports={inventoryText,run};
