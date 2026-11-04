import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const here=path.dirname(fileURLToPath(import.meta.url));
const r4=path.resolve(here,'..'),migration=path.resolve(r4,'..'),repo=path.resolve(r4,'../../..');
const notice=require('../r4-license-notice.js');
const gate=require('../r4-release-readiness.cjs');
const {catalog}=require('../r4-source-catalog.cjs');
const state=JSON.parse(fs.readFileSync(path.join(r4,'r4-approval-state.json'),'utf8'));
const m2=JSON.parse(fs.readFileSync(path.join(migration,'m2','m2-publication-gate.json'),'utf8'));
const html=fs.readFileSync(path.join(repo,'study-note','study-note.html'),'utf8');
function fakeDocument(){
 const body={children:[],appendChild(x){this.children.push(x);return x;}};
 return {body,createElement(tag){return {tagName:tag,children:[],
   style:{},attributes:{},appendChild(x){this.children.push(x);return x;},
   setAttribute(k,v){this.attributes[k]=v;}}},
   getElementById:id=>body.children.find(x=>x.id===id)||null};
}
test('R4 verified npm AGPL license text copied exactly (no modifications)',()=>{
 const lock=JSON.parse(fs.readFileSync(path.join(migration,'m2','m2-asset-lock.json'),'utf8'));
 const expected=lock.files.find(f=>f.name==='LICENSE');
 const bytes=fs.readFileSync(path.join(r4,'licenses','AGPL-3.0.txt'));
 assert.equal(bytes.length,expected.size);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expected.sha256);
});
test('R4 local-only notice rejects all non-loopback and missing opt-in URLs',()=>{
 for(const url of ['https://aliasel0817.github.io/Pe-Exam-Search/study-note.html?m4-local=1',
   'http://127.0.0.1:9000/study-note.html',
   'http://localhost:9000/study-note.html?m5-local=1',
   'file:///index.html?m4-local=1'])
   assert.equal(notice.isPrivateLoopback(url),false,url);
 assert.equal(notice.isPrivateLoopback('http://127.0.0.1:9000/study-note.html?m4-local=1'),true);
 assert.equal(notice.isPrivateLoopback('http://localhost:9000/study-note.html?m4-local=1'),true);
 assert.match(html,/M4_REFERENCE_DEV_ENABLED = \/\^http:/);
 assert.match(html,/R4_LICENSE_NOTICE_PRIVATE_START/);
});
test('R4 has no false source link without legal and release approvals',()=>{
 const none=notice.model({approved:false,gate:'BLOCKED',sourceUrl:'https://example.org/sources.tar.gz'});
 assert.equal(none.sourceOffer,null);
 assert.match(none.sourceStatus,/보류/);
 for(const u of ['javascript:alert(1)','http://example.org/sources','https://name:pass@example.org/sources'])
   assert.equal(notice.safeSourceOffer({approved:true,gate:'OPEN',sourceUrl:u}),null);
 const doc=fakeDocument();
 const mounted=notice.mount(doc,{approved:false,gate:'BLOCKED'});
 assert.equal(mounted.tagName,'details');
 assert.equal(doc.body.children.length,1);
 assert.equal(mounted.children.some(n=>n.id==='r4-source-offer-link'),false);
 assert.equal(notice.mount(doc,{approved:false,gate:'BLOCKED'}),mounted);
});
test('R4 keeps M2 release gate closed; readiness is NO-GO even with fake approvals',()=>{
 const result=gate.audit();
 assert(Object.values(result.markers).every(Boolean),JSON.stringify(result.markers));
 assert.equal(result.decision,'NO_GO_R4_PRELAUNCH_NO_DEPLOY');
 assert.equal(result.releasePermitted,false);
 assert.equal(result.publicBinaryDistributionPermitted,false);
 assert(result.blockers.includes('LICENSE_RIGHTS_AND_SOURCE_OFFER'));
 assert.equal(m2.publicMuPdfBinaryDistributionAllowed,false);
 assert.equal(state.licenseChoice,'UNDECIDED');
});
test('R4 catalogue describes files only and never asserts complete source rights',()=>{
 const result=catalog(repo);
 assert(result.entryCount>175);
 assert.equal(result.sourceOfferPubliclyAccessible,false);
 assert.equal(result.appsScriptLiveCodeIncluded,false);
 assert.equal(result.mupdfCoreCSourceIncluded,false);
 assert.equal(result.isCompleteCorrespondingSource,false);
 assert(!result.entries.some(x=>(x.path.endsWith('.wasm')&&
   x.path!=='study-note/vendor/mupdf/1.28.1/mupdf-wasm.wasm')||x.path.includes('.r4-private/')));
 assert(result.categories.FRONTEND_INTEGRATION_SOURCE===1);
});
test('R4 notices preserve original annotations and backend/Service Worker without changes',()=>{
 assert.match(html,/const ANNOTATION_SCHEMA_VERSION = 3;/);
 assert.match(html,/coordinateSpace: 'normalized-0-1'/);
 assert.match(html,/buildSignedGetUrl\(getApiUrl\(\), 'referencePdfContent'/);
 assert.match(html,/M4_REFERENCE_DEV_ENABLED/);
 assert.equal(fs.existsSync(path.join(repo,'study-note','mupdf-migration','r4','R4-THIRD-PARTY-NOTICES-DRAFT.md')),true);
});
test('R4 corrected legal standard distinguishes reproducible source from identical hash',()=>{
 const a=fs.readFileSync(path.join(r4,'R4-AGPL-LEGAL-ASSESSMENT-20261104.md'),'utf8');
 assert.match(a,/SHA-256 완전 동일성/);
 assert.match(a,/완전한 소스/);
 assert.equal(state.build.byteIdentityRequiredByLicense,false);
 assert.equal(state.build.actualLinuxBuildCompleted,false);
 assert.equal(state.legal.commercialContractSigned,false);
});
