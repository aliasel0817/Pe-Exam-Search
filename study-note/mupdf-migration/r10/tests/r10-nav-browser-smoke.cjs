'use strict';
// Isolated Windows Chrome viewport test: all remote/backend requests intercepted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.R10_PLAYWRIGHT_MODULE||
  path.resolve(__dirname,'../../m3/node_modules/playwright'));
const root=path.resolve(__dirname,'../../../..'),study=path.join(root,'study-note');
const base='https://aliasel0817.github.io/Pe-Exam-Search/study-note/';
const selectors=['#jumpTopBtn','#prevBtn','#listBtn','#nextBtn','#jumpBottomBtn','#r4-private-notice summary'];
const mime=f=>f.endsWith('.wasm')?'application/wasm':/\.(js|mjs)$/.test(f)?'text/javascript':
 f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html; charset=utf-8':
 f.endsWith('.md')||f.endsWith('.txt')?'text/plain; charset=utf-8':'application/octet-stream';
async function run(){
 const browser=await chromium.launch({headless:true,
  executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--no-first-run','--no-default-browser-check']});
 const report=[], blocked={external:0,writes:0};
 try{
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request();
   if(req.method()!=='GET'){blocked.writes++;return route.abort('blockedbyclient');}
   const url=req.url();
   if(!url.startsWith(base)){blocked.external++;return route.abort('blockedbyclient');}
   const rel=decodeURIComponent(url.slice(base.length).split('?')[0]),full=path.resolve(study,rel);
   if(!full.startsWith(study+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile())
    return route.fulfill({status:404,body:'not found'});
   return route.fulfill({status:200,contentType:mime(full),body:fs.readFileSync(full)});
  });
  for(const viewport of [
   {width:1440,height:900,label:'PC Chrome'},
   {width:768,height:1024,label:'tablet viewport simulation'},
   {width:402,height:874,label:'iPhone 16 Pro viewport simulation'},
   {width:375,height:667,label:'small iPhone viewport simulation'},
   {width:320,height:740,label:'320px accessibility viewport'}]){
   const page=await context.newPage();await page.setViewportSize(viewport);
   const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,130)));
   const response=await page.goto(base+'study-note.html',{waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(response.status(),200);
   await page.waitForSelector('#r4-private-notice',{state:'attached',timeout:22000});
   const measure=await page.evaluate(ids=>{
    document.getElementById('bottomNav').classList.remove('hidden','nav-collapsed');
    const data=ids.map(id=>{
     const el=document.querySelector(id),r=el?.getBoundingClientRect();
     return {id,visible:!!el&&getComputedStyle(el).display!=='none',x:r?.x,y:r?.y,
      right:r?.right,bottom:r?.bottom,width:r?.width,height:r?.height};
    });
    const notice=document.getElementById('r4-private-notice');
    return {data,parent:notice?.parentElement?.id,
      duplicateFixed:document.querySelectorAll('body > #r4-private-notice').length,
      caption:notice?.querySelector('summary')?.textContent,
      source:document.getElementById('r4-source-offer-link')?.href,
      popoverPosition:getComputedStyle(notice.querySelector('.r4-notice-popover')).position};
   },selectors);
   assert.equal(measure.parent,'bottomNavActions');assert.equal(measure.duplicateFixed,0);
   assert.equal(measure.caption,'ⓘ 고지');
   assert.match(measure.source,/pe-study-note-mupdf-1.28.1-r8-20261104/);
   assert.equal(measure.popoverPosition,'absolute');
   for(const node of measure.data){
    assert(node.visible&&node.width>=24&&node.height>=30,viewport.label+' invisible '+node.id);
    assert(node.x>=-1&&node.right<=viewport.width+1,viewport.label+' horizontal clip '+node.id);
    assert(node.y>=-1&&node.bottom<=viewport.height+1,viewport.label+' vertical clip '+node.id);
   }
   for(let i=0;i<measure.data.length;i++)for(let j=i+1;j<measure.data.length;j++){
    const a=measure.data[i],b=measure.data[j];
    assert(!(a.x<b.right-1&&b.x<a.right-1&&a.y<b.bottom-1&&b.y<a.bottom-1),
      viewport.label+' buttons overlap '+a.id+' '+b.id);
   }
   await page.locator('#r4-private-notice summary').click();
   const pop=await page.evaluate(()=>{
    const el=document.getElementById('r4-private-notice');
    return {open:el.open,rect:el.querySelector('.r4-notice-popover').getBoundingClientRect().toJSON(),
     links:[...el.querySelectorAll('a')].map(a=>a.href)};
   });
   assert(pop.open);assert(pop.rect.x>=-1&&pop.rect.right<=viewport.width+1,
      viewport.label+' popover horizontally clipped '+JSON.stringify(pop.rect));
   assert(pop.rect.y>=-1,viewport.label+' popover vertically clipped');
   assert(pop.links.some(x=>x.includes('THIRD_PARTY_NOTICES.md')));
   assert(pop.links.some(x=>x.includes('AGPL-3.0.txt')));
   assert(pop.links.some(x=>x.includes('Pe-Exam-Search/tree/')));
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#r4-private-notice').evaluate(d=>d.open),false);
   await page.locator('#navToggleBtn').click();
   assert(await page.locator('#r4-private-notice summary').isVisible(),
     viewport.label+' source offer missing in user-collapsed navigation');
   await page.locator('#r4-private-notice summary').click();
   const collapsedRect=await page.locator('.r4-notice-popover').boundingBox();
   assert(collapsedRect.x>=-1 && collapsedRect.x+collapsedRect.width<=viewport.width+1,
     viewport.label+' collapsed-source notice clipped horizontally');
   await page.keyboard.press('Escape');
   await page.close();
   report.push({viewport:viewport.label,width:viewport.width,sixButtonsNoOverlap:true,
    sourcePopover:'PASS',sourceVisibleAfterCollapse:true,pageErrors:errors.length});
  }
  assert.equal(blocked.writes,0);
  console.log('R10_REAL_CHROME_NAV_QA '+JSON.stringify({status:'PASS',chrome:browser.version(),
   checks:report,externalRequestsBlocked:blocked.external,productionWrites:blocked.writes}));
 }finally{await browser.close();}
}
run().catch(e=>{console.error('R10_CHROME_NAV_QA_FAIL '+e.stack);process.exitCode=1;});
