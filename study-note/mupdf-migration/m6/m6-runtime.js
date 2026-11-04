/* M6 private-only runtime hooks for all three PDF viewers.
 * Only activated on http://localhost/127.0.0.1 with m4-local=1, m5-local=1,
 * and m6-local=1. Never touches Apps Script, localStorage, or ink persistence. */
(async()=>{
  if(typeof M6_DEV_ENABLED==='undefined'||!M6_DEV_ENABLED)return;
  const policy=await import('./m6-interaction-policy.mjs');
  if(!policy.isM6LocalOptIn(window.location.href)
    && !window.PE_R6_POLICY?.isProductionRelease(window.PE_R6_RELEASE,window.location.href))
    throw Error('M6 renderer origin/release gate');
  const zoom=new policy.M6ZoomAnchor();
  const gates=new Map([
    ['reference',policy.createM6ScrollCoalescer({delayMs:125,maxWaitMs:360})],
    ['attachment',policy.createM6ScrollCoalescer({delayMs:125,maxWaitMs:360})],
  ]);
  const frames={reference:[],attachment:[]};
  const profile=({zoom:factor=1}={})=>policy.m6BudgetForDevice(policy.currentM6DeviceInfo(),{zoom:factor});
  let orientationCount=0,relayoutCount=0,viewportTimer=0,oldWidth=0,oldHeight=0;
  const mediaFor=scroller=>scroller?.querySelector(
    '.reference-pdf-vector-canvas.is-rendered, .attachment-pdf-canvas');
  const scheduleRelayout=()=>{
    if(viewportTimer)return;
    viewportTimer=requestAnimationFrame(()=>{
      viewportTimer=0;
      const vv=window.visualViewport;
      const width=vv?.width||window.innerWidth,height=vv?.height||window.innerHeight;
      // Ignore visualViewport height changes caused solely by the on-screen
      // keyboard, avoiding a destructive re-render during annotation text edits.
      const keyboard=document.activeElement?.matches?.('input, textarea,[contenteditable="true"]');
      if(keyboard&&Math.abs(width-oldWidth)<3)return;
      const sizeChanged=Math.abs(width-oldWidth)>3||Math.abs(height-oldHeight)>3;
      oldWidth=width;oldHeight=height;
      if(!sizeChanged)return;
      relayoutCount++;
      if(m4ReferenceDocument&&activeReferencePdfVectorReady
          && !els.referencePdfViewerModal.classList.contains('hidden')){
        renderActiveReferencePdfImage({preserveCenter:true});
      }
      if(m5AttachmentDocument&&activeAttachmentPdfPage
          && !els.mediaViewerModal.classList.contains('hidden')){
        m5LayoutAttachment({preserveCenter:true});
      }
    });
  };
  oldWidth=window.visualViewport?.width||window.innerWidth;
  oldHeight=window.visualViewport?.height||window.innerHeight;
  window.visualViewport?.addEventListener('resize',scheduleRelayout,{passive:true});
  window.addEventListener('orientationchange',()=>{
    orientationCount++;scheduleRelayout();
  },{passive:true});
  const api=Object.freeze({
    profile,
    dpr({zoom:factor=1}={}) {
      return profile({zoom:factor}).effectiveDpr(window.devicePixelRatio||1);
    },
    scheduleTile(kind,fn) {
      const gate=gates.get(kind);
      if(!gate)throw Error('Unknown M6 tile queue');
      gate.schedule(fn);
    },
    flushTile(kind){gates.get(kind)?.flush();},
    cancelTile(kind){gates.get(kind)?.cancel();},
    tileStats(kind){return gates.get(kind)?.stats();},
    zoomAt(scroller,clientX,clientY,fn){
      zoom.zoomAt(scroller,mediaFor(scroller),clientX,clientY,fn);
    },
    forgetZoom(scroller){if(scroller)zoom.forget(scroller);},
    recordRender(kind,{elapsedMs=0,bytes=0,pixelWidth=0,pixelHeight=0,engine='',budgetLimited=false,zoom=1,region=false}={}){
      if(!frames[kind])return;
      frames[kind].push({elapsedMs:Math.round(elapsedMs*10)/10,bytes,pixelWidth,pixelHeight,
        engine,budgetLimited,zoom,region});
      if(frames[kind].length>16)frames[kind].shift();
    },
    renderHistory(kind){return frames[kind]?.slice()||[];},
    accidentalPenDown:policy.isM6AccidentalPenContact,
    palmNearPen:policy.isM6LikelyPalmNearActiveStylus,
    normalizedPagePosition:policy.normalizedPagePosition,
    resetZoomAnchors(){
      for(const selector of ['.reference-pdf-pan-scroller','.attachment-pdf-pan-scroller']){
        const scroller=document.querySelector(selector);
        if(scroller)zoom.forget(scroller);
      }
    },
    stats(){
      return {device:policy.currentM6DeviceInfo(),
        profile:profile({zoom:1}).tier,viewportRelayouts:relayoutCount,
        orientationEvents:orientationCount,
        referenceTile:gates.get('reference').stats(),
        attachmentTile:gates.get('attachment').stats(),
        referenceHistory:frames.reference.slice(),
        attachmentHistory:frames.attachment.slice()};
    }
  });
  window.__M6_PERF__=api;
  if(policy.isM6LocalOptIn(window.location.href))window.__M6_QA__=Object.freeze({
    getState:()=>api.stats(),
    zoomAt:api.zoomAt,
    currentProfile:factor=>{
      const p=profile({zoom:factor});
      return {tier:p.tier,baseBudget:p.baseBudget,tileBudget:p.tileBudget,
        dpr:p.effectiveDpr(window.devicePixelRatio||1)};
    },
    simulateResize:()=>{scheduleRelayout();},
    flushTile:(kind)=>api.flushTile(kind),
  });
})().catch(error=>{
  console.warn('M6 private runtime not initialized:',error?.message||error);
});
