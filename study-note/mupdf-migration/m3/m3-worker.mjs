// Browser module Worker, private same-origin MuPDF ESM URL injected at runtime.
// Each worker owns one document; only one render job at a time is recommended.
import {createMuPDFEngine} from './m3-mupdf.mjs';
let session=null;
self.addEventListener('message', async ({data})=>{
  const {id,op,payload={}}=data??{};
  if(!Number.isInteger(id))return;
  try{
    if(op==='open'){
      if(session)await session.close();
      session=await createMuPDFEngine({moduleURL:payload.moduleURL,budget:payload.budget}).openDocument(payload.bytes);
      self.postMessage({id,ok:true,value:{pageCount:session.countPages,engine:'mupdf'}});return;
    }
    if(!session)throw new Error('Worker session not opened');
    if(op==='bounds'){
      self.postMessage({id,ok:true,value:session.getPageBounds(payload.pageNumber)});return;
    }
    if(op==='render'){
      const result=await session.renderPage(payload.pageNumber,payload.options??{});
      const transfer=result.pixels.buffer;
      self.postMessage({id,ok:true,value:result},[transfer]);return;
    }
    if(op==='close'){
      await session.close();session=null;self.postMessage({id,ok:true,value:{closed:true}});return;
    }
    throw new Error('Unsupported Worker operation');
  }catch(e){
    self.postMessage({id,ok:false,error:{code:e?.code||'WORKER_ERROR',
      message:String(e?.message||'Worker rendering failed').slice(0,240)}});
  }
});
