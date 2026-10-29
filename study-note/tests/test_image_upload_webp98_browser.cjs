"use strict";
// Browser-only synthetic regression; never accesses Sheets, Drive or Apps Script.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const puppeteer=require(process.env.QA_PUPPETEER_CORE||path.resolve(__dirname,"../../.qa-browser/node_modules/puppeteer-core"));
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage","--no-default-browser-check"]});
 try{
  const page=await browser.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  await page.goto("about:blank");
  await page.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,"../image-upload-optimizer.js"),"utf8")});
  const result=await page.evaluate(async()=>{
   const opt=window.PEImageUploadOptimizer;
   const check=(condition,message)=>{if(!condition)throw Error(message)};
   const canvas=document.createElement("canvas");
   canvas.width=1152;canvas.height=1152;
   const ctx=canvas.getContext("2d");
   const pixels=ctx.createImageData(canvas.width,canvas.height);
   let seed=123456789;
   for(let i=0;i<pixels.data.length;i+=4){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    pixels.data[i]=seed&255;pixels.data[i+1]=(seed>>8)&255;
    pixels.data[i+2]=(seed>>16)&255;pixels.data[i+3]=255;
   }
   ctx.putImageData(pixels,0,0);
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("png encoding failed")),"image/png"));
   const original=new File([blob],"synthetic.png",{type:"image/png"});
   check(original.size>=opt.THRESHOLD_BYTES,"Sample under threshold");
   const encoded=await opt.optimizeFile(original);
   check(encoded.optimized,"Large PNG unchanged: "+encoded.reason);
   check(encoded.file.type==="image/webp"&&encoded.file.size<original.size,"WebP result invalid");
   const before=await createImageBitmap(original),after=await createImageBitmap(encoded.file);
   check(before.width===after.width&&before.height===after.height,"Resolution changed");
   before.close();after.close();
   const small=new File([new Uint8Array(512)],"small.png",{type:"image/png"});
   const smallRes=await opt.optimizeFile(small);
   check(!smallRes.optimized&&smallRes.file===small&&smallRes.reason==="below-threshold","Small file changed");
   const gif=new File([new Uint8Array(opt.THRESHOLD_BYTES)],"animated.gif",{type:"image/gif"});
   const gifRes=await opt.optimizeFile(gif);
   check(!gifRes.optimized&&gifRes.file===gif&&gifRes.reason==="unsupported-format","GIF changed");
   const bytes=new Uint8Array(await original.arrayBuffer());
   for(const marker of ["iCCP","gAMA","pHYs","tEXt","acTL"]){
    const chunk=new Uint8Array(12);
    for(let i=0;i<4;i++)chunk[4+i]=marker.charCodeAt(i);
    const merged=new Uint8Array(bytes.length+12);
    merged.set(bytes.slice(0,33));merged.set(chunk,33);merged.set(bytes.slice(33),45);
    const file=new File([merged],"metadata.png",{type:"image/png"});
    const ret=await opt.optimizeFile(file);
    check(!ret.optimized&&ret.file===file&&ret.reason==="metadata-or-animation",marker+" metadata removed");
   }
   const realToBlob=HTMLCanvasElement.prototype.toBlob;
   HTMLCanvasElement.prototype.toBlob=function(callback){callback(new Blob([new Uint8Array(original.size+1)],{type:"image/webp"}))};
   try{
    const larger=await opt.optimizeFile(original);
    check(!larger.optimized&&larger.file===original&&larger.reason==="not-smaller","Larger result replaced original");
   }finally{HTMLCanvasElement.prototype.toBlob=realToBlob}
   return {originalBytes:original.size,optimizedBytes:encoded.file.size,width:canvas.width,height:canvas.height};
  });
  assert.deepEqual(errors,[]);
  console.log("IMAGE_UPLOAD_WEBP98_CHROMIUM_PASS "+JSON.stringify(result));
  await page.close();
 }finally{await browser.close()}
})().catch(e=>{console.error("IMAGE_UPLOAD_WEBP98_CHROMIUM_FAIL "+String(e.stack||e));process.exitCode=1});
