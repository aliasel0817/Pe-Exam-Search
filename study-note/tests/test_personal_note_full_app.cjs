'use strict';
/* Essential integration: real study-note.html + local assets, no real external requests. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const puppeteer=require(process.env.QA_PUPPETEER_CORE||path.resolve(__dirname,'../../.qa-browser/node_modules/puppeteer-core'));
const root=path.resolve(__dirname,'..');
const contentType=p=>p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':
  p.endsWith('.json')?'application/json':p.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8';
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const full=path.resolve(root,'.'+pathname);
 if(!full.startsWith(root+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile()){
  res.writeHead(404);res.end();return;
 }
 res.setHeader('Content-Type',contentType(full));res.end(fs.readFileSync(full));
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',req=>req.url().startsWith(base+'/')?req.continue():req.abort());
  const jsErrors=[];page.on('pageerror',err=>jsErrors.push(err.message));
  await page.goto(base+'/study-note.html',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>typeof window.PEPersonalNote?.open==='function',{timeout:10000});
  const wired=await page.evaluate(()=>{
    // Synthetic topic solely for this browser session; no API, MASTER or cloud writes.
    currentTopicId='T9998';
    document.getElementById('detailTitle').textContent='개인 노트 통합 검사';
    document.getElementById('personalNoteBtn').click();
    return {button:!!document.getElementById('personalNoteBtn'),modal:window.PEPersonalNote.isOpen()};
  });
  assert.equal(wired.button,true);assert.equal(wired.modal,false,'open is asynchronous');
  await page.waitForSelector('#personalNoteModal:not([hidden])');
  assert.match(await page.$eval('#pnTopic',el=>el.textContent),/개인 노트 통합 검사/);
  assert.equal(await page.$eval('#pnCloudRestore',el=>el.disabled),true);
  await page.click('#pnAdd');
  assert.equal(await page.$eval('#pnPageLabel',el=>el.textContent),'2 / 2 페이지');
  await page.click('#pnSave');
  await page.waitForFunction(()=>document.querySelector('#pnStatus').textContent.includes('로컬 저장 완료'),{timeout:12000});
  assert.equal(await page.$eval('#pnCloudRestore',el=>el.disabled),true);
  await page.click('#pnCancel');
  assert.equal(await page.$('#personalNoteModal'),null);
  const bad=jsErrors.filter(e=>/personal.?note/i.test(e));
  assert.deepEqual(bad,[],'Personal Note runtime errors: '+bad.join('; '));
  console.log('PERSONAL_NOTE_FULL_APP_SYNTHETIC_PASS '+JSON.stringify({button:true,entry:true,multiPage:true,localSave:true,cloudGate:true,badErrors:0}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error('PERSONAL_NOTE_FULL_APP_SYNTHETIC_FAIL '+String(e.stack||e));process.exitCode=1;server.close();});
