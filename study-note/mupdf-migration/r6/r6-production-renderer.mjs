/* R6: release-only adapters. Reuse existing M3, M4, M5 rendering/ink geometry.
 * Never bypass signed GET, mediaContent, or user annotation storage.
 * Config flags are NOT server authorization; the backend must enforce ACTIVE/owner.
 */
import {createUnifiedRenderer} from '../m3/m3-engine.mjs';
import {createMuPDFEngine} from '../m3/m3-mupdf.mjs';
import {createMuPDFWorkerEngine} from '../m3/m3-worker-client.mjs';
import {createPdfJsEngine} from '../m3/m3-pdfjs.mjs';
import {RendererError,asBytes,assertSignal} from '../m3/m3-common.mjs';
import {M4ReferenceDocument,makeReferencePageFacade,attachVisibleTile,clearVisibleTile}
  from '../m4/m4-reference-adapter.mjs';
import {M5AttachmentDocument,validateAttachmentPdfBytes,showVisibleTile}
  from '../m5/m5-attachment-adapter.mjs';

function releaseUrls(config) {
  const api=globalThis.PE_R6_POLICY;
  if(!api||!api.isProductionRelease(config,globalThis.location?.href||''))
    throw new RendererError('R6_PUBLIC_GATE_CLOSED','Production MuPDF requires a fully approved release');
  return api.productionAssetUrls(config,globalThis.location.href);
}
export async function createR6ReferenceEngine(config,{forcePdfjs=false,forceMainThread=false,
  workerFactory}={}) {
  const urls=releaseUrls(config);
  const main=createMuPDFEngine({moduleURL:urls.mupdfURL});
  const worker=typeof Worker==='undefined'||forceMainThread?main
    :createMuPDFWorkerEngine({moduleURL:urls.mupdfURL,workerFactory});
  const mupdf=Object.freeze({
    id:worker.id,
    async openDocument(bytes,options={}) {
      try { return await worker.openDocument(bytes,options); }
      catch(error) {
        if(worker===main||options.signal?.aborted||error?.code==='ABORTED')throw error;
        return main.openDocument(bytes,options);
      }
    }
  });
  const pdfjs=Object.freeze({
    id:'pdfjs',
    async openDocument(bytes,options={}) {
      const library=await import(urls.pdfjsURL);
      library.GlobalWorkerOptions.workerSrc=urls.pdfjsWorkerURL;
      return createPdfJsEngine({module:library}).openDocument(bytes,options);
    }
  });
  const engine=createUnifiedRenderer({mupdf,pdfjs,prefer:forcePdfjs?'pdfjs':'mupdf',
    allowFallback:true});
  return Object.freeze({
    id:'r6-reference-engine',
    async openDocument(bytes,{signal}={}) {
      assertSignal(signal);
      const session=await engine.openDocument(asBytes(bytes),{signal});
      return new M4ReferenceDocument(session);
    }
  });
}
export async function createR6AttachmentEngine(config,options={}) {
  const base=await createR6ReferenceEngine(config,options);
  return Object.freeze({
    id:'r6-attachment-engine',
    async openDocument(input,{signal}={}) {
      assertSignal(signal);
      const bytes=validateAttachmentPdfBytes(input);
      const doc=await base.openDocument(bytes,{signal});
      return new M5AttachmentDocument(doc);
    }
  });
}
export {makeReferencePageFacade,attachVisibleTile,clearVisibleTile,showVisibleTile};
