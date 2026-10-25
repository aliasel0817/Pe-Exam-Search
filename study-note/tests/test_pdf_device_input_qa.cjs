"use strict";
/* Isolated PDF width-fit + device input + preference tests; no LIVE data. */
const fs=require("node:fs");
const http=require("node:http");
const path=require("node:path");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const engine=process.env.PDF_DEVICE_QA_ENGINE==="webkit"?"webkit":"chromium";
const raw=fs.readFileSync(path.join(root,"study-note.html"),"utf8");
const html=raw.replace("window.addEventListener('DOMContentLoaded', init);",
  "window.addEventListener('DOMContentLoaded', () => { bindElements(); bindAnnotationToolbarEvents(); window.__pdfDeviceReady=true; });")
  .replace(/<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>/,"")
  .replace(/<script src="\.\/tts\/natural-tts\.js\?v=[^"]+"><\/script>/,"")
  .replace(/<link rel="manifest" href="\.\/manifest\.webmanifest">/,"");
const server=http.createServer((req,res)=>{
 if(req.url==="/"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(html)}
 else{res.writeHead(404);res.end("No remote data")}
});
const profiles=[
 {kind:"phone",width:390,ua:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1"},
 {kind:"tablet",width:820,ua:"Mozilla/5.0 (Linux; Android 15; SM-X920 Build/UP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"},
 {kind:"desktop",width:1280,ua:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"},
];
const challenge=async page=>page.evaluate(async()=>{
 const kind=ANNOTATION_DEVICE_CLASS;
 const classes=Array.from(document.querySelectorAll("[data-annotation-finger-mode]"));
 const ui={device:kind,buttons:classes.length,defaultZoom:[REFERENCE_PDF_DEFAULT_ZOOM,ATTACHMENT_PDF_DEFAULT_ZOOM]};
 const sc=document.createElement("div");
 sc.className="reference-pdf-pan-scroller";
 sc.style.cssText="position:fixed;top:100px;left:8px;width:280px;height:300px;background:#fff;overflow:auto;touch-action:none;z-index:999999;";
 const stage=document.createElement("div");
 stage.style.cssText="position:relative;display:block;width:1200px;height:1600px;";
 const media=document.createElement("canvas");
 media.width=1100;media.height=1450;
 media.style.cssText="position:absolute;top:0;left:0;width:1100px;height:1450px;display:block;";
 stage.append(media);sc.append(stage);document.body.append(sc);
 let zoom=1;
 const surface=ensureAnnotationSurface({host:stage,media,key:"qa-dev-"+kind,kind:"reference-pdf",intrinsicWidth:1100,intrinsicHeight:1450});
 syncAnnotationSurface(media);
 installPdfPanPinchHandlers(sc,{getZoom:()=>zoom,setZoom:v=>zoom=v,minZoom:0.5,maxZoom:10});
 setAnnotationTool("pen");
 const doc=getAnnotationDocument(surface.key);
 const initialDoc=JSON.stringify(doc.objects);
 const testTouch=(id,x,y,radiusX=4,radiusY=4,target=kind==="phone"?media:surface.canvas)=>({
   identifier:id,target,clientX:x,clientY:y,radiusX,radiusY
 });
 const fireTouch=(type,points,changed)=> {
   const evt=new Event(type,{bubbles:true,cancelable:true});
   Object.defineProperties(evt,{touches:{value:points},changedTouches:{value:changed},targetTouches:{value:points}});
   (points[0]||changed[0]||{}).target?.dispatchEvent(evt);
 };
 const pointer=(type,id,x,y,pointerType="touch",w=7,h=7)=>{
   surface.canvas.dispatchEvent(new PointerEvent(type,{pointerType,pointerId:id,isPrimary:true,
     width:w,height:h,clientX:x,clientY:y,bubbles:true,cancelable:true,pressure:.5,
     button:0,buttons:type==="pointerup"?0:1}));
 };
 const x=160,y=200;
 // Tablet: pen ink and broad resting hand must never scroll or draw ink.
 // Phone: finger remains navigation by default even when pen selected.
 sc.scrollTop=200;
 const fingertip=testTouch(51,x,y);
 pointer("pointerdown",51,x,y);
 fireTouch("touchstart",[fingertip],[fingertip]);
 const moved=testTouch(51,x,y-50);
 fireTouch("touchmove",[moved],[moved]);
 pointer("pointermove",51,x,y-50);
 pointer("pointerup",51,x,y-50);
 fireTouch("touchend",[],[moved]);
 await new Promise(resolve=>requestAnimationFrame(resolve));
 const navigation={scroll:sc.scrollTop,ink:doc.objects.length};
 // Tablet S Pen / desktop pen still draw; phone stylus cannot annotate.
 const phoneInputDisabled = !surface.canvas.classList.contains("annotation-input-enabled");
 pointer("pointerdown",70,x,y,"pen");
 const palm=testTouch(72,x+20,y+30,28,22);
 const prePalmScroll=sc.scrollTop;
 fireTouch("touchstart",[palm],[palm]);
 fireTouch("touchmove",[testTouch(72,x+20,y+75,28,22)],[palm]);
 pointer("pointermove",70,x+30,y+20,"pen");
 pointer("pointerup",70,x+50,y+30,"pen");
 fireTouch("touchend",[],[palm]);
 const pen={ink:doc.objects.length,scrollUnchanged:sc.scrollTop===prePalmScroll,
   lastType:doc.objects.at(-1)?.pointerType};
 const penCount=doc.objects.length;
 // Width fit tall page (vertical scroll allowed).
 const referenceScale=computeReferencePdfFitScale({naturalWidth:800,naturalHeight:2600},sc);
 const referenceWidth=800*referenceScale;
 // Broad palm contact must not move a tablet PDF even when the stylus is idle.
 const beforePalmOnly=sc.scrollTop;
 // Simulate an engine with no Touch radius metadata, but broad Pointer size.
 const palmOnly=testTouch(75,175,185,0,0);
 pointer("pointerdown",75,175,185,"touch",56,44);
 fireTouch("touchstart",[palmOnly],[palmOnly]);
 fireTouch("touchmove",[testTouch(75,175,90,0,0)],[palmOnly]);
 pointer("pointermove",75,175,90,"touch",56,44);
 pointer("pointerup",75,175,90,"touch",56,44);
 fireTouch("touchend",[],[palmOnly]);
 const palmOnlyIgnored=sc.scrollTop===beforePalmOnly && doc.objects.length===penCount;
 const wideFingerPanned=sc.scrollTop>=beforePalmOnly+45 && doc.objects.length===penCount;
 // A palm must not leave the navigation surface permanently disabled.
 const afterPalmTop=sc.scrollTop;
 pointer("pointerdown",76,165,180);
 const nextFinger=testTouch(76,165,180);
 fireTouch("touchstart",[nextFinger],[nextFinger]);
 fireTouch("touchmove",[testTouch(76,165,130)],[nextFinger]);
 pointer("pointermove",76,165,130);
 pointer("pointerup",76,165,130);
 fireTouch("touchend",[],[nextFinger]);
 const normalFingerRestored=sc.scrollTop>=afterPalmTop+45;
 // Real attachment display sizing is recomputed against the current scroller.
 els.mediaViewerModal.classList.remove("hidden");
 const attachmentWrap=document.createElement("div");
 attachmentWrap.id="pdfViewerFrameWrap";
 attachmentWrap.className="pdf-frame-wrap";
 attachmentWrap.style.cssText="width:280px;height:300px;flex:none;position:relative;";
 attachmentWrap.innerHTML='<div class="attachment-pdf-pan-scroller"><div class="attachment-pdf-stage"><canvas class="attachment-pdf-canvas"></canvas></div></div>';
 els.mediaViewerBody.appendChild(attachmentWrap);
 activeAttachmentPdfPage={getViewport:()=>({width:800,height:2600})};
 activeAttachmentPdfZoomFactor=1;
 activePdfAttachments=[{attachmentId:"qa-only"}];
 activePdfIndex=0;
 activeAttachmentPdfPageNumber=1;
 renderActiveAttachmentPdfCanvas({preserveCenter:false});
 const attachmentScroller=attachmentWrap.querySelector(".attachment-pdf-pan-scroller");
 const attachmentCanvas=attachmentWrap.querySelector(".attachment-pdf-canvas");
 const attachmentWidth=Number.parseFloat(attachmentCanvas.style.width);
 const attachmentExpected=Math.max(1,attachmentScroller.clientWidth-28);
 const attachmentInputDisabled=!attachmentWrap.querySelector(".annotation-canvas")?.classList.contains("annotation-input-enabled");
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 const attachmentStartTop=attachmentScroller.scrollTop;
 attachmentWrap.style.width="330px";
 schedulePdfViewerWidthFit();
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 const resizedWidth=Number.parseFloat(attachmentCanvas.style.width);
 const resizedExpected=Math.max(1,attachmentScroller.clientWidth-28);
 destroyAnnotationSurfacesWithin(attachmentWrap);attachmentWrap.remove();
 els.mediaViewerModal.classList.add("hidden");activeAttachmentPdfPage=null;
 let fingerInk=null,pinchRollback=null,toolsStayedReadOnly=null;
 if(kind==="phone"){
   annotationEditorState.fingerDraw=true;
   saveAnnotationToolPreferences();
   syncAnnotationToolbarUi();
   const stored=JSON.parse(localStorage.getItem(ANNOTATION_OPTIONS_KEY));
   const beforeInk=doc.objects.length;
   const beforePhoneFingerPan=sc.scrollTop;
   pointer("pointerdown",81,140,160);
   const a=testTouch(81,140,160);
   fireTouch("touchstart",[a],[a]);
   pointer("pointermove",81,210,180);
   fireTouch("touchmove",[testTouch(81,210,180)],[a]);
   pointer("pointerup",81,210,180);
   fireTouch("touchend",[],[a]);
   fingerInk={beforeInk,afterInk:doc.objects.length,lastType:doc.objects.at(-1)?.pointerType,
     panDistance:Math.abs(sc.scrollTop-beforePhoneFingerPan),
     saved:stored.fingerDraw,ui:document.querySelector("[data-annotation-finger-mode]")?.textContent};
   // The UI and old preference may say finger-draw, but all phone ink is disabled.
   for (const tool of ["highlighter","rect","eraser","text","note","select"]) {
     setAnnotationTool(tool);
     pointer("pointerdown",82,140,160);
     pointer("pointermove",82,210,180);
     pointer("pointerup",82,210,180);
     pointer("pointerdown",83,140,160,"pen");
     pointer("pointermove",83,210,180,"pen");
     pointer("pointerup",83,210,180,"pen");
   }
   toolsStayedReadOnly=doc.objects.length===beforeInk;
   // A shape tool must not prevent ordinary one-finger navigation.
   setAnnotationTool("rect");
   const beforeShapePan=sc.scrollTop;
   const shapeFinger=testTouch(87,140,185);
   fireTouch("touchstart",[shapeFinger],[shapeFinger]);
   fireTouch("touchmove",[testTouch(87,140,140)],[shapeFinger]);
   fireTouch("touchend",[],[shapeFinger]);
   toolsStayedReadOnly &&= doc.objects.length===beforeInk && sc.scrollTop>=beforeShapePan+40;
   setAnnotationTool("pen");
   const beforeSecond=doc.objects.length;
   pointer("pointerdown",91,140,170);
   fireTouch("touchstart",[testTouch(91,140,170)],[testTouch(91,140,170)]);
   pointer("pointermove",91,190,180);
   const b=testTouch(92,210,170);
   fireTouch("touchstart",[testTouch(91,190,180),b],[b]);
   fireTouch("touchmove",[testTouch(91,190,180),testTouch(92,280,170)],[b]);
   pointer("pointerup",91,190,180);
   fireTouch("touchend",[],[testTouch(91,190,180),b]);
   pinchRollback={beforeSecond,afterSecond:doc.objects.length,zoom};
   // Existing annotation content must survive the still-visible PDF toolbar
   // undo / clear buttons. Test enabled controls, not disabled-button no-ops.
   lastActiveAnnotationSurface=surface;
   doc.objects.push({id:"qa-existing-ink",type:"stroke",tool:"pen",
     points:[{x:.1,y:.1,p:.5},{x:.2,y:.2,p:.5}],widthN:.004,color:"#2563eb",opacity:1});
   doc.undoStack.push([]);
   syncAnnotationToolbarUi();
   const clear=els.referencePdfViewerModal.querySelector("[data-annotation-clear]");
   const undo=els.referencePdfViewerModal.querySelector("[data-annotation-undo]");
   const beforeToolbar=JSON.stringify(doc.objects);
   const oldConfirm=window.confirm;
   window.confirm=()=>true;
   let toolbarActionsIgnored;
   try{
     const controlsPresent=Boolean(clear && undo && !clear.disabled && !undo.disabled);
     clear?.click();undo?.click();
     toolbarActionsIgnored=controlsPresent && JSON.stringify(doc.objects)===beforeToolbar;
   }finally{window.confirm=oldConfirm;}
   doc.objects=[];doc.undoStack=[];doc.redoStack=[];
   toolsStayedReadOnly &&=toolbarActionsIgnored;
 }
 const referenceClientWidth=sc.clientWidth;
 // Image viewer is out of scope: its annotation overlay must remain usable.
 const imageHost=document.createElement("div");
 imageHost.style.cssText="position:relative;width:150px;height:150px;";
 const imageMedia=document.createElement("canvas");
 imageMedia.style.cssText="position:absolute;width:150px;height:150px;";
 imageMedia.width=150;imageMedia.height=150;
 imageHost.append(imageMedia);document.body.append(imageHost);
 setAnnotationTool("pen");
 const imageSurface=ensureAnnotationSurface({host:imageHost,media:imageMedia,
   key:"qa-image-"+kind,kind:"attachment-image",intrinsicWidth:150,intrinsicHeight:150});
 syncAnnotationSurface(imageMedia);
 const imageAnnotationPreserved=imageSurface.canvas.classList.contains("annotation-input-enabled");
 destroyAnnotationSurface(imageSurface);imageHost.remove();
 const savedPreferences=JSON.parse(localStorage.getItem(ANNOTATION_OPTIONS_KEY) || '{}');
 // No cloud/settings cross-device writes. Distinct keys on this same origin.
 if(kind==="phone"){
   annotationEditorState.pen.width=6.5;annotationEditorState.pen.opacity=.45;
   saveAnnotationToolPreferences();
 }
 const toolSettings={width:annotationEditorState.pen.width,opacity:annotationEditorState.pen.opacity,
   savedKey:ANNOTATION_OPTIONS_KEY,storageKeys:Object.keys(localStorage).filter(k=>k.startsWith("peStudyNote.annotation.toolPreferences.v2."))};
 destroyAnnotationSurface(surface);sc.remove();
 return {ui,navigation,pen,phoneInputDisabled,attachmentInputDisabled,imageAnnotationPreserved,palmOnlyIgnored,wideFingerPanned,normalFingerRestored,referenceWidth,referenceClientWidth,
   attachmentWidth,attachmentExpected,attachmentStartTop,resizedWidth,resizedExpected,toolSettings,fingerInk,pinchRollback,
   toolsStayedReadOnly:kind==="phone"?toolsStayedReadOnly:undefined,
   storedKeys:Object.keys(localStorage).filter(k=>k.startsWith("peStudyNote.annotation.toolPreferences"))};
});
async function main(){
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url="http://127.0.0.1:"+server.address().port+"/";
 let browser;
 try{
  if(engine==="chromium"){
   let puppeteer;
   try{puppeteer=require("../../.qa-browser/node_modules/puppeteer-core")}
   catch(error){if(error.code!=="MODULE_NOT_FOUND")throw error;puppeteer=require("puppeteer-core")}
   browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",args:["--no-sandbox"]});
  }else browser=await require("../../.qa-webkit/node_modules/playwright").webkit.launch({headless:true});
  for(const profile of profiles){
   let page,context;
   if(engine==="chromium"){
     page=await browser.newPage();
     await page.setUserAgent(profile.ua);
     await page.setViewport({width:profile.width,height:844,isMobile:profile.kind!=="desktop",hasTouch:profile.kind!=="desktop"});
   }else{
     context=await browser.newContext({userAgent:profile.ua,viewport:{width:profile.width,height:844},
        isMobile:profile.kind!=="desktop",hasTouch:profile.kind!=="desktop"});
     page=await context.newPage();
   }
   await page.goto(url,{waitUntil:"domcontentloaded"});
   await page.waitForFunction(()=>window.__pdfDeviceReady===true);
   const out=await challenge(page);
   assert.equal(out.ui.device,profile.kind,"Device class");
   assert.deepEqual(Array.from(out.ui.defaultZoom),[1,1],"Defaults must be width-fit 100%");
   assert.equal(out.ui.buttons,profile.kind==="phone"?2:0,"Finger mode must only appear on phone PDF toolbars");
   assert(Math.abs(out.referenceWidth-(out.referenceClientWidth-28))<1.1,"Ref width fit "+JSON.stringify(out));
   assert(Math.abs(out.attachmentWidth-out.attachmentExpected)<1.1,"Attachment width fit "+JSON.stringify(out));
   assert(Math.abs(out.resizedWidth-out.resizedExpected)<1.1,"Resize width fit "+JSON.stringify(out));
   assert(out.resizedWidth>out.attachmentWidth+20,"Resize must really reflow the page");
   assert.equal(out.phoneInputDisabled,profile.kind==="phone","Phone annotation overlay must not intercept touches");
   assert.equal(out.attachmentInputDisabled,profile.kind==="phone","Attachment PDF annotation overlay must not intercept touches");
   assert(out.imageAnnotationPreserved,"Image viewer annotation must not be changed");
   if(profile.kind==="phone") assert(out.wideFingerPanned,"Broad finger input must pan on phone");
   else assert(out.palmOnlyIgnored,"Broad palm contact must not scroll or ink on tablet/desktop");
   assert(out.normalFingerRestored,"Normal finger navigation must resume after a rejected palm");
   assert.equal(out.attachmentStartTop,0,"Width-fit PDF must start at top of the page");
   if(profile.kind!=="phone"){
     assert.equal(out.toolSettings.width,4,"Device class inherited phone width");
     assert.equal(out.toolSettings.opacity,1,"Device class inherited phone opacity");
   }
   assert(out.pen.ink===(profile.kind==="phone"?0:1)
     && (profile.kind==="phone" || (out.pen.lastType==="pen" && out.pen.scrollUnchanged)),
     "Phone pen disabled / tablet pen and palm isolation "+JSON.stringify(out));
   assert.equal(out.navigation.ink,0,"Finger navigation inked unexpectedly");
   if(profile.kind!=="desktop") assert(out.navigation.scroll>=225,"Finger should pan PDF "+JSON.stringify(out));
   if(profile.kind==="phone"){
     assert.equal(out.fingerInk.afterInk,out.fingerInk.beforeInk,"Phone finger must never create ink");
     assert.equal(out.fingerInk.saved,true,"Previously saved finger mode still loads");
     assert(out.fingerInk.panDistance>=15,"Finger must still pan with saved drawing mode on");
     assert(out.fingerInk.ui.includes("켬"),"Existing finger-mode UI remains visible");
     assert(out.toolsStayedReadOnly,"Phone annotation tools, pen, undo and clear must not modify PDF content");
     assert.equal(out.pinchRollback.afterSecond,out.pinchRollback.beforeSecond,"Phone two-finger pinch must not create ink");
     assert(out.pinchRollback.zoom>1.1,"Phone two-finger pinch must zoom");
   }
   console.log("PDF_DEVICE_INPUT_PASS",JSON.stringify({engine,profile:profile.kind,results:out}));
   if(context)await context.close();else await page.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error("PDF_DEVICE_INPUT_FAIL",e);process.exitCode=1;server.close()});
