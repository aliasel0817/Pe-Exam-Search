"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"../image-upload-optimizer.js"),"utf8");
const page=fs.readFileSync(path.resolve(__dirname,"../study-note.html"),"utf8");
assert(page.includes('<script src="./image-upload-optimizer.js"></script>'));
assert(page.includes('await window.PEImageUploadOptimizer.optimizeFile(originalFile)'));
const context={window:{},Uint8Array,File:class File { constructor(parts,name,opts){this.name=name;this.type=opts.type;this.size=parts[0].size;} }};
const encode=(bytes)=>new Uint8Array(bytes);
let width=800,height=600,webpSize=120000;
context.document={createElement(){return{width:0,height:0,
  getContext(){return{drawImage(){}}},
  toBlob(cb){cb({size:webpSize,type:"image/webp"})}
}}};
context.createImageBitmap=async file=>({width,height,close(){},file});
vm.runInNewContext(source,context);
const o=context.window.PEImageUploadOptimizer;
assert.equal(o.THRESHOLD_BYTES,1048576);
assert.equal(o.QUALITY,0.98);
const png=(withMetadata)=>{
 const chunks=[];
 function chunk(tag,payload=[]){
   const len=payload.length;chunks.push(...[(len>>>24)&255,(len>>>16)&255,(len>>>8)&255,len&255],
     ...Array.from(tag).map(x=>x.charCodeAt(0)),...payload,0,0,0,0);
 }
 chunk("IHDR",[0,0,3,32,0,0,2,88,8,6,0,0,0]);
 if(withMetadata)chunk("iCCP",[1,0,0]);
 chunk("IDAT",[1]);chunk("IEND");
 return encode([137,80,78,71,13,10,26,10,...chunks]);
};
function file(size,bytes,mime="image/png",name="test.png"){
 return{size,type:mime,name,lastModified:123,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}
(async()=>{
 assert.equal((await o.optimizeFile(file(1048575,png(false)))).reason,"below-threshold");
 assert.equal((await o.optimizeFile(file(1048576,png(true)))).reason,"metadata-or-animation");
 assert.equal((await o.optimizeFile(file(1048576,encode([0]),"image/gif"))).reason,"unsupported-format");
 let result=await o.optimizeFile(file(1800000,png(false)));
 assert.equal(result.optimized,true);
 assert.equal(result.file.type,"image/webp");
 assert.equal(result.file.name,"test_optimized.webp");
 assert.equal(result.outputBytes,120000);
 webpSize=2000000;
 result=await o.optimizeFile(file(1800000,png(false)));
 assert.equal(result.reason,"not-smaller");
 width=19000;webpSize=120000;
 result=await o.optimizeFile(file(1800000,png(false)));
 assert.equal(result.reason,"too-large-to-render-safely");
 console.log("IMAGE_UPLOAD_WEBP98_SYNTHETIC_QA_PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
