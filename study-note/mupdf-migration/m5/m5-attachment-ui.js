/* M5 — isolated attachment PDF integration. Local opt-in only.
 * Keep the operating mediaContent fetch and annotation persistence unchanged. */
async function m5AttachmentRuntime() {
  if (!M5_ATTACHMENT_DEV_ENABLED) throw new Error('M5 requires loopback-only opt-in');
  if (!m5AttachmentRuntimePromise) {
    m5AttachmentRuntimePromise = import('./m5-attachment-adapter.mjs')
      .then(async mod => {
        m5AttachmentModule = mod;
        return mod.createM5AttachmentEngine();
      }).catch(e => { m5AttachmentRuntimePromise = null; throw e; });
  }
  return m5AttachmentRuntimePromise;
}
function m5IsCurrent(loadSerial=attachmentPdfLoadSerial,pageSerial=m5AttachmentPageSerial) {
  return M5_ATTACHMENT_DEV_ENABLED && loadSerial === attachmentPdfLoadSerial
    && pageSerial === m5AttachmentPageSerial && !!m5AttachmentDocument
    && !els.mediaViewerModal.classList.contains('hidden');
}
function m5StopPageRendering() {
  ++m5AttachmentPageSerial;
  clearTimeout(attachmentPdfRenderTimer);
  ++attachmentPdfRenderSerial;
  clearTimeout(m5AttachmentTileTimer);
  ++m5AttachmentTileSerial;
  m5AttachmentTileAbort?.abort();
  m5AttachmentTileAbort = null;
  m5AttachmentBaseAbort?.abort();
  m5AttachmentBaseAbort = null;
  m5AttachmentModule?.clearVisibleTile(
    els.mediaViewerBody?.querySelector('#pdfViewerFrameWrap .attachment-pdf-stage'));
  m5AttachmentVectorReady = false;
}
function m5DisposeAttachmentViewer() {
  if (!M5_ATTACHMENT_DEV_ENABLED) return;
  m5AttachmentLoadAbort?.abort();
  m5AttachmentLoadAbort = null;
  m5StopPageRendering();
  const old = m5AttachmentDocument;
  m5AttachmentDocument = null;
  if (old) void old.close().catch(() => {});
}
function m5SetAttachmentStatus(label,detail='') {
  const chip = els.mediaViewerBody?.querySelector('.m5-attachment-engine-status');
  if (chip) { chip.textContent = label; chip.title = detail || label; }
}
function m5PageAbort(error) {
  return error?.code === 'ABORTED' || error?.name === 'AbortError'
    || error?.name === 'RenderingCancelledException';
}
async function m5LoadPdfAtIndex(index) {
  if (!activePdfAttachments.length) return;
  const bounded = Math.max(0, Math.min(index, activePdfAttachments.length - 1));
  const item = activePdfAttachments[bounded];
  const wrap = els.mediaViewerBody.querySelector('#pdfViewerFrameWrap');
  if (!wrap) return;
  destroyAnnotationSurfacesWithin(wrap);
  m5DisposeAttachmentViewer();
  const serial = ++attachmentPdfLoadSerial;
  activePdfIndex = bounded;
  activeAttachmentPdfDocument = null;
  activeAttachmentPdfPage = null;
  activeAttachmentPdfPageCount = 0;
  activeAttachmentPdfPageNumber = 1;
  activeAttachmentPdfFitScale = 1;
  activeAttachmentPdfZoomFactor = ATTACHMENT_PDF_DEFAULT_ZOOM;
  updateAttachmentPdfViewerUi();
  wrap.innerHTML = '<div class="media-placeholder">첨부 PDF 원본 확인 중...</div>';
  const abort = new AbortController();
  m5AttachmentLoadAbort = abort;
  let pending = null;
  try {
    // Use the unchanged mediaContent GET path. No Drive/OAuth bypass or mutation.
    const payload = await fetchMediaContent(getApiUrl(), item.attachmentId, {signal:abort.signal});
    if (abort.signal.aborted || serial !== attachmentPdfLoadSerial
      || els.mediaViewerModal.classList.contains('hidden')
      || activePdfAttachments[activePdfIndex]?.attachmentId !== item.attachmentId) return;
    const base64 = payload?.base64;
    if (typeof base64 !== 'string' || !base64
        || base64.length > Math.ceil(MAX_ATTACHMENT_BYTES/3)*4+8
        || (payload.mime && payload.mime !== 'application/pdf'))
      throw new Error('첨부 PDF 응답이 올바르지 않거나 허용 크기를 초과했습니다.');
    const bytes = base64ToUint8Array(base64);
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES)
      throw new Error('첨부 PDF 허용 크기 초과');
    const engine = await m5AttachmentRuntime();
    if (abort.signal.aborted || serial !== attachmentPdfLoadSerial) return;
    pending = await engine.openDocument(bytes, {signal:abort.signal});
    if (abort.signal.aborted || serial !== attachmentPdfLoadSerial
        || els.mediaViewerModal.classList.contains('hidden')) return;
    if (!Number.isInteger(pending.pageCount) || pending.pageCount < 1)
      throw new Error('PDF 문서에 표시 가능한 페이지가 없습니다.');
    m5AttachmentDocument = pending;
    pending = null;
    activeAttachmentPdfPageCount = m5AttachmentDocument.pageCount;
    activeAttachmentPdfPageNumber = 1;
    updateAttachmentPdfViewerUi();
    await m5LoadAttachmentPdfPage(1,{serial});
  } catch(e) {
    if (m5PageAbort(e) || abort.signal.aborted || serial !== attachmentPdfLoadSerial) return;
    console.warn('M5 첨부 PDF 로컬 렌더링 오류:',e?.code||e?.name||'PDF_ERROR');
    wrap.innerHTML = '<div class="media-placeholder">첨부 PDF 불러오기 실패 · '
      + escapeHtml(e?.message||String(e)) + '</div>';
  } finally {
    if (pending) await pending.close();
    if (m5AttachmentLoadAbort === abort) m5AttachmentLoadAbort = null;
  }
}
async function m5LoadAttachmentPdfPage(pageNumber,{serial=attachmentPdfLoadSerial}={}) {
  const doc = m5AttachmentDocument;
  if (!doc || !activeAttachmentPdfPageCount) return;
  const bounded = Math.max(1, Math.min(Math.floor(Number(pageNumber)||1), activeAttachmentPdfPageCount));
  m5StopPageRendering();
  const pageSerial = m5AttachmentPageSerial;
  activeAttachmentPdfPageNumber = bounded;
  activeAttachmentPdfPage = null;
  activeAttachmentPdfZoomFactor = ATTACHMENT_PDF_DEFAULT_ZOOM;
  updateAttachmentPdfViewerUi();
  const wrap = els.mediaViewerBody.querySelector('#pdfViewerFrameWrap');
  if (!wrap) return;
  destroyAnnotationSurfacesWithin(wrap);
  wrap.innerHTML =
    '<div class="attachment-pdf-pan-scroller" tabindex="0" aria-label="PDF 페이지. 마우스·터치로 이동하거나 두 손가락으로 확대할 수 있습니다.">'
    + '<div class="attachment-pdf-stage"><canvas class="attachment-pdf-canvas" aria-label="첨부 PDF 고화질 렌더링"></canvas></div>'
    + '</div><div class="attachment-pdf-loading">첨부 PDF ' + bounded + '페이지 렌더링 중...</div>'
    + '<span class="m5-attachment-engine-status" role="status">MuPDF 원본 렌더링 준비 중</span>';
  const scroller = wrap.querySelector('.attachment-pdf-pan-scroller');
  installPdfPanPinchHandlers(scroller,{
    getZoom: () => activeAttachmentPdfZoomFactor,
    setZoom: value => setAttachmentPdfZoomFactor(value),
    minZoom:ATTACHMENT_PDF_ZOOM_MIN, maxZoom:ATTACHMENT_PDF_ZOOM_MAX,
  });
  scroller.addEventListener('scroll',() => m5ScheduleAttachmentTile(),{passive:true});
  try {
    const view = await doc.getPageView(bounded);
    if (!m5IsCurrent(serial,pageSerial) || doc !== m5AttachmentDocument) return;
    activeAttachmentPdfPage = view.facade;
    m5LayoutAttachment({preserveCenter:false,scheduleRender:false});
    await m5RepaintAttachment({immediate:true,loadSerial:serial,pageSerial});
    if (!m5IsCurrent(serial,pageSerial) || doc !== m5AttachmentDocument) return;
    if (!m5AttachmentVectorReady) throw new Error('첨부 PDF 첫 렌더링 실패');
    wrap.querySelector('.attachment-pdf-loading')?.remove();
    updateAttachmentPdfViewerUi();
  } catch(e) {
    if (!m5IsCurrent(serial,pageSerial) || m5PageAbort(e)) return;
    console.warn('M5 첨부 PDF 페이지 오류:',e?.code||e?.name||'RENDER_ERROR');
    wrap.innerHTML = '<div class="media-placeholder">첨부 PDF 페이지 렌더링 실패 · '
      + escapeHtml(e?.message||String(e)) + '</div>';
  }
}
function m5LayoutAttachment({preserveCenter=true,scheduleRender=true}={}) {
  const wrap = els.mediaViewerBody.querySelector('#pdfViewerFrameWrap');
  const scroller = wrap?.querySelector('.attachment-pdf-pan-scroller');
  const stage = wrap?.querySelector('.attachment-pdf-stage');
  const canvas = wrap?.querySelector('.attachment-pdf-canvas');
  if (!scroller || !stage || !canvas || !activeAttachmentPdfPage || !m5AttachmentDocument) return;
  const base = activeAttachmentPdfPage.getViewport({scale:1});
  const oldWidth = Math.max(1,scroller.scrollWidth);
  const oldHeight = Math.max(1,scroller.scrollHeight);
  const centerX = (scroller.scrollLeft+scroller.clientWidth/2)/oldWidth;
  const centerY = (scroller.scrollTop+scroller.clientHeight/2)/oldHeight;
  activeAttachmentPdfFitScale = Math.max(.01,Math.max(1,scroller.clientWidth-28)/Math.max(1,base.width));
  const displayWidth = Math.max(1,Math.round(base.width*activeAttachmentPdfFitScale*activeAttachmentPdfZoomFactor));
  const displayHeight = Math.max(1,Math.round(base.height*activeAttachmentPdfFitScale*activeAttachmentPdfZoomFactor));
  const padding = window.innerWidth<=760 ? 16:24;
  canvas.style.width = displayWidth+'px';
  canvas.style.height = displayHeight+'px';
  stage.style.width = Math.max(scroller.clientWidth,displayWidth+padding)+'px';
  stage.style.height = Math.max(scroller.clientHeight,displayHeight+padding)+'px';
  updateAttachmentPdfViewerUi();
  const item = activePdfAttachments[activePdfIndex];
  ensureAnnotationSurface({
    host:stage,media:canvas,
    key:annotationSurfaceKey('attachment-pdf',item?.attachmentId||'unknown',String(activeAttachmentPdfPageNumber)),
    kind:'attachment-pdf',intrinsicWidth:base.width,intrinsicHeight:base.height,
  });
  requestAnimationFrame(()=>{
    if (!canvas.isConnected) return;
    syncAnnotationSurface(canvas);
    if (preserveCenter) {
      scroller.scrollLeft = Math.max(0,centerX*scroller.scrollWidth-scroller.clientWidth/2);
      scroller.scrollTop = Math.max(0,centerY*scroller.scrollHeight-scroller.clientHeight/2);
    } else {
      scroller.scrollLeft = Math.max(0,(scroller.scrollWidth-scroller.clientWidth)/2);
      scroller.scrollTop = 0;
    }
  });
  if (scheduleRender) void m5RepaintAttachment({immediate:false});
}
async function m5RepaintAttachment({immediate=false,
  loadSerial=attachmentPdfLoadSerial,pageSerial=m5AttachmentPageSerial}={}) {
  clearTimeout(attachmentPdfRenderTimer);
  clearTimeout(m5AttachmentTileTimer);
  ++m5AttachmentTileSerial;
  m5AttachmentTileAbort?.abort();
  m5AttachmentTileAbort = null;
  m5AttachmentBaseAbort?.abort();
  const paintSerial = ++attachmentPdfRenderSerial;
  const doc = m5AttachmentDocument;
  const controller = new AbortController();
  m5AttachmentBaseAbort = controller;
  const paint = async () => {
    const wrap = els.mediaViewerBody.querySelector('#pdfViewerFrameWrap');
    const scroller = wrap?.querySelector('.attachment-pdf-pan-scroller');
    const canvas = wrap?.querySelector('.attachment-pdf-canvas');
    const page = activeAttachmentPdfPage;
    if (!doc || !canvas || !scroller || !page || controller.signal.aborted
      || !m5IsCurrent(loadSerial,pageSerial) || paintSerial!==attachmentPdfRenderSerial) return;
    const base = page.getViewport({scale:1});
    const fit = Math.max(.01,Math.max(1,scroller.clientWidth-28)/Math.max(1,base.width));
    const buffer = document.createElement('canvas');
    try {
      const result = await doc.renderPage(buffer,{
        pageNumber:activeAttachmentPdfPageNumber,fitScale:fit,
        zoom:activeAttachmentPdfZoomFactor,
        dpr:Math.min(3,Math.max(1,window.devicePixelRatio||1)),
        signal:controller.signal,
      });
      if (controller.signal.aborted || !m5IsCurrent(loadSerial,pageSerial)
        || paintSerial!==attachmentPdfRenderSerial || doc!==m5AttachmentDocument
        || !canvas.isConnected) return;
      canvas.width = buffer.width;canvas.height = buffer.height;
      const ctx = canvas.getContext('2d',{alpha:false});
      if (!ctx) throw new Error('첨부 PDF 출력 캔버스를 생성할 수 없습니다.');
      ctx.drawImage(buffer,0,0);
      m5AttachmentVectorReady = true;
      wrap.querySelector('.attachment-pdf-loading')?.remove();
      const label = doc.engine==='pdfjs'?'PDF.js 안전 복구':'MuPDF.js 고화질';
      m5SetAttachmentStatus(label,result.width+'×'+result.height+'px · '
        +(result.budgetLimited?'메모리 예산 적용':'원본 PDF 렌더링'));
      m5ScheduleAttachmentTile();
    } catch(e) {
      if (!controller.signal.aborted && !m5PageAbort(e) && m5IsCurrent(loadSerial,pageSerial)){
        console.warn('M5 고화질 재렌더링 오류:',e?.code||e?.name||'RENDER_ERROR');
        m5SetAttachmentStatus('PDF 고화질 렌더 실패',e?.message||'');
      }
    } finally {
      if (m5AttachmentBaseAbort===controller) m5AttachmentBaseAbort=null;
    }
  };
  if (immediate) await paint();
  else attachmentPdfRenderTimer = setTimeout(()=>{void paint();},135);
}
function m5ScheduleAttachmentTile() {
  if (!M5_ATTACHMENT_DEV_ENABLED || !m5AttachmentDocument || !m5AttachmentVectorReady) return;
  clearTimeout(m5AttachmentTileTimer);
  const tileSerial = ++m5AttachmentTileSerial;
  m5AttachmentTileAbort?.abort();
  m5AttachmentTileAbort = null;
  const wrap = els.mediaViewerBody.querySelector('#pdfViewerFrameWrap');
  const stage = wrap?.querySelector('.attachment-pdf-stage');
  if (activeAttachmentPdfZoomFactor<1.12){
    m5AttachmentModule?.clearVisibleTile(stage);
    return;
  }
  const loadSerial=attachmentPdfLoadSerial,pageSerial=m5AttachmentPageSerial;
  m5AttachmentTileTimer=setTimeout(async()=>{
    // Never terminate the same Worker while a base canvas is painting.
    if (m5AttachmentBaseAbort) {
      m5AttachmentTileTimer=setTimeout(m5ScheduleAttachmentTile,145);
      return;
    }
    const doc=m5AttachmentDocument;
    const scroller=wrap?.querySelector('.attachment-pdf-pan-scroller');
    const canvas=wrap?.querySelector('.attachment-pdf-canvas');
    const base=activeAttachmentPdfPage?.getViewport({scale:1});
    if (!doc || !stage || !scroller || !canvas || !base
        || !m5IsCurrent(loadSerial,pageSerial)||tileSerial!==m5AttachmentTileSerial) return;
    const fit=Math.max(.01,Math.max(1,scroller.clientWidth-28)/Math.max(1,base.width));
    const controller=new AbortController();
    m5AttachmentTileAbort=controller;
    try {
      const tile=await doc.renderVisibleRegion({
        canvas,scroller,stage,pageNumber:activeAttachmentPdfPageNumber,fitScale:fit,
        zoom:activeAttachmentPdfZoomFactor,dpr:Math.min(3,Math.max(1,window.devicePixelRatio||1)),
        signal:controller.signal,
      });
      if (!tile || controller.signal.aborted || doc!==m5AttachmentDocument
          || !m5IsCurrent(loadSerial,pageSerial)||tileSerial!==m5AttachmentTileSerial) return;
      m5AttachmentModule.showVisibleTile(stage,tile.tile);
      stage.dataset.m5TileBytes=String(tile.output.rgbaBytes);
      stage.dataset.m5TilePage=String(activeAttachmentPdfPageNumber);
    } catch(e) {
      if (!controller.signal.aborted && !m5PageAbort(e))
        console.warn('M5 가시 영역 타일 오류:',e?.code||e?.name||'TILE_ERROR');
    } finally {
      if (m5AttachmentTileAbort===controller)m5AttachmentTileAbort=null;
    }
  },115);
}
// The test hook uses the real renderPdfViewer() and real fetchMediaContent().
// Its Playwright browser intercepts HTTP and supplies synthetic PDF bytes.
if (M5_ATTACHMENT_DEV_ENABLED) {
  window.__M5_ATTACHMENT_QA__=Object.freeze({
    openFixture(items) {
      if (!Array.isArray(items) || !items.length
          || items.some(item=>!/^M5-QA-[A-Za-z0-9-]+$/.test(item.attachmentId)||item.type!=='P'))
        throw new Error('Only synthetic M5 fixture metadata permitted');
      cleanupMediaViewerObjects();
      els.imageViewerModal.classList.add('hidden');
      els.mediaViewerModal.classList.remove('hidden');
      els.mediaViewerTitle.textContent='M5 로컬 첨부 PDF';
      els.mediaViewerSubtitle.textContent='합성 PDF · 운영 데이터 접근 없음';
      setAnnotationTool('pan');
      renderPdfViewer(items);
    },
    getState(){
      const wrap=els.mediaViewerBody.querySelector('#pdfViewerFrameWrap');
      const canvas=wrap?.querySelector('.attachment-pdf-canvas');
      const stage=wrap?.querySelector('.attachment-pdf-stage');
      const item=activePdfAttachments[activePdfIndex];
      return {
        ready:m5AttachmentVectorReady,engine:m5AttachmentDocument?.engine||null,
        attachmentId:item?.attachmentId||null,
        index:activePdfIndex+1,total:activePdfAttachments.length,
        page:activeAttachmentPdfPageNumber,count:activeAttachmentPdfPageCount,
        zoom:activeAttachmentPdfZoomFactor,width:canvas?.width||0,height:canvas?.height||0,
        annotationKey:annotationSurfaceKey('attachment-pdf',item?.attachmentId||'',String(activeAttachmentPdfPageNumber)),
        annotationSchema:ANNOTATION_SCHEMA_VERSION,coordinateSpace:'normalized-0-1',
        inkObjects:annotationDocuments.get(annotationSurfaceKey('attachment-pdf',
          item?.attachmentId||'',String(activeAttachmentPdfPageNumber)))?.objects?.length||0,
        tileCount:stage?.querySelectorAll('.m5-attachment-detail-tile').length||0,
        tileBytes:Number(stage?.dataset?.m5TileBytes||0),
        status:wrap?.querySelector('.m5-attachment-engine-status')?.textContent||'',
        visible:!els.mediaViewerModal.classList.contains('hidden'),
      };
    },
    // Synthetic in-memory ink only; never invokes persistence or cloud sync.
    seedInk(){
      const state=this.getState();
      if(!state.attachmentId?.startsWith('M5-QA-')||!state.ready)throw new Error('No synthetic page');
      const doc=getAnnotationDocument(state.annotationKey);
      if(!doc.objects.some(o=>o.id==='M5-QA-STROKE')){
        doc.objects.push({id:'M5-QA-STROKE',type:'stroke',tool:'pen',
          color:'#2563eb',opacity:1,widthN:.004,pressureSensitive:true,
          points:[{x:.21,y:.28,p:.4},{x:.57,y:.73,p:.8}]});
      }
      const media=els.mediaViewerBody.querySelector('.attachment-pdf-canvas');
      const surface=media?annotationSurfaceByMedia.get(media):null;
      if(surface)renderAnnotationSurface(surface);
      return doc.objects.length;
    },
    page(n){return loadAttachmentPdfPage(n);},
    item(n){return loadPdfAtIndex(n);},
    zoom(value){setAttachmentPdfZoomFactor(value);},
    async usePdfjsFallbackForNextFixture(){
      await m5AttachmentRuntime();
      m5AttachmentRuntimePromise=m5AttachmentModule.createM5AttachmentEngine({forcePdfjs:true});
    },
    async useDefaultEngineForNextFixture(){
      await m5AttachmentRuntime();
      m5AttachmentRuntimePromise=m5AttachmentModule.createM5AttachmentEngine();
    },
    close(){closeMediaViewer();}
  });
}
