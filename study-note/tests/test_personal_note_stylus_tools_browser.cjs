'use strict';
/* Isolated Chromium input/tools regression: no Google LIVE MASTER or network writes. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const puppeteer=require(path.resolve(__dirname,'../../.qa-browser/node_modules/puppeteer-core'));
const root=path.resolve(__dirname,'..');
const html='<!doctype html><html lang="ko"><head><meta charset="UTF-8"><link rel="stylesheet" href="/personal-note.css"></head><body><script src="/personal-note-cloud.js"></script><script src="/personal-note.js"></script></body></html>';
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),name=url.pathname;
 if(name==='/fixture'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
 const file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(file));
});
(async()=>{
 let browser;
 try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
  await page.evaluate(()=>PEPersonalNote.open('T9899','합성 필기 토픽'));
  await page.waitForSelector('#pnCanvas');
  const outcome=await page.evaluate(async()=>{
   const canvas=document.querySelector('#pnCanvas'),stage=document.querySelector('#pnStage');
   const send=(type,pointerType,id,x,y,extra={})=>{
    const r=canvas.getBoundingClientRect();
    const e=new PointerEvent(type,{bubbles:true,cancelable:true,pointerType,pointerId:id,button:0,
     isPrimary:true,clientX:r.left+x,clientY:r.top+y,width:5,height:5,pressure:.6,...extra});
    canvas.dispatchEvent(e);
   };
   const getRecords=async()=>{
    document.querySelector('#pnSave').click();
    await new Promise(resolve=>setTimeout(resolve,100));
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pe-personal-note-db');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const tx=db.transaction('papers','readonly'),rq=tx.objectStore('papers').get('T9899');
    return await new Promise((resolve,reject)=>{rq.onsuccess=()=>resolve(rq.result?.pages?.[0]?.objects||[]);rq.onerror=()=>reject(rq.error);});
   };
   const initialStage={x:stage.scrollLeft,y:stage.scrollTop};
   send('pointerdown','touch',11,30,30);
   send('pointermove','touch',11,40,100);
   send('pointerup','touch',11,40,100);
   send('pointerdown','touch',31,60,80);
   send('pointerdown','touch',32,110,80,{isPrimary:false});
   send('pointermove','touch',32,210,80,{isPrimary:false});
   const pinchZoom=document.querySelector('#pnZoomLabel').textContent;
   send('pointerup','touch',32,210,80,{isPrimary:false});
   send('pointerup','touch',31,60,80);
   document.querySelector('#pnZoomReset').click();
   send('pointerdown','touch',33,50,50,{width:55,height:35});
   send('pointerup','touch',33,50,50,{width:55,height:35});
   let objs=await getRecords();
   const touchCount=objs.length;
   send('pointerdown','pen',22,50,120);
   for(let x=50;x<=350;x+=10)send('pointermove','pen',22,x,120);
   send('pointerup','pen',22,350,120);
   objs=await getRecords();
   const penCount=objs.length;
   document.querySelector('[data-pn-tool="eraser"]').click();
   send('pointerdown','pen',23,180,120);
   send('pointerup','pen',23,180,120);
   objs=await getRecords();
   const afterErase=objs.length;
   const penPieces=objs.filter(o=>o.type==='stroke');
   const selectedTool=canvas.dataset.tool;
   const colorButton=document.querySelector('#pnPalette');
   colorButton.click();
   const paletteShown=!document.querySelector('#pnColorMenu').hidden;
   document.querySelector('[data-pn-color="#dc2626"]').click();
   const chosenColor=document.querySelector('#pnColor').value;
   document.querySelector('[data-pn-tool="pen"]').click();
   document.querySelector('#pnPenStyle').value='brush';
   document.querySelector('#pnPenStyle').dispatchEvent(new Event('change',{bubbles:true}));
   document.querySelector('#pnWidth').value='8';
   document.querySelector('#pnWidth').dispatchEvent(new Event('change',{bubbles:true}));
   document.querySelector('#pnOpacity').value='60';
   document.querySelector('#pnOpacity').dispatchEvent(new Event('input',{bubbles:true}));
   send('pointerdown','pen',24,20,150);send('pointermove','pen',24,45,160);send('pointerup','pen',24,55,160);
   objs=await getRecords();
   const last=objs[objs.length-1];
   return {touchCount,penCount,afterErase,penPieces:penPieces.length,selectedTool,paletteShown,chosenColor,last,pinchZoom,
    initialStage,stageAfter:{x:stage.scrollLeft,y:stage.scrollTop}};
  });
  assert.equal(outcome.touchCount,0,'finger touch must not draw');
  assert.notEqual(outcome.pinchZoom,'100%','two finger pinch must zoom');
  assert.equal(outcome.penCount,1,'stylus must draw one stroke');
  assert.ok(outcome.penPieces>=1,'partial eraser should retain remaining stroke');
  assert.equal(outcome.selectedTool,'eraser');
  assert.equal(outcome.paletteShown,true);
  assert.equal(outcome.chosenColor,'#dc2626');
  assert.equal(outcome.last.penStyle,'brush');
  assert.equal(outcome.last.width,8);
  assert.equal(outcome.last.opacity,.6);
  assert.deepEqual(errors,[]);
  console.log('PERSONAL_NOTE_STYLUS_TOOLS_BROWSER_PASS',JSON.stringify({touchCount:outcome.touchCount,penCount:outcome.penCount,afterErase:outcome.afterErase,penPieces:outcome.penPieces,errors:errors.length}));
 } finally {if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
