"use strict";
/*
 * Offline, synthetic WebKit layout checks against full Study Note HTML/CSS/JS.
 * This tests a Linux WebKit engine, NOT an actual iPhone Safari device.
 * No LIVE Google Sheets, auth, Apps Script, PDF or TTS calls are performed.
 */
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const assert=require("node:assert/strict");
const {webkit}=require("../../.qa-webkit/node_modules/playwright");

const root=path.resolve(__dirname,"..");
const raw=fs.readFileSync(path.join(root,"study-note.html"),"utf8");
assert.equal(raw.split("window.addEventListener('DOMContentLoaded', init);").length,2);
const html=raw
 .replace("window.addEventListener('DOMContentLoaded', init);",
          "window.addEventListener('DOMContentLoaded', () => { bindElements(); window.__webkitQaReady=true; });")
 .replace(/<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>/,"")
 .replace(/<script src="\.\/tts\/natural-tts\.js\?v=[^"]+"><\/script>/,"")
 .replace(/<link rel="manifest" href="\.\/manifest\.webmanifest">/,"");
assert.ok(html.includes("function showTopicById("));
assert.ok(html.includes("appendVerifiedFeatureBilingualText"));

const make=(id,title,features,technical,keywords="")=>({
 topicId:id,topicName:title,domain:"SW",domainName:"화면검수",domainOrder:1,
 categoryCode:"SW-01",categoryName:"검수",categorySortOrder:1,topicOrder:1,
 importance:"중",studyTarget:"Y",concept:"모의 토픽, 실제 운영 자료 아님",
 background:"",necessity:"",features,technicalComponents:technical,keywords,
 mnemonic:"",relatedTopics:"",status:"QA",sourceDomain:"",
 subnotePages:"",textbookPages:"",studyExclusionReason:"",notes:"",sourceLinkCount:0
});
const topics=[
 make("T0001","한글 중심 특징 검증",
    "Customer(고객)·Competitor(경쟁사)·Company(자사) 관점 분석 · 전략에 적용",
    "분석관점: Customer(고객 니즈를 분석하고 결과를 비교) · Competitor(경쟁사 전략을 분석하고 기록)",
    "고객(Customer), 경쟁사(Competitor), 자사(Company)"),
 make("T1961","중첩 괄호와 긴 설명",
    "Selection(선택)·Expansion(확장)·Simulation(시뮬레이션) 개념 비교 · UCT(탐색식) 활용",
    "탐색요소: Selection(선택)(Tree(트리)의 Node(노드)를 UCT(Upper Confidence Bounds for Trees, 트리 상한신뢰도)로 선택) · Expansion(확장)(미탐색 Child Node(자식 노드)를 추가하면서 RFC 8446, 1.25 Gbps, O(n log n)을 손상 없이 유지)",
    "선택(Selection), 확장(Expansion)"),
 make("T4038","번호형 원문 계층 보존",
    "- 논리 큐비트 인코딩\n- 패리티 측정\n- 비파괴 오류 검출",
    "1. 코드:\n  가. 표면 부호: 국소 연산\n  나. 양자 LDPC: 장거리 연산")
];
const viewports=[
 {name:"iphone-like-402",width:402,height:874,isMobile:true},
 {name:"phone-landscape-844",width:844,height:390,isMobile:true},
 {name:"tablet-820",width:820,height:1180,isMobile:false},
 {name:"tablet-landscape-1180",width:1180,height:820,isMobile:false}
];
const qaDir=path.join(root,"qa-artifacts","visibility-webkit");
fs.mkdirSync(qaDir,{recursive:true});
const server=http.createServer((req,res)=>{
  if(req.url==="/normal"||req.url==="/safearea"){
   res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
   res.end(req.url==="/safearea"?html.replaceAll("env(safe-area-inset-bottom)","34px"):html);
  }else{res.writeHead(404);res.end("QA fixture only");}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;
 const results=[];
 try{
  browser=await webkit.launch({headless:true});
  for(const vp of viewports){
   const context=await browser.newContext({viewport:{width:vp.width,height:vp.height},isMobile:vp.isMobile,hasTouch:vp.isMobile});
   const page=await context.newPage();
   const errors=[];page.on("pageerror",e=>errors.push(String(e)));
   for(const safeArea of [false,true]){
    await page.goto("http://127.0.0.1:"+server.address().port+(safeArea?"/safearea":"/normal"),{waitUntil:"domcontentloaded",timeout:20000});
    await page.waitForFunction("window.__webkitQaReady===true",{timeout:10000});
    await page.evaluate(data=>{
      allTopics=data;filteredTopics=data;topicPage=1;
      window.peStudyNoteTTS={onTopicChanged(){}};
    },topics);
    for(const topic of topics){
     const r=await page.evaluate(id=>{
       showTopicById(id,{scrollList:false});
       const x=document.getElementById("detailFeatures"),y=document.getElementById("detailTechnicalComponents");
       const list=e=>e.querySelector("ol.study-readable-list");
       const info={
         id:currentTopicId,title:document.getElementById("detailTitle").textContent,
         sourceX:list(x)?[...list(x).children].map(n=>n.dataset.studyOriginalItem):[],
         sourceY:list(y)?[...list(y).children].map(n=>n.dataset.studyOriginalItem):[],
         displayX:x.textContent,displayY:y.textContent,
         whiteX:getComputedStyle(x).whiteSpace,whiteY:getComputedStyle(y).whiteSpace,
         overflowRoot:document.documentElement.scrollWidth>innerWidth+2,
         overflowX:x.scrollWidth>x.clientWidth+2,
         overflowY:y.scrollWidth>y.clientWidth+2
       };
       window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"});
       return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
         const d=document.getElementById("topicDetail").getBoundingClientRect(),
               n=document.getElementById("bottomNav").getBoundingClientRect();
         info.footerClear=d.bottom<=n.top+2;
         resolve(info);
       })));
     },topic.topicId);
     assert.equal(r.id,topic.topicId);
     assert.equal(r.title,topic.topicName);
     assert.ok(!r.overflowRoot&&!r.overflowX&&!r.overflowY,
       "WebKit horizontal overflow "+JSON.stringify({vp:vp.name,topic:topic.topicId,safeArea}));
     assert.ok(r.footerClear,
       "WebKit footer clipped "+JSON.stringify({vp:vp.name,topic:topic.topicId,safeArea}));
     if(topic.topicId==="T0001"){
       assert.equal(r.sourceX.length,2);
       assert.match(r.displayX,/고객 \(Customer\)·경쟁사 \(Competitor\)·자사 \(Company\)/);
       assert.equal(r.sourceX[0],"Customer(고객)·Competitor(경쟁사)·Company(자사) 관점 분석");
       assert.equal(r.sourceY.length,2);
     }
     if(topic.topicId==="T1961"){
       assert.equal(r.sourceY.length,2);
       assert.match(r.displayY,/RFC 8446, 1\.25 Gbps, O\(n log n\)/);
     }
     if(topic.topicId==="T4038"){
       assert.equal(r.sourceX.length,0);
       assert.equal(r.sourceY.length,0);
       assert.equal(r.whiteX,"pre-wrap");
       assert.equal(r.whiteY,"pre-wrap");
       assert.match(r.displayY,/가\. 표면 부호:[^\n]+\n\s*나\. 양자 LDPC:/);
     }
     assert.deepEqual(errors,[],"WebKit uncaught error");
     results.push({vp:vp.name,safeArea,topic:topic.topicId,pass:true});
    }
    if(!safeArea)await page.screenshot({path:path.join(qaDir,vp.name+".png"),fullPage:true});
   }
   console.log("WEBKIT_VIEWPORT_PASS",vp.name,"topics",topics.length,"safearea",true);
   await context.close();
  }
  fs.writeFileSync(path.join(qaDir,"qa-results.json"),
    JSON.stringify({engine:"Linux WebKit via Playwright",warning:"NOT physical iPhone Safari or Galaxy Tab",
      input:"Synthetic topics only, full production HTML/CSS/JS with offline bootstrap",
      cases:results.length,results},null,2));
  console.log("WEBKIT_QA_PASS",results.length,"topic-viewport-safearea combinations");
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error("WEBKIT_QA_FAILURE",e.stack||String(e));process.exitCode=1});
