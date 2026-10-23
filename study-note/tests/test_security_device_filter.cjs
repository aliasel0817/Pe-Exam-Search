"use strict";
/* Synthetic device fixtures only. Never calls the live authentication API. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const puppeteer=require("../../.qa-browser/node_modules/puppeteer-core");
const root=path.resolve(__dirname,"..");
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);res.end();return;}
 res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript":p.endsWith(".json")?"application/json":"text/html; charset=utf-8");
 res.end(fs.readFileSync(p));
});
async function readUi(page){
 return page.evaluate(()=>{
  const s=document.getElementById("securityDeviceStatusFilter");
  const rows=[...document.querySelectorAll("#securityDeviceList .security-device-item")];
  const wrap=document.getElementById("securityDevicesSection");
  return {
   filter:s.value, options:[...s.options].map(o=>({value:o.value,text:o.textContent})),
   count:rows.length, names:rows.map(row=>row.querySelector("strong")?.textContent||""),
   statuses:rows.map(row=>row.querySelector(".security-device-badge")?.textContent||""),
   approve:rows.filter(row=>row.querySelector(".security-approve-device")).length,
   rename:rows.filter(row=>row.querySelector(".security-rename-device")).length,
   revoke:rows.filter(row=>row.querySelector(".security-revoke-device")).length,
   empty:document.getElementById("securityDeviceList").textContent,
   sectionWidth:Math.ceil(wrap.getBoundingClientRect().width),
   toolbarWidth:Math.ceil(wrap.querySelector(".security-device-toolbar").getBoundingClientRect().width),
   documentWidth:document.documentElement.scrollWidth,
   viewport:innerWidth,
   statusHelp:wrap.querySelector(".help-text").textContent,
   scriptNodes:document.querySelectorAll("#securityDeviceList script").length,
  };
 });
}
(async()=>{
 let browser;
 try{
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
  const base="http://127.0.0.1:"+server.address().port;
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",headless:true,args:["--no-sandbox","--disable-extensions"]});
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request",request=>request.url().startsWith(base+"/")?request.continue():request.abort());
  const errors=[];page.on("pageerror",e=>errors.push(String(e)));
  await page.goto(base+"/study-note.html",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>typeof renderSecurityDevices==="function"&&!!document.getElementById("securityDeviceStatusFilter"),{timeout:12000});
  await page.evaluate(()=>{
   const fixtures=[
    {deviceId:"qa-active-1",deviceName:"내 컴퓨터",status:"ACTIVE",current:true,platform:"Windows",browserInfo:"Chrome",registeredAt:"2026-10-10T00:00:00Z"},
    {deviceId:"qa-active-2",deviceName:"태블릿",status:"ACTIVE",current:false,platform:"Android",browserInfo:"Chrome"},
    {deviceId:"qa-pending",deviceName:"승인 대기 아이폰",status:"PENDING",current:false,platform:"iOS",browserInfo:"Safari"},
    {deviceId:"qa-revoked-1",deviceName:"차단된 회사 PC",status:"REVOKED",current:false,platform:"Windows",browserInfo:"Chrome"},
    {deviceId:"qa-revoked-2",deviceName:"<img src=x onerror=alert(1)>",status:"REVOKED",current:false,platform:"iOS",browserInfo:"Safari"},
   ];
   window.qaDeviceFixtures=fixtures;
   document.getElementById("securityModal").classList.remove("hidden");
   document.getElementById("securityDevicesSection").classList.remove("hidden");
   document.getElementById("securityDeviceStatusFilter").value="active";
   renderSecurityDevices(fixtures);
  });
  const initial=await readUi(page);
  assert.equal(initial.filter,"active");
  assert.equal(initial.count,3);
  assert.equal(initial.approve,1);
  assert.equal(initial.rename,3);
  assert.equal(initial.revoke,3);
  assert.deepEqual(initial.options.map(x=>x.text),["활성·승인 대기 (3)","차단된 기기 (2)","전체 기기 (5)"]);
  assert(!initial.names.some(x=>x.includes("차단된 회사 PC")));
  assert(initial.statusHelp.includes("서버 기록은 삭제하지 않습니다"));
  await page.select("#securityDeviceStatusFilter","revoked");
  const revoked=await readUi(page);
  assert.equal(revoked.count,2);
  assert.deepEqual(revoked.statuses,["REVOKED","REVOKED"]);
  assert.equal(revoked.approve,0);
  assert.equal(revoked.rename,0);
  assert.equal(revoked.revoke,0);
  assert.equal(revoked.scriptNodes,0,"User-supplied device names must never inject HTML");
  assert(revoked.empty.includes("<img src=x onerror=alert(1)>"));
  await page.select("#securityDeviceStatusFilter","all");
  const all=await readUi(page);
  assert.equal(all.count,5);
  assert.equal(all.revoke,3);
  assert.equal(all.approve,1);
  await page.select("#securityDeviceStatusFilter","active");
  assert.equal((await readUi(page)).count,3);
  // A filter change is client-side only: the original server-like payload remains unchanged.
  const unmodified=await page.evaluate(()=>qaDeviceFixtures.map(x=>x.status));
  assert.deepEqual(unmodified,["ACTIVE","ACTIVE","PENDING","REVOKED","REVOKED"]);
  // Fresh server results after an existing revoke operation must refresh displayed counts, not delete records.
  await page.evaluate(()=>{
   const fromServer=qaDeviceFixtures.map(d=>d.deviceId==="qa-active-2"?{...d,status:"REVOKED"}:d);
   renderSecurityDevices(fromServer);
  });
  const changed=await readUi(page);
  assert.equal(changed.count,2);
  assert.deepEqual(changed.options.map(x=>x.text),["활성·승인 대기 (2)","차단된 기기 (3)","전체 기기 (5)"]);
  await page.select("#securityDeviceStatusFilter","revoked");
  assert.equal((await readUi(page)).count,3);
  await page.evaluate(()=>renderSecurityDevices([{deviceId:"test-lowercase",deviceName:"대소문자 테스트",status:"revoked"}]));
  const normalized=await readUi(page);
  assert.equal(normalized.count,1);
  assert.deepEqual(normalized.statuses,["REVOKED"]);
  assert.equal(normalized.revoke,0);
  await page.evaluate(()=>renderSecurityDevices([]));
  assert.equal((await readUi(page)).count,0);
  assert((await readUi(page)).empty.includes("등록된 기기가 없습니다"));
  await page.evaluate(()=>renderSecurityDevices([{deviceId:"test-active",deviceName:"활성",status:"ACTIVE"}]));
  assert((await readUi(page)).empty.includes("차단된 기기가 없습니다"));
  await page.select("#securityDeviceStatusFilter","active");
  const sizes=[];
  for(const width of [320,390,820,1280]){
   await page.setViewport({width,height:850,deviceScaleFactor:1});
   const state=await readUi(page);
   assert(state.documentWidth<=state.viewport+2,"Viewport overflow "+JSON.stringify(state));
   assert(state.toolbarWidth<=state.sectionWidth+2,"Device filter row overflow "+JSON.stringify(state));
   sizes.push({width,documentWidth:state.documentWidth,toolbarWidth:state.toolbarWidth,sectionWidth:state.sectionWidth});
  }
  assert.deepEqual(errors,[]);
  console.log("SECURITY_DEVICE_FILTER_QA_PASS",JSON.stringify({defaultVisible:initial.count,revokedShown:revoked.count,allVisible:all.count,backendPayloadUnchanged:true,filtersDoNotMutateCredentials:true,sizes}));
 }finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
 }
})().catch(err=>{console.error("SECURITY_DEVICE_FILTER_QA_FAIL",err.stack||err);process.exitCode=1;server.close()});
