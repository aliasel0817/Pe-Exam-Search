"use strict";
/**
 * Real Study Note annotation-handler QA with isolated synthetic PDF/image surfaces.
 * No login, MASTER, network data, IndexedDB or persistent annotation writes.
 * Tests the production installAnnotationInputHandlers implementation, not the
 * separate pen-touch-test.html prototype.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const root=path.resolve(__dirname,"..");
const engine=process.env.ANNOTATION_POINTER_ENGINE==="webkit"?"webkit":"chromium";
const driver=process.env.QA_PUPPETEER_CORE||path.resolve(root,"../.qa-browser/node_modules/puppeteer-core");
const puppeteer=engine==="chromium"?require(driver):null;
const webkit=engine==="webkit"?require(path.resolve(root,"../.qa-webkit/node_modules/playwright")).webkit:null;
const raw=fs.readFileSync(path.join(root,"study-note.html"),"utf8");
const original="window.addEventListener('DOMContentLoaded', init);";
assert.equal(raw.split(original).length,2,"Expected exactly one normal init bootstrap");
const testHTML=raw.replace(original,
 "window.addEventListener('DOMContentLoaded', () => { bindElements(); window.__annotationPointerQaReady = true; });")
 .replace(/<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>/,"")
 .replace(/<script src="\.\/tts\/natural-tts\.js\?v=[^"]+"><\/script>/,"")
 .replace(/<link rel="manifest" href="\.\/manifest\.webmanifest">/,"");
assert(!testHTML.includes("const annotationPointerProfile"),"Old stylus history gate must not remain");
assert(testHTML.includes("if (event.pointerType !== 'pen' && event.pointerType !== 'mouse') return;"));

const server=http.createServer((req,res)=>{
 if(req.url==="/"){
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
  res.end(testHTML);
 }else {res.writeHead(404);res.end("Synthetic QA only");}
});
const widths=[{name:"phone",width:390,height:844},{name:"tablet",width:820,height:1180},{name:"desktop",width:1280,height:850}];
const kinds=["subnote","textbook","attachment-pdf","attachment-image"];
function fixtureSetup(){
 if(window.__penTouchQaRoot){window.__penTouchQaRoot.remove();window.__penTouchQaRoot=null}
 if(window.__penTouchQaSurface){destroyAnnotationSurface(window.__penTouchQaSurface);window.__penTouchQaSurface=null}
 const scroll=document.createElement("div");
 const classes={"reference-pdf":"reference-pdf-pan-scroller","attachment-pdf":"attachment-pdf-pan-scroller","attachment-image":"media-image-zoom-wrap"};
 const kind=window.__penTouchQaKind;
 const runtimeKind=kind==="subnote"||kind==="textbook"?"reference-pdf":kind;
 scroll.className=classes[runtimeKind];
 scroll.style.cssText="position:fixed;inset:auto;left:12px;top:100px;right:auto;bottom:auto;width:min(440px,90vw);height:330px;overflow:auto;overscroll-behavior:contain;z-index:100000;background:#dbeafe;touch-action:none";
 const stage=document.createElement("div");
 stage.style.cssText="position:relative;box-sizing:border-box;width:1170px;height:1700px;background:#ffffff;padding:0;margin:0";
 const media=document.createElement("canvas");
 media.width=1100;media.height=1480;
 media.style.cssText="position:absolute;left:0;top:0;display:block;width:1100px;height:1480px;background:white";
 stage.append(media);scroll.append(stage);
 let visibleScroller=scroll;
 if(runtimeKind==="attachment-image"){
  // Real image viewer scrolls its list vertically; the image zoom-wrap only
  // scrolls horizontally. A touch drag on the annotation overlay must use
  // the outer .image-viewer-body for y, not the overflow-y:hidden zoom-wrap.
  const imageBody=document.createElement("div");
  imageBody.className="image-viewer-body";
  imageBody.style.cssText="position:fixed;inset:auto;left:12px;top:100px;right:auto;bottom:auto;width:min(440px,90vw);height:330px;overflow-y:auto;overflow-x:hidden;z-index:100000";
  scroll.style.cssText="position:relative;inset:auto;width:100%;height:330px;overflow-x:auto;overflow-y:hidden;touch-action:pan-y";
  imageBody.append(scroll);
  const second=document.createElement("div");
  second.style.cssText="height:1100px;background:#e2e8f0";
  imageBody.append(second);
  document.body.append(imageBody);
  visibleScroller=imageBody;
 }else document.body.append(scroll);
 const qaKey="qa-pointer:"+kind+":"+window.__penTouchQaViewport;
 const surface=ensureAnnotationSurface({host:stage,media,key:qaKey,kind:runtimeKind,intrinsicWidth:1100,intrinsicHeight:1480});
 syncAnnotationSurface(media);
 setAnnotationTool("pen");
 window.__penTouchQaRoot=visibleScroller;window.__penTouchQaSurface=surface;
 window.__penTouchQaZoom=1;
 window.__penTouchQaPersist=[];
 // Do not access app storage; only collect synthetic persistence intentions.
 scheduleAnnotationPersist=function(documentData){
    window.__penTouchQaPersist.push({key:documentData.key,count:documentData.objects.length});
 };
 // Use inert adapter to verify pointer->pinch routing, never replace PDF data.
 annotationTouchZoomAdapter=function(){
    return {getZoom:()=>window.__penTouchQaZoom,setZoom:value=>{window.__penTouchQaZoom=value}};
 };
 return true;
}
async function exerciseSynthetic(kind,viewport){
 return await new Promise((resolve,reject)=>{
  try{
   window.__penTouchQaKind=kind;window.__penTouchQaViewport=viewport;
   window.__createPointerQaFixture();
   const s=window.__penTouchQaSurface,sc=window.__penTouchQaRoot,canvas=s.canvas,doc=getAnnotationDocument(s.key);
   const obj=()=>doc.objects;
   function emit(type,pointerType,id,x,y,button=0,touchDerived=false){
    const rect=canvas.getBoundingClientRect();
    const evt=new PointerEvent(type,{pointerType,pointerId:id,clientX:rect.left+x,clientY:rect.top+y,button,buttons:type==="pointerup"?0:1,pressure:.5,bubbles:true,cancelable:true});
    if(touchDerived)Object.defineProperty(evt,"sourceCapabilities",{value:{firesTouchEvents:true}});
    canvas.dispatchEvent(evt);
   }
   function eq(actual,expected,label){if(actual!==expected)throw Error(kind+" "+viewport+": "+label+" ("+JSON.stringify(actual)+" != "+JSON.stringify(expected)+")")}
   // First finger contact must pan immediately, even before any stylus.
   sc.scrollTop=60;sc.scrollLeft=40;
   const initial=JSON.stringify(obj());
   emit("pointerdown","touch",11,200,280);
   emit("pointermove","touch",11,200,140);
   emit("pointerup","touch",11,200,140);
   eq(obj().length,0,"finger before stylus created ink");
   eq(JSON.stringify(obj()),initial,"finger changed original annotation data");
   if(sc.scrollTop<170)throw Error(kind+" "+viewport+": finger did not pan "+sc.scrollTop);
   // Pen writes without changing tool; original schema and pointerType preserved.
   emit("pointerdown","pen",21,110,180);
   emit("pointermove","pen",21,210,190);
   emit("pointerup","pen",21,245,195);
   eq(obj().length,1,"pen did not write");
   eq(obj()[0].pointerType,"pen","stroke loses pointer type");
   eq(obj()[0].type,"stroke","stroke schema changed");
   // Finger navigation remains active after first pen use; no new annotation.
   const atPen=JSON.stringify(obj());
   const beforeFinger=sc.scrollTop;
   emit("pointerdown","touch",12,200,260);
   emit("pointermove","touch",12,200,160);
   emit("pointerup","touch",12,200,160);
   eq(JSON.stringify(obj()),atPen,"finger after stylus changed pen strokes");
   if(sc.scrollTop<beforeFinger+80)throw Error(kind+" "+viewport+": finger did not pan after pen");
   // Two-finger pinch triggers adapter, not ink.
   emit("pointerdown","touch",31,130,240);
   emit("pointerdown","touch",32,230,240);
   emit("pointermove","touch",32,290,240);
   emit("pointerup","touch",32,290,240);
   emit("pointerup","touch",31,130,240);
   if(window.__penTouchQaZoom<1.4)throw Error(kind+" "+viewport+": pinch failed");
   eq(obj().length,1,"pinch created ink");
   // Finger must never create a highlighter or eraser object.
   setAnnotationTool("highlighter");
   emit("pointerdown","touch",42,120,220);
   emit("pointermove","touch",42,185,225);
   emit("pointerup","touch",42,185,225);
   eq(obj().length,1,"finger drew highlighter");
   emit("pointerdown","pen",43,350,240);
   emit("pointermove","pen",43,500,260);
   emit("pointerup","pen",43,550,265);
   eq(obj().length,2,"pen highlighter failed");
   eq(obj()[1].tool,"highlighter","wrong highlighter tool");
   const beforeErase=JSON.stringify(obj());
   setAnnotationTool("eraser");
   emit("pointerdown","touch",44,360,243);
   emit("pointermove","touch",44,420,243);
   emit("pointerup","touch",44,420,243);
   eq(JSON.stringify(obj()),beforeErase,"finger erased a highlight");
   emit("pointerdown","pen",45,350,240);
   emit("pointerup","pen",45,350,240);
   eq(obj().length,1,"stylus eraser failed");
   // Finger cannot add shapes; pen can.
   setAnnotationTool("rect");
   emit("pointerdown","touch",48,370,310);
   emit("pointermove","touch",48,410,340);
   emit("pointerup","touch",48,410,340);
   eq(obj().length,1,"finger drew a shape");
   emit("pointerdown","pen",49,370,310);
   emit("pointermove","pen",49,430,355);
   emit("pointerup","pen",49,430,355);
   eq(obj().length,2,"pen shape failed");
   eq(obj()[1].type,"shape","shape schema changed");
   // Touch in select/text/note tools is navigation, not edit/entry.
   for(const tool of ["select","text","note"]){
    setAnnotationTool(tool);
    const baseline=JSON.stringify(obj());
    emit("pointerdown","touch",53,240,260);
    emit("pointermove","touch",53,240,185);
    emit("pointerup","touch",53,240,185);
    eq(JSON.stringify(obj()),baseline,"finger edited in "+tool);
    if(document.querySelector(".annotation-entry-overlay"))throw Error(kind+" "+viewport+": finger opened "+tool+" editor");
   }
   // Ignore a palm touchdown while an S Pen stroke is active.
   setAnnotationTool("pen");
   const prePalm=sc.scrollTop;
   emit("pointerdown","pen",63,160,400);
   // A Samsung touch/pen driver or interrupted stream may reuse a pointer ID.
   // Touch must not append points to an active stylus stroke or finish it.
   emit("pointerdown","touch",63,190,400);
   if(s.touchGesture?.pointers?.has(63))throw Error(kind+" "+viewport+": palm became pan gesture");
   const penPointsBeforePalm=s.activeStroke.stroke.points.length;
   emit("pointermove","touch",63,190,300);
   eq(s.activeStroke?.stroke?.points?.length,penPointsBeforePalm,"touch continued pen stroke after pointerId collision");
   emit("pointerup","touch",63,190,300);
   eq(s.activeStroke?.pointerId,63,"touch finished active stylus stroke");
   eq(sc.scrollTop,prePalm,"palm moved document while pen drew");
   emit("pointermove","pen",63,240,425);
   emit("pointerup","pen",63,270,440);
   eq(obj().length,3,"palm interrupted pen");
   // Defensive unsupported pointer types must never edit.
   const beforeUnknown=JSON.stringify(obj());
   emit("pointerdown","unknown",70,120,190);
   emit("pointermove","unknown",70,160,190);
   emit("pointerup","unknown",70,160,190);
   eq(JSON.stringify(obj()),beforeUnknown,"unrecognized pointer created ink");
   // Some touch-capable browsers can emit a compatibility mouse PointerEvent
   // while the finger is already scrolling. It must not create ghost ink.
   const beforeCompat=JSON.stringify(obj());
   emit("pointerdown","touch",81,210,325);
   emit("pointermove","touch",81,210,270);
   emit("pointerdown","mouse",82,210,325);
   emit("pointermove","mouse",82,240,270);
   emit("pointerup","mouse",82,240,270);
   emit("pointerup","touch",81,210,270);
   eq(JSON.stringify(obj()),beforeCompat,"finger + compatibility mouse created simultaneous ink");
   // Defensive Galaxy Tab case: a touch-capable Android browser may present
   // a compatibility input as mouse even without a recorded touch pointer.
   const androidBase=JSON.stringify(obj());
   Object.defineProperty(navigator,"userAgent",{configurable:true,value:"Mozilla/5.0 (Linux; Android 16; SM-X730) AppleWebKit/537.36"});
   Object.defineProperty(navigator,"maxTouchPoints",{configurable:true,value:5});
   s.lastTouchInputAt=0;
   emit("pointerdown","mouse",85,325,240);
   emit("pointermove","mouse",85,375,270);
   emit("pointerup","mouse",85,375,270);
   eq(JSON.stringify(obj()),androidBase,"Android synthetic mouse bypassed stylus-only input");
   delete navigator.userAgent;
   delete navigator.maxTouchPoints;
   // Explicitly flagged touch-synthesized mouse input must also be rejected
   // on desktop-class browsers, even outside the recent-touch time window.
   s.lastTouchInputAt=0;
   const capBaseline=JSON.stringify(obj());
   emit("pointerdown","mouse",86,100,200,0,true);
   emit("pointermove","mouse",86,140,230,0,true);
   emit("pointerup","mouse",86,140,230,0,true);
   eq(JSON.stringify(obj()),capBaseline,"sourceCapabilities touch-derived mouse created ink");
   // An independent PC mouse is allowed after the finger gesture has ended.
   s.lastTouchInputAt=0;
   // Desktop mouse support remains available.
   emit("pointerdown","mouse",72,350,470);
   emit("pointermove","mouse",72,390,500);
   emit("pointerup","mouse",72,410,520);
   eq(obj().length,4,"desktop mouse stopped working");
   // No touches should have pushed any undo history.
   if(!doc.undoStack || doc.undoStack.length<4)throw Error(kind+" "+viewport+": existing undo behavior regressed");
   // Use protected read-only data shape for the outcome; no server or LIVE write.
   resolve({kind,viewport,fingerPanBeforeStylus:true,fingerPanAfterStylus:true,penStroke:true,highlighter:true,penEraser:true,shape:true,untouchedByFinger:true,pinch:window.__penTouchQaZoom,annotations:doc.objects.length,undo:doc.undoStack.length,palmRejected:true,mouseSupported:true});
  }catch(e){reject(e)}
 });
}
async function verifyNativeChromiumPointerInput(page){
 await page.evaluate(()=>{
  window.__penTouchQaKind="attachment-pdf";
  window.__penTouchQaViewport="native";
  window.__createPointerQaFixture();
 });
 const box=await page.evaluate(()=>{
  const r=window.__penTouchQaSurface.canvas.getBoundingClientRect();
  const scroller=window.__penTouchQaRoot.getBoundingClientRect();
  return {canvas:{x:r.x,y:r.y,width:r.width,height:r.height},scroller:{x:scroller.x,y:scroller.y,width:scroller.width,height:scroller.height}};
 });
 const x=Math.round(box.scroller.x+125),y=Math.round(box.scroller.y+240);
 const client=await page.createCDPSession();
 await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:81}]});
 await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:y-125,id:81}]});
 await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 await new Promise(r=>setTimeout(r,100));
 const moved=await page.evaluate(()=>({scrollTop:window.__penTouchQaRoot.scrollTop,ink:getAnnotationDocument(window.__penTouchQaSurface.key).objects.length}));
 assert(moved.scrollTop>=90,"Native finger pan failed "+JSON.stringify(moved));
 assert.equal(moved.ink,0,"Native finger produced annotation");
 await client.send("Input.dispatchMouseEvent",{type:"mousePressed",x,y,button:"left",buttons:1,pointerType:"pen",clickCount:1});
 await client.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:x+65,y:y+20,button:"left",buttons:1,pointerType:"pen"});
 await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",x:x+85,y:y+35,button:"left",buttons:0,pointerType:"pen"});
 const written=await page.evaluate(()=>{
  const a=getAnnotationDocument(window.__penTouchQaSurface.key).objects;
  return {count:a.length,pointerType:a[0]?.pointerType,tool:a[0]?.tool};
 });
 assert.equal(written.count,1,"Native stylus did not draw");
 assert.equal(written.pointerType,"pen","Native stylus misidentified");
 await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:91}]});
 await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:91},{x:x+95,y,id:92}]});
 await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y,id:91},{x:x+170,y,id:92}]});
 await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 await new Promise(r=>setTimeout(r,100));
 const pinch=await page.evaluate(()=>({zoom:window.__penTouchQaZoom,ink:getAnnotationDocument(window.__penTouchQaSurface.key).objects.length}));
 assert(pinch.zoom>1.25,"Native pinch failed "+JSON.stringify(pinch));
 assert.equal(pinch.ink,1,"Native pinch produced annotation");
 console.log("ANNOTATION_NATIVE_POINTER_PASS "+JSON.stringify({moved,written,pinch}));
 await page.evaluate(()=>{
  window.__penTouchQaKind="attachment-image";
  window.__penTouchQaViewport="native-image";
  window.__createPointerQaFixture();
  window.__qaNativeTouchBubbles={starts:0,moves:0};
  const wrap=window.__penTouchQaSurface.canvas.closest(".media-image-zoom-wrap");
  wrap.addEventListener("touchstart",()=>{window.__qaNativeTouchBubbles.starts++},{passive:true});
  wrap.addEventListener("touchmove",()=>{window.__qaNativeTouchBubbles.moves++},{passive:true});
 });
 const imageRect=await page.evaluate(()=>{
  const r=window.__penTouchQaRoot.getBoundingClientRect();
  return {x:Math.round(r.left+135),y:Math.round(r.top+240)};
 });
 await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:imageRect.x,y:imageRect.y,id:111}]});
 await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:imageRect.x,y:imageRect.y-115,id:111}]});
 await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 await new Promise(r=>setTimeout(r,100));
 const imageFinger=await page.evaluate(()=>({
  scrollTop:window.__penTouchQaRoot.scrollTop,
  ink:getAnnotationDocument(window.__penTouchQaSurface.key).objects.length,
  wrapperEvents:window.__qaNativeTouchBubbles
 }));
 assert(imageFinger.scrollTop>60,"Native image-list finger navigation failed "+JSON.stringify(imageFinger));
 assert.equal(imageFinger.ink,0,"Native finger annotated an image");
 assert.equal(imageFinger.wrapperEvents.starts,0,"Native image zoom handler received touchstart concurrently");
 assert.equal(imageFinger.wrapperEvents.moves,0,"Native image zoom handler received touchmove concurrently");
 console.log("ANNOTATION_NATIVE_IMAGE_TOUCH_PASS "+JSON.stringify(imageFinger));
}
(async()=>{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=engine==="webkit"
  ? await webkit.launch({headless:true})
  : await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",args:["--no-first-run","--no-default-browser-check","--no-sandbox"]});
 const results=[];
 try{
  for(const vp of widths){
   const page=engine==="webkit"
    ? await browser.newPage({viewport:{width:vp.width,height:vp.height},deviceScaleFactor:1,hasTouch:vp.name!=="desktop",isMobile:vp.name!=="desktop"})
    : await browser.newPage();
   if(engine==="chromium")await page.setViewport({...vp,deviceScaleFactor:1,hasTouch:vp.name!=="desktop",isMobile:vp.name!=="desktop"});
   const errors=[],outside=[];
   page.on("pageerror",e=>errors.push(String(e)));
   page.on("request",req=>{if(!req.url().startsWith("http://127.0.0.1:"))outside.push(req.url())});
   await page.goto("http://127.0.0.1:"+server.address().port+"/",{waitUntil:"domcontentloaded",timeout:30000});
   await page.waitForFunction("window.__annotationPointerQaReady===true",{timeout:10000});
   const source="("+fixtureSetup.toString()+")";
   const runner="("+exerciseSynthetic.toString()+")";
   await page.evaluate(({source,runner})=>{
     // Local test HTML: no dynamic eval. Transfer audited functions as a script.
     const script=document.createElement("script");
     script.textContent="window.__createPointerQaFixture = "+source+";window.__runPointerQaFixture = "+runner+";";
     document.documentElement.appendChild(script);script.remove();
   },{source,runner});
   for(const kind of kinds){
    const res=await page.evaluate(({kind,vp})=>window.__runPointerQaFixture(kind,vp),{kind,vp:vp.name});
    results.push(res);
   }
   if(engine==='chromium'&&vp.name==='tablet')await verifyNativeChromiumPointerInput(page);
   assert.equal(errors.length,0,"Page error "+vp.name+": "+errors.join("; "));
   assert.equal(outside.length,0,"External request leaked "+JSON.stringify(outside));
   await page.close();
   console.log("ANNOTATION_POINTER_VIEWPORT_PASS "+vp.name+" kinds="+kinds.join(","));
  }
  assert.equal(results.length,widths.length*kinds.length);
  console.log("ANNOTATION_POINTER_SPLIT_PASS "+JSON.stringify({engine,combinations:results.length,kinds,widths:widths.map(v=>v.width),pointerTypes:["touch","pen","mouse","unknown"],oldStylusGate:false,all:results}));
 }catch(e){console.error("ANNOTATION_POINTER_SPLIT_FAIL "+String(e.stack||e));process.exitCode=1}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})();
