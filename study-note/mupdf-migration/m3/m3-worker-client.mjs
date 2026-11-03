// M3 cancellable, stateful browser Worker bridge. No public asset URLs hardcoded.
import {asBytes,RendererError,assertSignal,assertPageNumber} from './m3-common.mjs';
function defaultWorkerFactory(){
  if(typeof Worker==='undefined')throw new RendererError('WORKER_UNAVAILABLE','Module Workers are unavailable');
  return new Worker(new URL('./m3-worker.mjs',import.meta.url),{type:'module'});
}
export class MuPDFWorkerSession {
  constructor(bytes,{moduleURL,budget,workerFactory=defaultWorkerFactory}={}){
    this.bytes=asBytes(bytes);
    this.moduleURL=moduleURL;
    this.budget=budget;this.workerFactory=workerFactory;
    this.worker=null;this.pending=new Map();this.seq=0;
    this.countPages=0;this.closed=false;this.engine='mupdf-worker';
  }
  _ensureWorker(){
    if(this.worker)return;
    const w=this.workerFactory();this.worker=w;
    w.onmessage=({data})=>{
      const job=this.pending.get(data.id);if(!job)return;
      this.pending.delete(data.id);
      if(data.ok)job.resolve(data.value);
      else job.reject(new RendererError(data.error?.code||'WORKER_ERROR',data.error?.message||'Worker error'));
    };
    w.onerror=()=>this._terminate(new RendererError('WORKER_CRASH','MuPDF worker terminated unexpectedly'));
  }
  _terminate(error=new RendererError('ABORTED','Worker task cancelled')){
    const worker=this.worker;this.worker=null;
    if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate();}
    for(const item of this.pending.values())item.reject(error);
    this.pending.clear();this.countPages=0;
  }
  _request(op,payload,signal){
    if(this.closed)throw new RendererError('DOCUMENT_CLOSED','Worker document has been closed');
    assertSignal(signal);this._ensureWorker();
    const id=++this.seq;
    return new Promise((resolve,reject)=>{
      const abort=()=>this._terminate(new RendererError('ABORTED','Worker render cancelled'));
      const settle={resolve:v=>{signal?.removeEventListener('abort',abort);resolve(v);},
        reject:e=>{signal?.removeEventListener('abort',abort);reject(e);}};
      this.pending.set(id,settle);
      signal?.addEventListener('abort',abort,{once:true});
      try{this.worker.postMessage({id,op,payload});}catch(e){this.pending.delete(id);settle.reject(e);}
    });
  }
  async _open({signal}={}){
    if(this.countPages>0&&this.worker)return;
    const result=await this._request('open',{bytes:this.bytes,moduleURL:this.moduleURL,budget:this.budget},signal);
    this.countPages=result.pageCount;
  }
  async getPageBounds(pageNumber,{signal}={}){
    await this._open({signal});assertPageNumber(pageNumber,this.countPages);
    return this._request('bounds',{pageNumber},signal);
  }
  async renderPage(pageNumber,{signal,...options}={}){
    await this._open({signal});assertPageNumber(pageNumber,this.countPages);
    return this._request('render',{pageNumber,options},signal);
  }
  async cancelPending(){
    this._terminate(new RendererError('ABORTED','Worker task cancelled by page navigation'));
  }
  async close(){
    if(this.closed)return;this.closed=true;
    this._terminate(new RendererError('DOCUMENT_CLOSED','Worker session closed'));
    this.bytes=null;
  }
}
export function createMuPDFWorkerEngine({moduleURL,budget,workerFactory}={}){
  return {id:'mupdf-worker',packageVersion:'1.28.1',
    async openDocument(value,{signal}={}){
      const doc=new MuPDFWorkerSession(value,{moduleURL,budget,workerFactory});
      try{await doc._open({signal});return doc;}catch(e){await doc.close();throw e;}
    }};
}
