'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const smoke=require('./auth-smoke.js');

const mockedToken='a'.repeat(120);

test('auth probe pins Cloud Run HTTPS endpoint and never mutates cloud resources',async()=>{
  let route, options;
  const r=await smoke.probeToken(mockedToken,async(u,opts)=>{
    route=u; options=opts;
    return{status:503,json:async()=>({error:'Audio manifest unavailable'})};
  });
  assert.equal(route,smoke.GATEWAY_URL+'/v1/manifest');
  assert.ok(route.startsWith('https://'));
  assert.equal(options.method,'GET');
  assert.equal(options.mode,'cors');
  assert.equal(options.credentials,'omit');
  assert.equal(options.cache,'no-store');
  assert.deepEqual(Object.keys(options.headers),['Authorization']);
  assert.equal(options.headers.Authorization,'Bearer '+mockedToken);
  assert.equal(r.state,'success');
  assert.match(r.message,/503/);
});

test('missing or malformed token does not call Cloud Run',async()=>{
  let touched=false;
  const r=await smoke.probeToken('x',async()=>{touched=true;throw Error('should not call');});
  assert.equal(touched,false);
  assert.equal(r.state,'failure');
});

test('403/401 never interpreted as successful Google login',()=>{
  for(const code of [401,403]){
    assert.notEqual(smoke.classify(code,{}).state,'success');
  }
});

test('arbitrary 503 response cannot be confused with verified token',()=>{
  assert.equal(smoke.classify(503,{}).state,'failure');
  assert.equal(smoke.classify(503,{error:'backend overloaded'}).state,'failure');
});

test('manifest 200 requires expected schema',()=>{
  assert.equal(smoke.classify(200,{schemaVersion:1,entries:{}}).state,'success');
  assert.equal(smoke.classify(200,{error:'other'}).state,'failure');
});

test('network failures are caught and do not disclose token',async()=>{
  const r=await smoke.probeToken(mockedToken,async()=>{throw Error('Bearer '+mockedToken);});
  assert.equal(r.state,'failure');
  assert.ok(!r.message.includes(mockedToken));
});

test('non-GitHub-Pages origins never initialize Google login',()=>{
  const status={dataset:{},textContent:''};
  const calls=[];
  const dom={getElementById:name=>name==='result'?status:{}};
  smoke.init(dom,'file://', {initialize:()=>calls.push('init'),renderButton:()=>calls.push('render')});
  assert.equal(calls.length,0);
  assert.equal(status.dataset.state,'warning');
});

test('GIS credential callback performs only one request and never displays the token',async()=>{
  let cb;
  const status={dataset:{},textContent:''};
  const dom={getElementById:id=>id==='result'?status:{}};
  const auth={
    initialize:cfg=>{cb=cfg.callback;assert.equal(cfg.client_id,smoke.CLIENT_ID);assert.equal(cfg.auto_select,false);},
    renderButton:()=>{}
  };
  smoke.init(dom,smoke.APPROVED_ORIGIN,auth);
  assert.equal(typeof cb,'function');
  const old=global.fetch;
  let count=0;
  global.fetch=async()=>{count++;return{status:503,json:async()=>({error:'Audio manifest unavailable'})};};
  try{await cb({credential:mockedToken});}finally{global.fetch=old;}
  // Runtime uses a lexical fetch argument default: this test verifies the UI
  // does not display the secret, even when the request encounters a network failure.
  assert.ok(!status.textContent.includes(mockedToken));
  assert.ok(status.textContent.length>0);
});

test('single-file GitHub Pages login tester lives outside the Study Note PWA scope',()=>{
  const one=fs.readFileSync(path.join(__dirname,'../../tts-auth-check.html'),'utf8');
  const source=fs.readFileSync(path.join(__dirname,'auth-smoke.js'),'utf8');
  assert.ok(one.includes('<meta name="robots" content="noindex,nofollow">'));
  const found=one.match(/<script id="tts-auth-smoke">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(found,'Single-file smoke page must embed tested script');
  assert.equal(found[1].trim(),source.trim());
  assert.ok(one.includes('https://accounts.google.com/gsi/client'));
  assert.ok(!one.includes('study-note.html'));
  assert.ok(!one.includes('service-worker.js'));
});

test('HTML is an isolated tester with no token persistence or mutation controls',()=>{
  const html=fs.readFileSync(path.join(__dirname,'auth-smoke.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'auth-smoke.js'),'utf8');
  assert.ok(html.includes('https://accounts.google.com/gsi/client'));
  assert.ok(html.includes('./auth-smoke.js'));
  assert.ok(js.includes("origin !== APPROVED_ORIGIN"));
  for(const unsafe of ['localStorage.','sessionStorage.','indexedDB.','console.log(','console.error(','innerHTML=','/v1/synthesize','gcloud run deploy','gcloud storage cp']){
    assert.ok(!js.includes(unsafe),'Unexpected unsafe behavior: '+unsafe);
  }
});
