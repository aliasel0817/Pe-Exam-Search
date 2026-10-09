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

function makeEnvironment({stopAtSegment=false, includeSecond=true, multipart=false, privateCloud=false, badSignedHost=false, cloudDisabled=false}={}) {
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
    "ttsSelectNone","ttsExportBtn","ttsCloudLogin","ttsCloudStatus","detailTitle","detailConcept",
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
        entry.files=[
          filename.replace(".mp3","-p01.mp3"),
          filename.replace(".mp3","-p02.mp3")
        ];
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
        const url = badSignedHost ? "https://not-gcs.example/audio?X-Goog-Signature=unsafe" :
          "https://storage.googleapis.com/test-private-bucket/study-note/tts/audio/"+file+"?X-Goog-Signature=abc";
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
test("missing cloud MP3 stops rather than using system TTS",async()=>{
  const ctx=makeEnvironment({includeSecond:false});
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),2);
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
