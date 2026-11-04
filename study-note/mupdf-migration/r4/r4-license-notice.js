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
    const docked=settings.docked===true;
    const host=docked ? settings.host : doc.body;
    if (!host || !host.appendChild) throw new Error('R10_DOCK_HOST_REQUIRED');
    const root=doc.createElement('details');
    root.id='r4-private-notice';
    root.setAttribute('role','note');
    root.setAttribute('lang','ko');
    root.style.cssText=docked
      ? 'position:relative;z-index:36;flex:0 0 auto;min-width:0'
      : 'position:fixed;z-index:9000;right:12px;bottom:12px;max-width:min(370px,calc(100vw - 24px));background:#fff;color:#172033;border:1px solid #cbd5e1;border-radius:10px;padding:9px 12px;box-shadow:0 4px 14px #0002;font:13px/1.5 system-ui,sans-serif';
    if (docked) root.className='r4-notice-docked';
    const summary=doc.createElement('summary');
    summary.textContent=docked?'ⓘ 고지':settings.production===true?'오픈소스 고지':'오픈소스 고지 (비운영 미리보기)';
    summary.style.cssText=docked?'':'cursor:pointer;font-weight:600';
    if(docked){
      summary.className='nav-btn r4-notice-summary';
      summary.setAttribute('aria-label','오픈소스 고지 및 전체 대응 소스 보기');
      summary.title='오픈소스 고지 및 전체 대응 소스';
    }
    root.appendChild(summary);
    const panel=docked?doc.createElement('div'):root;
    if(docked)panel.className='r4-notice-popover';
    const h=doc.createElement('strong');h.textContent=data.title;panel.appendChild(h);
    const info=doc.createElement('p');
    info.textContent=data.version+' | '+data.license+' | © '+data.author;
    panel.appendChild(info);
    const warning=doc.createElement('p');
    warning.textContent=data.noWarranty;
    panel.appendChild(warning);
    const license=doc.createElement('a');
    license.href=LICENSE_PATH;
    license.textContent='GNU AGPLv3 전문';
    license.rel='noopener noreferrer';
    license.target='_blank';
    panel.appendChild(license);
    // R8: the exact upstream attribution list and full third-party notices
    // remain publicly readable regardless of the binary release decision.
    const notices=doc.createElement('a');
    notices.href='./THIRD_PARTY_NOTICES.md';
    notices.textContent='제3자 라이선스 및 저작권 고지';
    notices.rel='noopener noreferrer';
    notices.target='_blank';
    notices.style.marginLeft='12px';
    panel.appendChild(notices);
    const status=doc.createElement('p');
    status.id='r4-source-offer-status';
    status.textContent=data.sourceStatus;
    panel.appendChild(status);
    if (data.sourceOffer) {
      const link=doc.createElement('a');
      link.id='r4-source-offer-link';
      link.href=data.sourceOffer;
      link.textContent='완전한 대응 소스 확인';
      link.target='_blank';
      link.rel='noopener noreferrer';
      panel.appendChild(link);
    }
    if(docked){
      root.appendChild(panel);
      if(doc.addEventListener){
        doc.addEventListener('pointerdown',event=>{
          if(root.open && !root.contains(event.target))root.open=false;
        });
        doc.addEventListener('keydown',event=>{
          if(event.key==='Escape' && root.open){
            root.open=false;
            summary.focus();
          }
        });
      }
    }
    host.appendChild(root);
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
