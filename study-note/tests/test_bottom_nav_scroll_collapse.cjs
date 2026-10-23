"use strict";
/* Synthetic-only browser QA for topic navigation controls; no LIVE Sheet changes. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const puppeteer=require("../../.qa-browser/node_modules/puppeteer-core");
const root=path.resolve(__dirname,"..");
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
 const file=path.resolve(root,"."+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
 res.setHeader("Content-Type",file.endsWith(".json")?"application/json":file.endsWith(".js")?"text/javascript":"text/html; charset=utf-8");
 res.end(fs.readFileSync(file));
});
async function measure(page){
 return page.evaluate(()=>{
  const nav=document.getElementById("bottomNav"),actions=document.getElementById("bottomNavActions"),toggle=document.getElementById("navToggleBtn");
  const doc=document.scrollingElement||document.documentElement;
  return {
   viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
   pageY:Math.round(scrollY),maxY:Math.round(doc.scrollHeight-doc.clientHeight),
   visible:!nav.classList.contains("hidden"),
   collapsed:nav.classList.contains("nav-collapsed"),
   dockWidth:Math.round(nav.getBoundingClientRect().width),
   dockLeft:Math.round(nav.getBoundingClientRect().left),
   dockTop:Math.round(nav.getBoundingClientRect().top),
   actionsDisplay:getComputedStyle(actions).display,
   toggleExpanded:toggle.getAttribute("aria-expanded"),
   listDisplay:getComputedStyle(document.getElementById("listBtn")).display,
   lastCardBottom:Math.round(document.getElementById("detailNotes").closest(".study-card").getBoundingClientRect().bottom),
  };
 });
}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
  const origin="http://127.0.0.1:"+server.address().port;
  browser=await puppeteer.launch({
   executablePath:process.env.CHROME_BIN||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
   headless:true,args:["--no-sandbox","--disable-extensions"]
  });
  const page=await browser.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(String(e)));
  await page.setRequestInterception(true);
  page.on("request",req=>req.url().startsWith(origin+"/")?req.continue():req.abort());
  await page.goto(origin+"/study-note.html",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>!!document.querySelector("#navToggleBtn")&&typeof showTopicById==="function"&&!document.getElementById('refreshBtn').disabled&&!!db,{timeout:15000});
  await page.evaluate(()=>{
   const longText=Array.from({length:125},(_,i)=>"기존 기술정보 보존 확인 "+(i+1)+": 명칭·설명·구성요소·단계").join("\n");
   const make=(topicId,order)=>({
    topicId,topicName:"합성 검수 토픽 "+order,domain:"QA",domainName:"테스트",domainOrder:1,
    categoryCode:"QA-01",categoryName:"화면검증",categorySortOrder:1,topicOrder:order,
    importance:"중",studyTarget:"Y",concept:"화면 검수용 개념",
    background:longText,necessity:"필요성",features:"기능A(설명) · 기능B(설명)",technicalComponents:"요소A(설명) · 요소B(설명)",
    keywords:"기술키워드",mnemonic:"암기법",relatedTopics:"",status:"검수",
    sourceDomain:"",subnotePages:"",textbookPages:"",studyExclusionReason:"",
    notes:"마지막 비고: 맨 아래 이동 대상",sourceLinkCount:0
   });
   allTopics=[make("T0001",1),make("T0002",2)];
   filteredTopics=allTopics.slice();
   window.peStudyNoteTTS={onTopicChanged(){},onFilterChanged(){}};
   showTopicById("T0001",{scrollList:false});
  });
  const matrix=[];
  for(const width of [320,390,820,1280]){
   await page.setViewport({width,height:800,deviceScaleFactor:1});
   // Allow existing responsive sidebar slide-out transition to settle after viewport change.
   await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,320)));
   await page.evaluate(()=>{window.scrollTo(0,0);setBottomNavCollapsed(false)});
   const opened=await measure(page);
   assert(opened.visible&&opened.maxY>100,"Synthetic topic must be long and nav visible");
   assert.equal(opened.actionsDisplay,"flex");
   assert(opened.scrollWidth<=opened.viewport+2,"Horizontal overflow expanded: "+JSON.stringify(opened));
   assert(opened.dockLeft>=0,"Dock clipped at left: "+JSON.stringify(opened));
   assert.equal(opened.toggleExpanded,"true");
   // Existing previous/next navigation must work unmodified.
   await page.click("#nextBtn");

   assert.equal(await page.evaluate(()=>currentTopicId),"T0002");
   await page.click("#prevBtn");
   assert.equal(await page.evaluate(()=>currentTopicId),"T0001");
   await page.click("#jumpBottomBtn");
   await page.waitForFunction(()=>Math.abs(scrollY-((document.scrollingElement||document.documentElement).scrollHeight-innerHeight))<3,{timeout:5000});
   const bottom=await measure(page);
   assert(bottom.lastCardBottom<=bottom.dockTop+4,"Bottom card hidden by visible dock: "+JSON.stringify(bottom));
   await page.click("#jumpTopBtn");
   await page.waitForFunction(()=>scrollY<3,{timeout:5000});
   await page.click("#navToggleBtn");
   const collapsed=await measure(page);
   assert.equal(collapsed.collapsed,true);
   assert.equal(collapsed.actionsDisplay,"none");
   assert.equal(collapsed.toggleExpanded,"false");
   assert(collapsed.dockWidth<=52,"Collapsed dock should leave a tiny handle: "+JSON.stringify(collapsed));
   assert(collapsed.scrollWidth<=collapsed.viewport+2,"Horizontal overflow collapsed: "+JSON.stringify(collapsed));
   assert.equal(await page.evaluate(()=>localStorage.getItem("peStudyNote.bottomNavCollapsed.v1")),"1");
   await page.click("#navToggleBtn");
   const reopened=await measure(page);
   assert.equal(reopened.collapsed,false);
   assert.equal(reopened.toggleExpanded,"true");
   // On mobile the existing List button must open the search/list drawer.
   if(width<=760){
    assert.notEqual(reopened.listDisplay,"none");
    await page.click("#listBtn");
    assert.equal(await page.$eval("#sidebar",e=>e.classList.contains("open")),true);
    await page.click("#sidebarBackdrop");
    assert.equal(await page.$eval("#sidebar",e=>e.classList.contains("open")),false);
   }
   if(width===390||width===1280){
    const dir=path.join(root,"qa-artifacts","bottom-nav");
    fs.mkdirSync(dir,{recursive:true});
    await page.click("#jumpBottomBtn");
    await page.screenshot({path:path.join(dir,"expanded-"+width+".png")});
    await page.click("#navToggleBtn");
    await page.screenshot({path:path.join(dir,"collapsed-"+width+".png")});
    await page.click("#navToggleBtn");
   }
   matrix.push({width,opened,bottom,collapsed:{dockWidth:collapsed.dockWidth,actions:collapsed.actionsDisplay},reopened:reopened.dockWidth});
  }
  // Collapsed preference survives page reload and selecting a different topic.
  await page.evaluate(()=>setBottomNavCollapsed(true));
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>typeof showTopicById==="function"&&!!document.getElementById("navToggleBtn"),{timeout:15000});
  await page.evaluate(()=>{
   allTopics=[{topicId:"T0001",topicName:"복원테스트",domain:"QA",domainName:"검증",categoryCode:"QA-01",categoryName:"화면검증",topicOrder:1,importance:"중",studyTarget:"Y",concept:"복원 확인"}];
   filteredTopics=allTopics.slice();
   showTopicById("T0001",{scrollList:false});
  });
  assert.equal(await page.$eval("#bottomNav",e=>e.classList.contains("nav-collapsed")),true);
  assert.equal(await page.$eval("#navToggleBtn",e=>e.getAttribute("aria-expanded")),"false");
  assert.deepEqual(errors,[]);
  console.log("BOTTOM_NAV_QA_PASS",JSON.stringify({matrix:matrix.map(m=>({width:m.width,maxScroll:m.opened.maxY,dockWidth:m.opened.dockWidth,collapsedWidth:m.collapsed.dockWidth,noOverflow:true})),listOpens:true,topBottomNavigation:true,prefSurvivesReload:true,errors:0}));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(e=>{console.error("BOTTOM_NAV_QA_FAIL",e.stack||e);process.exitCode=1;server.close()});
