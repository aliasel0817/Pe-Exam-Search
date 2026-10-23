"use strict";
/* iPhone/Safari-engine responsive smoke test: synthetic fixtures only. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {webkit}=require("../../.qa-webkit/node_modules/playwright");
const root=path.resolve(__dirname,"..");
const server=http.createServer((req,res)=>{
 const target=path.resolve(root,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));
 if(!target.startsWith(root+path.sep)||!fs.existsSync(target)){res.writeHead(404);res.end();return;}
 res.setHeader("Content-Type",target.endsWith(".js")?"text/javascript":target.endsWith(".json")?"application/json":"text/html; charset=utf-8");
 res.end(fs.readFileSync(target));
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const url="http://127.0.0.1:"+server.address().port;
  browser=await webkit.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/*",route=>route.request().url().startsWith(url+"/")?route.continue():route.abort());
  await page.goto(url+"/study-note.html",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>typeof renderSecurityDevices==="function"&&!!document.getElementById("securityDeviceStatusFilter"));
  await page.evaluate(()=>{
   document.getElementById("securityModal").classList.remove("hidden");
   document.getElementById("securityDevicesSection").classList.remove("hidden");
   renderSecurityDevices([
    {deviceId:"active-1",deviceName:"Active PC",status:"ACTIVE",current:true},
    {deviceId:"pending-1",deviceName:"Pending iPhone",status:"PENDING",current:false},
    {deviceId:"revoked-1",deviceName:"Revoked tablet",status:"REVOKED",current:false}
   ]);
  });
  assert.equal(await page.locator("#securityDeviceStatusFilter").inputValue(),"active");
  assert.equal(await page.locator("#securityDeviceList .security-device-item").count(),2);
  assert.equal(await page.locator(".security-approve-device").count(),1);
  await page.selectOption("#securityDeviceStatusFilter","revoked");
  assert.equal(await page.locator("#securityDeviceList .security-device-item").count(),1);
  assert.equal(await page.locator(".security-revoke-device").count(),0);
  await page.selectOption("#securityDeviceStatusFilter","all");
  assert.equal(await page.locator("#securityDeviceList .security-device-item").count(),3);
  const widths=[];
  for(const width of [320,390,820,1280]){
   await page.setViewportSize({width,height:844});
   const measured=await page.evaluate(()=>{
    const section=document.getElementById("securityDevicesSection"),header=section.querySelector(".security-device-toolbar");
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,section:section.getBoundingClientRect().width,header:header.getBoundingClientRect().width};
   });
   assert(measured.scrollWidth<=measured.width+2,"Horizontal overflow "+JSON.stringify(measured));
   assert(measured.header<=measured.section+2,"Header overflow "+JSON.stringify(measured));
   widths.push(measured);
  }
  assert.deepEqual(errors,[]);
  console.log("SECURITY_DEVICE_FILTER_WEBKIT_QA_PASS",JSON.stringify({filters:["active","revoked","all"],widths,errors:0}));
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error("SECURITY_DEVICE_FILTER_WEBKIT_QA_FAIL",e.stack||e);process.exitCode=1;server.close()});
