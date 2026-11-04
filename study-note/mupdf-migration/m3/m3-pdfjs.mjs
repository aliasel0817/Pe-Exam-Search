// M3 isolated PDF.js 6.5.438 fallback; not connected to current study-note.
import {RendererError,asBytes,assertSignal,assertPageNumber,boundedMetrics,getMemoryEstimate} from './m3-common.mjs';
function defaultCanvas(width,height){
  if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(width,height);
  if(typeof document!=='undefined'){
    const c=document.createElement('canvas');c.width=width;c.height=height;return c;
  }
  throw new RendererError('CANVAS_FACTORY_REQUIRED','In Node pass an injected canvasFactory');
}
export function createPdfJsEngine({module,moduleURL,canvasFactory=defaultCanvas,budget}={}){
  let lazy=null;
  async function load(){
    if(module)return module;
    if(!lazy){
      if(!moduleURL)throw new RendererError('PDFJS_MODULE_URL_MISSING','Provide trusted PDF.js ESM module URL');
      const uri=new URL(moduleURL,import.meta.url);
      if(typeof location!=='undefined'&&uri.origin!==location.origin)
        throw new RendererError('CROSS_ORIGIN_MODULE','PDF.js fallback module must be same-origin');
      lazy=import(uri.href);
    }
    return lazy;
  }
  return {id:'pdfjs',packageVersion:'6.5.438',
    async openDocument(value,{signal}={}){
      assertSignal(signal);
      const pdfjs=await load();assertSignal(signal);
      const task=pdfjs.getDocument({
        data:asBytes(value),isEvalSupported:false,disableAutoFetch:true,
        useSystemFonts:true,
      });
      const cancel=()=>{void task.destroy();};
      if(signal)signal.addEventListener('abort',cancel,{once:true});
      try{
        const document=await task.promise;assertSignal(signal);
        return new PDFJsSession(pdfjs,document,{canvasFactory,budget,loadingTask:task});
      }catch(e){
        try{await task.destroy();}catch(_){}
        if(signal?.aborted)throw new RendererError('ABORTED','PDF.js open cancelled',e);
        throw new RendererError('PDFJS_OPEN_FAILED','PDF.js fallback failed to open document',e);
      }finally{signal?.removeEventListener('abort',cancel);}
    }
  };
}
export class PDFJsSession {
  constructor(lib,document,{canvasFactory,budget,loadingTask}={}){
    this.lib=lib;this.document=document;this.canvasFactory=canvasFactory;this.budget=budget;
    this.engine='pdfjs';this.pageCount=document.numPages;this.closed=false;this.activeJobs=new Set();this.loadingTask=loadingTask;
  }
  get countPages(){return this.pageCount;}
  _assertOpen(){if(this.closed)throw new RendererError('DOCUMENT_CLOSED','PDF.js document is closed');}
  async getPageBounds(n){
    this._assertOpen();assertPageNumber(n,this.pageCount);
    const page=await this.document.getPage(n);
    try{
      const v=page.getViewport({scale:1});
      return {pageNumber:n,pageWidth:v.width,pageHeight:v.height,rotation:page.rotate,
        cropBox:{x0:page.view[0],y0:page.view[1],x1:page.view[2],y1:page.view[3],width:page.view[2]-page.view[0],height:page.view[3]-page.view[1]},
        coordSpace:'pdfjs-rotated-viewport'};
    }finally{page.cleanup();}
  }
  async renderPage(n,{scale=1,dpr=1,region=null,budget=this.budget,signal=null}={}){
    this._assertOpen();assertPageNumber(n,this.pageCount);assertSignal(signal);
    let page=null,job=null;
    try{
      page=await this.document.getPage(n);assertSignal(signal);
      const base=page.getViewport({scale:1});
      const m=boundedMetrics(base.width,base.height,{scale,dpr,region,budget});
      const viewport=page.getViewport({scale:m.scale});
      const canvas=this.canvasFactory(m.width,m.height);
      canvas.width=m.width;canvas.height=m.height;
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new RendererError('NO_CANVAS','No 2D context');
      job=page.render({canvasContext:ctx,viewport,
        transform:m.x||m.y?[1,0,0,1,-m.x,-m.y]:undefined,
        intent:'display'});
      this.activeJobs.add(job);
      const abort=()=>{try{job.cancel();}catch(_){}};
      signal?.addEventListener('abort',abort,{once:true});
      try{await job.promise;}finally{signal?.removeEventListener('abort',abort);}
      assertSignal(signal);
      const pix=ctx.getImageData(0,0,m.width,m.height);
      const pixels=new Uint8ClampedArray(pix.data);
      const result={engine:'pdfjs',pageNumber:n,width:m.width,height:m.height,
        fullWidth:m.fullWidth,fullHeight:m.fullHeight,x:m.x,y:m.y,
        pixels,rotation:page.rotate,pageBox:'CropBox',scale:m.scale,requestedScale:m.requestedScale,
        budgetLimited:m.budgetLimited,region,normalizedCoordinateSpace:'normalized-0-1',annotationSchema:3};
      result.memory=getMemoryEstimate(result);
      return result;
    }catch(e){
      if(signal?.aborted)throw new RendererError('ABORTED','PDF.js rendering cancelled',e);
      if(e instanceof RendererError)throw e;
      throw new RendererError('PDFJS_RENDER_FAILED','PDF.js fallback rendering failed',e);
    }finally{
      if(job){this.activeJobs.delete(job);try{job.cancel();}catch(_){}}
      try{page?.cleanup();}catch(_){}
    }
  }
  async close(){
    if(this.closed)return;
    this.closed=true;
    for(const task of this.activeJobs)try{task.cancel();}catch(_){}
    this.activeJobs.clear();
    if(typeof this.document?.destroy==='function')await this.document.destroy();
    else if(typeof this.loadingTask?.destroy==='function')await this.loadingTask.destroy();
    else await this.document?.cleanup?.();
    this.document=null;this.loadingTask=null;
  }
}
