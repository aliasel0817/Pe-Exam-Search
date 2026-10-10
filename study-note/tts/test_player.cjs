"use strict";
/* Controller-level tests with fake DOM/audio/network; no browser TTS or paid API. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "natural-tts.js"), "utf8");
const voice = "ko-KR-Chirp3-HD-Aoede";
const originalTopics = [
  { topicId:"T0001", topicName:"정규화", concept:"데이터 중복을 최소화하는 과정",
    background:"", necessity:"", features:"", technicalComponents:"", keywords:"", studyTarget:"Y" },
  { topicId:"T0002", topicName:"트리 탐색", concept:"트리 구조를 탐색하는 방법",
    background:"", necessity:"", features:"", technicalComponents:"", keywords:"", studyTarget:"Y" }
];
const sha = text => crypto.createHash("sha256").update(text, "utf8").digest("hex");

function makeEnvironment({stopAtSegment=false, includeSecond=true, multipart=false,
  multipartCount=2, privateCloud=false, badSignedHost=false, badSignedPath=false,
  badSignedExpiry=false, cloudDisabled=false}={}) {
  let currentId = "T0001";
  let played = 0;
  let paused = 0;
  const selected = ["T0001", "T0002"];
  const topics = structuredClone(originalTopics);
  const data = new Map(topics.map(x=>[x.topicId,x]));
  const elements = new Map();
  const generatedDownloads = [];

  function element(id) {
    if (!elements.has(id)) {
      const listeners = new Map();
      const classes = new Set();
      const e = {
        id, value:"", textContent:"", checked:true, attrs:{}, dataset:{},
        listeners, children:[], href:"", download:"",
        classList:{
          contains:key=>classes.has(key), add:key=>classes.add(key),
          remove:key=>classes.delete(key), toggle:key=>{
            if(classes.has(key)) {classes.delete(key);return false;}
            classes.add(key);return true;
          }
        },
        addEventListener(name, callback) {
          if (!listeners.has(name)) listeners.set(name,[]);
          listeners.get(name).push(callback);
        },
        removeEventListener(name,callback) {
          listeners.set(name,(listeners.get(name)||[]).filter(f=>f!==callback));
        },
        setAttribute(k,v){this.attrs[k]=String(v)},
        closest(){return this},
        scrollIntoView(){},
        remove(){},
        click(){generatedDownloads.push({href:this.href,download:this.download})},
        dispatch(name,...args){for(const fn of listeners.get(name)||[])fn(...args)}
      };
      elements.set(id,e);
    }
    return elements.get(id);
  }
  const required = [
    "ttsToggleBtn","ttsSettingsBtn","ttsSettingsPanel","ttsStatus","ttsSelectAll",
    "ttsSelectNone","ttsExportBtn","ttsCloudLogin","ttsCloudStatus","ttsCloudCheckBtn",
    "ttsAvailabilityBtn","ttsAvailabilityStatus","detailTitle","detailConcept",
    "detailBackground","detailNecessity","detailFeatures",
    "detailTechnicalComponents","detailKeywords",
    ...["voice","rate","mode","repeat","gap"].map(x=>"ttsOption-"+x),
    ...["concept","background","necessity","features","components","keywords"].map(x=>"ttsField-"+x)
  ];
  required.forEach(element);

  const manifest={schemaVersion:1,entries:{}};
  for(const topic of topics){
    for(const [key,prop] of [["topic","topicName"],["concept","concept"]]){
      if(!includeSecond && topic.topicId==="T0002")continue;
      const original=topic[prop];
      const filename=voice+"/"+topic.topicId+"/"+key+"-"+sha(original).slice(0,12)+".mp3";
      const entry={
        sha256:sha(original),
        file:filename
      };
      if(multipart && topic.topicId==="T0001" && key==="concept"){
        entry.files=Array.from({length:multipartCount},(_,i)=>
          filename.replace(".mp3","-p"+String(i+1).padStart(2,"0")+".mp3"));
        delete entry.file;
      }
      manifest.entries[topic.topicId+":"+key+":"+voice]=entry;
    }
  }
  let bytesRequested=0;
  let manifestRequests=0;
  let signedRequests=0;
  let googleCallback=null;
  class MockAudio {
    constructor() {this.listeners=new Map(); this.src="";this.preload="";this.playbackRate=1;}
    setAttribute(){}
    removeAttribute(){}
    load(){}
    addEventListener(name,fn){
      if(!this.listeners.has(name))this.listeners.set(name,new Set());
      this.listeners.get(name).add(fn);
    }
    removeEventListener(name,fn){this.listeners.get(name)?.delete(fn)}
    pause(){paused++}
    play(){
      played++;
      if(!stopAtSegment){
        setImmediate(()=>{for(const f of this.listeners.get("ended")||[])f()});
      }
      return Promise.resolve();
    }
  }
  class FakeURL extends URL {}
  FakeURL.createObjectURL=(obj)=>{
    if(obj.type==="application/json"){
      generatedDownloads.push({bytes:obj.size});
    }
    return "blob:fake"+(Math.random()*100000);
  };
  FakeURL.revokeObjectURL=()=>{};
  const storage=new Map();
  const doc={
    currentScript:{src:"https://example.com/study-note/tts/natural-tts.js"},
    readyState:"complete",
    visibilityState:"visible",
    getElementById:id=>elements.get(id)||null,
    createElement:id=>element("created-"+id),
    body:{appendChild(){}}
  };
  const sandbox={
    document:doc,
    window:{
      PE_TTS_LOCAL_PREVIEW:!privateCloud,
      google:{accounts:{id:{
        initialize:settings=>{googleCallback=settings.callback;},
        renderButton:()=>{}
      }}},
      peStudyNoteTtsBridge:{
        currentTopic:()=>data.get(currentId),
        getTopicById:id=>data.get(id),
        filteredTopicIds:()=>selected.slice(),
        selectTopic:id=>{
          currentId=id;
          sandbox.window.peStudyNoteTTS?.onTopicChanged(id);
        }
      }
    },
    location:{href:privateCloud?"https://example.com/study-note/study-note.html":"https://example.com/study-note/tts/preview.html"},
    crypto:crypto.webcrypto,TextEncoder, Audio:MockAudio,
    URL:FakeURL, Blob,console,
    setTimeout,clearTimeout,setImmediate,
    localStorage:{
      getItem:key=>storage.get(key)||null,
      setItem:(key,val)=>storage.set(key,String(val))
    },
    fetch:async (url,options={})=>{
      const name = String(url);
      if (name.endsWith("/cloud-config.json")) {
        return {ok:true,status:200,json:async()=>cloudDisabled
          ? {schemaVersion:1,mode:"disabled"} : {
          schemaVersion:1,mode:"gcs-private",
          gatewayUrl:"https://gateway.a.run.app",
          oauthClientId:"1234567-a.apps.googleusercontent.com"
        }};
      }
      if (name.endsWith("/index.json") || name.endsWith("/v1/manifest")) {
        if (privateCloud && name.endsWith("/v1/manifest")) {
          assert.equal(options.headers.Authorization,"Bearer mock-google-id-token");
        }
        manifestRequests++;
        return {ok:true,status:200,json:async()=>manifest,clone(){return this}};
      }
      if (name.includes("/v1/audio-url?file=")) {
        assert.equal(options.headers.Authorization,"Bearer mock-google-id-token");
        signedRequests++;
        const file = decodeURIComponent(name.split("?file=")[1]);
        const bucket="study-note-tts-audio-558407087449";
        const fixedObject=badSignedPath ? file.replace("/T0001/", "/T9999/") : file;
        const expiry=badSignedExpiry ? 999 : 300;
        const url = badSignedHost
          ? "https://not-gcs.example/audio?X-Goog-Signature=abcdef&X-Goog-Expires=300"
          : "https://storage.googleapis.com/"+bucket+
            "/study-note/tts/audio/"+fixedObject+
            "?X-Goog-Signature=abcdef123456&X-Goog-Expires="+expiry;
        return {ok:true,status:200,json:async()=>({url})};
      }
      bytesRequested++;
      return {
        ok:true,status:200,
        blob:async()=>new Blob([Buffer.concat([Buffer.from("ID3"),Buffer.alloc(200)])],{type:"audio/mpeg"}),
        clone(){return this}
      };
    }
  };
  vm.runInNewContext(source,sandbox,{filename:"natural-tts.js"});
  const player=sandbox.window.peStudyNoteTTS;
  player.settings.gap=0;
  player.settings.fields={
    concept:true,background:false,necessity:false,features:false,components:false,keywords:false
  };
  return {
    player,manifest,element,topics,
    currentTopicId:()=>currentId,
    played:()=>played,
    paused:()=>paused,
    downloads:()=>generatedDownloads,
    apiFetchCount:()=>bytesRequested,
    manifestCount:()=>manifestRequests,
    signedCount:()=>signedRequests,
    googleLogin:async()=>{await player.renderCloudLogin();googleCallback?.({credential:"mock-google-id-token"});}
  };
}
async function waitFor(fn, timeoutMs=1000) {
  const begin=Date.now();
  while(!fn()){
    if(Date.now()-begin>=timeoutMs)throw Error("Timed out");
    await new Promise(r=>setTimeout(r,5));
  }
}

test("no browser speech synthesis or live paid API in client",()=>{
  assert.doesNotMatch(source, /window\.speechSynthesis|new SpeechSynthesisUtterance/);
  assert.doesNotMatch(source, /texttospeech\.googleapis\.com/);
});
test("auto-advance reads both topics and updates visible topic",async()=>{
  const ctx=makeEnvironment();
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.currentTopicId(),"T0002");
  assert.equal(ctx.played(),4);
  assert.equal(ctx.apiFetchCount(),4);
  assert.match(ctx.element("ttsStatus").textContent,/마지막 토픽/);
});
test("stop during playback prevents next topic",async()=>{
  const ctx=makeEnvironment({stopAtSegment:true});
  const pending=ctx.player.start();
  await waitFor(()=>ctx.played()>0);
  ctx.player.stop("수동 중지");
  await pending;
  assert.equal(ctx.currentTopicId(),"T0001");
  assert.equal(ctx.player.playing,false);
  assert.match(ctx.element("ttsStatus").textContent,/수동 중지/);
});
test("missing cloud MP3 stops before navigating to incomplete next topic",async()=>{
  const ctx=makeEnvironment({includeSecond:false});
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),2);
  assert.equal(ctx.currentTopicId(),"T0001");
  assert.match(ctx.element("ttsStatus").textContent,/미생성 AI MP3/);
});
test("multipart field reads every MP3 chunk",async()=>{
  const ctx=makeEnvironment({multipart:true});
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),5);
  assert.equal(ctx.currentTopicId(),"T0002");
});
test("changed source text invalidates MP3 manifest entry",async()=>{
  const ctx=makeEnvironment();
  ctx.topics[0].concept="수정된 개념";
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.match(ctx.element("ttsStatus").textContent,/MP3 재생성이 필요/);
});
test("three-topic export stays local and does not call TTS API",()=>{
  const ctx=makeEnvironment();
  ctx.player.exportSampleTopics();
  assert.ok(ctx.downloads().length>=1);
  assert.equal(ctx.apiFetchCount(),0);
  assert.match(ctx.element("ttsStatus").textContent,/JSON으로 저장/);
});


test("production GCS disabled until Google login, then uses signed MP3 URLs",async()=>{
  const ctx=makeEnvironment({privateCloud:true});
  await ctx.player.start();
  assert.equal(ctx.manifestCount(),0);
  assert.equal(ctx.played(),0);
  assert.match(ctx.element("ttsStatus").textContent,/Google 계정으로 로그인/);
  await ctx.googleLogin();
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),4);
  assert.equal(ctx.currentTopicId(),"T0002");
  assert.equal(ctx.manifestCount(),1);
  assert.equal(ctx.signedCount(),4);
});
test("private Cloud player rejects signed MP3 URL from unexpected host",async()=>{
  const ctx=makeEnvironment({privateCloud:true,badSignedHost:true});
  await ctx.googleLogin();
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),0);
  assert.match(ctx.element("ttsStatus").textContent,/검증되지 않은 Google Cloud/);
});

test("private GCS disabled by default: zero signed URLs and zero MP3 fetch",async()=>{
  const ctx=makeEnvironment({privateCloud:true,cloudDisabled:true});
  await ctx.player.start();
  assert.equal(ctx.played(),0);
  assert.equal(ctx.manifestCount(),0);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.apiFetchCount(),0);
  assert.match(ctx.element("ttsStatus").textContent,/Cloud Storage 연결 전/);
});

test("safe cloud settings diagnostic does not invoke any billable gateway or MP3 download",async()=>{
  for (const config of [{privateCloud:true,cloudDisabled:true},{privateCloud:true}]) {
    const ctx = makeEnvironment(config);
    const status = await ctx.player.checkCloudReady();
    assert.equal(ctx.played(),0);
    assert.equal(ctx.manifestCount(),0);
    assert.equal(ctx.signedCount(),0);
    assert.equal(ctx.apiFetchCount(),0);
    assert.match(status,config.cloudDisabled ? /연결하지 않았습니다/ : /Cloud Storage 주소가 등록/);
    assert.equal(ctx.element("ttsCloudStatus").textContent,status);
  }
});

test("stage5 readiness check is manual-only and disabled mode never contacts Cloud Run",async()=>{
  const ctx=makeEnvironment({privateCloud:true,cloudDisabled:true});
  assert.equal(ctx.manifestCount(),0);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.apiFetchCount(),0);
  const report=await ctx.player.checkCurrentTopicAvailability();
  assert.match(report,/연결이 비활성화/);
  assert.equal(ctx.manifestCount(),0);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.apiFetchCount(),0);
});
test("stage5 check requires Google login before reading private manifest",async()=>{
  const ctx=makeEnvironment({privateCloud:true});
  const report=await ctx.player.checkCurrentTopicAvailability();
  assert.match(report,/로그인/);
  assert.equal(ctx.manifestCount(),0);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.apiFetchCount(),0);
});
test("stage5 check validates topic-first and selected field against source without downloading audio",async()=>{
  const ctx=makeEnvironment({privateCloud:true});
  await ctx.googleLogin();
  ctx.player.selectFields(true);
  const report=await ctx.player.checkCurrentTopicAvailability();
  assert.match(report,/T0001/);
  assert.match(report,/2\/2항목/);
  assert.match(report,/2개 MP3/);
  assert.match(report,/목록 검사는 통과/);
  assert.match(report,/원문 없는 항목 5개 제외/);
  assert.equal(ctx.element("ttsAvailabilityStatus").textContent,report);
  assert.equal(ctx.manifestCount(),1);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.apiFetchCount(),0);
  assert.equal(ctx.played(),0);
});
test("stage5 readiness reports missing essential MP3 instead of skipping topic name",async()=>{
  const ctx=makeEnvironment({privateCloud:true});
  await ctx.googleLogin();
  const key="T0001:topic:"+voice;
  delete ctx.manifest.entries[key];
  const report=await ctx.player.checkCurrentTopicAvailability();
  assert.match(report,/미생성: 토픽명/);
  assert.match(report,/토픽명 MP3가 없어/);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.apiFetchCount(),0);
});
test("stage5 readiness warns when source concept changed without paid regeneration",async()=>{
  const ctx=makeEnvironment({privateCloud:true});
  await ctx.googleLogin();
  ctx.topics[0].concept="바뀐 개념 내용";
  const report=await ctx.player.checkCurrentTopicAvailability();
  assert.match(report,/원문 변경: 개념/);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.apiFetchCount(),0);
});
test("stage5 readiness respects selected text fields and reports missing components",async()=>{
  const ctx=makeEnvironment({privateCloud:true});
  await ctx.googleLogin();
  ctx.topics[0].technicalComponents="기술요소 테스트";
  ctx.player.settings.fields={
    concept:false,background:false,necessity:false,features:false,components:true,keywords:false
  };
  const report=await ctx.player.checkCurrentTopicAvailability();
  assert.match(report,/1\/2항목/);
  assert.match(report,/미생성: 기술요소\/구성요소/);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.apiFetchCount(),0);
});

test("title-only playback is allowed when all six body checkboxes are off",async()=>{
  const ctx=makeEnvironment({privateCloud:true});
  await ctx.googleLogin();
  ctx.player.settings.mode="one";
  ctx.player.selectFields(false);
  const available=await ctx.player.checkCurrentTopicAvailability();
  assert.match(available,/1\/1항목/);
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),1);
  assert.equal(ctx.signedCount(),1);
  assert.equal(ctx.currentTopicId(),"T0001");
});
test("PWA preflight refuses missing selected body before playing title",async()=>{
  const ctx=makeEnvironment({privateCloud:true});
  await ctx.googleLogin();
  const key="T0001:concept:"+voice;
  delete ctx.manifest.entries[key];
  ctx.player.settings.mode="one";
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),0);
  assert.equal(ctx.signedCount(),0);
  assert.match(ctx.element("ttsStatus").textContent,/미생성 AI MP3/);
});
test("PWA preflight rejects manifest field path swapped to another topic",async()=>{
  const ctx=makeEnvironment({privateCloud:true});
  await ctx.googleLogin();
  ctx.player.settings.mode="one";
  const key="T0001:topic:"+voice;
  ctx.manifest.entries[key].file=ctx.manifest.entries[key].file.replace("/T0001/","/T0002/");
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),0);
  assert.equal(ctx.signedCount(),0);
  assert.match(ctx.element("ttsStatus").textContent,/경로 또는 분할 순서/);
});
test("PWA preflight rejects duplicate or out-of-order multipart MP3s",async()=>{
  for(const tamper of ["duplicate","reverse"]){
    const ctx=makeEnvironment({privateCloud:true,multipart:true});
    await ctx.googleLogin();
    ctx.player.settings.mode="one";
    const key="T0001:concept:"+voice;
    const paths=ctx.manifest.entries[key].files;
    if(tamper==="duplicate")paths[1]=paths[0];
    else paths.reverse();
    await ctx.player.start();
    await waitFor(()=>!ctx.player.playing);
    assert.equal(ctx.played(),0);
    assert.equal(ctx.signedCount(),0);
    assert.match(ctx.element("ttsStatus").textContent,/목록|분할 순서/);
  }
});
test("PWA download refuses other GCS objects and signed URL expiry over 300",async()=>{
  for(const invalid of [{badSignedPath:true},{badSignedExpiry:true}]){
    const ctx=makeEnvironment({privateCloud:true,...invalid});
    await ctx.googleLogin();
    ctx.player.settings.mode="one";
    await ctx.player.start();
    await waitFor(()=>!ctx.player.playing);
    assert.equal(ctx.played(),0);
    assert.equal(ctx.apiFetchCount(),0);
    assert.match(ctx.element("ttsStatus").textContent,/검증되지 않은 Google Cloud/);
  }
});
test("readiness check is read-only and new title-only selection does not call signing API",async()=>{
  const ctx=makeEnvironment({privateCloud:true});
  await ctx.googleLogin();
  ctx.player.selectFields(false);
  const s=await ctx.player.checkCurrentTopicAvailability();
  assert.match(s,/1\/1항목/);
  assert.equal(ctx.manifestCount(),1);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.played(),0);
});

test("PWA correctly plays four consecutive MP3 parts after topic intro",async()=>{
  const ctx=makeEnvironment({privateCloud:true,multipart:true,multipartCount:4});
  await ctx.googleLogin();
  ctx.player.settings.mode="one";
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),5);
  assert.equal(ctx.signedCount(),5);
  assert.equal(ctx.apiFetchCount(),5);
  assert.equal(ctx.currentTopicId(),"T0001");
});
test("development PWA boot alone never sends billable GCS or Cloud Run requests",()=>{
  const ctx=makeEnvironment({privateCloud:true});
  assert.equal(ctx.player.playing,false);
  assert.equal(ctx.manifestCount(),0);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.apiFetchCount(),0);
});
