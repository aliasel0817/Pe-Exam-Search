'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createGateway, validateSettings} = require('./server.cjs');
const permitted = 'ko-KR-Chirp3-HD-Aoede/T0001/concept-123456789abc.mp3';
const origin = 'https://aliasel0817.github.io';
const token = 'a'.repeat(100);
const entries = { 'T0001:concept:ko-KR-Chirp3-HD-Aoede':
  {file:permitted,sha256:'0'.repeat(64),speechSha256:'1'.repeat(64)} };
const audioUrl = 'https://storage.googleapis.com/private-bucket/study-note/tts/audio/' + permitted +
  '?X-Goog-Signature=example&X-Goog-Expires=300';
async function setup(overrides = {}) {
  let signCalls = 0;
  const app = createGateway({
    allowedOrigin:origin,
    verifyToken:async t => t===token ? 'owner@example.com' : null,
    getManifest:async()=>({schemaVersion:1,entries}),
    signReadUrl:async()=>{signCalls++;return audioUrl;},
    ...overrides
  });
  const server = http.createServer((req,res)=>{app(req,res).catch(()=>res.end('{"error":"caught"}'));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:'+server.address().port;
  return {
    close:()=>new Promise(resolve=>server.close(resolve)),
    calls:()=>signCalls,
    request:async(path, headers={}, method='GET')=>{
      const response = await fetch(base+path,{method,headers});
      return {status:response.status,body:response.status===204?{}:await response.json(),
        origin:response.headers.get('access-control-allow-origin')};
    }
  };
}
test('production config requires explicit private bucket, Google client ID and owner',()=>{
  assert.throws(()=>validateSettings({}),/TTS_BUCKET/);
  const conf=validateSettings({TTS_BUCKET:'study-audio-123',
    GOOGLE_WEB_CLIENT_ID:'123456789-abc.apps.googleusercontent.com',
    ALLOWED_GOOGLE_EMAILS:'owner@example.com'});
  assert.equal(conf.allowedOrigin,origin);
  assert.ok(conf.emails.has('owner@example.com'));
  assert.throws(()=>validateSettings({TTS_BUCKET:'bucket-x',
    GOOGLE_WEB_CLIENT_ID:'123-abc.apps.googleusercontent.com',
    ALLOWED_GOOGLE_EMAILS:'user@example.com',TTS_ALLOWED_ORIGIN:'https://evil.example'}),/TTS_ALLOWED_ORIGIN/);
});
test('no token, invalid token and other origin cannot read private manifest',async()=>{
  const a=await setup();
  try {
    assert.equal((await a.request('/v1/manifest',{Origin:origin})).status,401);
    assert.equal((await a.request('/v1/manifest',{Origin:origin,Authorization:'Bearer '+('b'.repeat(100))})).status,403);
    assert.equal((await a.request('/v1/manifest',{Origin:'https://evil.example',Authorization:'Bearer '+token})).status,403);
    assert.equal((await a.request('/v1/manifest',{Origin:origin},'POST')).status,405);
    assert.equal(a.calls(),0);
  } finally {await a.close();}
});
test('verified owner can read manifest and only listed MP3 gets signed URL',async()=>{
  const a=await setup();
  try {
    const headers={Origin:origin,Authorization:'Bearer '+token};
    const m=await a.request('/v1/manifest',headers);
    assert.equal(m.status,200);
    assert.equal(m.origin,origin);
    assert.equal(m.body.entries['T0001:concept:ko-KR-Chirp3-HD-Aoede'].file,permitted);
    const q=await a.request('/v1/audio-url?file='+encodeURIComponent(permitted),headers);
    assert.equal(q.status,200);
    assert.equal(q.body.url,audioUrl);
    assert.equal(q.body.expiresInSeconds,300);
    assert.equal(a.calls(),1);
    assert.equal((await a.request('/v1/audio-url?file='+encodeURIComponent(
      'ko-KR-Chirp3-HD-Aoede/T9999/concept-123456789abc.mp3'),headers)).status,404);
    assert.equal((await a.request('/v1/audio-url?file='+encodeURIComponent('../../key.json'),headers)).status,400);
    assert.equal(a.calls(),1);
  } finally {await a.close();}
});
test('preflight allowed only for approved origin; no token body or billing endpoint',async()=>{
  const a=await setup();
  try {
    const ok=await a.request('/v1/audio-url',{Origin:origin},'OPTIONS');
    assert.equal(ok.status,204);
    assert.equal(ok.origin,origin);
    const bad=await a.request('/v1/audio-url',{Origin:'https://untrusted.example'},'OPTIONS');
    assert.equal(bad.status,403);
    assert.equal(bad.origin,null);
    assert.equal((await a.request('/v1/synthesize',{Origin:origin,Authorization:'Bearer '+token})).status,404);
  } finally {await a.close();}
});
test('audio signing must be Google Cloud Storage https endpoint',async()=>{
  const a=await setup({signReadUrl:async()=> 'https://attacker.example/?X-Goog-Signature=abc'});
  try{
    const res=await a.request('/v1/audio-url?file='+encodeURIComponent(permitted),{
      Origin:origin,Authorization:'Bearer '+token});
    assert.equal(res.status,503);
  }finally{await a.close()}
});
