"use strict";
// Synthetic local browser gesture QA: never fetches/updates LIVE PDF or MASTER.
const assert = require("node:assert/strict");
const path = require("node:path");
let puppeteer;
try { puppeteer = require("../../.qa-browser/node_modules/puppeteer-core"); }
catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  puppeteer = require("puppeteer-core");
}
const root = path.resolve(__dirname, "..");
const url = "file:///" + path.join(root, "study-note.html").replaceAll("\\", "/");
async function run() {
  const chrome = process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const browser = await puppeteer.launch({ headless: true, executablePath: chrome,
    args: ["--no-sandbox", "--disable-extensions"] });
  try {
    for (const width of [390, 820, 1280]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 844, deviceScaleFactor: 1,
        isMobile: width < 761, hasTouch: true });
      await page.setRequestInterception(true);
      page.on("request", r => r.url().startsWith("file:") ? r.continue() : r.abort());
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const results = await page.evaluate(() => {
        const output = [];
        const point = (id, target, x, y) => new Touch({ identifier: id, target,
          clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y });
        const send = (target, type, touches, changed) => target.dispatchEvent(
          new TouchEvent(type, { bubbles: true, cancelable: true,
            touches, targetTouches: touches, changedTouches: changed }));
        for (const kind of ["reference-pdf", "attachment-pdf"]) {
          const cls = kind === "reference-pdf" ? "reference-pdf-pan-scroller" : "attachment-pdf-pan-scroller";
          const scroller = document.createElement("div");
          scroller.className = cls;
          scroller.style.cssText = "position:relative;width:260px;height:280px;overflow:auto;touch-action:none;";
          const stage = document.createElement("div");
          stage.style.cssText = "position:relative;display:block;width:1200px;height:1400px;";
          const canvas = document.createElement("canvas");
          canvas.className = "annotation-canvas annotation-input-enabled";
          canvas.style.cssText = "position:relative;display:block;width:1100px;height:1200px;pointer-events:auto;touch-action:none;";
          stage.appendChild(canvas);
          scroller.appendChild(stage);
          document.body.appendChild(scroller);
          scroller.scrollLeft = 200; scroller.scrollTop = 300;
          let zoom = 2.5;
          const changes = [];
          installPdfPanPinchHandlers(scroller, { getZoom: () => zoom,
            setZoom: value => { zoom = value; changes.push(value); }, minZoom: 0.5, maxZoom: 10 });
          // Drawing overlay consumes bubbling TouchEvents; a PDF gesture must still be seen.
          for (const name of ["touchstart","touchmove","touchend","touchcancel"])
            canvas.addEventListener(name, e => e.stopPropagation(), { passive:false });
          const a = point(1, canvas, 100, 150);
          const b = point(2, canvas, 160, 150);
          send(canvas, "touchstart", [a], [a]);
          send(canvas, "touchstart", [a,b], [b]);
          const bOut = point(2, canvas, 260, 150);
          send(canvas, "touchmove", [a,bOut], [bOut]);
          const zoomOutward = zoom;
          send(canvas, "touchend", [], [a,bOut]);
          const c = point(3, canvas, 100, 150);
          const e = point(4, canvas, 260, 150);
          send(canvas, "touchstart", [c,e], [c,e]);
          const eIn = point(4, canvas, 145, 150);
          send(canvas, "touchmove", [c,eIn], [eIn]);
          const zoomInward = zoom;
          send(canvas, "touchend", [], [c,eIn]);
          output.push({ kind, zoomOutward, zoomInward, calls: changes.length, zoom,
            startingScroll: 200, finalScroll: scroller.scrollLeft });
          scroller.remove();
        }
        return output;
      });
      for (const r of results) {
        assert(r.zoomOutward > 2.6, "Pinch out must zoom in: " + JSON.stringify(r));
        assert(r.zoomInward < r.zoomOutward - 0.1, "Pinch in must zoom out: " + JSON.stringify(r));
        assert(r.calls >= 2, "Both gestures must change zoom: " + JSON.stringify(r));
      }
      console.log("PDF_TOUCH_QA_PASS", JSON.stringify({ width, results }));
      // Device-level Chromium touch input produces real browser Touch/Pointer
      // event sequences, not only scripted DOM-dispatched TouchEvents.
      await page.evaluate(() => {
        const scroller = document.createElement("div");
        scroller.className = "reference-pdf-pan-scroller";
        scroller.style.cssText = "position:fixed;top:110px;left:16px;width:260px;height:280px;z-index:999999;background:#eee;overflow:auto;touch-action:none;";
        const stage = document.createElement("div");
        stage.style.cssText = "position:relative;display:block;width:1100px;height:1200px;";
        const layer = document.createElement("canvas");
        layer.className = "annotation-canvas annotation-input-enabled";
        layer.style.cssText = "display:block;position:relative;width:1000px;height:1100px;pointer-events:auto;touch-action:none;";
        layer.addEventListener("touchstart", e => e.stopPropagation(), { passive: false });
        layer.addEventListener("touchmove", e => e.stopPropagation(), { passive: false });
        stage.appendChild(layer); scroller.appendChild(stage);
        document.body.appendChild(scroller);
        let zoom = 2.5;
        let touchMoves = 0;
        scroller.addEventListener("touchmove", () => touchMoves++, { capture:true });
        scroller.scrollLeft = 220;
        window.__pdfNativeTouchProbe = { scroller, get zoom(){return zoom;},
          get touchMoves(){return touchMoves;} };
        installPdfPanPinchHandlers(scroller, { getZoom: () => zoom,
          setZoom: v => { zoom = v; }, minZoom:0.5,maxZoom:10 });
      });
      const client = await page.createCDPSession();
      const t1 = { x: 90, y: 195 };
      const t2 = { x: 160, y: 195 };
      await client.send("Input.dispatchTouchEvent", { type:"touchStart", touchPoints:[t1,t2] });
      await client.send("Input.dispatchTouchEvent", { type:"touchMove",
        touchPoints:[t1,{ x: 220,y:195 }] });
      await client.send("Input.dispatchTouchEvent", { type:"touchEnd", touchPoints:[] });
      const browserInput = await page.evaluate(()=>({
        zoom:window.__pdfNativeTouchProbe.zoom,
        events:window.__pdfNativeTouchProbe.touchMoves
      }));
      assert(browserInput.events>0,"browser did not deliver TouchEvents to the scroller");
      assert(browserInput.zoom>2.6,"native browser pinch must zoom: "+JSON.stringify(browserInput));
      console.log("PDF_NATIVE_INPUT_PASS",JSON.stringify({width,browserInput}));
      await client.detach();
      await page.close();
    }
  } finally { await browser.close(); }
}
run().catch(e => { console.error("PDF_TOUCH_QA_FAIL",e); process.exitCode = 1 });
