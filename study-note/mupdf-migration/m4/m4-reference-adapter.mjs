// M4: isolated, loopback-only reference PDF adapter for the existing study-note UI.
// Uses M3 engines; source PDF acquisition/authentication and annotation persistence
// remain entirely in the existing study-note.html code.
import {createUnifiedRenderer} from '../m3/m3-engine.mjs';
import {createMuPDFEngine} from '../m3/m3-mupdf.mjs';
import {createMuPDFWorkerEngine} from '../m3/m3-worker-client.mjs';
import {createPdfJsEngine} from '../m3/m3-pdfjs.mjs';
import {paintBitmapToCanvas, RendererError, assertSignal, asBytes} from '../m3/m3-common.mjs';

export const M4_BUDGET = Object.freeze({maxEdge:4096,maxPixels:9*1024*1024,maxBytes:36*1024*1024});
export const M4_TILE_BUDGET = Object.freeze({maxEdge:4096,maxPixels:8*1024*1024,maxBytes:32*1024*1024});
const LOOPBACK = new Set(['localhost','127.0.0.1','[::1]']);

export function isM4LocalOptIn(href) {
  let url;
  try { url = new URL(href); } catch(_) { return false; }
  return url.protocol === 'http:' && LOOPBACK.has(url.hostname.toLowerCase())
    && url.searchParams.get('m4-local') === '1';
}
function enforceLocal() {
  if (typeof location === 'undefined' || !isM4LocalOptIn(location.href))
    throw new RendererError('M4_PRIVATE_ONLY','M4 binary renderer is only available on an explicitly opted-in local development page');
}
function trustedLocalAsset(pathOrUrl) {
  enforceLocal();
  const url = new URL(pathOrUrl, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/__m4_private__/'))
    throw new RendererError('INVALID_PRIVATE_ASSET','M4 private vendor assets must use a same-origin local-only route');
  return url.href;
}
function safeClose(doc) {
  try { const task=doc?.close?.(); if(task?.catch)void task.catch(()=>{}); } catch(_) {}
}
export function makeReferencePageFacade(bounds) {
  if(!bounds || !(bounds.pageWidth>0 && bounds.pageHeight>0))
    throw new RendererError('INVALID_BOUNDS','M4 reference viewport dimensions missing');
  const width=bounds.pageWidth,height=bounds.pageHeight;
  return Object.freeze({
    getViewport:({scale=1}={})=>Object.freeze({width:width*scale,height:height*scale}),
    rotate:bounds.rotation??0,
    view:[0,0,width,height],
  });
}
export async function createM4ReferenceEngine({
  mupdfURL='/__m4_private__/mupdf/mupdf.js',
  pdfjsURL='/__m4_private__/pdfjs/pdf.mjs',
  pdfjsWorkerURL='/__m4_private__/pdfjs/pdf.worker.mjs',
  prefer='mupdf',
  forceMainThread=false,
  forcePdfjs=false,
  workerFactory,
}={}){
  enforceLocal();
  const muURL=trustedLocalAsset(mupdfURL);
  const jsURL=trustedLocalAsset(pdfjsURL);
  const workerURL=trustedLocalAsset(pdfjsWorkerURL);
  const main=createMuPDFEngine({moduleURL:muURL});
  const worker=(typeof Worker==='undefined'||forceMainThread)
    ? main : createMuPDFWorkerEngine({moduleURL:muURL,workerFactory});
  const mupdf=Object.freeze({
    id:worker.id,
    async openDocument(bytes,opts={}){
      try{return await worker.openDocument(bytes,opts);}
      catch(e){
        if(worker===main||opts.signal?.aborted||e?.code==='ABORTED')throw e;
        return main.openDocument(bytes,opts);
      }
    }
  });
  const pdfjs=Object.freeze({
    id:'pdfjs',
    async openDocument(bytes,opts={}){
      const lib=await import(jsURL);
      lib.GlobalWorkerOptions.workerSrc=workerURL;
      return createPdfJsEngine({module:lib}).openDocument(bytes,opts);
    }
  });
  const factory=createUnifiedRenderer({mupdf,pdfjs,prefer:forcePdfjs?'pdfjs':prefer,allowFallback:true});
  return Object.freeze({
    id:'m4-reference-viewer',
    async openDocument(bytes,{signal}={}){
      assertSignal(signal);
      const session=await factory.openDocument(asBytes(bytes),{signal});
      return new M4ReferenceDocument(session);
    }
  });
}

export class M4ReferenceDocument {
  constructor(session){this.session=session;this.closed=false;this.lastResult=null;this.annotationSchema=3;
    this.coordinateSpace='normalized-0-1';}
  get engine(){return this.session?.engine??'closed';}
  get pageCount(){return this.session?.countPages??0;}
  get fallbackReason(){return this.session?.fallbackReason??null;}
  _live(){if(this.closed)throw new RendererError('DOCUMENT_CLOSED','M4 reference PDF is closed');}
  async getPageBounds(n=1){this._live();return this.session.getPageBounds(n);}
  async renderInto(canvas,{pageNumber=1,fitScale,zoom=1,dpr=1,signal=null,budget=M4_BUDGET}={}){
    this._live();assertSignal(signal);
    if(!(fitScale>0&&Number.isFinite(fitScale)))throw new RendererError('INVALID_SCALE','Fit scale invalid');
    const frame=await this.session.renderPage(pageNumber,{scale:fitScale*zoom,dpr,budget,signal});
    assertSignal(signal);this._live();
    paintBitmapToCanvas(frame,canvas);
    this.lastResult={engine:this.engine,pageNumber,width:frame.width,height:frame.height,
      effectiveScale:frame.scale,requestedScale:frame.requestedScale,
      budgetLimited:frame.budgetLimited,rgbaBytes:frame.pixels.byteLength};
    return this.lastResult;
  }
  async renderVisibleRegion({canvas,scroller,stage,pageNumber=1,fitScale,zoom=1,dpr=1,signal=null,
    budget=M4_TILE_BUDGET, overscan=0.12}={}){
    this._live();assertSignal(signal);
    if(!canvas?.isConnected||!scroller?.isConnected||!stage?.isConnected || zoom<1.12)return null;
    const displayWidth=canvas.offsetWidth,displayHeight=canvas.offsetHeight;
    if(!(displayWidth>0&&displayHeight>0))return null;
    const marginX=scroller.clientWidth*Math.max(0,Math.min(0.25,overscan));
    const marginY=scroller.clientHeight*Math.max(0,Math.min(0.25,overscan));
    const left=Math.max(0,Math.min(1,(scroller.scrollLeft-canvas.offsetLeft-marginX)/displayWidth));
    const top=Math.max(0,Math.min(1,(scroller.scrollTop-canvas.offsetTop-marginY)/displayHeight));
    const right=Math.max(0,Math.min(1,(scroller.scrollLeft+scroller.clientWidth-canvas.offsetLeft+marginX)/displayWidth));
    const bottom=Math.max(0,Math.min(1,(scroller.scrollTop+scroller.clientHeight-canvas.offsetTop+marginY)/displayHeight));
    if(right<=left||bottom<=top)return null;
    // Aligned to the same untransformed CropBox page used by the annotation overlay.
    const region={x:left,y:top,width:right-left,height:bottom-top};
    const frame=await this.session.renderPage(pageNumber,{scale:fitScale*zoom,dpr,region,budget,signal});
    assertSignal(signal);this._live();
    const tile=document.createElement('canvas');
    tile.className='m4-reference-detail-tile';
    tile.setAttribute('aria-hidden','true');
    paintBitmapToCanvas(frame,tile);
    tile.style.left=(canvas.offsetLeft+displayWidth*region.x)+'px';
    tile.style.top=(canvas.offsetTop+displayHeight*region.y)+'px';
    tile.style.width=(displayWidth*region.width)+'px';
    tile.style.height=(displayHeight*region.height)+'px';
    return {tile,region,engine:this.engine,
      budgetLimited:frame.budgetLimited,
      output:{width:frame.width,height:frame.height,rgbaBytes:frame.pixels.byteLength}};
  }
  async cancelPending(){this._live();await this.session.cancelPending?.();}
  async close(){
    if(this.closed)return;
    this.closed=true;const doc=this.session;this.session=null;this.lastResult=null;
    await doc?.close();
  }
}

export function attachVisibleTile(stage, nextTile) {
  if(!stage?.isConnected || !nextTile?.isConnected && !nextTile)return;
  const old=stage.querySelector('.m4-reference-detail-tile');
  if(nextTile)stage.appendChild(nextTile);
  if(old&&old!==nextTile)old.remove();
}
export function clearVisibleTile(stage){stage?.querySelector('.m4-reference-detail-tile')?.remove();}
