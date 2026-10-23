"use strict";
/*
 * PR #18 Windows Chrome integration QA: real PWA init, IndexedDB, service
 * worker cache network-first/fallback, actual UI clicks and read-only
 * authentication gate. All content is synthetic. No OAuth tokens, LIVE Sheet,
 * Apps Script calls, PDF, or TTS actions are used.
 *
 * Fresh ephemeral Chrome profile + local 127.0.0.1 origin only.
 * This is NOT a test of a user's existing signed-in Chrome session.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const puppeteer = require("../../.qa-browser/node_modules/puppeteer-core");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root,"study-note.html"),"utf8");
const swSource = fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const manifest = fs.readFileSync(path.join(root,"manifest.webmanifest"),"utf8");
const plannerJs = fs.readFileSync(path.join(root,"study-planner.js"),"utf8");
const plannerJson = fs.readFileSync(path.join(root,"study-plans","pe141-100days.json"),"utf8");
assert(source.includes("window.addEventListener('DOMContentLoaded', init);"));
assert(swSource.includes("fetch(event.request, { cache: 'no-store' })"));
assert(swSource.includes(".catch(() => caches.match(event.request))") ||
       swSource.includes(".catch(() => caches.match(event.request, { ignoreSearch: true }))"));
const fixtures = [
 {topicId:"T0001",topicName:"검증: 3C 분석",
  features:"Customer(고객)(고객 요구 파악) · Competitor(경쟁사)(경쟁 환경 분석) · Company(자사)(자원과 역량 분석)",
  technicalComponents:"요소: Customer(고객)(수요 분석) · Competitor(경쟁사)(시장 비교) · Company(자사)(핵심 자원)",
  keywords:"고객(Customer),경쟁사(Competitor),자사(Company)"},
 {topicId:"T1961",topicName:"검증: 중첩 괄호",
  features:"다중 원리 비교 · 수치 13.56MHz 검증 · RFC 8446 준수",
  technicalComponents:"단계: Selection(선택)(Tree(트리)에서 UCT(Upper Confidence Bounds for Trees, 트리 상한신뢰도)로 노드 탐색) · Expansion(확장)(새 자식 노드 추가) · Simulation(시뮬레이션)(O(n log n) 및 RFC 8446, TLS 1.3 유지)",
  keywords:"MCTS,Selection,Expansion"},
 {topicId:"TQA-NUMERIC",topicName:"검증: IEEE 소수점",
  features:"13.56MHz 무선 주파수 · 2.4GHz 무선 대역 · 802.11p PHY/MAC · 802.1X/EAP 인증",
  technicalComponents:"구성요소: NFC(비접촉 통신 구현) · IEEE 802.11p(차량 무선 접근 지원)",
  keywords:"NFC,IEEE 802.11p"},
 {topicId:"T4038",topicName:"검증: 기존 계층",
  features:"- 논리 큐비트 인코딩\n- 패리티 측정\n- 비파괴 오류 검출",
  technicalComponents:"1. 코드:\n  가. 표면 부호: 국소 연산\n  나. 양자 LDPC: 희소 행렬 기반",
  keywords:"QEC"}
].map((topic,i)=>({
 domain:"QA",domainName:"화면 검증",domainOrder:1,categoryCode:"QA-01",
 categoryName:"표시검증",categorySortOrder:1,topicOrder:i+1,
 importance:"중",studyTarget:"Y",concept:"실제 PWA 화면에서만 확인하는 합성 토픽",
 background:"",necessity:"",mnemonic:"",relatedTopics:"",status:"QA",
 sourceDomain:"",subnotePages:"",textbookPages:"",studyExclusionReason:"",
 notes:"",sourceLinkCount:0,...topic
}));

const reportDir=path.join(root,"qa-artifacts","visibility-windows-cache");
fs.mkdirSync(reportDir,{recursive:true});
const localProfile=fs.mkdtempSync(path.join(os.tmpdir(),"pe-study-note-windows-qa-"));
let revision="A";
let externalRequestsBlocked=0;
const server=http.createServer((req,res)=>{
 const pathname=(req.url||"").split("?")[0];
 res.setHeader("Cache-Control","no-store");
 if(pathname==="/study-note.html"){
  assert(source.includes("</head>"),"HTML head marker missing");
  const html=source.replace("</head>",
    '<meta name="qa-preview-revision" content="'+revision+'"></head>');
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});
  return res.end(html);
 }
 if(pathname==="/service-worker.js"){
  res.writeHead(200,{"Content-Type":"text/javascript; charset=utf-8",
   "Service-Worker-Allowed":"/"});
  return res.end(swSource);
 }
 if(pathname==="/manifest.webmanifest"){
  res.writeHead(200,{"Content-Type":"application/manifest+json"});
  return res.end(manifest);
 }
 if(pathname==="/study-planner.js"){
  res.writeHead(200,{"Content-Type":"text/javascript; charset=utf-8"});
  return res.end(plannerJs);
 }
 if(pathname==="/study-plans/pe141-100days.json"){
  res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});
  return res.end(plannerJson);
 }
 res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});
 res.end("Local PR QA asset not found");
});

async function waitForReady(page){
 await page.waitForFunction(()=>{
  const button=document.getElementById("refreshBtn");
  return !!button&&button.disabled===false&&typeof ensureDatabaseReady==="function"
   &&typeof hasActiveSecuritySession==="function"&&!!db;
 },{timeout:20000});
}
async function cacheSnapshot(page){
 return page.evaluate(async()=>{
  const keys=await caches.keys();
  const key=keys.find(x=>x.startsWith("pe-study-note-shell-"));
  if(!key)return {keys,cachedHtml:""};
  const cache=await caches.open(key);
  const item=await cache.match(new URL("/study-note.html",location.href).href);
  return {keys,cachedHtml:item?await item.text():""};
 });
}
async function assertReadyAndLocked(page){
 await waitForReady(page);
 const data=await page.evaluate(()=>({
  authenticated:hasActiveSecuritySession(),
  badge:document.getElementById("securityBadge").textContent,
  count:(awaitReadNotUsed=>Boolean(awaitReadNotUsed))(db),
  origin:location.origin
 }));
 assert.equal(data.authenticated,false,"Fresh profile must not claim signed-in user");
 assert.match(data.badge,/미인증/);
 assert.match(data.origin,/^http:\/\/127\.0\.0\.1:/);
}
function elementSources(id,field){
 return document.getElementById(field)?undefined:id;
}
async function captureCurrent(page){
 return page.evaluate(()=>{
  const sourceItems=id=>[...document.querySelectorAll("#"+id+" ol.study-readable-list > li")]
     .map(n=>n.dataset.studyOriginalItem);
  return {
   id:currentTopicId,
   title:document.getElementById("detailTitle").textContent,
   x:sourceItems("detailFeatures"),y:sourceItems("detailTechnicalComponents"),
   xText:document.getElementById("detailFeatures").textContent,
   yText:document.getElementById("detailTechnicalComponents").textContent,
   xPreserved:document.getElementById("detailFeatures").classList.contains("study-preserved-lines"),
   yPreserved:document.getElementById("detailTechnicalComponents").classList.contains("study-preserved-lines"),
   overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
  };
 });
}
(async()=>{
 let browser,phase="start";
 const report={engine:"Windows hosted Google Chrome",source:"Original PR #18 HTML/JS/CSS and service-worker.js served only on localhost",
  data:"Synthetic QA topics only",existingUserLoginChecked:false,
  remoteCallsAllowed:false,checks:[],failures:0};
 try{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address="http://127.0.0.1:"+server.address().port+"/study-note.html";
  const executablePath=process.env.CHROME_BIN;
  assert.ok(executablePath&&fs.existsSync(executablePath),"Chrome binary missing");
  browser=await puppeteer.launch({
   executablePath,headless:true,userDataDir:localProfile,
   args:["--no-sandbox","--no-first-run","--no-default-browser-check",
    "--disable-extensions","--disable-background-networking","--disable-sync"]
  });
  const page=await browser.newPage();
  await page.setViewport({width:1280,height:850,deviceScaleFactor:1});
  await page.setRequestInterception(true);
  page.on("request",req=>{
   if(req.url().startsWith("http://127.0.0.1:"+server.address().port+"/"))
    req.continue();
   else{externalRequestsBlocked++;req.abort();}
  });
  const unexpected=[];
  page.on("pageerror",e=>unexpected.push(String(e)));
  phase="initial-app";
  await page.goto(address,{waitUntil:"domcontentloaded",timeout:30000});
  await assertReadyAndLocked(page);
  const a=await page.$eval('meta[name="qa-preview-revision"]',e=>e.content);
  assert.equal(a,"A");
  report.checks.push("Full PWA init + genuine IndexedDB bootstrap in fresh isolated Windows Chrome");
  report.checks.push("Unauthenticated security gate correctly shows no existing user login");
  console.log("WINDOWS_PREVIEW_AUTH_GATE_PASS");

  phase="seed-local";
  await page.evaluate(async topics=>{
   const localDb=await ensureDatabaseReady();
   await replaceAllTopics(localDb,topics,{
    lastMasterSyncAt:new Date().toISOString(),serverGeneratedAt:"",
    spreadsheetName:"synthetic-only",sheetName:"QA",schemaVersion:1
   });
   allTopics=topics;
   filteredTopics=topics;
   currentTopicId=null;
   topicPage=1;
   window.peStudyNoteTTS={onTopicChanged(){},onFilterChanged(){}};
   showTopicById(topics[0].topicId,{scrollList:false});
  },fixtures);
  let shown=await captureCurrent(page);
  assert.equal(shown.id,"T0001");
  assert.equal(shown.x.length,3,"Three Korean-first feature items must render");
  assert.equal(shown.y.length,3,"Three technical elements must render");
  assert.deepEqual(shown.x,fixtures[0].features.split(" · "));
  assert.deepEqual(shown.y,fixtures[0].technicalComponents.slice("요소: ".length).split(" · "));
  assert.ok(shown.xText.includes("고객 (Customer)") && shown.xText.includes("경쟁사 (Competitor)"),
    "Korean-first labels must remain");
  assert.equal(shown.overflow,0);
  await page.click("#nextBtn");
  shown=await captureCurrent(page);
  assert.equal(shown.id,"T1961","Actual Next button must switch topics");
  assert.ok(shown.yText.includes("RFC 8446") && shown.yText.includes("O(n log n)"),
    "Complex technical detail must not disappear");
  assert.ok(!shown.xText.includes("Company(자사)"),"No stale X values from previous topic");
  await page.click("#prevBtn");
  shown=await captureCurrent(page);
  assert.equal(shown.id,"T0001","Actual Previous button must work");
  await page.click("#nextBtn");
  assert.equal((await captureCurrent(page)).id,"T1961");
  report.checks.push("Original X/Y renderer, item fidelity, bilingual cues, actual Prev/Next buttons and stale-content check");
  console.log("WINDOWS_PREVIEW_UI_PASS",JSON.stringify({elementsX:3,elementsY:3,topics:fixtures.length}));

  phase="sw-install";
  await page.evaluate(async()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),{timeout:20000});
  await page.waitForFunction(async()=>{
   const keys=await caches.keys(),k=keys.find(x=>x.startsWith("pe-study-note-shell-"));
   if(!k)return false;
   const c=await caches.open(k),r=await c.match(new URL("/study-note.html",location.href).href);
   return Boolean(r)&&(await r.text()).includes('name="qa-preview-revision" content="A"');
  },{timeout:15000});
  const first=await cacheSnapshot(page);
  assert.ok(first.cachedHtml.includes('content="A"'),"Initial app shell A must be in SW cache");
  report.checks.push("Real registered service-worker caches local app shell revision A");
  console.log("WINDOWS_PREVIEW_CACHE_A_PASS");

  phase="network-first";
  revision="B";
  await page.reload({waitUntil:"domcontentloaded",timeout:30000});
  await assertReadyAndLocked(page);
  assert.equal(await page.$eval('meta[name="qa-preview-revision"]',e=>e.content),"B",
   "Network-first refresh must load new online app shell");
  await page.waitForFunction(async()=>{
   const keys=await caches.keys(),k=keys.find(x=>x.startsWith("pe-study-note-shell-"));
   if(!k)return false;
   const c=await caches.open(k),r=await c.match(new URL("/study-note.html",location.href).href);
   return Boolean(r)&&(await r.text()).includes('name="qa-preview-revision" content="B"');
  },{timeout:15000});
  shown=await captureCurrent(page);
  assert.equal(shown.id,"T1961","IndexedDB and last-topic restore must survive online refresh");
  assert.ok(shown.yText.includes("RFC 8446"));
  report.checks.push("Network-first loads newer revision B, updates cached HTML, restores selected topic from real IndexedDB");
  console.log("WINDOWS_PREVIEW_CACHE_UPDATE_PASS");

  phase="offline-fallback";
  await page.setOfflineMode(true);
  await page.reload({waitUntil:"domcontentloaded",timeout:30000});
  await waitForReady(page);
  assert.equal(await page.$eval('meta[name="qa-preview-revision"]',e=>e.content),"B",
   "Offline reload must return latest B cache, not stale revision A");
  shown=await captureCurrent(page);
  assert.equal(shown.id,"T1961","Last topic must survive offline reload from IndexedDB");
  await page.click("#prevBtn");
  shown=await captureCurrent(page);
  assert.equal(shown.id,"T0001");
  assert.equal(shown.x.length,3);
  report.checks.push("Offline fallback serves latest cached B shell; local topics, X/Y rendering and buttons remain usable");
  console.log("WINDOWS_PREVIEW_OFFLINE_PASS");

  phase="mobile-layout";
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await page.evaluate(()=>{
   const selected=filteredTopics.find(t=>t.topicId==="TQA-NUMERIC");
   if(!selected)throw Error("Numeric fixture missing");
   showTopicById(selected.topicId,{scrollList:false});
  });
  shown=await captureCurrent(page);
  assert.equal(shown.x.length,4);
  assert.ok(shown.xText.includes("802.11p")&&shown.xText.includes("802.1X/EAP"));
  assert.ok(shown.overflow<=2);
  const layout=await page.evaluate(async()=>{
   window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"});
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   return {detailBottom:document.getElementById("topicDetail").getBoundingClientRect().bottom,
     navTop:document.getElementById("bottomNav").getBoundingClientRect().top};
  });
  assert.ok(layout.detailBottom<=layout.navTop+2);
  report.checks.push("390px offline mobile viewport: IEEE values present and last item not hidden behind bottom navigation");
  console.log("WINDOWS_PREVIEW_MOBILE_PASS");

  assert.equal(unexpected.length,0,"Unexpected uncaught browser errors: "+unexpected.join(" | "));
  report.blockedExternalRequests=externalRequestsBlocked;
  report.checkCount=report.checks.length;
  report.status="PASS";
  fs.writeFileSync(path.join(reportDir,"qa-results.json"),JSON.stringify(report,null,2));
  console.log("WINDOWS_PREVIEW_CACHE_QA_PASS",report.checks.length,"checks");
 }catch(error){
  report.status="FAIL";
  report.phase=phase;
  report.error=String(error.stack||error);
  fs.writeFileSync(path.join(reportDir,"qa-results.json"),JSON.stringify(report,null,2));
  console.error("WINDOWS_PREVIEW_CACHE_QA_FAIL",phase,error.stack||String(error));
  process.exitCode=1;
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  try{fs.rmSync(localProfile,{recursive:true,force:true});}catch(e){
   console.warn("Ephemeral Chrome profile cleanup deferred:",String(e));
  }
 }
})().catch(e=>{console.error(e.stack||String(e));process.exitCode=1;});
