import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const migration=path.resolve(here,'../..');
const html=fs.readFileSync(path.resolve(migration,'../study-note.html'),'utf8');
const start=html.indexOf('async function fetchReferencePdfBytesFromServer(');
const end=html.indexOf('\nasync function repaintReferencePdfAtZoom(',start);
assert(start>0&&end>start,'Real study-note signed GET implementation required');
const source=html.slice(start,end);
const documentData=Buffer.from('%PDF-1.4\nR2 isolated fixture - no user PDF');
const basePayload=Object.freeze({
  ok:true,sourceType:'서브노트',pageToken:'MG:187',mime:'application/pdf',
  base64:documentData.toString('base64'),size:documentData.length,
});
function isolated(overrides={}){
  const calls=[];
  const context={
    referencePdfBackendSourceReady:true,hasActiveSecuritySession:()=>true,
    activeReferencePdfSourceType:'서브노트',
    MAX_REFERENCE_PAGE_BYTES:10*1024*1024,
    clean:value=>String(value??'').trim(),getApiUrl:()=> 'https://synthetic.invalid/exec',
    buildSignedGetUrl:async()=> 'https://synthetic.invalid/exec?signed=R2-FAKE',
    base64ToUint8Array:value=>Uint8Array.from(Buffer.from(value,'base64')),
    DOMException,
    fetch:async(url,opts)=>{
      calls.push({url,opts});
      return {ok:true,json:async()=>structuredClone(basePayload)};
    },
    ...overrides,
  };
  const fn=vm.runInNewContext('('+source+')',context,{filename:'study-note.html:fetchReferencePdfBytesFromServer'});
  return {fn,calls,context};
}
const page=Object.freeze({sourceType:'서브노트',pageToken:'MG:187'});

test('R2 authenticated PDF GET preserves signed action, no-store and no-referrer',async()=>{
  const h=isolated(), controller=new AbortController();
  const result=await h.fn(page,{signal:controller.signal});
  assert.equal(Buffer.from(result).toString(),documentData.toString());
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].opts.method,'GET');
  assert.equal(h.calls[0].opts.cache,'no-store');
  assert.equal(h.calls[0].opts.referrerPolicy,'no-referrer');
  assert.equal(h.calls[0].opts.signal,controller.signal);
  assert.match(h.calls[0].url,/R2-FAKE/);
});

test('R2 cancels superseded request while signing, before fetch',async()=>{
  let finishSigning;
  const signing=new Promise(resolve=>{finishSigning=resolve;});
  const h=isolated({buildSignedGetUrl:()=>signing});
  const controller=new AbortController();
  const request=h.fn(page,{signal:controller.signal});
  controller.abort();
  finishSigning('https://synthetic.invalid/exec?signed=R2-FAKE');
  await assert.rejects(request,e=>e?.name==='AbortError');
  assert.equal(h.calls.length,0);
});

test('R2 can abort an in-flight fetch without consuming PDF payload',async()=>{
  let fetchStarted;
  const started=new Promise(resolve=>{fetchStarted=resolve;});
  const h=isolated({fetch:(_url,{signal})=>{
    fetchStarted();
    return new Promise((_resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});
    });
  }});
  const controller=new AbortController();
  const request=h.fn(page,{signal:controller.signal});
  await started;
  controller.abort();
  await assert.rejects(request,e=>e?.name==='AbortError');
});

test('R2 rejects mismatched page metadata and mislabeled PDF bytes',async()=>{
  const mismatch=isolated({fetch:async()=>({ok:true,json:async()=>({...basePayload,pageToken:'MG:188'})})});
  await assert.rejects(mismatch.fn(page),/일치하지/);
  const wrongPdf=isolated({fetch:async()=>({ok:true,json:async()=>({
    ...basePayload,base64:Buffer.from('NOT A PDF CONTENT').toString('base64'),size:17,
  })})});
  await assert.rejects(wrongPdf.fn(page),/헤더/);
});

test('R2 never bypasses ACTIVE session gate or the registered source selector',async()=>{
  const h=isolated({hasActiveSecuritySession:()=>false});
  await assert.rejects(h.fn(page),/신뢰기기/);
  assert.equal(h.calls.length,0);
  const invalid=isolated();
  await assert.rejects(invalid.fn({sourceType:'unknown',pageToken:'MG:187'}),/올바르지/);
  assert.equal(invalid.calls.length,0);
});

test('R2 abort controller is canceled on page reset and shared by both renderer paths',()=>{
  const reset=html.slice(html.indexOf('function resetReferencePdfHighQualityRenderer()'),
    html.indexOf('function setReferencePdfSourceStatus('));
  const legacy=html.slice(html.indexOf('async function loadReferencePdfHighQuality('),
    html.indexOf('// M4 non-production integration.'));
  const m4=html.slice(html.indexOf('async function m4LoadReferencePdfHighQuality('),
    html.indexOf('async function m4RepaintReferencePdf('));
  assert.match(reset,/referencePdfSourceAbort\?\.abort\(\)/);
  for(const part of [legacy,m4]){
    assert.match(part,/referencePdfSourceAbort\?\.abort\(\)/);
    assert.match(part,/new AbortController\(\)/);
    assert.match(part,/fetchReferencePdfBytesFromServer\(page,\s*\{signal: sourceAbort\.signal\}\)/);
    assert.match(part,/sourceAbort\.signal\.aborted/);
  }
});

test('R2 retains schema 3, normalized annotation keys, signed GET and backend release block',()=>{
  assert.match(html,/const ANNOTATION_SCHEMA_VERSION = 3;/);
  assert.match(html,/coordinateSpace: 'normalized-0-1'/);
  assert.match(html,/buildSignedGetUrl\(getApiUrl\(\), 'referencePdfContent'/);
  assert.match(html,/async function fetchMediaContent\(apiUrl, attachmentId/);
  const guard=JSON.parse(fs.readFileSync(path.join(migration,'m2','m2-publication-gate.json'),'utf8'));
  assert.equal(guard.productionDeploymentAllowed,false);
  assert.equal(guard.publicMuPdfBinaryDistributionAllowed,false);
});
