// M5 loopback-only attachment PDF adapter.
// Reuses the audited M3/M4 raster engine, never changes HTTP authentication,
// source attachment records or schema 3 normalized-0-1 annotations.
import {
  createM4ReferenceEngine, isM4LocalOptIn, makeReferencePageFacade,
  M4_BUDGET, M4_TILE_BUDGET,
} from '../m4/m4-reference-adapter.mjs';
import {asBytes, assertPageNumber, assertSignal, RendererError} from '../m3/m3-common.mjs';

export const M5_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const M5_BASE_BUDGET = M4_BUDGET;
export const M5_TILE_BUDGET = M4_TILE_BUDGET;

export function isM5LocalOptIn(href) {
  try {
    const u = new URL(href);
    return isM4LocalOptIn(href) && u.searchParams.get('m5-local') === '1';
  } catch (_) { return false; }
}
function privateOnly() {
  if(typeof location==='undefined' || !isM5LocalOptIn(location.href))
    throw new RendererError('M5_PRIVATE_ONLY','M5 renderer requires explicit loopback-only opt-in');
}
export function validateAttachmentPdfBytes(input) {
  const bytes = asBytes(input);
  if(bytes.byteLength<8 || bytes.byteLength>M5_MAX_ATTACHMENT_BYTES)
    throw new RendererError('INVALID_ATTACHMENT_SIZE','Attachment PDF exceeds allowed size or is empty');
  if(String.fromCharCode(...bytes.subarray(0,5))!=='%PDF-')
    throw new RendererError('NOT_PDF','Attachment content must be real PDF data');
  return bytes;
}
export function annotationPageKey(attachmentId,pageNumber,count) {
  if(typeof attachmentId!=='string'||!/^[^\s:][^\r\n:]*$/.test(attachmentId))
    throw new RendererError('INVALID_ATTACHMENT_ID','Missing attachment ID');
  assertPageNumber(pageNumber,count);
  return 'attachment-pdf:'+attachmentId+':'+pageNumber;
}

export async function createM5AttachmentEngine(options={}) {
  privateOnly();
  const base = await createM4ReferenceEngine(options);
  return Object.freeze({
    id: 'm5-attachment-mupdf',
    async openDocument(input,{signal}={}){
      assertSignal(signal);
      const bytes=validateAttachmentPdfBytes(input);
      const doc=await base.openDocument(bytes,{signal});
      return new M5AttachmentDocument(doc);
    }
  });
}
export class M5AttachmentDocument {
  constructor(doc) {
    this.doc=doc;this.closed=false;
    this.annotationSchema=3;this.coordinateSpace='normalized-0-1';
    this.boundsByPage=new Map();
  }
  get pageCount(){return this.doc?.pageCount??0;}
  get engine(){return this.doc?.engine??'closed';}
  get fallbackReason(){return this.doc?.fallbackReason??null;}
  check(pageNumber) {
    if(this.closed)throw new RendererError('DOCUMENT_CLOSED','Attachment PDF already closed');
    return assertPageNumber(pageNumber,this.pageCount);
  }
  async getPageView(pageNumber=1,{signal}={}) {
    this.check(pageNumber);assertSignal(signal);
    if(!this.boundsByPage.has(pageNumber)){
      const bounds=await this.doc.getPageBounds(pageNumber);
      assertSignal(signal);this.check(pageNumber);
      this.boundsByPage.set(pageNumber,{bounds,facade:makeReferencePageFacade(bounds)});
    }
    return this.boundsByPage.get(pageNumber);
  }
  async renderPage(canvas,{pageNumber=1,fitScale,zoom=1,dpr=1,signal=null,budget=M5_BASE_BUDGET}={}){
    this.check(pageNumber);assertSignal(signal);
    return this.doc.renderInto(canvas,{pageNumber,fitScale,zoom,dpr,signal,budget});
  }
  async renderVisibleRegion({pageNumber=1,signal=null,...options}={}){
    this.check(pageNumber);assertSignal(signal);
    const detail=await this.doc.renderVisibleRegion({pageNumber,signal,budget:M5_TILE_BUDGET,...options});
    assertSignal(signal);
    if(detail?.tile)detail.tile.className='m5-attachment-detail-tile';
    return detail;
  }
  async cancelPending(){
    if(this.closed)return;
    await this.doc?.cancelPending?.();
  }
  async close(){
    if(this.closed)return;
    this.closed=true;
    this.boundsByPage.clear();
    const doc=this.doc;this.doc=null;
    await doc?.close();
  }
}
export function showVisibleTile(stage,tile){
  if(!stage?.isConnected)return;
  const existing=stage.querySelector('.m5-attachment-detail-tile');
  if(tile)stage.appendChild(tile);
  if(existing&&existing!==tile)existing.remove();
}
export function clearVisibleTile(stage) {
  stage?.querySelector('.m5-attachment-detail-tile')?.remove();
}
