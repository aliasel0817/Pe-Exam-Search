"use strict";
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const puppeteer=require('../../.qa-browser/node_modules/puppeteer-core');
const root=path.resolve(__dirname,'..');
const plan=JSON.parse(fs.readFileSync(path.join(root,'study-plans','pe141-100days.json'),'utf8'));
const planId='pe141-100d-2026';
const freshIds=['T4069','T4070','T4051','T4066','T4068','T4071','T4063','T4064','T4065','T4062','T4072','T4059','T4074','T4067','T4055','T4061','T4073','T4056','T4057','T4058','T4054','T4060','T4052','T4053'];
const originalIds=[...new Set(plan.days.flatMap(day=>day.ids))];
assert.equal(originalIds.length,3812);
assert(freshIds.every(id=>!originalIds.includes(id)));
const topics=originalIds.map(id=>({topicId:id,topicName:'기존 '+id,studyTarget:'Y',categoryCode:'SW-01',categoryName:'SW',domain:'SW',domainName:'소프트웨어공학'}));
topics.push(...freshIds.map(id=>({topicId:id,topicName:'신규 '+id,studyTarget:'Y',categoryCode:'AI-06',categoryName:'AI 보안',domain:'AI',domainName:'AI'})));
topics.push({topicId:'T4099',topicName:'학습 제외',studyTarget:'N',categoryCode:'AI-06',categoryName:'AI 보안',domain:'AI',domainName:'AI'});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),p=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);res.end();return}
 res.setHeader('Content-Type',p.endsWith('.json')?'application/json':p.endsWith('.js')?'text/javascript':'text/html');
 res.end(fs.readFileSync(p));
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function dbSnapshot(page){
 return page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pe-study-planner-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const get=store=>new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const [plans,progress]=await Promise.all([get('plans'),get('progress')]);db.close();
  return {plans,progress};
 });
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const chrome=process.env.CHROME_BIN||'/usr/bin/google-chrome';
 let browser;
 try{
  browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-extensions']});
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',req=>req.url().startsWith(origin+'/')?req.continue():req.abort());
  const errors=[],dialogs=[];
  page.on('pageerror',err=>errors.push(String(err)));
  page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept()});
  await page.goto(origin+'/study-note.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.StudyPlanner&&document.getElementById('plannerManage')),{timeout:15000});
  await page.evaluate(t=>{allTopics=t},topics);
  await page.click('#learningBtn');
  await page.waitForFunction(()=>document.getElementById('plannerStats')?.textContent.includes('계획 '),{timeout:15000});
  await page.evaluate(()=>document.querySelector('[data-learning-view="plan"]').click());
  await page.waitForFunction(()=>document.getElementById('plannerStats')?.textContent.includes('시작 2026-10-22'),{timeout:12000});
  assert((await page.$eval('#plannerStats',e=>e.textContent)).includes('23/100일차'),'Compact stats should include Korean day number');
  const day=plan.days.find(x=>x.date==='2026-11-13');
  assert(day,'fixture day exists');
  const key=planId+'|2026-11-13|'+day.ids[0];
  await page.evaluate(row=>new Promise((resolve,reject)=>{
   const r=indexedDB.open('pe-study-planner-v1');r.onsuccess=()=>{
    const db=r.result,tx=db.transaction('progress','readwrite');tx.objectStore('progress').put(row);
    tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error);
   };r.onerror=()=>reject(r.error);
  }),{key,planId,date:'2026-11-13',topicId:day.ids[0],status:'done',updatedAt:'2026-11-13T00:00:00Z'});
  const before=await dbSnapshot(page);
  assert.equal(before.plans[0].entries,19060);
  await page.click('#plannerManage');
  await page.$eval('#plannerExtendStart',el=>{el.value='2026-11-14';el.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.click('#plannerExtendCheck');
  await page.waitForFunction(()=>!document.getElementById('plannerExtendApply').disabled,{timeout:12000});
  assert((await page.$eval('#plannerExtendPreview',e=>e.textContent)).includes('신규 학습대상 24개'));
  await page.click('#plannerExtendApply');
  await page.waitForFunction(()=>document.getElementById('plannerNotice').textContent.includes('24개를 5회씩 편입'),{timeout:20000});
  const after=await dbSnapshot(page);
  const upgraded=after.plans.find(p=>p.id===planId);
  assert(upgraded);
  assert.equal(upgraded.entries,19180);
  assert.equal(after.progress.length,1);
  assert.deepEqual(after.progress,before.progress);
  for(let i=0;i<plan.days.length;i++){
   const orig=plan.days[i],next=upgraded.days[i];
   assert.deepEqual(next.ids.slice(0,orig.ids.length),orig.ids,'original IDs must stay at fixed slots');
   assert.deepEqual(next.groups.slice(0,orig.groups.length),orig.groups,'original grouping must stay at fixed slots');
  }
  for(const id of freshIds){
   const added=upgraded.days.filter(d=>d.ids.includes(id));
   assert.equal(added.length,5,id+' must be assigned 5 times');
   assert(added.every(d=>d.date>='2026-11-14'&&Number.isInteger(d.round)));
  }
  assert.equal(upgraded.days.filter(d=>d.ids.includes('T4099')).length,0,'N excluded');
  await page.click('#plannerExtendCheck');
  await page.waitForFunction(()=>document.getElementById('plannerExtendPreview').textContent.includes('미편입 토픽이 없습니다.'),{timeout:12000});
  assert.equal(await page.$eval('#plannerExtendApply',e=>e.disabled),true,'must prevent duplicate add');
  await page.$eval('#plannerCreateName',e=>{e.value='제142회 검수 새 계획';e.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.$eval('#plannerCreateStart',e=>{e.value='2027-02-01';e.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.$eval('#plannerCreateEnd',e=>{e.value='2027-05-31';e.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.select('#plannerCreateScope','selected');
  await page.$eval('#plannerCreateIds',e=>{e.value='T4069; T4070';e.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.click('#plannerCreatePreviewBtn');
  await page.waitForFunction(()=>!document.getElementById('plannerCreateApply').disabled,{timeout:12000});
  assert((await page.$eval('#plannerCreatePreview',e=>e.textContent)).includes('10건'));
  await page.click('#plannerCreateApply');
  await page.waitForFunction(()=>document.getElementById('plannerNotice').textContent.includes('새 계획 저장 완료'),{timeout:12000});
  const saved=await dbSnapshot(page);
  assert.equal(saved.plans.length,2);
  assert.equal(saved.progress.length,1);
  assert.deepEqual(saved.progress,before.progress);
  const personal=saved.plans.find(p=>p.id!==planId);
  assert.equal(personal.entries,10);
  assert.equal(personal.days.length,120);
  assert.equal(saved.plans.find(p=>p.id===planId).entries,19180);
  assert.equal(await page.$eval('#plannerSelect',e=>e.value),personal.id);
  assert.equal(dialogs.length,2,'each mutation requires explicit confirmation');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StudyPlanner&&document.querySelector('[data-learning-view="plan"]'),{timeout:15000});
  await page.click('#learningBtn');
  await page.evaluate(()=>document.querySelector('[data-learning-view="plan"]').click());
  await page.waitForFunction(()=>document.getElementById('plannerSelect')?.options.length===2,{timeout:15000});
  const persisted=await dbSnapshot(page);
  assert.equal(persisted.plans.find(p=>p.id===planId).entries,19180);
  assert.equal(persisted.plans.find(p=>p.id===personal.id).entries,10);
  assert.equal(persisted.progress.length,1);
  const snapshots=[];
  const screenshots=path.join(root,'qa-artifacts','study-planner-live-master');
  fs.mkdirSync(screenshots,{recursive:true});
  for(const width of [390,820,1280]){
   await page.setViewport({width,height:900,deviceScaleFactor:1});
   await page.evaluate(()=>{document.getElementById('plannerManagement').open=true;document.querySelector('.learning-dashboard-card').scrollTop=0});
   await delay(100);
   const info=await page.evaluate(()=>({
    viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
    panelWidth:Math.round(document.getElementById('studyPlannerPanel').getBoundingClientRect().width),
    managerWidth:Math.round(document.getElementById('plannerManagement').getBoundingClientRect().width)
   }));
   assert(info.documentWidth<=info.viewport+2,'document horizontal overflow '+JSON.stringify(info));
   assert(info.panelWidth<=info.viewport,'panel overflow '+JSON.stringify(info));
   snapshots.push(info);
   if(width===390||width===1280)await page.screenshot({path:path.join(screenshots,'planner-'+width+'.png')});
  }
  assert.deepEqual(errors,[]);
  console.log('STUDY_PLANNER_MASTER_BROWSER_PASS',JSON.stringify({existing:19060,added:120,total:19180,newPlan:10,progressPreserved:true,snapshots,dialogs:dialogs.length}));
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{console.error('STUDY_PLANNER_MASTER_BROWSER_FAIL',error.stack||error);process.exitCode=1;server.close()});
