import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {r3SignedMutationCandidate,R3RegistrationRequiresSeparateReview}
  from '../r3-verified-idempotency-candidate.mjs';
const require=createRequire(import.meta.url);
const {scanTree,scanGitIndex}=require('../r3-source-export-audit.cjs');
const {parseGitlinks,parseSubmoduleStatus}=require('../r3-upstream-provenance.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const m2Gate=JSON.parse(fs.readFileSync(
  path.join(root,'study-note','mupdf-migration','m2','m2-publication-gate.json'),'utf8'));

test('R3 source audit parses exact pinned gitlinks without misreading regular thirdparty files',()=>{
 const sha='a'.repeat(40);
 const links=parseGitlinks('100644 blob '+sha+'\tthirdparty/README\n160000 commit '+sha+'\tthirdparty/jbig2dec');
 assert.deepEqual(links,[{path:'thirdparty/jbig2dec',commit:sha}]);
 const status=parseSubmoduleStatus(' '+sha+' thirdparty/jbig2dec (heads/main)\n-'+sha+' thirdparty/freetype');
 assert.equal(status.get('thirdparty/jbig2dec').marker,' ');
 assert.equal(status.get('thirdparty/freetype').marker,'-');
});

test('R3 source offer candidate scanner excludes private files, binaries and secret assignments',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mupdf-r3-safe-fixture-'));
 try{
  fs.writeFileSync(path.join(temp,'public.example.json'),'{"endpoint":"https://example.invalid"}');
  assert.equal(scanTree(temp).pass,true);
  fs.writeFileSync(path.join(temp,'.env'),'PRIVATE_R3_FAKE_ONLY=true');
  const fakeSecretAssignment=['client','secret'].join('_')+' = "'+'FAKE_'+'DO_NOT_USE_LONG_VALUE"';
  fs.writeFileSync(path.join(temp,'sensitive.txt'),fakeSecretAssignment);
  fs.writeFileSync(path.join(temp,'source.pdf'),Buffer.from('%PDF-1.4\nR3 fake fixture'));
  const result=scanTree(temp);
  assert.equal(result.pass,false);
  assert(result.findings.some(x=>x.rule==='SENSITIVE_FILENAME'));
  assert(result.findings.some(x=>x.rule==='POTENTIAL_SECRET_ASSIGNMENT'));
  assert(result.findings.some(x=>x.rule==='NON_SOURCE_BINARY_OR_MEDIA'));
  const printed=JSON.stringify(result);
  assert(!printed.includes('FAKE_DO_NOT_USE_LONG_VALUE'),'never echo matched secret value');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

function fixture({rejectAuth=false,rejectOwner=false,executeFails=false}={}){
 const cache=new Map(),events=[];
 let queue=Promise.resolve();
 const deps={
  withLock:fn=>{
    const next=queue.then(fn,fn);
    queue=next.then(()=>undefined,()=>undefined);
    return next;
  },
  peek:async(id,key)=>cache.get(id+':'+key)||null,
  verify:async(_envelope,statuses)=>{
   events.push('verify');
   assert.deepEqual(statuses,['ACTIVE']);
   if(rejectAuth)throw Error('REJECTED_SIGNATURE');
   return {auth:{status:'ACTIVE'},data:{testId:'R3-SYNTHETIC'}};
  },
  authorize:async(auth)=>{events.push('authorize');if(rejectOwner||auth.status!=='ACTIVE')throw Error('DENIED_NOT_OWNER');},
  reserve:async(id,key,status)=>{
    events.push('reserve');cache.set(id+':'+key,status);
  },
  execute:async()=>{events.push('execute');if(executeFails)throw Error('FAKE_EXECUTION_ERROR');return {changed:'fixture-only'};},
  finish:async(id,key,status)=>{events.push('finish');cache.set(id+':'+key,status);},
 };
 return {deps,cache,events};
}
const request={action:'saveannotations',requestId:'R3-SYNTHETIC-REQUEST',
  pollKey:'x'.repeat(64),signedPayload:'fake-fixture-only'};
test('R3 untrusted initial mutation cannot poison idempotency cache',async()=>{
 const f=fixture({rejectAuth:true});
 await assert.rejects(r3SignedMutationCandidate(request,f.deps),/REJECTED_SIGNATURE/);
 assert.equal(f.cache.size,0,'invalid signature must not create processing or error status');
 assert.deepEqual(f.events,['verify']);
});
test('R3 owner-only denial does not reserve cache or execute a mutation',async()=>{
 const f=fixture({rejectOwner:true});
 await assert.rejects(r3SignedMutationCandidate(request,f.deps),/DENIED_NOT_OWNER/);
 assert.equal(f.cache.size,0);
 assert.equal(f.events.includes('execute'),false);
});
test('R3 valid mutation reserves exactly once and duplicate uses existing status',async()=>{
 const f=fixture();
 const first=await r3SignedMutationCandidate(request,f.deps);
 assert.equal(first.ok,true);
 const duplicate=await r3SignedMutationCandidate(request,f.deps);
 assert.equal(duplicate.duplicateDelivery,true);
 assert.equal(f.events.filter(x=>x==='verify').length,1);
 assert.equal(f.events.filter(x=>x==='reserve').length,1);
 assert.equal(f.events.filter(x=>x==='execute').length,1);
});
test('R3 concurrent retry does not execute twice under a single lock',async()=>{
 const f=fixture();
 const results=await Promise.all([
  r3SignedMutationCandidate(request,f.deps),
  r3SignedMutationCandidate(request,f.deps),
 ]);
 assert.equal(f.events.filter(x=>x==='verify').length,1);
 assert.equal(f.events.filter(x=>x==='execute').length,1);
 assert(results.some(x=>x.duplicateDelivery===true));
});
test('R3 authenticated execution failure may be cached, not invalid auth failure',async()=>{
 const f=fixture({executeFails:true});
 const result=await r3SignedMutationCandidate(request,f.deps);
 assert.equal(result.state,'error');
 assert.equal(f.cache.size,1);
 assert.equal(result.message,'SIGNED_MUTATION_FAILED');
 assert(!JSON.stringify(result).includes('FAKE_EXECUTION_ERROR'));
});
test('R3 registration is explicitly excluded from unreviewed signed POST candidate',async()=>{
 const f=fixture();
 await assert.rejects(r3SignedMutationCandidate(
   {...request,action:'registerdevice'},f.deps),R3RegistrationRequiresSeparateReview);
 assert.equal(f.cache.size,0);
});
test('R3 enforces unchanged M2 legal block and private source tracking guards',()=>{
 assert.equal(m2Gate.productionDeploymentAllowed,false);
 assert.equal(m2Gate.publicMuPdfBinaryDistributionAllowed,false);
 assert.equal(m2Gate.gate,'BLOCKED_PENDING_ARTIFEX_LEGAL_REVIEW');
 const audit=scanGitIndex(root);
 assert.equal(audit.pass,true);
 assert.equal(audit.blockedPaths.length,0);
});

test('R3 sanitized source manifest covers exact source and never authorizes release',()=>{
 const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const m=JSON.parse(fs.readFileSync(path.join(dir,'r3-draft-source-manifest.json'),'utf8'));
 const notices=JSON.parse(fs.readFileSync(path.join(dir,'r3-thirdparty-notices.draft.json'),'utf8'));
 assert.equal(m.mupdf.commit,'20061bd45183f5a2bff8f43675e4da91e5ac2901');
 assert.equal(m.mupdf.initializedSubmoduleCount,18);
 assert.equal(m.mupdf.npmArtifactMatchingM2Lock,'PASS');
 assert.equal(m.mupdf.actualWasmRebuildCompleted,false);
 assert.equal(m.deployAllowed,false);
 assert.equal(m.publicBinaryReleaseAllowed,false);
 assert.equal(notices.modules.length,18);
 assert.equal(notices.sourceOfferApproved,false);
 assert(notices.modules.every(x=>x.manualLegalReviewRequired));
});
test('R3 build comparator cannot label absent WASM output reproducible',()=>{
 const compare=require('../r3-compare-built.cjs').compareDist;
 const r=compare(path.join(os.tmpdir(),'nonexistent-R3-private-dist-folder'));
 assert.equal(r.status,'NO_BUILD_OUTPUT');
 assert.equal(r.publicReleasePermitted,false);
});
