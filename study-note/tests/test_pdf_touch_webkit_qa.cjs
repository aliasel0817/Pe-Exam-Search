"use strict";
/* Synthetic Safari WebKit engine QA; no LIVE Google Sheet, PDF, or mutation. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { webkit } = require("../../.qa-webkit/node_modules/playwright");
const html = fs.readFileSync(path.resolve(__dirname, "../study-note.html"), "utf8")
  .replace("window.addEventListener('DOMContentLoaded', init);", "")
  .replace(/<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>/, "")
  .replace(/<script src="\.\/tts\/natural-tts\.js\?v=[^"]+"><\/script>/, "");
(async () => {
  const browser = await webkit.launch({headless:true});
  try {
    for (const width of [390, 820]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 }, isMobile: width < 761, hasTouch: true
      });
      const page = await context.newPage();
      await page.route("**/*", route => route.abort());
      await page.setContent(html, { waitUntil:"domcontentloaded" });
      const results = await page.evaluate(() => {
        if (typeof installPdfPanPinchHandlers !== "function") throw Error("PDF gesture function missing");
        const touch = (id,target,x,y) => new Touch({identifier:id,target,clientX:x,clientY:y,
          pageX:x,pageY:y,screenX:x,screenY:y});
        const emit = (target,type,points,changed) => target.dispatchEvent(
          new TouchEvent(type,{bubbles:true,cancelable:true,touches:points,
            targetTouches:points,changedTouches:changed}));
        const results=[];
        for(const name of ["reference-pdf","attachment-pdf"]){
          const scroller=document.createElement("div");
          scroller.className=name+"-pan-scroller";
          scroller.style.cssText="position:relative;width:260px;height:280px;overflow:auto;touch-action:none;";
          const stage=document.createElement("div");
          stage.style.cssText="position:relative;display:block;width:1100px;height:1200px;";
          const layer=document.createElement("canvas");
          layer.className="annotation-canvas annotation-input-enabled";
          layer.style.cssText="position:relative;display:block;width:1000px;height:1100px;pointer-events:auto;touch-action:none;";
          stage.appendChild(layer);scroller.appendChild(stage);document.body.appendChild(scroller);
          for(const e of ["touchstart","touchmove","touchend","touchcancel"])
            layer.addEventListener(e,event=>event.stopPropagation(),{passive:false});
          let zoom=2.5;
          installPdfPanPinchHandlers(scroller,{getZoom:()=>zoom,setZoom:value=>{zoom=value;},
            minZoom:.5,maxZoom:10});
          const a=touch(1,layer,100,100),b=touch(2,layer,180,100);
          emit(layer,"touchstart",[a,b],[a,b]);
          const b1=touch(2,layer,270,100);
          emit(layer,"touchmove",[a,b1],[b1]);
          const expanded=zoom;
          emit(layer,"touchend",[],[a,b1]);
          const c=touch(3,layer,100,100),e=touch(4,layer,270,100);
          emit(layer,"touchstart",[c,e],[c,e]);
          const e1=touch(4,layer,140,100);
          emit(layer,"touchmove",[c,e1],[e1]);
          const reduced=zoom;
          emit(layer,"touchend",[],[c,e1]);
          results.push({name,expanded,reduced});
          scroller.remove();
        }
        return results;
      });
      for(const result of results){
        assert(result.expanded>2.6,"WebKit pinch-out must zoom: "+JSON.stringify(result));
        assert(result.reduced<result.expanded-0.1,"WebKit pinch-in must zoom: "+JSON.stringify(result));
      }
      console.log("WEBKIT_PDF_PINCH_PASS",JSON.stringify({width,results}));
      await context.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error("WEBKIT_PDF_PINCH_FAIL",e);process.exitCode=1});
