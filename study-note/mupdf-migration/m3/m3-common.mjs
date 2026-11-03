// M3 shared renderer/annotation math. No PDF or user data persistence.
export class RendererError extends Error {
  constructor(code, message, cause) { super(message, { cause }); this.name='RendererError'; this.code=code; }
}
export function assertSignal(signal) {
  if (signal?.aborted) throw new RendererError('ABORTED','PDF rendering cancelled');
}
export function assertPageNumber(pageNumber, count) {
  if (!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>count)
    throw new RendererError('INVALID_PAGE', 'Page must be an integer from 1 to '+count);
  return pageNumber;
}
export function asBytes(value) {
  if(value instanceof Uint8Array) return Uint8Array.from(value);
  if(value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  throw new RendererError('INVALID_INPUT','Expected Uint8Array or ArrayBuffer PDF source');
}
export const DEFAULT_BUDGET=Object.freeze({maxEdge:8192,maxPixels:20*1024*1024,maxBytes:80*1024*1024});
export function ensureBudget(overrides={}) {
  const b={...DEFAULT_BUDGET,...overrides};
  for(const k of ['maxEdge','maxPixels','maxBytes'])
    if(!Number.isSafeInteger(b[k])||b[k]<1)throw new RendererError('INVALID_BUDGET','Invalid budget '+k);
  return b;
}
export function boundedMetrics(pageWidth,pageHeight,{scale=1,dpr=1,budget={},region=null}={}) {
  const b=ensureBudget(budget);
  if(!(pageWidth>0 && pageHeight>0 && Number.isFinite(pageWidth) && Number.isFinite(pageHeight)))
    throw new RendererError('INVALID_BOUNDS','PDF page must have positive finite bounds');
  if(!(scale>0 && Number.isFinite(scale) && dpr>0 && Number.isFinite(dpr)))
    throw new RendererError('INVALID_SCALE','Render scale and DPR must be positive finite');
  if(scale>1000||dpr>8)throw new RendererError('INVALID_SCALE','Render scale or DPR unreasonably large');
  let n=null;
  if(region!==null) {
    const {x,y,width,height}=region;
    if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<=0||height<=0||
      x+width>1.0000001||y+height>1.0000001)
      throw new RendererError('INVALID_REGION','Region must be a normalized rectangle inside page');
    n={x,y,width,height};
  }
  const factor=scale*dpr;
  const rectArea=n?n.width*n.height:1;
  const rectEdge=n?Math.max(pageWidth*n.width,pageHeight*n.height):Math.max(pageWidth,pageHeight);
  const pixelMax=Math.min(b.maxPixels,Math.floor(b.maxBytes/4));
  const limit=Math.min(1,b.maxEdge/(rectEdge*factor),Math.sqrt(pixelMax/(pageWidth*pageHeight*rectArea*factor*factor)));
  let effectiveScale=factor*limit;
  // MuPDF/PDF.js rasterization rounds outward at box edges. Reserve a few pixels
  // to keep the *actual* RGBA allocation within maxBytes, not just the estimate.
  for(let i=0;i<100;i++){
    const rw=Math.ceil(pageWidth*(n?.width??1)*effectiveScale)+3;
    const rh=Math.ceil(pageHeight*(n?.height??1)*effectiveScale)+3;
    if(rw<=b.maxEdge&&rh<=b.maxEdge&&rw*rh<=pixelMax)break;
    effectiveScale*=0.99;
  }
  const fullWidth=Math.max(1,Math.ceil(pageWidth*effectiveScale));
  const fullHeight=Math.max(1,Math.ceil(pageHeight*effectiveScale));
  let left=0,top=0,right=fullWidth,bottom=fullHeight;
  if(n){
    left=Math.floor(fullWidth*n.x);top=Math.floor(fullHeight*n.y);
    right=Math.ceil(fullWidth*(n.x+n.width));bottom=Math.ceil(fullHeight*(n.y+n.height));
  }
  const width=right-left,height=bottom-top;
  if(!width||!height||width>b.maxEdge+2||height>b.maxEdge+2||width*height>pixelMax+2*b.maxEdge)
    throw new RendererError('BUDGET_EXCEEDED','Rendered surface exceeds safe allocation limits');
  return {fullWidth,fullHeight,x:left,y:top,width,height,scale:effectiveScale,dpr,
    requestedScale:factor,budgetLimited:limit<1,region:n,estimatedRGBABytes:width*height*4};
}
export function normalizedToPixel(point, geometry) {
  const x=Number(point?.x),y=Number(point?.y);
  if(!Number.isFinite(x)||!Number.isFinite(y)) throw new RendererError('INVALID_POINT','Point must be finite');
  return {x:x*geometry.fullWidth-geometry.x,y:y*geometry.fullHeight-geometry.y};
}
export function pixelToNormalized(point,geometry) {
  const x=Number(point?.x),y=Number(point?.y);
  if(!Number.isFinite(x)||!Number.isFinite(y)) throw new RendererError('INVALID_POINT','Point must be finite');
  return {x:(x+geometry.x)/geometry.fullWidth,y:(y+geometry.y)/geometry.fullHeight};
}
export function normalizedToCss(point,{width,height}) {
  return {x:Number(point.x)*width,y:Number(point.y)*height};
}
export function cssToNormalized(point,{width,height}) {
  if(!(width>0 && height>0))throw new RendererError('INVALID_BOUNDS','Invalid display geometry');
  return {x:Number(point.x)/width,y:Number(point.y)/height};
}
export function rgbaFromPixmap(pixmap) {
  const width=pixmap.getWidth(),height=pixmap.getHeight();
  const channels=pixmap.getNumberOfComponents(),stride=pixmap.getStride();
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
    ![1,2,3,4].includes(channels)||stride<width*channels)
    throw new RendererError('INVALID_PIXMAP','Unsupported MuPDF Pixmap layout');
  const src=pixmap.getPixels(),dst=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=y*stride+x*channels,j=4*(y*width+x);
    if(channels<=2){dst[j]=dst[j+1]=dst[j+2]=src[i];dst[j+3]=channels===2?src[i+1]:255;}
    else{dst[j]=src[i];dst[j+1]=src[i+1];dst[j+2]=src[i+2];dst[j+3]=channels===4?src[i+3]:255;}
  }
  return dst;
}
export function paintBitmapToCanvas(bitmap,canvas) {
  if(!canvas?.getContext)throw new RendererError('NO_CANVAS','A canvas must be supplied by the caller');
  canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new RendererError('NO_CANVAS','2D context unavailable');
  let frame;
  if(typeof ImageData!=='undefined')frame=new ImageData(bitmap.pixels,bitmap.width,bitmap.height);
  else if(ctx.createImageData){frame=ctx.createImageData(bitmap.width,bitmap.height);frame.data.set(bitmap.pixels);}
  else throw new RendererError('NO_IMAGE_DATA','No compatible ImageData factory');
  ctx.putImageData(frame,0,0);
  return canvas;
}
export function getMemoryEstimate(bitmap) {
  return {rgbaBytes:bitmap.width*bitmap.height*4,outputBytes:bitmap.pixels.byteLength,
    fullPageEstimatedBytes:bitmap.fullWidth*bitmap.fullHeight*4};
}
