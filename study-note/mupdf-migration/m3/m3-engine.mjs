// Unified M3 renderer facade. Not wired to operating PDFs.
import {RendererError,asBytes,assertSignal} from './m3-common.mjs';
export function createUnifiedRenderer({mupdf,pdfjs,prefer='mupdf',allowFallback=true}={}){
  if(!mupdf||!pdfjs)throw new RendererError('INVALID_ENGINE','Both renderer factories are required');
  return {
    id:'m3-unified',
    async openDocument(source,{signal}={}){
      assertSignal(signal);
      // Caller-provided raw PDF bytes are private and never cached or persisted.
      const bytes=asBytes(source);
      const engine=prefer==='pdfjs'?pdfjs:mupdf;
      const fallback=prefer==='pdfjs'?mupdf:pdfjs;
      try{
        const doc=await engine.openDocument(bytes,{signal});
        return new RoutedSession(doc,engine.id,allowFallback?fallback:null,bytes);
      }catch(e){
        if(signal?.aborted||e?.code==='ABORTED'||!allowFallback)throw e;
        const doc=await fallback.openDocument(bytes,{signal});
        return new RoutedSession(doc,fallback.id,null,bytes,{reason:e?.code||'PRIMARY_OPEN_FAILED'});
      }
    }
  };
}
export class RoutedSession {
  constructor(doc,engine,fallback,bytes,{reason=null}={}){
    this.doc=doc;this.engine=engine;this.fallback=fallback;this.bytes=bytes;
    this.fallbackReason=reason;this.closed=false;this.switchCount=reason?1:0;
  }
  get countPages(){return this.doc?.countPages??0;}
  async getPageBounds(n,opts){
    this._open();return this.doc.getPageBounds(n,opts);
  }
  async renderPage(n,opts={}){
    this._open();
    try{return await this.doc.renderPage(n,opts);}
    catch(e){
      if(opts.signal?.aborted||e?.code==='ABORTED'||!this.fallback)throw e;
      const former=this.doc;
      const oldName=this.engine;
      let next;
      try{next=await this.fallback.openDocument(this.bytes,{signal:opts.signal});}
      catch(second){
        throw new RendererError('BOTH_RENDERERS_FAILED','MuPDF and PDF.js both failed',new AggregateError([e,second]));
      }
      this.doc=next;this.engine=this.fallback.id;this.fallback=null;
      this.fallbackReason=oldName+':'+(e?.code||'RENDER_FAILED');this.switchCount++;
      try{await former.close();}catch(_){}
      return this.doc.renderPage(n,opts);
    }
  }
  async cancelPending(){await this.doc?.cancelPending?.();}
  _open(){if(this.closed)throw new RendererError('DOCUMENT_CLOSED','Renderer closed');}
  async close(){
    if(this.closed)return;
    this.closed=true;
    const doc=this.doc;this.doc=null;this.bytes=null;this.fallback=null;
    await doc?.close();
  }
}
