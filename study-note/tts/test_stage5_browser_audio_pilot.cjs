'use strict';
/* No-network browser test of 8 approved fields / 12 pinned Aoede files. */
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const m=require('./stage5_browser_audio_pilot.js');

const sha='1'.repeat(64);
function sampleIndex(){
  const entries={};
  let seq=0;
  for(const pilot of m.PILOTS){
    const files=[];
    for(let i=0;i<pilot.parts;i++){
      seq++;
      files.push(m.VOICE+'/'+pilot.topic+'/'+pilot.field+'-'+
        seq.toString(16).padStart(12,'0')+
        (pilot.parts>1?'-p'+String(i+1).padStart(2,'0'):'')+'.mp3');
    }
    entries[m.entryKey(pilot)]={sha256:sha,speechSha256:sha,
      ...(pilot.parts===1?{file:files[0]}:{files})};
  }
  return {schemaVersion:1,entries};
}
function signedUrl(file){
  return 'https://storage.googleapis.com/'+m.BUCKET+'/study-note/tts/audio/'+file+
    '?X-Goog-Signature=abcdef0123&X-Goog-Expires=300';
}

test('eight exact approved entries and twelve MP3 parts are required',()=>{
  const accepted=m.validateManifest(sampleIndex());
  assert.equal(m.PILOTS.length,8);
  assert.equal(accepted.size,8);
  assert.equal([...accepted.values()].flat().length,12);
  assert.deepEqual(m.PILOTS.map(p=>p.parts),[1,1,1,1,1,2,1,4]);
  assert.equal(m.PILOTS.filter(p=>p.field==='topic').length,5);
});
test('unexpected extra or missing GCS index entry is rejected',()=>{
  const extra=sampleIndex();
  extra.entries['T9999:topic:'+m.VOICE]={sha256:sha,file:'x.mp3'};
  assert.throws(()=>m.validateManifest(extra),/8개 항목/);
  const missing=sampleIndex();
  delete missing.entries[m.entryKey(m.PILOTS[0])];
  assert.throws(()=>m.validateManifest(missing),/8개 항목/);
});
test('wrong title versus body field path is rejected',()=>{
  const index=sampleIndex();
  const key=m.entryKey(m.PILOTS[0]);
  index.entries[key].file=index.entries[key].file.replace('/topic-','/concept-');
  assert.throws(()=>m.validateManifest(index),/경로 또는 분할 순서/);
});
test('duplicate, path traversal, URL and unordered chunk are rejected',()=>{
  const index=sampleIndex();
  const key=m.entryKey(m.PILOTS[5]);
  for(const bad of [
    '../../private.json',
    'https://attacker.example/audio.mp3',
    index.entries[m.entryKey(m.PILOTS[0])].file,
    'ko-KR-Chirp3-HD-Aoede/T2354/components-00000000abcd-p01.mp3',
  ]){
    const copy=structuredClone(index);
    copy.entries[key].files[0]=bad;
    assert.throws(()=>m.validateManifest(copy),/경로 또는 분할 순서/);
  }
  const outOfOrder=structuredClone(index);
  outOfOrder.entries[key].files.reverse();
  assert.throws(()=>m.validateManifest(outOfOrder),/경로 또는 분할 순서/);
});
test('signed URL pinning rejects unapproved GCS origin and expiry',()=>{
  const file=m.validateManifest(sampleIndex()).get(m.entryKey(m.PILOTS[0]))[0];
  assert.equal(m.verifySignedUrl(signedUrl(file),file),signedUrl(file));
  assert.throws(()=>m.verifySignedUrl(signedUrl(file).replace('https:','http:'),file),/서명 주소/);
  assert.throws(()=>m.verifySignedUrl(signedUrl(file).replace(m.BUCKET,'other-bucket'),file),/서명 주소/);
  assert.throws(()=>m.verifySignedUrl(signedUrl(file).replace('Expires=300','Expires=999'),file),/서명 주소/);
});
test('signed audio URL remains private; no user token stored',async()=>{
  const token='T'.repeat(99);
  const captured=[];
  const approved=await m.fetchManifest(token,async (url,opt)=>{
    captured.push({url,opt});
    return {ok:true,status:200,json:async()=>sampleIndex()};
  });
  assert.equal(approved.size,8);
  assert.equal(captured.length,1);
  assert.equal(captured[0].url,m.GATEWAY+'/v1/manifest');
  assert.equal(captured[0].opt.headers.Authorization,'Bearer '+token);
  assert.equal(captured[0].opt.credentials,'omit');
  assert.equal(captured[0].opt.cache,'no-store');
});
test('401, 403 or absent Google ID token fail safely',async()=>{
  for(const code of [401,403]){
    await assert.rejects(m.fetchManifest('X'.repeat(100),async()=>({ok:false,status:code})),
      new RegExp('HTTP '+code));
  }
  await assert.rejects(m.fetchManifest('',async()=>{
    throw Error('No unauthenticated HTTP request allowed');
  }),/토큰/);
});
test('wrong browser origin does not initialize GIS or call Cloud Run',()=>{
  const fields=m.PILOTS.map(p=>({dataset:{pilot:m.entryKey(p)},addEventListener(){},disabled:false}));
  const status={textContent:''};
  const doc={
    getElementById:id=>({
      pilotStatus:status,pilotLogin:{},
      pilotAudio:{pause(){},removeAttribute(){},load(){}},
      pilotStop:{disabled:false,addEventListener(){}},
    })[id],
    querySelectorAll:()=>fields,
  };
  const gis={initialize(){throw Error('unapproved GIS init')},
    renderButton(){throw Error('unapproved GIS button')}};
  m.init(doc,'https://evil.example',gis,async()=>{throw Error('unapproved network')});
  assert.match(status.textContent,/승인된 GitHub Pages/);
  assert.ok(fields.every(p=>p.disabled));
});
test('standalone HTML has all eight buttons and exact pinned script integrity',()=>{
  const html=fs.readFileSync(path.join(__dirname,'stage5_browser_audio_pilot.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'stage5_browser_audio_pilot.js'));
  const sri='sha384-'+crypto.createHash('sha384').update(js).digest('base64');
  assert.equal((html.match(/data-pilot=/g)||[]).length,8);
  assert.match(html,/study-note\/tts\/stage5_browser_audio_pilot\.js/);
  assert.ok(html.includes('integrity="'+sri+'"'),'SRI must match exactly published JS bytes');
  assert.match(html,/crossorigin="anonymous"/);
  assert.match(html,/referrerpolicy="no-referrer"/);
  assert.doesNotMatch(html,/texttospeech\.googleapis\.com/);
});
test('standalone test cannot auto initialize from the old stage4 html route',()=>{
  assert.equal(m.PILOTS.filter(x=>x.field==='topic').length,5);
  const source=fs.readFileSync(path.join(__dirname,'stage5_browser_audio_pilot.js'),'utf8');
  assert.match(source,/\/stage5_browser_audio_pilot\.html/);
  assert.doesNotMatch(source,/peStudyNoteStage4Pilot/);
});
