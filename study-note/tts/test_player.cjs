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
  badSignedExpiry=false, cloudDisabled=false, stageTrial=false,
  preserveDefaults=false, aliasTopic=null, returningConsent=false,
  googleOneTapBlocked=false, unauthorizedManifest=false,
  holdSignedRequest=false, holdAudioDownload=false,
  extraMissingTopics=0}={}) {
  let currentId = aliasTopic?.topicId || "T0001";
  let played = 0;
  let paused = 0;
  const selected = [currentId, "T0002"];
  const topics = structuredClone(originalTopics);
  if (aliasTopic) {
    topics[0].topicId=aliasTopic.topicId;
    topics[0].topicName=aliasTopic.recorded;
  }
  for (let i=0;i<extraMissingTopics;i++) {
    const topicId="T"+String(10000+i);
    topics.push({topicId,topicName:"음성 미생성 토픽 "+i,
      concept:"",background:"",necessity:"",features:"",
      technicalComponents:"",keywords:"",studyTarget:"Y"});
    selected.splice(selected.length-1,0,topicId);
  }
  const data = new Map(topics.map(x=>[x.topicId,x]));
  const elements = new Map();
  const generatedDownloads = [];

  function element(id) {
    if (!elements.has(id)) {
      const listeners = new Map();
      const classes = new Set(id==="ttsSettingsPanel" ? ["hidden"] : []);
      const e = {
        id, value:"", textContent:"", checked:true, attrs:{}, dataset:{},
        style:{}, scrollHeight:450,
        getBoundingClientRect(){return {left:600,right:730,top:90,bottom:132}},
        contains(target){return target===this || this.children.includes(target)},
        focus(){this.focused=true},
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
    "ttsToggleBtn","ttsRepeatBtn","ttsSettingsPanel","ttsSettingsCloseBtn","ttsStatus","ttsSelectAll",
    "ttsSelectNone","ttsExportBtn","ttsCloudLogin","ttsCloudStatus","ttsCloudCheckBtn",
    "ttsAvailabilityBtn","ttsAvailabilityStatus","detailTitle","detailConcept",
    "detailBackground","detailNecessity","detailFeatures",
    "detailTechnicalComponents","detailKeywords",
    ...["voice","rate","mode","gap"].map(x=>"ttsOption-"+x),
    ...["concept","background","necessity","features","components","keywords"].map(x=>"ttsField-"+x)
  ];
  required.forEach(element);

  const manifest={schemaVersion:1,entries:{}};
  // Added scalability fixtures represent topics that have no synthesized MP3s.
  for(const topic of topics.slice(0,originalTopics.length)){
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
  if (aliasTopic) topics[0].topicName=aliasTopic.current;
  let bytesRequested=0;
  let manifestRequests=0;
  let signedRequests=0;
  let audioAbortCount=0;
  let signedAbortCount=0;
  let googleCallback=null;
  let googleInitializeCount=0, googleButtonCount=0, googlePromptCount=0;
  let googleInitOptions=null;
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
  if (returningConsent) storage.set('peStudyNote.aiTts.googleVoiceOneTapOptIn.v1','1');
  const documentListeners=new Map();
  const doc={
    currentScript:{src:"https://example.com/study-note/tts/natural-tts.js"},
    addEventListener(name,fn){
      if(!documentListeners.has(name))documentListeners.set(name,[]);
      documentListeners.get(name).push(fn);
    },
    dispatch(name,event){for(const fn of documentListeners.get(name)||[])fn(event)},
    readyState:"complete",
    visibilityState:"visible",
    getElementById:id=>elements.get(id)||null,
    createElement:id=>element("created-"+id),
    body:{appendChild(){}}
  };
  let cacheOpens=0;
  const sandbox={
    document:doc,
    window:{
      innerWidth:1024,innerHeight:768,
      PE_TTS_STAGE5_TRIAL:stageTrial,
      caches:{open(){cacheOpens++;throw Error("staging should never touch CacheStorage");}},
      PE_TTS_LOCAL_PREVIEW:!privateCloud,
      google:{accounts:{id:{
        initialize:settings=>{googleCallback=settings.callback;googleInitOptions=settings;googleInitializeCount++;},
        renderButton:()=>{googleButtonCount++;},
        prompt:googleOneTapBlocked?undefined:()=>{googlePromptCount++;}
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
    location:{
      href:stageTrial
        ? "https://aliasel0817.github.io/Pe-Exam-Search/study-note/tts/stage5_pwa_trial.html"
        : privateCloud?"https://example.com/study-note/study-note.html":"https://example.com/study-note/tts/preview.html",
      pathname:stageTrial
        ? "/Pe-Exam-Search/study-note/tts/stage5_pwa_trial.html"
        : privateCloud?"/study-note/study-note.html":"/study-note/tts/preview.html"
    },
    crypto:crypto.webcrypto,TextEncoder, AbortController, Audio:MockAudio,
    URL:FakeURL, Blob,console,
    setTimeout,clearTimeout,setImmediate,
    localStorage:{
      getItem:key=>storage.get(key)||null,
      setItem:(key,val)=>storage.set(key,String(val)),
      removeItem:key=>storage.delete(key)
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
        if (unauthorizedManifest && name.endsWith("/v1/manifest"))
          return {ok:false,status:401,json:async()=>({error:"unauthorized"})};
        return {ok:true,status:200,json:async()=>manifest,clone(){return this}};
      }
      if (name.includes("/v1/audio-url?file=")) {
        assert.equal(options.headers.Authorization,"Bearer mock-google-id-token");
        signedRequests++;
        if (holdSignedRequest) {
          return new Promise((resolve,reject)=>{
            assert.ok(options.signal, "signed-URL request must receive an AbortSignal");
            options.signal.addEventListener("abort",()=>{
              signedAbortCount++;
              const error=new Error("stopped signed request");
              error.name="AbortError";
              reject(error);
            },{once:true});
          });
        }
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
      if (holdAudioDownload) {
        return new Promise((resolve,reject)=>{
          assert.ok(options.signal, "MP3 request must receive an AbortSignal");
          options.signal.addEventListener("abort",()=>{
            audioAbortCount++;
            const error=new Error("stopped MP3 download");
            error.name="AbortError";
            reject(error);
          },{once:true});
        });
      }
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
  if (!stageTrial && !preserveDefaults) {
    player.settings.mode="continuous";
    player.settings.fields={
      concept:true,background:false,necessity:false,features:false,components:false,keywords:false
    };
  }
  return {
    player,manifest,element,topics,doc,storage,
    cacheOpens:()=>cacheOpens,
    googleInitializeCount:()=>googleInitializeCount,
    googleButtonCount:()=>googleButtonCount,
    googlePromptCount:()=>googlePromptCount,
    googleInitOptions:()=>googleInitOptions,
    googleCredential:(source="auto")=>googleCallback?.({credential:"mock-google-id-token",select_by:source}),
    currentTopicId:()=>currentId,
    played:()=>played,
    paused:()=>paused,
    downloads:()=>generatedDownloads,
    apiFetchCount:()=>bytesRequested,
    manifestCount:()=>manifestRequests,
    signedCount:()=>signedRequests,
    audioAbortCount:()=>audioAbortCount,
    signedAbortCount:()=>signedAbortCount,
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
test("continuous reading skips missing next topic without silently failing",async()=>{
  const ctx=makeEnvironment({includeSecond:false});
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),2);
  assert.equal(ctx.currentTopicId(),"T0001");
  assert.match(ctx.element("ttsStatus").textContent,/미생성 1개 건너뜀/);
  assert.equal(ctx.signedCount(),0);
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

function fakePointer({pointerId=7,clientX=100,clientY=100,pointerType="touch",button=0}={}) {
  return {pointerId,clientX,clientY,pointerType,button,
    prevented:false,stopped:false,
    preventDefault(){this.prevented=true},
    stopImmediatePropagation(){this.stopped=true}};
}
test("short tap toggles play and stop on the single Listen button",async()=>{
  const ctx=makeEnvironment({stopAtSegment:true});
  ctx.player.settings.mode="one";
  const listen=ctx.element("ttsToggleBtn");
  const down=fakePointer();
  listen.dispatch("pointerdown",down);
  listen.dispatch("pointerup",down);
  listen.dispatch("click",fakePointer());
  await waitFor(()=>ctx.played()===1);
  assert.equal(ctx.player.playing,true);
  assert.equal(listen.attrs["aria-pressed"],"true");
  const second=fakePointer();
  listen.dispatch("pointerdown",second);
  listen.dispatch("pointerup",second);
  listen.dispatch("click",fakePointer());
  await waitFor(()=>!ctx.player.playing);
  assert.match(ctx.element("ttsStatus").textContent,/중지/);
  assert.equal(listen.attrs["aria-pressed"],"false");
});
test("long press 550ms opens options without initiating or stopping playback",async()=>{
  const ctx=makeEnvironment({privateCloud:true,cloudDisabled:true});
  const listen=ctx.element("ttsToggleBtn");
  const panel=ctx.element("ttsSettingsPanel");
  assert.equal(panel.classList.contains("hidden"),true);
  const down=fakePointer();
  listen.dispatch("pointerdown",down);
  await new Promise(resolve=>setTimeout(resolve,575));
  assert.equal(panel.classList.contains("hidden"),false);
  assert.equal(listen.attrs["aria-expanded"],"true");
  listen.dispatch("pointerup",down);
  const click=fakePointer();
  listen.dispatch("click",click);
  assert.equal(click.prevented,true);
  assert.equal(ctx.player.playing,false);
  assert.equal(ctx.manifestCount(),0);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.apiFetchCount(),0);
});
test("moving finger over 12px cancels hold, never starts unintended audio",async()=>{
  const ctx=makeEnvironment();
  const listen=ctx.element("ttsToggleBtn");
  listen.dispatch("pointerdown",fakePointer({clientX:30,clientY:30}));
  listen.dispatch("pointermove",fakePointer({clientX:45,clientY:46}));
  await new Promise(resolve=>setTimeout(resolve,565));
  const click=fakePointer();
  listen.dispatch("pointerup",fakePointer());
  listen.dispatch("click",click);
  assert.equal(ctx.element("ttsSettingsPanel").classList.contains("hidden"),true);
  assert.equal(click.prevented,true);
  assert.equal(ctx.played(),0);
});
test("keyboard Alt+ArrowDown opens options and Escape returns to Listen",()=>{
  const ctx=makeEnvironment();
  const listen=ctx.element("ttsToggleBtn");
  const key={key:"ArrowDown",altKey:true,preventDefault(){this.prevented=true}};
  listen.dispatch("keydown",key);
  assert.equal(key.prevented,true);
  assert.equal(ctx.element("ttsSettingsPanel").classList.contains("hidden"),false);
  assert.equal(ctx.element("ttsSettingsCloseBtn").focused,true);
  const escape={key:"Escape",preventDefault(){this.prevented=true}};
  ctx.doc.dispatch("keydown",escape);
  assert.equal(escape.prevented,true);
  assert.equal(ctx.element("ttsSettingsPanel").classList.contains("hidden"),true);
  assert.equal(listen.focused,true);
});
test("right click opens options; close and outside-click work",()=>{
  const ctx=makeEnvironment();
  const listen=ctx.element("ttsToggleBtn");
  const menu={preventDefault(){this.prevented=true}};
  listen.dispatch("contextmenu",menu);
  assert.equal(menu.prevented,true);
  assert.equal(ctx.element("ttsSettingsPanel").classList.contains("hidden"),false);
  ctx.element("ttsSettingsCloseBtn").dispatch("click",{});
  assert.equal(ctx.element("ttsSettingsPanel").classList.contains("hidden"),true);
  listen.dispatch("contextmenu",menu);
  ctx.doc.dispatch("pointerdown",{target:ctx.element("ttsRepeatBtn")});
  assert.equal(ctx.element("ttsSettingsPanel").classList.contains("hidden"),true);
});
test("repeat button cycles one/two, updates aria, and preserves repeat setting",async()=>{
  const ctx=makeEnvironment();
  const repeat=ctx.element("ttsRepeatBtn");
  assert.equal(repeat.textContent,"↻ 1회");
  repeat.dispatch("click",{});
  assert.equal(ctx.player.settings.repeat,2);
  assert.equal(repeat.attrs["aria-pressed"],"true");
  assert.equal(repeat.textContent,"↻ 2회");
  assert.match(ctx.storage.get("peStudyNote.aiTts.options.v1"),/"repeat":2/);
  ctx.player.settings.mode="one";
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),4);
  repeat.dispatch("click",{});
  assert.equal(ctx.player.settings.repeat,1);
  assert.equal(repeat.attrs["aria-pressed"],"false");
});
test("changing repeat during playback stops safely",async()=>{
  const ctx=makeEnvironment({stopAtSegment:true});
  ctx.player.settings.mode="one";
  const current=ctx.player.start();
  await waitFor(()=>ctx.played()===1);
  ctx.element("ttsRepeatBtn").dispatch("click",{});
  await current;
  assert.equal(ctx.player.playing,false);
  assert.equal(ctx.player.settings.repeat,2);
  assert.match(ctx.element("ttsStatus").textContent,/2회/);
});
test("option panel stays within viewport bounds and closes with no TTS cloud requests",()=>{
  const ctx=makeEnvironment({privateCloud:true,cloudDisabled:true});
  ctx.player.openOptions();
  const panel=ctx.element("ttsSettingsPanel");
  assert.match(panel.style.width,/px$/);
  assert.match(panel.style.top,/px$/);
  assert.equal(ctx.manifestCount(),0);
  assert.equal(ctx.signedCount(),0);
  ctx.player.closeOptions();
  assert.equal(panel.classList.contains("hidden"),true);
});

test("fixed-path staging defaults to one topic, title only, and isolated settings key",async()=>{
  const ctx=makeEnvironment({privateCloud:true,stageTrial:true});
  assert.equal(ctx.player.settings.mode,"one");
  assert.ok(Object.values(ctx.player.settings.fields).every(value=>value===false));
  assert.equal(ctx.cacheOpens(),0);
  ctx.element("ttsRepeatBtn").dispatch("click",{});
  assert.ok(ctx.storage.has("peStudyNote.aiTts.stage5Trial.options.v1"));
  assert.equal(ctx.storage.has("peStudyNote.aiTts.options.v1"),false);
  await ctx.googleLogin();
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),2); // title twice with 2x repeat
  assert.equal(ctx.apiFetchCount(),2);
  assert.equal(ctx.cacheOpens(),0);
  assert.equal(ctx.manifestCount(),1);
});
test("first-run production and isolated trial both default to one topic title-only",()=>{
  const ctx=makeEnvironment({privateCloud:true,preserveDefaults:true});
  assert.equal(ctx.player.settings.mode,"one");
  assert.ok(Object.values(ctx.player.settings.fields).every(value=>value===false));
  ctx.element("ttsRepeatBtn").dispatch("click",{});
  assert.equal(ctx.storage.has("peStudyNote.aiTts.stage5Trial.options.v1"),false);
  assert.ok(ctx.storage.has("peStudyNote.aiTts.options.v1"));
});

test("only the two exact approved pilot title source variants may use original MP3",async()=>{
  const exceptions=[
    {topicId:"T1961",recorded:"몬테카를로 트리검색(MCTS)",
      current:"몬테카를로 트리검색 (MCTS)"},
    {topicId:"T2354",recorded:"SQL",current:"SQL (Structured Query Language)"}
  ];
  for(const aliasTopic of exceptions){
    const ctx=makeEnvironment({privateCloud:true,preserveDefaults:true,aliasTopic});
    await ctx.googleLogin();
    const status=await ctx.player.checkCurrentTopicAvailability();
    assert.match(status,/1\/1항목/);
    assert.match(status,/기존 MP3 명칭 차이/);
    assert.equal(ctx.signedCount(),0);
    await ctx.player.start();
    await waitFor(()=>!ctx.player.playing);
    assert.equal(ctx.played(),1);
    assert.equal(ctx.signedCount(),1);
  }
});
test("unknown title edits or changed body never bypass manifest SHA checks",async()=>{
  for(const aliasTopic of [
    {topicId:"T1961",recorded:"몬테카를로 트리검색(MCTS)",current:"완전히 다른 이름"},
    {topicId:"T2354",recorded:"SQL",current:"SQL injection 사례"},
    {topicId:"T2238",recorded:"퀵 정렬",current:"Quick Sort"}
  ]){
    const ctx=makeEnvironment({privateCloud:true,preserveDefaults:true,aliasTopic});
    await ctx.googleLogin();
    const status=await ctx.player.checkCurrentTopicAvailability();
    assert.match(status,/원문 변경: 토픽명/);
    await ctx.player.start();
    await waitFor(()=>!ctx.player.playing);
    assert.equal(ctx.played(),0);
    assert.equal(ctx.signedCount(),0);
  }
  const ctx=makeEnvironment({privateCloud:true,preserveDefaults:true,aliasTopic:{
    topicId:"T2354",recorded:"SQL",current:"SQL (Structured Query Language)"
  }});
  ctx.player.settings.fields.concept=true;
  ctx.topics[0].concept="원문과 다른 개념";
  await ctx.googleLogin();
  await ctx.player.start();
  await waitFor(()=>!ctx.player.playing);
  assert.equal(ctx.played(),0);
  assert.equal(ctx.signedCount(),0);
  assert.match(ctx.element("ttsStatus").textContent,/재생성이 필요/);
});

test("the T0000 homepage never offers TTS or touches the private cloud",async()=>{
  const ctx=makeEnvironment({privateCloud:true,preserveDefaults:true,aliasTopic:{
    topicId:"T0000",recorded:"정보관리 기술사",current:"정보관리 기술사"
  }});
  const toggle=ctx.element("ttsToggleBtn"),repeat=ctx.element("ttsRepeatBtn");
  assert.equal(toggle.classList.contains("hidden"),true);
  assert.equal(repeat.classList.contains("hidden"),true);
  assert.equal(ctx.element("ttsStatus").classList.contains("hidden"),true);
  const report=await ctx.player.checkCurrentTopicAvailability();
  assert.match(report,/홈 화면.*제외/);
  await ctx.player.start();
  assert.equal(ctx.manifestCount(),0);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.apiFetchCount(),0);
  assert.equal(ctx.played(),0);
  ctx.player.getBridge().selectTopic("T0002");
  assert.equal(toggle.classList.contains("hidden"),false);
  assert.equal(repeat.classList.contains("hidden"),false);
});
test("studyTarget N safely disables audio controls without cloud requests",async()=>{
  const ctx=makeEnvironment({privateCloud:true,preserveDefaults:true});
  ctx.topics[0].studyTarget="N";
  ctx.player.onTopicChanged("T0001");
  assert.equal(ctx.element("ttsToggleBtn").classList.contains("hidden"),true);
  assert.equal(ctx.element("ttsRepeatBtn").classList.contains("hidden"),true);
  await ctx.player.start();
  assert.equal(ctx.manifestCount(),0);
  assert.equal(ctx.signedCount(),0);
  assert.equal(ctx.played(),0);
});

test("first successful voice login is memory-only; Google button hides; no auto prompt on first use",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true});
  assert.equal(c.googlePromptCount(),0);
  await c.googleLogin();
  assert.equal(c.storage.get("peStudyNote.aiTts.googleVoiceOneTapOptIn.v1"),"1");
  assert.equal(c.element("ttsCloudLogin").classList.contains("hidden"),true);
  assert.match(c.element("ttsCloudStatus").textContent,/토픽 이동마다 로그인할 필요/);
  assert.equal(c.googleButtonCount(),1);
  assert.equal(c.manifestCount(),0);
  assert.equal(c.signedCount(),0);
  assert.equal([...c.storage.values()].includes("mock-google-id-token"),false);
  await c.player.start();
  await waitFor(()=>!c.player.playing);
  assert.equal(c.played(),1);
  assert.equal(c.googleInitializeCount(),1);
});
test("returning user offers One Tap once on page load, with zero automatic cloud audio reads",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true,returningConsent:true});
  await waitFor(()=>c.googlePromptCount()===1);
  assert.equal(c.googleInitializeCount(),1);
  assert.equal(c.googleInitOptions().auto_select,true);
  assert.equal(c.googleButtonCount(),0);
  assert.equal(c.manifestCount(),0);
  assert.equal(c.signedCount(),0);
  assert.equal(c.apiFetchCount(),0);
  await c.player.offerReturningGoogleSignIn();
  assert.equal(c.googlePromptCount(),1);
  c.googleCredential();
  assert.equal(c.element("ttsCloudLogin").classList.contains("hidden"),true);
  await c.player.start();
  await waitFor(()=>!c.player.playing);
  assert.equal(c.played(),1);
});
test("Safari/ITP One Tap unavailable falls back to the ordinary Google button",async()=>{
  const c=makeEnvironment({privateCloud:true,returningConsent:true,
    googleOneTapBlocked:true,preserveDefaults:true});
  await waitFor(()=>c.googleInitializeCount()===1);
  assert.equal(c.googlePromptCount(),0);
  c.player.openOptions();
  await c.player.renderCloudLogin();
  assert.equal(c.googleButtonCount(),1);
  c.googleCredential("btn");
  assert.equal(c.element("ttsCloudLogin").classList.contains("hidden"),true);
});
test("first Listen click without voice token opens login options without contacting GCS",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true});
  await c.player.start();
  assert.equal(c.player.playing,false);
  assert.equal(c.element("ttsSettingsPanel").classList.contains("hidden"),false);
  assert.match(c.element("ttsStatus").textContent,/처음 한 번/);
  assert.equal(c.manifestCount(),0);
  assert.equal(c.signedCount(),0);
  assert.equal(c.apiFetchCount(),0);
  await c.player.renderCloudLogin();
  assert.equal(c.googleButtonCount(),1);
  c.googleCredential("btn");
  await c.player.start();
  await waitFor(()=>!c.player.playing);
  assert.equal(c.played(),1);
});
test("rejected token resets automatic consent and shows manual login without looping",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true,
    returningConsent:true,unauthorizedManifest:true});
  await waitFor(()=>c.googlePromptCount()===1);
  c.googleCredential();
  await c.player.start();
  await waitFor(()=>!c.player.playing);
  assert.equal(c.player.idToken,null);
  assert.equal(c.storage.has("peStudyNote.aiTts.googleVoiceOneTapOptIn.v1"),false);
  assert.equal(c.element("ttsCloudLogin").classList.contains("hidden"),false);
  assert.match(c.element("ttsCloudStatus").textContent,/인증이 만료/);
  assert.equal(c.googlePromptCount(),1);
  assert.equal(c.signedCount(),0);
  assert.equal(c.apiFetchCount(),0);
});
test("isolated pilot never enables returning Google consent or One Tap",async()=>{
  const c=makeEnvironment({privateCloud:true,stageTrial:true,returningConsent:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.googlePromptCount(),0);
  await c.googleLogin();
  c.storage.delete("peStudyNote.aiTts.googleVoiceOneTapOptIn.v1");
  await c.player.offerReturningGoogleSignIn();
  assert.equal(c.storage.has("peStudyNote.aiTts.googleVoiceOneTapOptIn.v1"),false);
  assert.equal(c.googlePromptCount(),0);
});

test("after first manifest load topic navigation displays audio readiness without GCS request",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true});
  c.player.cacheIndex=c.manifest;
  c.player.getBridge().selectTopic("T0002");
  await waitFor(()=>/토픽명 MP3 준비됨/.test(c.element("ttsStatus").textContent));
  assert.equal(c.manifestCount(),0);
  assert.equal(c.signedCount(),0);
  assert.equal(c.apiFetchCount(),0);
});
test("cached manifest immediately identifies unsynthesized topic without cloud traffic",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true});
  c.player.cacheIndex=c.manifest;
  delete c.manifest.entries["T0002:topic:"+voice];
  c.player.getBridge().selectTopic("T0002");
  await waitFor(()=>/토픽명 MP3 미생성/.test(c.element("ttsStatus").textContent));
  assert.equal(c.manifestCount(),0);
  assert.equal(c.signedCount(),0);
  assert.equal(c.apiFetchCount(),0);
});
test("cached status reports changed topic-name SHA and does not fetch audio",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true});
  c.player.cacheIndex=c.manifest;
  c.topics[1].topicName="원본과 다른 트리 탐색";
  c.player.getBridge().selectTopic("T0002");
  await waitFor(()=>/토픽명 원문 변경/.test(c.element("ttsStatus").textContent));
  assert.equal(c.manifestCount(),0);
  assert.equal(c.signedCount(),0);
  assert.equal(c.apiFetchCount(),0);
});
test("rapid topic changes never overwrite the latest topic's cached status",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true});
  c.player.cacheIndex=c.manifest;
  delete c.manifest.entries["T0002:topic:"+voice];
  c.player.getBridge().selectTopic("T0002");
  c.player.getBridge().selectTopic("T0001");
  await waitFor(()=>/토픽명 MP3 준비됨/.test(c.element("ttsStatus").textContent));
  await new Promise(resolve=>setImmediate(resolve));
  assert.doesNotMatch(c.element("ttsStatus").textContent,/미생성/);
  assert.equal(c.manifestCount(),0);
});
test("manual topic switch while playing prioritizes stop reason over cached status",async()=>{
  const c=makeEnvironment({privateCloud:true,stopAtSegment:true,preserveDefaults:true});
  await c.googleLogin();
  const playing=c.player.start();
  await waitFor(()=>c.played()===1);
  c.player.getBridge().selectTopic("T0002");
  await playing;
  assert.match(c.element("ttsStatus").textContent,/다른 토픽을 선택하여 재생을 중지/);
  assert.equal(c.player.playing,false);
});

test("continuous skips missing selected body MP3 without partial topic playback",async()=>{
  const c=makeEnvironment({privateCloud:true});
  await c.googleLogin();
  delete c.manifest.entries["T0002:concept:"+voice];
  await c.player.start();
  await waitFor(()=>!c.player.playing);
  assert.equal(c.played(),2); // title+concept of T0001 only
  assert.equal(c.currentTopicId(),"T0001");
  assert.match(c.element("ttsStatus").textContent,/미생성 1개 건너뜀/);
  assert.equal(c.signedCount(),2);
});
test("single-topic mode remains strict when selected MP3 is missing",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true});
  c.player.settings.fields.concept=true;
  delete c.manifest.entries["T0001:concept:"+voice];
  await c.googleLogin();
  await c.player.start();
  await waitFor(()=>!c.player.playing);
  assert.equal(c.played(),0);
  assert.equal(c.signedCount(),0);
  assert.match(c.element("ttsStatus").textContent,/미생성 AI MP3/);
});
test("continuous with all entries missing terminates without navigation, downloads or TTS synthesis",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true});
  c.player.settings.mode="continuous";
  delete c.manifest.entries["T0001:topic:"+voice];
  delete c.manifest.entries["T0002:topic:"+voice];
  await c.googleLogin();
  await c.player.start();
  await waitFor(()=>!c.player.playing);
  assert.equal(c.played(),0);
  assert.equal(c.signedCount(),0);
  assert.equal(c.apiFetchCount(),0);
  assert.equal(c.currentTopicId(),"T0001");
  assert.match(c.element("ttsStatus").textContent,/2개 토픽 모두 MP3가 미생성/);
});
test("corrupted source hash is never treated as a skippable missing MP3",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true});
  c.player.settings.mode="continuous";
  c.manifest.entries["T0001:topic:"+voice].sha256="0".repeat(64);
  await c.googleLogin();
  await c.player.start();
  await waitFor(()=>!c.player.playing);
  assert.equal(c.played(),0);
  assert.equal(c.signedCount(),0);
  assert.equal(c.currentTopicId(),"T0001");
  assert.match(c.element("ttsStatus").textContent,/재생성이 필요/);
});
test("continuous with 4100 ungenerated entries plays only the two approved topics",async()=>{
  const c=makeEnvironment({privateCloud:true,extraMissingTopics:4100});
  await c.googleLogin();
  await c.player.start();
  await waitFor(()=>!c.player.playing,3000);
  assert.equal(c.played(),4);
  assert.equal(c.currentTopicId(),"T0002");
  assert.match(c.element("ttsStatus").textContent,/재생 2개/);
  assert.match(c.element("ttsStatus").textContent,/미생성 4100개 건너뜀/);
  assert.equal(c.manifestCount(),1);
  assert.equal(c.signedCount(),4);
});
test("Stop cancels a pending signed URL request and prevents any MP3 download",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true,holdSignedRequest:true});
  await c.googleLogin();
  const pending=c.player.start();
  await waitFor(()=>c.signedCount()===1);
  c.player.stop("사용자 중지");
  await pending;
  assert.equal(c.signedAbortCount(),1);
  assert.equal(c.audioAbortCount(),0);
  assert.equal(c.apiFetchCount(),0);
  assert.equal(c.played(),0);
  assert.equal(c.player.playing,false);
  assert.match(c.element("ttsStatus").textContent,/사용자 중지/);
});
test("Stop aborts in-flight GCS MP3 download and avoids late playback",async()=>{
  const c=makeEnvironment({privateCloud:true,preserveDefaults:true,holdAudioDownload:true});
  await c.googleLogin();
  const pending=c.player.start();
  await waitFor(()=>c.apiFetchCount()===1);
  c.player.stop("다운로드 중지");
  await pending;
  assert.equal(c.audioAbortCount(),1);
  assert.equal(c.played(),0);
  assert.equal(c.player.playing,false);
  assert.match(c.element("ttsStatus").textContent,/다운로드 중지/);
});
