// M3 isolated MuPDF.js adapter; no connection to operating study-note.html.
import {RendererError,assertSignal,assertPageNumber,asBytes,boundedMetrics,rgbaFromPixmap,getMemoryEstimate} from './m3-common.mjs';
function rectangle(box){return {x0:box[0],y0:box[1],x1:box[2],y1:box[3],
  width:box[2]-box[0],height:box[3]-box[1]};}
function safeDestroy(v){try{v?.destroy?.();}catch(_){/* all resources are best-effort finalized */}}
export class MuPDFSession {
  constructor(lib,document,{budget}={}){
    this.lib=lib;this.document=document;this.budget=budget;this.closed=false;this.engine='mupdf';
    this.pageCount=document.countPages();
    if(this.pageCount<1)throw new RendererError('EMPTY_PDF','Document has no pages');
  }
  get countPages(){return this.pageCount;}
  _assertOpen(){if(this.closed)throw new RendererError('DOCUMENT_CLOSED','MuPDF document has been closed');}
  getPageBounds(pageNumber){
    this._assertOpen();assertPageNumber(pageNumber,this.pageCount);
    const page=this.document.loadPage(pageNumber-1);
    try{
      const rect=rectangle(page.getBounds('CropBox'));
      const media=rectangle(page.getBounds('MediaBox'));
      let rotation=0;
      try{
        const raw=page.getObject?.().getInheritable?.('Rotate');
        if(raw&&!raw.isNull())rotation=(((raw.asNumber()%360)+360)%360);
      }catch(_){/* default page rotation available via bounds/transform */ }
      return {pageNumber,rotation,cropBox:rect,mediaBox:media,
        pageWidth:rect.width,pageHeight:rect.height,coordSpace:'mupdf-rotated-crop'};
    }finally{safeDestroy(page);}
  }
  async renderPage(pageNumber,{scale=1,dpr=1,region=null,budget=this.budget,signal=null}={}){
    this._assertOpen();assertPageNumber(pageNumber,this.pageCount);assertSignal(signal);
    // Let pending navigation/abort event update before entering synchronous WASM rendering.
    await Promise.resolve();assertSignal(signal);this._assertOpen();
    const lib=this.lib;
    let page=null,pix=null,device=null;
    try{
      page=this.document.loadPage(pageNumber-1);
      const bounds=page.getBounds('CropBox');
      const pageWidth=bounds[2]-bounds[0],pageHeight=bounds[3]-bounds[1];
      const metrics=boundedMetrics(pageWidth,pageHeight,{scale,dpr,region,budget});
      const matrix=lib.Matrix.scale(metrics.scale,metrics.scale);
      let originX=0,originY=0;
      if(region){
        const transformed=lib.Rect.transform(bounds,matrix);
        const x0=Math.floor(transformed[0])+metrics.x;
        const y0=Math.floor(transformed[1])+metrics.y;
        const x1=Math.floor(transformed[0])+metrics.x+metrics.width;
        const y1=Math.floor(transformed[1])+metrics.y+metrics.height;
        pix=new lib.Pixmap(lib.ColorSpace.DeviceRGB,[x0,y0,x1,y1],false);
        pix.clear(255);
        device=new lib.DrawDevice(lib.Matrix.identity,pix);
        page.run(device,matrix);
        device.close();safeDestroy(device);device=null;
        originX=metrics.x;originY=metrics.y;
      }else{
        // CropBox preserves the page's actual visible coordinate frame.
        pix=page.toPixmap(matrix,lib.ColorSpace.DeviceRGB,false,true,undefined,'CropBox');
      }
      assertSignal(signal);
      const requestedBudget={maxEdge:8192,maxPixels:20*1024*1024,maxBytes:80*1024*1024,...(budget||{})};
      const actualWidth=pix.getWidth(),actualHeight=pix.getHeight();
      if(actualWidth>requestedBudget.maxEdge || actualHeight>requestedBudget.maxEdge ||
          actualWidth*actualHeight>requestedBudget.maxPixels ||
          actualWidth*actualHeight*4>requestedBudget.maxBytes)
        throw new RendererError('BUDGET_EXCEEDED','Actual MuPDF pixmap exceeds render budget');
      const rgba=rgbaFromPixmap(pix);
      const w=pix.getWidth(),h=pix.getHeight();
      const result={engine:'mupdf',pageNumber,width:w,height:h,
        fullWidth:metrics.fullWidth,fullHeight:metrics.fullHeight,
        x:originX,y:originY,pixels:rgba,rotation:this.getPageRotation(page),
        pageBox:'CropBox',scale:metrics.scale,requestedScale:metrics.requestedScale,
        budgetLimited:metrics.budgetLimited,
        region,normalizedCoordinateSpace:'normalized-0-1',annotationSchema:3};
      result.memory=getMemoryEstimate(result);
      return result;
    }catch(e){
      if(e?.code==='ABORTED'||e?.code==='INVALID_SCALE'||e?.code==='BUDGET_EXCEEDED')throw e;
      throw new RendererError('MUPDF_RENDER_FAILED','MuPDF rendering failed',e);
    }finally{
      safeDestroy(device);safeDestroy(pix);safeDestroy(page);
    }
  }
  getPageRotation(page){
    try{
      const v=page.getObject?.().getInheritable?.('Rotate');
      return v&&!v.isNull()?((v.asNumber()%360)+360)%360:0;
    }catch(_){return 0;}
  }
  async close(){
    if(this.closed)return;
    this.closed=true;
    safeDestroy(this.document);this.document=null;
  }
}
export function createMuPDFEngine({module,moduleURL,budget}={}){
  let lazy=null;
  async function load(){
    if(module)return module;
    if(!lazy){
      if(!moduleURL)throw new RendererError('MUPDF_MODULE_URL_MISSING','Provide trusted same-origin MuPDF ESM URL');
      const url=new URL(moduleURL,import.meta.url);
      if(typeof location!=='undefined'&&url.origin!==location.origin)
        throw new RendererError('CROSS_ORIGIN_MODULE','MuPDF must be self-hosted on the same origin');
      lazy=import(url.href);
    }
    return lazy;
  }
  return {
    id:'mupdf',packageVersion:'1.28.1',
    async openDocument(value,{signal}={}){
      assertSignal(signal);
      const lib=await load();assertSignal(signal);
      let doc=null;
      try{
        const bytes=asBytes(value);
        doc=lib.Document.openDocument(bytes,'application/pdf');
        if(doc.needsPassword?.())throw new RendererError('PASSWORD_REQUIRED','PDF password is required');
        return new MuPDFSession(lib,doc,{budget});
      }catch(e){
        safeDestroy(doc);
        if(e instanceof RendererError)throw e;
        throw new RendererError('MUPDF_OPEN_FAILED','MuPDF could not open PDF',e);
      }
    }
  };
}
