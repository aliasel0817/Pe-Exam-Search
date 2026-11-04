// Local read-only performance sampling with generated PDF, not a device benchmark.
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createMuPDFEngine} from '../m3-mupdf.mjs';
import {buildSamplePdf} from './fixtures.mjs';
const bytes=await buildSamplePdf();
const module=await import(pathToFileURL(path.resolve(import.meta.dirname,'../../m2/node_modules/mupdf/dist/mupdf.js')).href);
const doc=await createMuPDFEngine({module}).openDocument(bytes);
const output=[];
try{
 for(const scale of [1,2,4,8]){
  const before=process.memoryUsage();
  const start=performance.now();
  const frame=await doc.renderPage(1,{scale,dpr:1});
  const ms=performance.now()-start;
  const after=process.memoryUsage();
  output.push({scale,actualScale:Number(frame.scale.toFixed(3)),
   width:frame.width,height:frame.height,pixelBytes:frame.pixels.byteLength,
   budgetLimited:frame.budgetLimited,elapsedMs:Number(ms.toFixed(2)),
   processRssBytesBefore:before.rss,processRssBytesAfter:after.rss,
   note:'RSS includes Node and WASM allocator; NOT a reliable browser peak'});
 }
}finally{await doc.close();}
console.log(JSON.stringify({run:'isolated-node-synthetic-pdf',
 fixture:'generated in memory',rows:output,productionPdfTested:false,operatingStateModified:false},null,2));
