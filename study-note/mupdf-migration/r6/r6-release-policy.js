/* R6 audited release selector. It is a feature gate, NOT an authentication mechanism. */
(function (root) {
  'use strict';
  const SCHEMA='pe-study-note-r6-mupdf-release-v1';
  const SHA=/^[0-9a-f]{40}$/;
  // R8: tag resolves the exact release source TREE without embedding its own
  // commit SHA (which is mathematically impossible in a checked-in config).
  // The release procedure must record/pin the tag's commit and verify that its
  // Git tree equals the actual deployed main tree. NEVER move a published tag.
  const RELEASE_TAG='pe-study-note-mupdf-1.28.1-r8-20261104';
  const isPinnedReleaseRef=value=>SHA.test(value||'')||value===RELEASE_TAG;
  const HOST='aliasel0817.github.io';
  const PREFIX='/Pe-Exam-Search/study-note/';
  const CORE='20061bd45183f5a2bff8f43675e4da91e5ac2901';
  const WASM='5a30ef7b027f541ea8fc54e7c73f16414b0b59940741a12efe5e55f1fd0a99d7';
  function isProductionRelease(config, href) {
    try {
      const u=new URL(href);
      if(u.protocol!=='https:'||u.hostname!==HOST||u.port||u.username||u.password
          ||!u.pathname.startsWith(PREFIX))return false;
      if(!config||config.schema!==SCHEMA||config.status!=='RELEASED'
          ||config.enabled!==true||!isPinnedReleaseRef(config.releaseCommit)
          ||config.mupdfVersion!=='1.28.1'||config.mupdfCommit!==CORE
          ||config.wasmSha256!==WASM)return false;
      if(config.sourceUrl!=='https://github.com/aliasel0817/Pe-Exam-Search/tree/'
          +config.releaseCommit+'/study-note')return false;
      // These declarations require an evidence-backed, separately approved release.
      if(config.review?.rights!==true||config.review?.source!==true
          ||config.review?.security!==true||config.review?.devices!==true
          ||config.review?.operator!==true)return false;
      return true;
    }catch(_){return false;}
  }
  function productionAssetUrls(config, href) {
    if(!isProductionRelease(config,href))throw Error('R6_RELEASE_NOT_AUTHORIZED');
    const rootUrl=new URL(PREFIX,href);
    const make=relative=>{
      const url=new URL(relative,rootUrl);
      if(url.origin!==rootUrl.origin||!url.pathname.startsWith(PREFIX)
          ||url.search||url.hash)throw Error('R6_ASSET_PATH_DENIED');
      return url.href;
    };
    return Object.freeze({
      mupdfURL:make('vendor/mupdf/1.28.1/mupdf.js'),
      pdfjsURL:make('vendor/pdfjs/6.5.438/pdf.mjs'),
      pdfjsWorkerURL:make('vendor/pdfjs/6.5.438/pdf.worker.mjs'),
      sourceUrl:config.sourceUrl
    });
  }
  const api=Object.freeze({SCHEMA,CORE,WASM,HOST,PREFIX,RELEASE_TAG,isProductionRelease,productionAssetUrls});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root&&typeof root==='object')root.PE_R6_POLICY=api;
})(typeof window!=='undefined'?window:null);
