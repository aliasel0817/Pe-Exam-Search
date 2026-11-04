import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const here=path.dirname(fileURLToPath(import.meta.url));
const r5=path.resolve(here,'..');
const migration=path.resolve(r5,'..');
const repo=path.resolve(r5,'../../..');
const scanner=require('../r5-private-source-scan.cjs');
const version21=path.join(r5,'source','Code.js');
const script=fs.readFileSync(path.join(r5,'r5-build-from-source.sh'),'utf8');
const status=JSON.parse(fs.readFileSync(path.join(migration,'m2','m2-publication-gate.json'),'utf8'));
const r3=JSON.parse(fs.readFileSync(path.join(migration,'r3','r3-draft-source-manifest.json'),'utf8'));
const lock=JSON.parse(fs.readFileSync(path.join(r5,'source','mupdf-wasm-package-lock.json'),'utf8'));
const html=fs.readFileSync(path.join(repo,'study-note','study-note.html'),'utf8');
test('R5 server source snapshot matches verified v21 immutable SHA and has both API handlers',()=>{
 const a=scanner.audit(version21);
 assert.equal(a.sha256,'e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f');
 assert.equal(a.bytes,171107);
 assert.equal(a.functions,149);
 assert.equal(a.checks.appsScriptBackend,true);
 assert.equal(a.pass,true,JSON.stringify(a.findings));
 assert.equal(a.publicationAuthorized,false,'heuristics alone never authorize release');
});
test('R5 exact upstream source hash and all 18 gitlink SHA values pinned',()=>{
 assert.equal(r3.mupdf.commit,'20061bd45183f5a2bff8f43675e4da91e5ac2901');
 assert.equal(r3.mupdf.submodules.length,18);
 assert(r3.mupdf.submodules.every(x=>/^[a-f0-9]{40}$/.test(x.commit)));
 assert(script.includes('git clone --depth 1 --branch 1.28.1 https://github.com/ArtifexSoftware/mupdf.git'));
 assert(script.includes('git -C "$SOURCE" submodule update --init --recursive'));
 assert(script.includes("R5_CORE_AND_18_THIRDPARTY_REVISIONS_MATCH"));
});
test('R5 npm resolution is locked to exact mupdf@1.28.1 platform WASM build project',()=>{
 assert.equal(lock.name,'mupdf');
 assert.equal(lock.version,'1.28.1');
 const deps=lock.packages[''].devDependencies;
 for(const name of ['@types/node','http-server','terser','typescript'])assert(deps[name],name);
 assert(script.includes('npm ci --ignore-scripts --no-audit --no-fund'));
 assert(script.includes('npm run prepack'));
 assert(script.includes("grep -q '4.0.8'"));
 assert(script.includes("export FEATURES='brotli=no mujs=no extract=no xps=no svg=no'"));
 assert(!script.includes('svg=no html=no'),'R5 must not retain the extra R3 html=no feature exclusion');
});
test('R5 application rights notice and server source are published as candidates, not secret configuration',()=>{
 const docs=fs.readFileSync(path.join(r5,'source','APPLICATION-LICENSE-SCOPE.md'),'utf8');
 const offer=fs.readFileSync(path.join(r5,'source','R5-CORRESPONDING-SOURCE-ACCESS.md'),'utf8');
 assert.match(docs,/AGPL-3.0-or-later/);
 assert.match(docs,/Script Properties/);
 assert.match(offer,/Code.js/);
 assert.match(offer,/18 third-party|18 third-party|18 third|18개|18 third|18 gitlinked/i);
 assert.match(offer,/REVIEW CANDIDATE/);
 assert.match(offer,/VERIFIED_RELEASE_COMMIT_SHA/);
 assert.equal(status.gate,'BLOCKED_PENDING_ARTIFEX_LEGAL_REVIEW');
 assert.equal(status.publicMuPdfBinaryDistributionAllowed,false);
});
test('R5 never alters production app PDF/annotation behavior while license remains unresolved',()=>{
 assert.match(html,/const ANNOTATION_SCHEMA_VERSION = 3;/);
 assert.match(html,/coordinateSpace: 'normalized-0-1'/);
 assert.match(html,/M4_REFERENCE_DEV_ENABLED = \/\^http:/);
 assert.match(html,/get\('m4-local'\) === '1'/);
 assert.match(html,/M5_ATTACHMENT_DEV_ENABLED/);
});
test('R5 source packaging excludes user binaries and CI has no deployment/artifact upload',()=>{
 const ignore=fs.readFileSync(path.join(repo,'.gitignore'),'utf8');
 const workflow=fs.readFileSync(path.join(repo,'.github','workflows','mupdf-r5-agpl-source.yml'),'utf8');
 assert.match(ignore,/\*\*\/\.r5-private\//);
 assert.match(workflow,/c-to-wasm-build/);
 assert.match(workflow,/persist-credentials: false/);
 assert(!/^\s*-\s+uses:\s+actions\/upload-artifact/m.test(workflow));
 assert(!/^\s*-\s+uses:\s+actions\/deploy-pages/m.test(workflow));
 assert(!/^\s*-\s+run:\s+(?:clasp|gh\s+release)/m.test(workflow));
 assert(fs.existsSync(path.join(migration,'r4','licenses','AGPL-3.0.txt')));
});
test('R5 relative license and source manifest pointers resolve from the published source folder',()=>{
 const source=path.join(r5,'source');
 for(const relative of ['../../r4/licenses/AGPL-3.0.txt','../../r3/r3-draft-source-manifest.json',
  '../../m2/THIRD-PARTY-NOTICES.md','../../r4/R4-THIRD-PARTY-NOTICES-DRAFT.md']){
  assert.equal(fs.existsSync(path.resolve(source,relative)),true,relative);
 }
});
test('R5 source scanner rejects synthetic credentials without exposing values',()=>{
 const tmpDir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'r5-audit-fixture-'));
 const file=path.join(tmpDir,'test.js');
 try{
  fs.writeFileSync(file,'function doGet(){}; function doPost(){}; getScriptProperties(); referencePdfContent; ownerSub; claimMutationRequest_; const hmacSecret="TESTSECRET123456";\n');
  const result=scanner.audit(file);
  assert.equal(result.pass,false);
  assert(result.findings.some(x=>x.type==='EXPLICIT_PASSWORD_LITERAL'));
  assert(!JSON.stringify(result).includes('TESTSECRET'));
 }finally{fs.rmSync(tmpDir,{recursive:true,force:true});}
});
