'use strict';
/* Offline tests for Stage-4 browser pilot; no real network, credentials or MP3. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const m = require('./stage4_browser_audio_pilot.js');
const sha = '0'.repeat(64);

function sample() {
  const entries = {};
  for (const p of m.PILOTS) {
    const files = Array.from({length:p.parts}, (_,i) =>
      m.VOICE + '/' + p.topic + '/' + p.field + '-123456789abc' +
      (p.parts > 1 ? '-p' + String(i+1).padStart(2,'0') : '') + '.mp3');
    entries[m.entryKey(p)] = {
      sha256:sha,
      ...(files.length === 1 ? {file: files[0]} : {files})
    };
  }
  return {schemaVersion:1,entries};
}
function signed(file, host='storage.googleapis.com') {
  const path = host === 'storage.googleapis.com' ?
    '/'+m.BUCKET+'/study-note/tts/audio/'+file :
    '/study-note/tts/audio/'+file;
  return 'https://' + host + path +
    '?X-Goog-Signature=abcdef0123&X-Goog-Expires=300';
}
test('exactly the three approved fields and seven MP3 parts are recognized',()=>{
  const rows=m.validateManifest(sample());
  assert.equal(rows.size,3);
  assert.equal(Array.from(rows.values()).flat().length,7);
  assert.deepEqual(m.PILOTS.map(x=>x.parts),[1,2,4]);
});
test('missing field or wrong chunk count is blocked before network',()=>{
  const a=sample();
  delete a.entries[m.entryKey(m.PILOTS[0])];
  assert.throws(()=>m.validateManifest(a),/누락/);
  const b=sample();
  b.entries[m.entryKey(m.PILOTS[2])].files.pop();
  assert.throws(()=>m.validateManifest(b),/분할 MP3/);
});
test('path traversal, field swap, duplicate and unordered chunks rejected',()=>{
  const key=m.entryKey(m.PILOTS[1]);
  const original=sample();
  for (const filename of ['../../secret.json','https://attacker.example/evil.mp3',
    m.VOICE+'/T2176/topic-123456789abc.mp3',
    m.VOICE+'/T2354/components-123456789abc-p01.mp3']) {
    const copy=structuredClone(original);
    copy.entries[key].files[0]=filename;
    assert.throws(()=>m.validateManifest(copy),/경로 또는 분할 순서/);
  }
  const outOfOrder=structuredClone(original);
  outOfOrder.entries[key].files.reverse();
  assert.throws(()=>m.validateManifest(outOfOrder),/경로 또는 분할 순서/);
});
test('signed read link must be the exact private bucket and object path',()=>{
  const file=m.validateManifest(sample()).get(m.entryKey(m.PILOTS[0]))[0];
  assert.equal(m.verifySignedUrl(signed(file),file),signed(file));
  const virtual=m.BUCKET+'.storage.googleapis.com';
  assert.equal(m.verifySignedUrl(signed(file,virtual),file),signed(file,virtual));
  for (const unsafe of [
    signed(file,'evil.example'),
    signed(file).replace('https:','http:'),
    signed(file).replace(m.BUCKET,'public-bucket'),
    signed(file).replace('X-Goog-Signature=abcdef0123','X-Goog-Signature=not-a-hex'),
    signed(file).replace('X-Goog-Expires=300','X-Goog-Expires=999')
  ]) {
    assert.throws(()=>m.verifySignedUrl(unsafe,file),/서명 주소/);
  }
});
test('manifest request uses in-memory bearer token, never persistent credentials',async()=>{
  const mockToken='a'.repeat(100);
  const received=[];
  const answer=await m.fetchManifest(mockToken,async (url,options)=>{
    received.push({url,options});
    return {ok:true,status:200,json:async()=>sample()};
  });
  assert.equal(answer.size,3);
  assert.equal(received.length,1);
  assert.equal(received[0].url,m.GATEWAY+'/v1/manifest');
  assert.equal(received[0].options.headers.Authorization,'Bearer '+mockToken);
  assert.equal(received[0].options.credentials,'omit');
  assert.equal(received[0].options.cache,'no-store');
  assert.equal(received[0].options.method,'GET');
});
test('expired ID token gives controlled failure without exposing token',async()=>{
  const secret='q'.repeat(100);
  await assert.rejects(
    m.fetchManifest(secret,async()=>({ok:false,status:403})),
    error=>error.message.includes('403') && !error.message.includes(secret)
  );
});
test('missing ID token stops before any cloud request',async()=>{
  await assert.rejects(m.fetchManifest('',async()=>{throw Error('should not fetch')}),/토큰/);
});
test('pilot refuses unapproved origin without Google initialize',()=>{
  const fields=m.PILOTS.map(p=>({dataset:{pilot:m.entryKey(p)},disabled:false,addEventListener(){}}));
  const status={textContent:''};
  const doc={
    getElementById:id=>({
      pilotStatus:status,pilotLogin:{},
      pilotAudio:{pause(){},removeAttribute(){},load(){}},
      pilotStop:{disabled:false,addEventListener(){}}
    })[id],
    querySelectorAll:()=>fields
  };
  const google={initialize(){throw Error('unexpected login')},renderButton(){throw Error('unexpected login')}};
  m.init(doc,'https://evil.example',google,async()=>{throw Error('unexpected request')});
  assert.match(status.textContent,/승인된 GitHub Pages/);
  assert.ok(fields.every(x=>x.disabled));
});
test('HTML is a standalone test that does not change the production PWA',()=>{
  const html=fs.readFileSync(path.join(__dirname,'stage4_browser_audio_pilot.html'),'utf8');
  assert.match(html,/stage4_browser_audio_pilot\.js/);
  assert.equal((html.match(/data-pilot=/g)||[]).length,3);
  assert.doesNotMatch(html,/study-note\.html|texttospeech\.googleapis\.com/);
});

test('pilot rejects any unapproved extra manifest entry',()=>{
  const index=sample();
  index.entries['T9999:topic:'+m.VOICE]={sha256:sha,file:'unsafe.mp3'};
  assert.throws(()=>m.validateManifest(index),/3개 항목/);
});
test('signed link refuses invalid expiry, alternate port and fragments',()=>{
  const file=m.validateManifest(sample()).get(m.entryKey(m.PILOTS[0]))[0];
  for (const bad of [
    signed(file).replace('X-Goog-Expires=300','X-Goog-Expires=nan'),
    signed(file).replace('X-Goog-Expires=300','X-Goog-Expires=0'),
    signed(file).replace('X-Goog-Expires=300','X-Goog-Expires=-1'),
    signed(file).replace('X-Goog-Expires=300','X-Goog-Expires=301'),
    signed(file).replace('storage.googleapis.com','storage.googleapis.com:9443'),
    signed(file)+'#fragment'
  ]) {
    assert.throws(()=>m.verifySignedUrl(bad,file),/서명 주소/);
  }
});
