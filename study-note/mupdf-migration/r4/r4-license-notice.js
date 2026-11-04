/* R4 private-only notice prototype. Do not load publicly until legal/source/owner approval. */
(function (scope) {
  'use strict';
  const LICENSE_PATH='./mupdf-migration/r4/licenses/AGPL-3.0.txt';
  function isPrivateLoopback(url) {
    try {
      const u=new URL(url);
      return u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)
        && u.searchParams.get('m4-local')==='1';
    } catch { return false; }
  }
  function safeSourceOffer({approved=false,gate='BLOCKED',sourceUrl=''}={}) {
    if (!approved || gate!=='OPEN') return null;
    try {
      const url=new URL(sourceUrl);
      return url.protocol==='https:' && !url.username && !url.password && url.hostname
        ? url.href : null;
    } catch { return null; }
  }
  function model(settings={}) {
    const source=safeSourceOffer(settings);
    return {
      title:'오픈소스 및 MuPDF 라이선스',
      author:'Artifex Software, Inc.',
      version:'MuPDF.js 1.28.1',
      license:'GNU AGPL-3.0-or-later',
      noWarranty:'이 소프트웨어는 관련 라이선스에서 정한 범위에서 보증 없이 제공됩니다.',
      sourceOffer:source,
      sourceStatus:source?'검증된 대응 소스 제공 링크':'대응 소스 및 공개 배포는 법률 검토·승인 전까지 보류',
    };
  }
  function mount(doc,settings={}) {
    if (!doc?.body) throw new Error('R4_DOCUMENT_BODY_REQUIRED');
    if (doc.getElementById('r4-private-notice')) return doc.getElementById('r4-private-notice');
    const data=model(settings);
    const root=doc.createElement('details');
    root.id='r4-private-notice';
    root.setAttribute('role','note');
    root.setAttribute('lang','ko');
    root.style.cssText='position:fixed;z-index:9000;right:12px;bottom:12px;max-width:min(370px,calc(100vw - 24px));background:#fff;color:#172033;border:1px solid #cbd5e1;border-radius:10px;padding:9px 12px;box-shadow:0 4px 14px #0002;font:13px/1.5 system-ui,sans-serif';
    const summary=doc.createElement('summary');
    summary.textContent=settings.production===true?'오픈소스 고지':'오픈소스 고지 (비운영 미리보기)';
    summary.style.cssText='cursor:pointer;font-weight:600';
    root.appendChild(summary);
    const h=doc.createElement('strong');h.textContent=data.title;root.appendChild(h);
    const info=doc.createElement('p');
    info.textContent=data.version+' | '+data.license+' | © '+data.author;
    root.appendChild(info);
    const warning=doc.createElement('p');
    warning.textContent=data.noWarranty;
    root.appendChild(warning);
    const license=doc.createElement('a');
    license.href=LICENSE_PATH;
    license.textContent='GNU AGPLv3 전문';
    license.rel='noopener noreferrer';
    license.target='_blank';
    root.appendChild(license);
    const status=doc.createElement('p');
    status.id='r4-source-offer-status';
    status.textContent=data.sourceStatus;
    root.appendChild(status);
    if (data.sourceOffer) {
      const link=doc.createElement('a');
      link.id='r4-source-offer-link';
      link.href=data.sourceOffer;
      link.textContent='완전한 대응 소스 확인';
      link.target='_blank';
      link.rel='noopener noreferrer';
      root.appendChild(link);
    }
    doc.body.appendChild(root);
    return root;
  }
  const api={isPrivateLoopback,safeSourceOffer,model,mount};
  if(typeof window!=='undefined')window.PE_R4_NOTICE=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined'&&typeof document!=='undefined' &&
    isPrivateLoopback(window.location.href)) {
    // R4 is NOT a public source-offer deployment. Public mode is intentionally
    // unavailable while m2-publication-gate.json remains CLOSED.
    mount(document,{approved:false,gate:'BLOCKED',sourceUrl:''});
  }
})(typeof globalThis!=='undefined'?globalThis:this);
