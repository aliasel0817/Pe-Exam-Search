'use strict';
/** One-time R9 release transition to preserve pre-release tests while
 * accepting exactly one SHA-pinned, AGPL-public MuPDF wasm, never other files.
 * Run in a new, clean R9 release checkout ONLY.
 */
const fs=require('node:fs'),path=require('node:path');
const here=__dirname,repo=path.resolve(here,'../../..'),migration=path.resolve(here,'..');
const WASM='study-note/vendor/mupdf/1.28.1/mupdf-wasm.wasm';
const updated=[];
function patch(rel,needle,replacement){
 const full=path.join(repo,...rel.split('/'));
 const data=fs.readFileSync(full,'utf8');
 const count=data.split(needle).length-1;
 if(count!==1)throw Error('R9_EXPECTED_EXACT_MATCH_'+rel+':'+count);
 fs.writeFileSync(full,data.replace(needle,replacement),'utf8');
 updated.push(rel);
}
const commonFiles=['m4/tests/m4.test.mjs','m5/tests/m5.test.mjs','m6/tests/m6.test.mjs'];
for(const f of commonFiles){
 const full='study-note/mupdf-migration/'+f;
 const name=f.startsWith('m6')?'p':'f';
 patch(full,`assert(!tracked.some(${name}=>${name}.endsWith('.wasm')));`,
  `assert(tracked.filter(${name}=>${name}.endsWith('.wasm')).every(${name}=>${name}==='${WASM}'));`);
}
patch('study-note/mupdf-migration/m7/tests/m7.test.mjs',
 "assert(!tracked.some(p=>p.endsWith('.wasm')||p.includes('.m2-private/')));",
 `assert(!tracked.some(p=>(p.endsWith('.wasm')&&p!=='${WASM}')||p.includes('.m2-private/')));`);
patch('study-note/mupdf-migration/r6/tests/r6-release.test.cjs',
 "p=>p.endsWith('.wasm')||p.includes('/.r6-private/')",
 `p=>(p.endsWith('.wasm')&&p!=='${WASM}')||p.includes('/.r6-private/')`);
patch('study-note/mupdf-migration/r7/tests/r7-source-package.test.cjs',
 "x=>/\\.wasm$/.test(x)||x.includes('.r7-private')",
 `x=>(/\\.wasm$/.test(x)&&x!=='${WASM}')||x.includes('.r7-private')`);
patch('study-note/mupdf-migration/r8/tests/r8-agpl-evidence.test.cjs',
 "p=>/\\.r8-private|\\.clasprc|\\.clasp\\.json|\\.wasm$/i.test(p)",
 `p=>/\\.r8-private|\\.clasprc|\\.clasp\\.json/i.test(p)||(p.endsWith('.wasm')&&p!=='${WASM}')`);
patch('study-note/mupdf-migration/r3/r3-source-export-audit.cjs',
 "p=>p.endsWith('.wasm')||p.includes('/.r3-private/')",
 `p=>(p.endsWith('.wasm')&&p!=='${WASM}')||p.includes('/.r3-private/')`);
const workflow=path.join(repo,'.github','workflows');
for(const name of fs.readdirSync(workflow).filter(x=>/^mupdf-(?:m[2-7]|r[0-8])-.*\.yml$/.test(x))){
 const file=path.join(workflow,name);
 let data=fs.readFileSync(file,'utf8'),before=data;
 if(name==='mupdf-m2-audit.yml'){
  const old="'^study-note/(vendor/mupdf|mupdf-migration/m2/(dist|node_modules))/|\\.wasm$'";
  const fresh="'^study-note/mupdf-migration/m2/(dist|node_modules)/'";
  if(!data.includes(old))throw Error('R9_M2_SOURCE_GUARD_CHANGED');
  data=data.replace(old,fresh);
 }else{
  data=data.replaceAll('\\.wasm$|','').replaceAll('|\\.wasm$','');
 }
 data=data.replace('test "$(git ls-files \'*.wasm\' | wc -l)" = "0"',
  'node study-note/mupdf-migration/r9/r9-audit-public-binaries.cjs');
 data=data.replace('test -z "$(git ls-files \'*.wasm\')"',
  'node study-note/mupdf-migration/r9/r9-audit-public-binaries.cjs');
 if(data!==before){fs.writeFileSync(file,data);updated.push('.github/workflows/'+name);}
}
if(require.main===module)console.log(JSON.stringify({filesUpdated:updated.length,files:updated},null,2));
