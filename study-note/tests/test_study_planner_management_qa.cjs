"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),http=require("node:http");
const puppeteer=require("../../.qa-browser/node_modules/puppeteer-core");
const root=path.resolve(__dirname,"..");
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);res.end();return}
 res.setHeader("Content-Type",p.endsWith(".json")?"application/json":p.endsWith(".js")?"text/javascript":"text/html");
 res.end(fs.readFileSync(p));
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function downloaded(dir,name){
 for(let i=0;i<60;i++){const p=path.join(dir,name);if(fs.existsSync(p)&&fs.statSync(p).size>0)return p;await delay(100)}
 throw Error("Download missing: "+name);
}
(async()=>{
 let browser,dir=fs.mkdtempSync(path.join(os.tmpdir(),"pe-plan-management-qa-"));
 try{
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const origin="http://127.0.0.1:"+server.address().port;
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--no-sandbox","--disable-extensions"]});
  const page=await browser.newPage();
  const cdp=await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior",{behavior:"allow",downloadPath:dir});
  await page.setRequestInterception(true);
  page.on("request",req=>{if(req.url().startsWith(origin+"/"))req.continue();else req.abort()});
  const errors=[];page.on("pageerror",e=>errors.push(String(e)));
  await page.goto(origin+"/study-note.html",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>!!window.StudyPlanner&&!!document.getElementById('plannerManage'),{timeout:15000});
  await page.evaluate(()=>document.getElementById('learningBtn').click());
  await page.waitForFunction(()=>document.getElementById('plannerStats')?.textContent.includes('137'),{timeout:10000});
  assert.equal(await page.$eval('#plannerPageSize',e=>e.value),"10");
  assert.equal(await page.$eval('#plannerGroup',e=>e.value),"all");
  const groupOptions=await page.$$eval('#plannerGroup option',xs=>xs.map(x=>({value:x.value,name:x.textContent})));
  assert.equal(groupOptions.length,5);
  await page.select("#plannerGroup","G24");
  await page.waitForFunction(()=>document.getElementById('plannerTotalPages').textContent==='4');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.planner-topic').length),10);
  assert.equal(await page.$eval('#plannerPageRange',e=>e.textContent),'1–10 / 34개');
  await page.click('#plannerNextPage');
  await page.waitForFunction(()=>document.getElementById('plannerPageInput').value==='2');
  await page.select("#plannerGroup","all");
  await page.waitForFunction(()=>document.getElementById('plannerPageInput').value==='1'&&document.getElementById('plannerTotalPages').textContent==='14');
  const statsStyles=await page.evaluate(()=>({stats:getComputedStyle(document.getElementById('plannerStats')).fontSize,hint:getComputedStyle(document.querySelector('.planner-local-info')).fontSize}));
  assert.equal(statsStyles.stats,statsStyles.hint);
  const compactClosed=await page.evaluate(()=>{
   const panel=document.getElementById('plannerManagement');
   const note=panel.querySelector(':scope > .planner-local-info');
   const summary=panel.querySelector(':scope > summary');
   return {
    outsideNoteCount:document.querySelectorAll('#studyPlannerPanel > .planner-local-info').length,
    insideNoteCount:panel.querySelectorAll(':scope > .planner-local-info').length,
    noteText:note?.textContent,
    noteVisibleHeight:note?.getBoundingClientRect().height,
    titleSize:getComputedStyle(summary).fontSize,
    panelHeight:panel.getBoundingClientRect().height,
    marginTop:getComputedStyle(panel).marginTop
   };
  });
  assert.equal(compactClosed.outsideNoteCount,0);
  assert.equal(compactClosed.insideNoteCount,1);
  assert(compactClosed.noteText.includes('기기 간 자동 동기화되지 않습니다'));
  assert.equal(compactClosed.noteVisibleHeight,0,'Note must not occupy space while collapsed');
  assert.equal(compactClosed.titleSize,'12px','Summary title should be smaller');
  assert(compactClosed.panelHeight<55,'Collapsed help must remain compact');
  assert.equal(compactClosed.marginTop,'8px');
  assert.equal(await page.$eval('#plannerManagement',e=>e.open),false);
  await page.click("#plannerManage");
  await page.waitForFunction(()=>document.getElementById('plannerManagement').open);
  const expandedNoteHeight=await page.$eval('#plannerManagement > .planner-local-info',e=>e.getBoundingClientRect().height);
  assert(expandedNoteHeight>0,'Note should appear when manager is expanded');
  assert.equal(await page.$eval('#plannerManage',e=>e.getAttribute('aria-expanded')),'true');
  assert.equal(await page.$$eval('.planner-manage-section',xs=>xs.length),3);
  assert((await page.$eval('#plannerManagement',e=>e.textContent)).includes('CSV UTF-8'));
  assert((await page.$eval('#plannerManagement',e=>e.textContent)).includes('진도 복원'));
  await page.click("#plannerCsvSample");
  const csvFile=await downloaded(dir,"학습계획_작성예제.csv");
  const csv=fs.readFileSync(csvFile,"utf8");
  assert(csv.charCodeAt(0)===65279,"Excel-compatible CSV BOM missing");
  assert(csv.includes("planId,planName,date,round,groupCode,groupName,topicId"));
  assert(csv.includes("T0692"));
  await page.click("#plannerJsonSample");
  const jsonFile=await downloaded(dir,"학습계획_JSON_예제.json");
  const example=JSON.parse(fs.readFileSync(jsonFile,"utf8"));
  assert.equal(example.id,"my-review-2026-v1");
  assert.equal(example.days.reduce((sum,d)=>sum+d.ids.length,0),3);
  await (await page.$('#plannerUpload')).uploadFile(jsonFile);
  await page.waitForFunction(()=>document.querySelectorAll('#plannerSelect option').length===2,{timeout:10000});
  assert.equal(await page.$eval('#plannerGroup option',e=>e.value),'all');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('#plannerGroup option').length),3);
  await (await page.$('#plannerUpload')).uploadFile(jsonFile);
  await page.waitForFunction(()=>document.getElementById('plannerNotice').textContent.includes('이미 등록된 planId'),{timeout:10000});
  assert.equal(await page.evaluate(()=>document.querySelectorAll('#plannerSelect option').length),2);
  const newCsvPath=path.join(dir,'new-plan-v2.csv');
  fs.writeFileSync(newCsvPath,csv.replace(/my-review-2026-v1/g,"my-review-2026-v2"),"utf8");
  await (await page.$('#plannerUpload')).uploadFile(newCsvPath);
  await page.waitForFunction(()=>document.querySelectorAll('#plannerSelect option').length===3,{timeout:10000});
  assert.equal(await page.$eval('#plannerSelect',e=>e.value),'my-review-2026-v2');
  await page.select('#plannerGroup','B');
  await page.waitForFunction(()=>document.getElementById('plannerPageRange').textContent==='1–1 / 1개');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.planner-topic').length),1);
  // Invalid CSV must be rejected without mutating any plan.
  const invalid=path.join(dir,'invalid-plan.csv');
  fs.writeFileSync(invalid,csv.replace(/my-review-2026-v1/g,"my-review-invalid-v1").replace(/T3125/g,'BAD-ID'),"utf8");
  await (await page.$('#plannerUpload')).uploadFile(invalid);
  await page.waitForFunction(()=>document.getElementById('plannerNotice').textContent.includes('통합ID'),{timeout:10000});
  assert.equal(await page.evaluate(()=>document.querySelectorAll('#plannerSelect option').length),3);
  await page.select('#plannerSelect','pe141-100d-2026');
  await page.waitForFunction(()=>document.getElementById('plannerStats').textContent.includes('계획 137개'));
  assert.equal(await page.$eval('#plannerGroup',e=>e.value),'all');
  await page.evaluate(async()=>{await StudyPlanner.record('T0692','암기')});
  await page.click('#plannerExport');
  const backupFile=await downloaded(dir,'study-plan-progress-backup.json');
  const backup=JSON.parse(fs.readFileSync(backupFile,'utf8'));
  assert.equal(backup.format,'study-planner-progress-v1');
  assert.equal(backup.progress.length,1);
  assert.equal(backup.progress[0].status,'done');
  await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pe-study-planner-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
   await new Promise((resolve,reject)=>{const t=db.transaction('progress','readwrite');t.objectStore('progress').clear();t.oncomplete=resolve;t.onerror=()=>reject(t.error)});
   db.close();
  });
  await (await page.$('#plannerRestore')).uploadFile(backupFile);
  await page.waitForFunction(()=>document.getElementById('plannerNotice').textContent.includes('진도 1건을 복원했습니다'),{timeout:10000});
  assert((await page.$eval('#plannerStats',e=>e.textContent)).includes('완료 1개'));
  // Existing local progress requires explicit overwrite confirmation.
  await page.evaluate(async()=>{await StudyPlanner.record('T0692','미암기')});
  let confirmed=0;
  page.on('dialog',async dialog=>{confirmed++;assert(dialog.message().includes('덮어쓸까요'));await dialog.accept()});
  await (await page.$('#plannerRestore')).uploadFile(backupFile);
  await page.waitForFunction(()=>document.getElementById('plannerNotice').textContent.includes('기존 1건 덮어씀'),{timeout:10000});
  assert.equal(confirmed,1);
  assert((await page.$eval('#plannerStats',e=>e.textContent)).includes('완료 1개'));
  const widths=[];
  for(const width of [390,820,1280]){
   await page.setViewport({width,height:880,deviceScaleFactor:1});
   await page.evaluate(()=>document.getElementById('plannerManagement').open=true);
   const x=await page.evaluate(()=>({viewport:innerWidth,doc:document.documentElement.scrollWidth,modal:Math.round(document.querySelector('.learning-dashboard-card').getBoundingClientRect().width),manager:Math.round(document.querySelector('.planner-manager').getBoundingClientRect().width)}));
   assert(x.doc<=x.viewport+2,'Horizontal overflow: '+JSON.stringify(x));
   widths.push({width,...x});
   if(width===390||width===1280){
    const dir=path.join(root,'qa-artifacts','study-planner-management');fs.mkdirSync(dir,{recursive:true});
    await page.evaluate(()=>document.querySelector('.learning-dashboard-card').scrollTop=0);
    await page.screenshot({path:path.join(dir,'management-'+width+'.png')});
   }
  }
  assert.deepEqual(errors,[]);
  console.log('STUDY_PLANNER_MANAGEMENT_QA_PASS',JSON.stringify({options:groupOptions,default:10,uploadedPlans:3,downloads:2,restored:1,confirmations:confirmed,widths,statsStyles}));
 }finally{
  if(browser)await browser.close();
  await new Promise(r=>server.close(r));
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error('STUDY_PLANNER_MANAGEMENT_QA_FAIL',e.stack||e);process.exitCode=1;server.close()});
