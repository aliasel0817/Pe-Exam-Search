'use strict';
// R14: real Windows Chrome, local-only assets at the Pages origin.
// External backend requests and ALL writes are blocked; no real user data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.R13_PLAYWRIGHT_MODULE||
  path.resolve(__dirname,'../../m3/node_modules/playwright'));
const repo=path.resolve(__dirname,'../../../..'),study=path.join(repo,'study-note');
const base='https://aliasel0817.github.io/Pe-Exam-Search/study-note/';
const contentType=f=>f.endsWith('.html')?'text/html; charset=utf-8':
 f.endsWith('.wasm')?'application/wasm':/\.(m?js)$/.test(f)?'text/javascript':
 f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'application/octet-stream';
function noOverlap(a,b,label){
 assert(a.bottom<=b.top+1||b.bottom<=a.top+1||
  a.right<=b.left+1||b.right<=a.left+1,'overlap '+label+' '+JSON.stringify({a,b}));
}
async function run(){
 const browser=await chromium.launch({headless:true,
  executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-first-run','--no-default-browser-check']});
 let ctx,blocked=0,writes=0;const report=[];
 try{
  ctx=await browser.newContext({serviceWorkers:'block'});
  await ctx.route('**/*',route=>{
   const q=route.request(),url=q.url();
   if(q.method()!=='GET'){writes++;return route.abort('blockedbyclient');}
   if(!url.startsWith(base)){blocked++;return route.abort('blockedbyclient');}
   const rel=decodeURIComponent(url.slice(base.length).split('?')[0]);
   const full=path.resolve(study,rel);
   if(!full.startsWith(study+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile())
     return route.fulfill({status:404,body:'Not found'});
   return route.fulfill({status:200,contentType:contentType(full),body:fs.readFileSync(full)});
  });
  for(const viewport of [
   {width:1440,height:900,label:'PC Windows Chrome'},
   {width:860,height:768,label:'screenshot-sized Chrome'},
   {width:402,height:874,label:'iPhone-size viewport simulation'},
   {width:320,height:640,label:'320px narrow viewport'}
  ]){
   const page=await ctx.newPage();await page.setViewportSize(viewport);
   const errors=[];page.on('pageerror',error=>errors.push(error.message.slice(0,160)));
   const response=await page.goto(base+'study-note.html?r14_local=1',{waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(response.status(),200);
   await page.waitForSelector('#manageQuickToggleBtn',{state:'attached',timeout:12000});
   await page.evaluate(()=>{
    const modal=document.getElementById('manageModal');modal.classList.remove('hidden');
    const body=document.querySelector('#manageModal .manage-card');body.scrollTop=0;
    document.getElementById('manageTopicName').value='R14 KEEP INPUT';
    document.getElementById('manageConcept').value='R14 KEEP MULTILINE CONCEPT';
    window.__r14Submits=0;
    document.getElementById('manageForm').addEventListener('submit',e=>{
      window.__r14Submits++;e.preventDefault();
    },{capture:true});
   });
   const layout=await page.evaluate(()=>{
    const modal=document.getElementById('manageModal'),card=modal.querySelector('.manage-card');
    const body=card,dock=modal.querySelector('.manage-quick-scroll');
    const rect=id=>document.getElementById(id).getBoundingClientRect().toJSON();
    return {card:card.getBoundingClientRect().toJSON(),body:body.getBoundingClientRect().toJSON(),
      dock:dock.getBoundingClientRect().toJSON(),
      dockRadius:getComputedStyle(dock).borderTopLeftRadius,
      dockShadow:getComputedStyle(dock).boxShadow,
      dockBackground:getComputedStyle(dock).backgroundColor,
      bodyOverflow:getComputedStyle(body).overflowY,
      dockPosition:getComputedStyle(dock).position,cardOverflow:getComputedStyle(card).overflowY,
      shell:modal.querySelector('.manage-shell').getBoundingClientRect().toJSON(),
      bodyBoxCount:[card,document.getElementById('manageScrollBody')].filter(x=>getComputedStyle(x).display!=='contents' && getComputedStyle(x).overflowY==='auto').length,
      wrapperDisplay:getComputedStyle(document.getElementById('manageScrollBody')).display,
      scrollMax:body.scrollHeight-body.clientHeight,bodyY:window.scrollY,
      toggleLabel:document.getElementById('manageQuickToggleBtn').getAttribute('aria-label'),
      toggleExpanded:document.getElementById('manageQuickToggleBtn').getAttribute('aria-expanded'),
      toggleText:document.getElementById('manageQuickToggleBtn').textContent.trim(),
      arrowIcons:[document.getElementById('manageJumpTopBtn').textContent.trim(),
        document.getElementById('manageJumpBottomBtn').textContent.trim()],
      arrowRects:[rect('manageJumpTopBtn'),rect('manageJumpBottomBtn')],
      arrowContainerVisible:getComputedStyle(document.getElementById('manageQuickArrows')).display!=='none'};
   });
   assert(layout.scrollMax>400,'modal body must scroll for long form');
   assert.equal(layout.bodyOverflow,'auto');assert.equal(layout.cardOverflow,'auto');
   assert.equal(layout.bodyBoxCount,1,'nested scrolling region still exists');
   assert.equal(layout.dockPosition,'absolute','navigation must overlay rather than reserve a row');
   assert(Math.abs(layout.body.bottom-layout.shell.bottom)<=2,'root single scroller not full dialog height');
   assert(layout.dock.bottom<=layout.card.bottom+1,'navigation beyond dialog bottom');
   assert(layout.dock.top>layout.card.top+layout.card.height*.55,'arrows not at dialog bottom');
   // R15: the nav is a compact floating-looking capsule, NOT a full-width footer.
   assert(layout.dock.width<=205,'scroll navigation is still a full-width bar');
   assert(layout.dock.right<=layout.card.right+1&&layout.dock.x>=layout.card.x-1,
     'compact navigation extends outside management dialog');
   assert(parseFloat(layout.dockRadius)>=12,'navigation is not rounded like main nav');
   assert(layout.dockShadow!=='none','no floating navigation shadow');
   assert.deepEqual(layout.arrowIcons,['▲','▼']);
   assert(layout.arrowRects.every(r=>r.width>=44&&r.height>=44),'too-small touch targets');
   assert.equal(layout.toggleExpanded,'true');assert.equal(layout.toggleText,'▶');
   assert.equal(layout.arrowContainerVisible,true);
   await page.locator('#manageJumpBottomBtn').click();
   const down=await page.evaluate(()=>{
    const body=document.querySelector('#manageModal .manage-card');
    const rect=id=>document.getElementById(id).getBoundingClientRect().toJSON();
    return {top:body.scrollTop,max:body.scrollHeight-body.clientHeight,
      save:rect('saveTopicBtn'),cancel:rect('cancelManageBtn'),
      deactivate:rect('deactivateTopicBtn'),
      dock:document.querySelector('#manageModal .manage-quick-scroll').getBoundingClientRect().toJSON(),
      body:body.getBoundingClientRect().toJSON(),mainY:window.scrollY};
   });
   assert(Math.abs(down.top-down.max)<=3,'▼ did not reach bottom');
   for(const n of ['save','cancel','deactivate']){
    assert(down[n].bottom<=down.body.bottom+1,n+' hidden beneath root scroller');
    noOverlap(down[n],down.dock,n+' vs dock');
   }
   assert.equal(down.mainY,layout.bodyY,'page scrolled instead of topic dialog');
   await page.locator('#manageJumpTopBtn').click();
   const up=await page.evaluate(()=>({
     position:document.querySelector('#manageModal .manage-card').scrollTop,
     topicName:document.getElementById('manageTopicName').value,
     concept:document.getElementById('manageConcept').value,
     writes:window.__r14Submits,mainY:window.scrollY
   }));
   assert(up.position<=2,'▲ failed to return to first field');
   assert.equal(up.topicName,'R14 KEEP INPUT');
   assert.equal(up.concept,'R14 KEEP MULTILINE CONCEPT');
   assert.equal(up.writes,0);
   assert.equal(up.mainY,layout.bodyY);
   // Native button keyboard operation and collapse/re-expand.
   await page.locator('#manageJumpBottomBtn').focus();
   await page.keyboard.press('Enter');
   assert(await page.locator('#manageModal .manage-card').evaluate(el=>el.scrollTop>100));
   await page.locator('#manageJumpTopBtn').focus();
   await page.keyboard.press('Space');
   assert(await page.locator('#manageModal .manage-card').evaluate(el=>el.scrollTop<=2));
   await page.locator('#manageQuickToggleBtn').click();
   const collapsed=await page.evaluate(()=>({
      display:getComputedStyle(document.getElementById('manageQuickArrows')).display,
      expanded:document.getElementById('manageQuickToggleBtn').getAttribute('aria-expanded'),
      name:document.getElementById('manageQuickToggleBtn').getAttribute('aria-label'),
      icon:document.getElementById('manageQuickToggleBtn').textContent.trim(),
      saveVisible:document.getElementById('saveTopicBtn').getBoundingClientRect().width>0,
      formExists:!!document.getElementById('manageForm'),
      dockWidth:document.querySelector('#manageModal .manage-quick-scroll').getBoundingClientRect().width,
      hasCollapsedClass:document.querySelector('#manageModal .manage-quick-scroll').classList.contains('is-collapsed'),
      dockBackground:getComputedStyle(document.querySelector('#manageModal .manage-quick-scroll')).backgroundColor
   }));
   assert.equal(collapsed.display,'none');assert.equal(collapsed.expanded,'false');
   assert.equal(collapsed.icon,'◀');assert(collapsed.name.includes('표시'));
   assert(collapsed.hasCollapsedClass,'pill did not collapse with arrow controls');
   assert(collapsed.dockWidth<=65,'collapsed navigation should be a single small toggle');
   assert(collapsed.formExists,'save form must remain intact');
   await page.locator('#manageQuickToggleBtn').click();
   assert(await page.locator('#manageJumpTopBtn').isVisible());
   assert(await page.locator('#manageJumpBottomBtn').isVisible());
   assert.equal(await page.locator('#manageQuickToggleBtn').getAttribute('aria-expanded'),'true');
   assert.equal((await page.locator('#manageQuickToggleBtn').textContent()).trim(),'▶',
     'expanded arrows must show the right-pointing hide control');
   await page.locator('#closeManageBtn').click();
   assert(await page.locator('#manageModal').evaluate(el=>el.classList.contains('hidden')));
   assert.equal(errors.length,0,'page JavaScript errors: '+errors.join(' | '));
   report.push({viewport:viewport.label,width:viewport.width,
     atBottom:true,cancelSaveDoNotOverlap:true,singleScrollRoot:true,zeroReservedFooter:true,toggleHideShow:true,inputsPreserved:true,errors:0});
   await page.close();
  }
  assert.equal(writes,0,'must never write to operating service');
  console.log('R17_CHROME_PASS '+JSON.stringify({chrome:browser.version(),checks:report,
    externalBlocked:blocked,operatingWrites:writes}));
 }finally{await ctx?.close();await browser.close();}
}
run().catch(e=>{console.error('R17_CHROME_FAIL '+e.stack);process.exitCode=1;});
