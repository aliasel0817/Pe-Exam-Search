'use strict';
// R13 real Windows Chrome UI smoke. Serve only the local checked-out assets
// through a Pages-style origin; block external backend and ALL write requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.R13_PLAYWRIGHT_MODULE||
  path.resolve(__dirname,'../../m3/node_modules/playwright'));
const repo=path.resolve(__dirname,'../../../..'),study=path.join(repo,'study-note');
const base='https://aliasel0817.github.io/Pe-Exam-Search/study-note/';
const contentType=file=>file.endsWith('.html')?'text/html; charset=utf-8':
 file.endsWith('.wasm')?'application/wasm':/\.(m?js)$/.test(file)?'text/javascript':
 file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':
 'application/octet-stream';
async function main(){
 const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless:true,args:['--no-first-run','--no-default-browser-check']});
 const report=[];let externalBlocked=0,writeAttempts=0;
 let context;
 try{
  context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>{
   const request=route.request(),url=request.url();
   if(request.method()!=='GET'){writeAttempts++;return route.abort('blockedbyclient');}
   if(!url.startsWith(base)){externalBlocked++;return route.abort('blockedbyclient');}
   const rel=decodeURIComponent(url.slice(base.length).split('?')[0]);
   const full=path.resolve(study,rel);
   if(!full.startsWith(study+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile())
    return route.fulfill({status:404,body:'R13 local-only 404'});
   return route.fulfill({status:200,contentType:contentType(full),body:fs.readFileSync(full)});
  });
  for(const vp of [
   {width:1440,height:900,label:'PC Chrome'},
   {width:860,height:768,label:'User screenshot width'},
   {width:402,height:874,label:'iPhone 16 Pro size (Chrome emulation)'},
   {width:320,height:740,label:'320px accessibility'}
  ]){
   const page=await context.newPage();
   await page.setViewportSize(vp);
   const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,180)));
   const response=await page.goto(base+'study-note.html?r13_local_test=1',
     {waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(response.status(),200);
   await page.waitForSelector('#manageJumpTopBtn',{state:'attached',timeout:12000});
   await page.evaluate(()=>{
    const modal=document.getElementById('manageModal');
    modal.classList.remove('hidden');
    const card=modal.querySelector('.manage-card');
    card.scrollTop=0;
    document.getElementById('manageTopicName').value='R13-PRESERVE-INPUT-EXACT';
    document.getElementById('manageConcept').value='Input stays unchanged after fast scroll';
    window.__r13Submitted=0;
    document.getElementById('manageForm').addEventListener('submit',event=>{
     window.__r13Submitted++;event.preventDefault();
    },{capture:true});
   });
   const initial=await page.evaluate(()=>{
    const modal=document.getElementById('manageModal');
    const card=modal.querySelector('.manage-card'),toolbar=modal.querySelector('.manage-quick-scroll');
    const r=toolbar.getBoundingClientRect(),c=card.getBoundingClientRect();
    return {max:card.scrollHeight-card.clientHeight,
      toolbarStyle:getComputedStyle(toolbar).position,top:r.top,cardTop:c.top,
      btns:[...toolbar.querySelectorAll('button')].map(x=>({id:x.id,type:x.type,
        aria:x.getAttribute('aria-label'),width:x.getBoundingClientRect().width})),
      bodyY:window.scrollY};
   });
   assert(initial.max>200,'topic manage dialog is not internally scrollable');
   assert.equal(initial.toolbarStyle,'sticky');
   assert.equal(initial.btns.length,2);
   assert(initial.btns.every(b=>b.type==='button'&&b.width>=44&&b.aria));
   await page.locator('#manageJumpBottomBtn').click();
   const down=await page.evaluate(()=>{
    const card=document.querySelector('#manageModal .manage-card');
    return {top:card.scrollTop,max:card.scrollHeight-card.clientHeight,
     toolbarTop:document.querySelector('.manage-quick-scroll').getBoundingClientRect().top,
     cardTop:card.getBoundingClientRect().top,
     visible:document.querySelector('.manage-quick-scroll').getBoundingClientRect().bottom>0};
   });
   assert(Math.abs(down.top-down.max)<=2,'down button did not reach the modal bottom');
   assert(down.visible && down.toolbarTop>=down.cardTop-2,
     'quick controls not sticky when long form scrolled to bottom');
   await page.locator('#manageJumpTopBtn').click();
   const up=await page.evaluate(()=>{
    const card=document.querySelector('#manageModal .manage-card');
    return {top:card.scrollTop,bodyY:window.scrollY,
     topicName:document.getElementById('manageTopicName').value,
     concept:document.getElementById('manageConcept').value,
     submitted:window.__r13Submitted};
   });
   assert(up.top<=2,'up button did not return to top');
   assert.equal(up.bodyY,initial.bodyY,'scrolled main page instead of modal');
   assert.equal(up.topicName,'R13-PRESERVE-INPUT-EXACT');
   assert.equal(up.concept,'Input stays unchanged after fast scroll');
   assert.equal(up.submitted,0,'scroll button submitted the topic edit form');
   // Keyboard-only access: Enter and Space operate the two native buttons.
   await page.locator('#manageJumpBottomBtn').focus();
   await page.keyboard.press('Enter');
   assert(await page.locator('#manageModal .manage-card').evaluate(el=>el.scrollTop>100));
   await page.locator('#manageJumpTopBtn').focus();
   await page.keyboard.press('Space');
   assert(await page.locator('#manageModal .manage-card').evaluate(el=>el.scrollTop<=2));
   const rects=await page.evaluate(()=>{
    const card=document.querySelector('#manageModal .manage-card'),c=card.getBoundingClientRect();
    return [...document.querySelectorAll('#manageModal .manage-quick-scroll button')].map(b=>{
      const x=b.getBoundingClientRect();return {x:x.x,right:x.right,width:x.width,
        cardLeft:c.left,cardRight:c.right};
    });
   });
   for(const box of rects)assert(box.x>=box.cardLeft-2&&box.right<=box.cardRight+2,
      'quick-scroll button protrudes outside modal on '+vp.label);
   await page.locator('#closeManageBtn').click();
   assert(await page.locator('#manageModal').evaluate(x=>x.classList.contains('hidden')),
     'close behavior changed');
   report.push({viewport:vp.label,width:vp.width,topBottom:true,
     sticky:true,formUnchanged:true,keyboard:true,closeUnchanged:true,
     pageErrors:errors.length});
   await page.close();
  }
  assert.equal(writeAttempts,0);
  console.log('R13_CHROME_TOPIC_MANAGE_PASS '+JSON.stringify({chrome:browser.version(),
   cases:report,thirdPartyRequestsBlocked:externalBlocked,writeAttempts}));
 }finally{await context?.close();await browser.close();}
}
main().catch(e=>{console.error('R13_CHROME_TOPIC_MANAGE_FAIL '+e.stack);process.exitCode=1;});
