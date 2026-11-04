import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {buildSamplePdf,inkSample} from './fixtures.mjs';
import {createMuPDFEngine} from '../m3-mupdf.mjs';
import {createPdfJsEngine} from '../m3-pdfjs.mjs';
import {boundedMetrics,normalizedToPixel,pixelToNormalized,RendererError,paintBitmapToCanvas,DEFAULT_BUDGET} from '../m3-common.mjs';

const moduleURL=pathToFileURL(path.resolve(import.meta.dirname,'../../m2/node_modules/mupdf/dist/mupdf.js')).href;
let bytes,mu,pdf;
test.before(async()=>{
 bytes=await buildSamplePdf();
 const mupdf=await import(moduleURL);
 mu=createMuPDFEngine({module:mupdf});
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 pdf=createPdfJsEngine({module:pdfjs,canvasFactory:createCanvas});
});
test('Synthetic fixture is a PDF, no actual user files or keys',()=>{
 assert.equal(String.fromCharCode(...bytes.slice(0,5)),'%PDF-');assert(bytes.length>1000);
});
test('Open document, page count, metadata and explicit close',async()=>{
 const doc=await mu.openDocument(bytes);
 assert.equal(doc.engine,'mupdf');assert.equal(doc.countPages,2);
 const m=doc.getPageBounds(1);assert.equal(Math.round(m.pageWidth),600);
 assert.equal(Math.round(m.pageHeight),800);
 const rot=doc.getPageBounds(2);
 assert.equal(rot.rotation,90);
 assert(rot.pageWidth>0&&rot.pageHeight>0);
 assert(rot.cropBox.width!==rot.mediaBox.width||rot.cropBox.height!==rot.mediaBox.height);
 await doc.close();await doc.close();
 await assert.rejects(doc.renderPage(1),e=>e.code==='DOCUMENT_CLOSED');
});
test('MuPDF render actual colored text/vector pixels and safe copies',async()=>{
 const doc=await mu.openDocument(bytes);
 try{
  const img=await doc.renderPage(1,{scale:1,dpr:1});
  assert.equal(img.engine,'mupdf');assert.equal(img.pageNumber,1);
  assert.equal(img.annotationSchema,3);assert.equal(img.normalizedCoordinateSpace,'normalized-0-1');
  assert(img.pixels.length===img.width*img.height*4);
  assert(img.width>=599&&img.width<=602);
  assert(img.height>=799&&img.height<=802);
  const colorSamples=[];for(let y=0;y<img.height;y+=8)for(let x=0;x<img.width;x+=8){
   const i=4*(y*img.width+x);if(img.pixels[i+2]>160&&img.pixels[i]<120)colorSamples.push(i);
  }
  assert(colorSamples.length>10,'expected visibly blue vector rectangle');
  const c=createCanvas(1,1);
  paintBitmapToCanvas(img,c);
  assert.equal(c.width,img.width);
  assert.equal(c.height,img.height);
  const png=c.toBuffer('image/png');assert(png.length>1000);
 }finally{await doc.close();}
});
test('Rotated cropped PDF page renders with actual requested page metadata',async()=>{
 const doc=await mu.openDocument(bytes);
 try{
  const info=doc.getPageBounds(2);
  const img=await doc.renderPage(2,{scale:1.25});
  assert.equal(img.rotation,90);
  assert(img.width>0&&img.height>0&&img.pixels.length>5000);
  assert(info.pageWidth>0&&info.pageHeight>0);
 }finally{await doc.close();}
});
test('High zoom budget maintains capped pixels and edges',async()=>{
 const doc=await mu.openDocument(bytes);
 try{
  const budget={maxEdge:1200,maxPixels:500000,maxBytes:2000000};
  const x=await doc.renderPage(1,{scale:6,dpr:2,budget});
  assert(x.width<=1202&&x.height<=1202);
  assert(x.pixels.byteLength<=2000000);
  assert.equal(x.budgetLimited,true);
  assert(x.scale<12);
 }finally{await doc.close();}
});
test('Normalized coordinates roundtrip without changing schema 3 annotation fields',async()=>{
 const doc=await mu.openDocument(bytes);
 const copy=JSON.stringify(inkSample());
 try{
  const region={x:0.25,y:0.2,width:0.3,height:0.5};
  const image=await doc.renderPage(1,{scale:1.5,dpr:2,region});
  const pos={x:0.45,y:0.4};
  const pixel=normalizedToPixel(pos,image);
  const recovered=pixelToNormalized(pixel,image);
  assert(Math.abs(pos.x-recovered.x)<1e-10);
  assert(Math.abs(pos.y-recovered.y)<1e-10);
  assert(image.x>0&&image.y>0&&image.width<image.fullWidth);
  assert.equal(JSON.stringify(inkSample()),copy);
 }finally{await doc.close();}
});
test('Aborted before render does not allocate output',async()=>{
 const doc=await mu.openDocument(bytes);
 try{
  const ctl=new AbortController();ctl.abort();
  await assert.rejects(doc.renderPage(1,{signal:ctl.signal}),e=>e.code==='ABORTED');
 }finally{await doc.close();}
});
test('Pixel budget and region input guard reject pathological allocations',()=>{
 assert.throws(()=>boundedMetrics(600,800,{scale:0}),e=>e.code==='INVALID_SCALE');
 assert.throws(()=>boundedMetrics(600,800,{scale:4000}),e=>e.code==='INVALID_SCALE');
 assert.throws(()=>boundedMetrics(600,800,{region:{x:0.8,y:0.8,width:0.5,height:0.5}}),e=>e.code==='INVALID_REGION');
 const bounded=boundedMetrics(600,800,{scale:20,dpr:3});
 assert(bounded.width<=DEFAULT_BUDGET.maxEdge);
 assert(bounded.height<=DEFAULT_BUDGET.maxEdge);
});
test('PDF.js secure fallback can open and rasterize same synthetic document',async()=>{
 const doc=await pdf.openDocument(bytes);
 try{
  assert.equal(doc.engine,'pdfjs');assert.equal(doc.countPages,2);
  const bounds=await doc.getPageBounds(2);assert.equal(bounds.rotation,90);
  const image=await doc.renderPage(1,{scale:0.5,dpr:1});
  assert.equal(image.engine,'pdfjs');
  assert(image.width>=299&&image.width<=302);
  assert.equal(image.pixels.length,image.width*image.height*4);
 }finally{await doc.close();}
});

test('Tile pixels align with full-page MuPDF raster on both cropped and rotated pages',async()=>{
 const doc=await mu.openDocument(bytes);
 try{
  for(const n of [1,2]){
   const full=await doc.renderPage(n,{scale:1,dpr:1});
   const region=await doc.renderPage(n,{scale:1,dpr:1,region:{x:0.2,y:0.2,width:0.4,height:0.4}});
   assert(region.width<full.width && region.height<full.height);
   let mismatched=0,sampled=0;
   for(let y=3;y<region.height-3;y+=3)for(let x=3;x<region.width-3;x+=3){
    const fullOffset=4*((region.y+y)*full.width+(region.x+x));
    const tileOffset=4*(y*region.width+x);
    if(fullOffset<0 || fullOffset+3>=full.pixels.length)throw Error('invalid tile bounds');
    for(let ch=0;ch<3;ch++)if(Math.abs(region.pixels[tileOffset+ch]-full.pixels[fullOffset+ch])>8){mismatched++;break;}
    sampled++;
   }
   assert(mismatched/sampled<0.02,'tile pixels differ from full page at '+n+': '+mismatched+'/'+sampled);
  }
 }finally{await doc.close();}
});

test('Repeated open / render / close releases native session handles',async()=>{
 for(let i=0;i<12;i++){
  const doc=await mu.openDocument(bytes);
  try{
   const img=await doc.renderPage(i%2+1,{scale:0.35});
   assert(img.pixels.length===img.width*img.height*4);
  }finally{await doc.close();}
 }
});
