"use strict";
const assert = require("node:assert/strict");
const puppeteer = require("C:/Users/user/AppData/Local/npm-cache/_npx/4b4c857f6efdfb61/node_modules/puppeteer");
const path = require("node:path");
const url = "file:///" + path.resolve(__dirname, "..", "study-note.html").replaceAll("\\", "/");
(async () => {
 const browser = await puppeteer.launch({headless: true, executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe", args:["--no-sandbox","--disable-extensions"]});
 try {
  const page = await browser.newPage();
  for (const width of [320,390,820,1280]) {
   await page.setViewport({width,height:800,deviceScaleFactor:1});
   await page.goto(url,{waitUntil:"domcontentloaded"});
   await new Promise(resolve=>setTimeout(resolve,500));
   await page.evaluate(()=>{document.getElementById("topicDetail").classList.remove("hidden");document.getElementById("emptyState").classList.add("hidden")});
   const initial = await page.$eval("#detailPageReference", e=>({open:e.open, count:e.querySelectorAll(".meta-grid > div").length, summary:e.querySelector("summary").textContent,visible:getComputedStyle(e.querySelector(".meta-grid")).display, summaryHeight:Math.round(e.querySelector("summary").getBoundingClientRect().height),width:document.documentElement.scrollWidth}));
   assert.equal(initial.open,false);
   assert.equal(initial.count,6);
   assert(initial.summary.includes("페이지 · 참고정보"));
   assert(initial.summaryHeight>=44);
   await page.$eval("#detailPageReference summary",e=>e.click());
   const expanded = await page.$eval("#detailPageReference",e=>({open:e.open, visible:getComputedStyle(e.querySelector(".meta-grid")).display, labels:Array.from(e.querySelectorAll("dt")).map(e=>e.textContent), hint:getComputedStyle(e.querySelector(".metadata-hint-close")).display}));
   assert.equal(expanded.open,true);
   assert.notEqual(expanded.visible,"none");
   assert.deepEqual(expanded.labels,["서브노트페이지","교재페이지","상태","원본도메인","학습제외사유","비고"]);
   await page.keyboard.press("Tab");
   await page.$eval("#detailPageReference summary",e=>e.click());
   assert.equal(await page.$eval("#detailPageReference",e=>e.open),false);
   assert(initial.width<=width+2,"horizontal overflow width="+width+" scroll="+initial.width);
   console.log("PASS width="+width+" height="+initial.summaryHeight+" fields="+initial.count);
  }
  console.log("PASS page-reference browser collapse/expand matrix");
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
