import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import {buildSamplePdf} from './fixtures.mjs';
import {createMuPDFEngine} from '../m3-mupdf.mjs';
import {createPdfJsEngine} from '../m3-pdfjs.mjs';
const source=await buildSamplePdf();
const muModule=await import(pathToFileURL(path.resolve(import.meta.dirname,'../../m2/node_modules/mupdf/dist/mupdf.js')).href);
const mu=await createMuPDFEngine({module:muModule}).openDocument(source);
const pdf=await createPdfJsEngine({module:await import('pdfjs-dist/legacy/build/pdf.mjs'),canvasFactory:createCanvas}).openDocument(source);
try{
 const a=mu.getPageBounds(2),b=await pdf.getPageBounds(2);
 const x=await mu.renderPage(2,{scale:1}),y=await pdf.renderPage(2,{scale:1});
 console.log(JSON.stringify({mupdfBounds:a,pdfjsBounds:b,mupdfRendered:{w:x.width,h:x.height,rotation:x.rotation},
    pdfjsRendered:{w:y.width,h:y.height,rotation:y.rotation}},null,2));
}finally{await mu.close();await pdf.close();}
