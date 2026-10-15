"use strict";

/**
 * Browser QA for the ACTUAL production Study Note HTML, CSS, DOM and formatter.
 * The file is loaded from this PR's study-note.html, not from a rewritten
 * miniature template. Auth, IndexedDB, Apps Script and external scripts are
 * disabled in a temporary in-memory copy; production files never change.
 * Fixture topics are synthetic and cannot write to LIVE Google Sheets.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const puppeteer = require("../../.qa-browser/node_modules/puppeteer-core");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "study-note.html");
const outputDir = path.join(root, "qa-artifacts", "visibility-browser");
fs.mkdirSync(outputDir, { recursive: true });
const originalHtml = fs.readFileSync(htmlPath, "utf8");

function replaceOne(source, from, into) {
  assert.equal(source.split(from).length - 1, 1, "Expected exactly one bootstrap marker: " + from);
  return source.replace(from, into);
}
let testHtml = replaceOne(
  originalHtml,
  "window.addEventListener('DOMContentLoaded', init);",
  "window.addEventListener('DOMContentLoaded', () => { bindElements(); window.__visibilityQaReady = true; });"
);
testHtml = testHtml
  .replace(/<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>/, "")
  .replace(/<script src="\.\/tts\/natural-tts\.js\?v=[^"]+"><\/script>/, "")
  .replace(/<link rel="manifest" href="\.\/manifest\.webmanifest">/, "");
assert.ok(testHtml.includes("function showTopicById("));
assert.ok(testHtml.includes("study-preserved-lines"));
assert.ok(testHtml.includes("splitSimpleKoreanFeatureNamesForDisplay"));

const makeTopic = (id, title, features, technicalComponents, keywords = "") => ({
  topicId:id, topicName:title,
  domain:"MG", domainName:"경영정보",
  domainOrder:1, categoryCode:"MG-01",categoryName:"화면검수",
  topicOrder:1, importance:"중", studyTarget:"Y",
  concept:"표시 검수를 위한 합성 토픽(실제 LIVE 자료 아님)",
  background:"", necessity:"", features,technicalComponents, keywords,
  mnemonic:"",relatedTopics:"",status:"QA",sourceDomain:"",
  subnotePages:"",textbookPages:"",studyExclusionReason:"",notes:"",
  sourceLinkCount:0
});
const fixtures = [
  makeTopic("T0001","3C 분석 — 일반 항목 분리",
    "Customer(고객)·Competitor(경쟁사)·Company(자사) 관점 분석 · 경쟁사 전략 분석 · 자사 역량 진단",
    "분석관점: Customer(고객 니즈·시장규모·구매행동 분석) · Competitor(경쟁사 전략·점유율·강약점 분석) · Company(자사 핵심역량·자원·성과 분석)",
    "고객(Customer), 경쟁사(Competitor), 자사(Company)"),
  makeTopic("T1961","MCTS — 중첩 괄호와 6개 기술요소",
    "Selection(선택)→Expansion(확장)→Simulation(시뮬레이션)→Backpropagation(역전파) 반복 · UCT로 탐색을 조정 · 롤아웃 성능 고려",
    "탐색요소: Selection(선택)(현재 Tree(트리)에서 UCT(Upper Confidence Bounds for Trees, 트리상한신뢰도)로 Node(노드)를 선택) · Expansion(확장)(미탐색 Action(행동)의 Child Node(자식노드)를 추가) · Simulation/Rollout(시뮬레이션/롤아웃)(종료까지 가상 탐색을 수행) · Reward(보상)(시뮬레이션 Result(결과)의 보상 값을 계산) · Backpropagation(역전파)(Visit(방문수)·Value(가치)를 조상 노드에 역전파) · Action Selection(행동 선택)(우수한 Root Action(루트 행동)을 최종 선정)",
    "선택(Selection), 확장(Expansion), 보상(Reward), 역전파(Backpropagation)"),
  makeTopic("T4036","쉼표형 특징 6개 / 기존 번호 절차",
    "비대화형 인증, 대량 동적 생성, 상시 접근성, 자격증명 의존성, 권한 집중성, 추적 관리 복잡성",
    "1. 공격절차: 1)신원정보 수집(영상과 음성 데이터), 2)AI 신원 합성(딥페이크)\n2. 공격유형: 인간 신원 및 AI 에이전트 신원 위조\n3. 대응방안: 위험기반 인증·권한통제"),
  makeTopic("T4038","QEC — 기작성 계층형/하이픈 원문",
    "- 논리 큐비트를 여러 물리 큐비트로 인코딩\n- 패리티(Parity) 측정 시 양자 상태 유지\n- 비파괴적 오류 검출과 선택적 보정",
    "1. 코드:\n  가. 표면 부호(suface code): 2차원 격자 기반 국소적 상호작용\n  나. 양자 LDPC(Quantum Low Density Parity Check, qLDPC): 희소 행렬 기반 장거리 상호작용"),
  makeTopic("TQA-LONG","긴 설명·중첩 괄호·수식/표준",
    "보안 경계 분석 · 표준·정량 지표 비교 · 알고리즘의 예외 조건 확인",
    "구성요소: Validation(검증)(입력 자료 내부에 (a+b)·[x,y]·O(n log n) 관계가 있어도 삭제 없이 유지하고, RFC 8446/TLS 1.3, AES-256, 1.25 Gbps, λ=0.025 및 99.999% 기준을 동시에 대조하여 적합성을 검증하고 보안 요구사항과 연결) · Monitoring(모니터링)(매우 긴 설명을 좁은 화면에서 다음 줄로 자연스럽게 연결하면서 계산식 2^256, 10^-6, HMAC-SHA256, TLS_AES_128_GCM_SHA256과 정책 식별자 ISO/IEC 27001:2022를 줄이지 않고 그대로 표시하기 위한 합성 테스트)")
];
const viewports=[
 {name:"windows-1280",width:1280,height:850,isMobile:false},
 {name:"tablet-landscape-1180",width:1180,height:820,isMobile:false},
 {name:"tablet-820",width:820,height:1180,isMobile:false},
 {name:"phone-landscape-844",width:844,height:390,isMobile:true},
 {name:"phone-402",width:402,height:874,isMobile:true},
 {name:"iphone-390",width:390,height:844,isMobile:true},
 {name:"narrow-320",width:320,height:720,isMobile:true}
];
function createServer(html){
  const server = http.createServer((req,res)=>{
    if(req.url === "/study-note.html"){
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
      res.end(html);
    }else if(req.url === "/study-note-safearea.html"){
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
      // Simulate a 34px iOS bottom safe area without changing the PWA source.
      res.end(html.replaceAll("env(safe-area-inset-bottom)","34px"));
    }else{res.writeHead(404);res.end("QA: no external resources served");}
  });
  return new Promise(resolve=>server.listen(0,"127.0.0.1",()=>resolve(server)));
}
const keepScreenshot = new Set(["T0001","T1961","T4036","T4038","TQA-LONG"]);

(async()=>{
  const server=await createServer(testHtml);
  const chromePath=process.env.CHROME_BIN || "/usr/bin/google-chrome";
  let browser;
  const all=[];
  try{
    browser=await puppeteer.launch({headless:true,executablePath:chromePath,args:[
      "--no-sandbox","--disable-dev-shm-usage","--disable-extensions",
      "--disable-background-networking","--no-first-run","--disable-gpu"
    ]});
    for(const vp of viewports){
      const page=await browser.newPage();
      await page.setViewport({width:vp.width,height:vp.height,isMobile:vp.isMobile,hasTouch:vp.isMobile,deviceScaleFactor:1});
      const fatal=[];
      page.on("pageerror",error=>fatal.push(String(error)));
      await page.goto("http://127.0.0.1:"+server.address().port+"/study-note.html",{waitUntil:"domcontentloaded",timeout:15000});
      await page.waitForFunction("window.__visibilityQaReady===true",{timeout:8000});
      const ready=await page.evaluate(()=>({title:document.title,hasFullAppDom:!!document.getElementById("topicDetail")&&!!document.getElementById("topicList"),hasRealFormatter:typeof setReadableStudyField==="function",ready:window.__visibilityQaReady}));
      assert.equal(ready.hasFullAppDom,true,"Full PWA topic detail/list DOM must be present");
      assert.equal(ready.hasRealFormatter,true,"Must use actual production formatter");
      await page.evaluate(topics=>{
        allTopics=topics;
        filteredTopics=topics;
        topicPage=1;
        window.peStudyNoteTTS={onTopicChanged(){}};
      },fixtures);
      for(const topic of fixtures){
        const render=await page.evaluate(topicId=>{
          showTopicById(topicId,{scrollList:false});
          const main=document.querySelector("#topicDetail");
          const x=document.querySelector("#detailFeatures"),y=document.querySelector("#detailTechnicalComponents");
          const xList=x.querySelector("ol.study-readable-list"),yList=y.querySelector("ol.study-readable-list");
          const boxed=el=>({width:Math.round(el.getBoundingClientRect().width),client:el.clientWidth,scroll:el.scrollWidth,whiteSpace:getComputedStyle(el).whiteSpace});
          const report={
            currentTopicId, display:getComputedStyle(main).display, x:boxed(x),y:boxed(y),
            xCount:xList?.children.length||0, yCount:yList?.children.length||0,
            xRaw:x.textContent,yRaw:y.textContent,
            xSourceItems:xList?[...xList.children].map(li=>li.dataset.studyOriginalItem):[],
            ySourceItems:yList?[...yList.children].map(li=>li.dataset.studyOriginalItem):[],
            technicalEnglishGlossCount:y.querySelectorAll(".study-technical-original-name").length,
            rootWidth:document.documentElement.scrollWidth,
            viewportWidth:document.documentElement.clientWidth,
            inlineOverflow:[x,y].filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.id),
            heading:document.querySelector("#detailTitle").textContent,
          };
          return report;
        },topic.topicId);
        assert.equal(render.currentTopicId,topic.topicId,"Topic navigation must change selected id");
        assert.notEqual(render.display,"none","Full PWA detail must be visible");
        assert.ok(render.x.width>0&&render.y.width>0,"X/Y must have measurable width");
        assert.equal(render.heading,topic.topicName);
        assert.equal(render.inlineOverflow.length,0,"Horizontal text overflow: "+JSON.stringify(render.inlineOverflow));
        assert.ok(render.rootWidth<=vp.width+2,"Document horizontally overflows: "+render.rootWidth+" > "+vp.width);
        if(topic.topicId==="T0001"){
          assert.equal(render.xCount,3);
          assert.equal(render.yCount,3);
          assert.match(render.xRaw,/고객 \(Customer\)·경쟁사 \(Competitor\)·자사 \(Company\)/);
          assert.equal(render.xSourceItems[0],"Customer(고객)·Competitor(경쟁사)·Company(자사) 관점 분석");
          assert.match(render.yRaw,/고객/);
          assert.match(render.yRaw,/Customer/);
        }
        if(topic.topicId==="T1961"){
          assert.equal(render.yCount,6);
          assert.match(render.yRaw,/UCT\(Upper Confidence Bounds for Trees, 트리상한신뢰도\)/);
        }
        if(topic.topicId==="T4036"){
          assert.equal(render.xCount,6);
          assert.deepEqual(render.xSourceItems,topic.features.split(", "));
          assert.equal(render.yCount,0);
          assert.equal(render.y.whiteSpace,"pre-wrap");
          assert.equal(render.yRaw,topic.technicalComponents);
        }
        if(topic.topicId==="T4038"){
          assert.equal(render.xCount,0);
          assert.equal(render.yCount,0);
          assert.equal(render.x.whiteSpace,"pre-wrap");
          assert.equal(render.y.whiteSpace,"pre-wrap");
          assert.equal(render.xRaw,topic.features);
          assert.equal(render.yRaw,topic.technicalComponents);
        }
        if(topic.topicId==="TQA-LONG"){
          assert.equal(render.yCount,2);
          for(const token of ["RFC 8446","TLS 1.3","AES-256","1.25 Gbps","λ=0.025","99.999%","2^256","HMAC-SHA256","ISO/IEC 27001:2022"])
            assert.ok(render.yRaw.includes(token),"Exact numeric/standard token lost: "+token);
        }
        assert.deepEqual(fatal,[],"Uncaught app page error: "+JSON.stringify(fatal));
        if(keepScreenshot.has(topic.topicId)){
          await page.screenshot({path:path.join(outputDir,vp.name+"-"+topic.topicId+".png"),fullPage:true});
        }
        all.push({vp:vp.name,topic:topic.topicId,xItems:render.xCount,yItems:render.yCount,overflow:render.inlineOverflow.length,documentExtraWidth:Math.max(0,render.rootWidth-vp.width),pass:true});
      }
      // Actual PWA full viewport scroll QA: fixed bottom navigation must not
      // make the last topic-detail card permanently unreadable.
      const bottomReachability=await page.evaluate(()=>{
        showTopicById("TQA-LONG",{scrollList:false});
        window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"});
        return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
          const detail=document.querySelector("#topicDetail");
          const nav=document.querySelector("#bottomNav");
          const content=detail.closest(".content");
          const lastCards=[...detail.querySelectorAll(".study-card")];
          const lastCard=lastCards[lastCards.length-1];
          const navRect=nav.getBoundingClientRect();
          resolve({
            scrollY:window.scrollY,canScroll:document.documentElement.scrollHeight>innerHeight,
            detailBottom:detail.getBoundingClientRect().bottom,
            lastCardBottom:lastCard?.getBoundingClientRect().bottom,
            navTop:navRect.top,
            navBottom:navRect.bottom,
            paddingBottom:parseFloat(getComputedStyle(content).paddingBottom),
            lastCardName:lastCard?.querySelector("h3")?.textContent||"unknown",
            navVisible:getComputedStyle(nav).display!=="none"
          });
        })));
      });
      assert.equal(bottomReachability.navVisible,true,"Bottom navigation must be visible");
      assert.equal(bottomReachability.canScroll,true,"Long detail must be scrollable");
      assert.ok(bottomReachability.detailBottom<=bottomReachability.navTop+2,
        "Last detail would be permanently hidden behind bottom navigation: "+JSON.stringify(bottomReachability));
      assert.ok(bottomReachability.lastCardBottom<=bottomReachability.navTop+2,
        "Last study card obstructed by bottom navigation: "+JSON.stringify(bottomReachability));

      // Switching raw hierarchical source to an auto-numbered technical list
      // must reset the CSS and fully replace the prior topic's view.
      const swap=await page.evaluate(()=>{
        showTopicById("T4038",{scrollList:false});
        const raw=document.querySelector("#detailTechnicalComponents");
        const rawPreserved=getComputedStyle(raw).whiteSpace==="pre-wrap";
        const rawHasList=!!raw.querySelector("ol");
        showTopicById("T1961",{scrollList:false});
        const list=document.querySelector("#detailTechnicalComponents");
        return {rawPreserved,rawHasList,listCount:list.querySelectorAll("ol.study-readable-list > li").length,
          listWhiteSpace:getComputedStyle(list).whiteSpace,
          stillHasPreserveClass:list.classList.contains("study-preserved-lines")};
      });
      assert.equal(swap.rawPreserved,true,"Authored hierarchy line breaks must be preserved");
      assert.equal(swap.rawHasList,false,"Do not double-number authored Y hierarchy");
      assert.equal(swap.listCount,6,"Technical list was not restored after topic switch");
      assert.equal(swap.stillHasPreserveClass,false,"Previous topic pre-wrap class leaked");

      // Responsive enlarged reading text at 150%, 200%, 250%:
      // test readability only; this is CSS root font scaling, NOT OS/browser zoom.
      const enlargements=await page.evaluate(()=>{
        const results=[];
        for(const scale of [150,200,250]){
          document.documentElement.style.fontSize=scale+"%";
          showTopicById("TQA-LONG",{scrollList:false});
          results.push({
            scale,
            docOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
            fieldOverflow:["detailFeatures","detailTechnicalComponents"].map(id=>{
              const el=document.getElementById(id);
              return {id,extra:Math.max(0,el.scrollWidth-el.clientWidth)};
            })
          });
        }
        document.documentElement.style.fontSize="";
        return results;
      });
      for(const enlarged of enlargements){
        assert.ok(enlarged.docOverflow<=2,
          "Enlarged reading font causes document horizontal overflow: "+JSON.stringify(enlarged));
        assert.ok(enlarged.fieldOverflow.every(f=>f.extra<=2),
          "Enlarged reading font causes X/Y overflow: "+JSON.stringify(enlarged));
      }
      console.log("READABILITY PASS",vp.name,"bottom",JSON.stringify(bottomReachability),
        "swap",JSON.stringify(swap),"enlargedFonts",JSON.stringify(enlargements));

      const nav=await page.evaluate(()=>{
        showTopicById("T0001",{scrollList:false});
        moveTopic(1);
        const afterNext=currentTopicId;
        moveTopic(-1);
        return {afterNext,afterPrev:currentTopicId};
      });
      assert.deepEqual(nav,{afterNext:"T1961",afterPrev:"T0001"},"Topic prev/next navigation broke");
      // Simulate a 34px system bottom inset for every responsive breakpoint.
      // This uses unchanged production CSS with env() substituted only in
      // the temporary offline QA HTTP response, not in study-note.html.
      {
        await page.goto("http://127.0.0.1:"+server.address().port+"/study-note-safearea.html",
          {waitUntil:"domcontentloaded",timeout:15000});
        await page.waitForFunction("window.__visibilityQaReady===true",{timeout:8000});
        await page.evaluate(topics=>{
          allTopics=topics;filteredTopics=topics;topicPage=1;
          window.peStudyNoteTTS={onTopicChanged(){}};
          showTopicById("TQA-LONG",{scrollList:false});
        },fixtures);
        const safeArea=await page.evaluate(()=>{
          window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"});
          return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
            const detail=document.getElementById("topicDetail");
            const content=detail.closest(".content");
            const nav=document.getElementById("bottomNav");
            resolve({contentPadding:parseFloat(getComputedStyle(content).paddingBottom),
              navHeight:nav.getBoundingClientRect().height,
              detailBottom:detail.getBoundingClientRect().bottom,
              navTop:nav.getBoundingClientRect().top});
          })));
        });
        assert.ok(safeArea.detailBottom<=safeArea.navTop+2,
          "iOS safe-area inset hides last text under bottom controls: "+JSON.stringify(safeArea));
        console.log("SAFEAREA PASS",vp.name,JSON.stringify(safeArea));
      }
      console.log("VIEWPORT PASS",vp.name,"cases",fixtures.length,"navigation",JSON.stringify(nav));
      await page.close();
    }
    fs.writeFileSync(path.join(outputDir,"qa-results.json"),JSON.stringify({
      commit:process.env.GITHUB_SHA||"local",source:"Full production PWA HTML + original CSS/JS and topic detail DOM; offline synthetic data only",
      fullAppBootstrap:"Isolated test copy: auth/IndexedDB/remote scripts disabled; bindElements and showTopicById/setReadableStudyField run",
      browser:"headless Google Chrome",viewports,results:all,failures:0,
      caveat:"NOT physical iPhone Safari / Galaxy Tab; NOT authenticated production service/backend"
    },null,2));
    console.log("VISIBILITY_QA_PASS:"+all.length+" topic-viewport combinations / "+viewports.length+" navigation scenarios");
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error("VISIBILITY_QA_FAILURE",error.stack||String(error));process.exitCode=1});
