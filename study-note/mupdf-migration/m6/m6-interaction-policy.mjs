// M6 shared display/input policy for a PRIVATE/loopback-only trial.
// No PDF, annotation, authentication, or user information is persisted.
export const M6_MEMORY_TIERS = Object.freeze({
  desktop: Object.freeze({baseMiB:36,tileMiB:32,dprCap:3,maxEdge:4096}),
  tablet: Object.freeze({baseMiB:24,tileMiB:20,dprCap:2.5,maxEdge:4096}),
  constrained: Object.freeze({baseMiB:16,tileMiB:12,dprCap:2,maxEdge:3072}),
});
const MIB=1024*1024;
export function isM6LocalOptIn(href) {
  try {
    const url=new URL(href);
    return url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname.toLowerCase())
      && ['m4-local','m5-local','m6-local'].every(k=>url.searchParams.get(k)==='1');
  }catch(_){return false;}
}
export function selectM6DeviceTier({deviceMemory=null,width=1366,hasTouch=false,coarse=false}={}) {
  if((Number.isFinite(deviceMemory)&&deviceMemory>0&&deviceMemory<=4)
      ||(width<=820&&(hasTouch||coarse)))return 'constrained';
  if((Number.isFinite(deviceMemory)&&deviceMemory>0&&deviceMemory<=6)
      ||(width<=1180&&(hasTouch||coarse))
      ||(coarse&&hasTouch&&width<=1800))return 'tablet';
  return 'desktop';
}
export function m6BudgetForDevice(device={}, {zoom=1}={}) {
  if(!Number.isFinite(zoom)||zoom<=0||zoom>1000)
    throw Error('Invalid zoom');
  const tier=selectM6DeviceTier(device),t=M6_MEMORY_TIERS[tier];
  const budget=(miB)=>Object.freeze({maxBytes:miB*MIB,maxPixels:miB*MIB/4,maxEdge:t.maxEdge});
  // A whole-page bitmap is only a navigation preview at very high zoom;
  // the visible-region tile receives its own larger allocation.
  const previewMiB=zoom>=4?Math.min(t.baseMiB,12):t.baseMiB;
  return Object.freeze({
    tier,
    baseBudget:budget(previewMiB),
    tileBudget:budget(t.tileMiB),
    dprCap:t.dprCap,
    effectiveDpr:(dpr=1)=>Math.min(t.dprCap,Math.max(1,Number(dpr)||1)),
  });
}
export function normalizedPagePosition({clientX,clientY},{left,top,width,height}) {
  if(!(width>0&&height>0))throw Error('Invalid page bounds');
  return {x:Math.max(0,Math.min(1,(clientX-left)/width)),
    y:Math.max(0,Math.min(1,(clientY-top)/height))};
}
export function clientPagePosition({x,y},{left,top,width,height}) {
  if(!(width>0&&height>0))throw Error('Invalid page bounds');
  return {clientX:left+x*width,clientY:top+y*height};
}
export function transformQuarterTurn(point,rotation) {
  if(![0,90,180,270].includes(rotation))throw Error('Unsupported quarter turn');
  const {x,y}=point;
  if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Non-finite normalized point');
  return rotation===90?{x:1-y,y:x}:rotation===180?{x:1-x,y:1-y}
    :rotation===270?{x:y,y:1-x}:{x,y};
}
export function inverseQuarterTurn(point,rotation) {
  return transformQuarterTurn(point,(360-rotation)%360);
}
export function createM6ScrollCoalescer({setTimer=setTimeout,clearTimer=clearTimeout,
  now=()=>Date.now(),delayMs=140,maxWaitMs=400}={}) {
  if(!(delayMs>=0&&maxWaitMs>=delayMs))throw Error('Bad tile throttle policy');
  // Null rather than 0: a clock starting at 0 is a valid first event time.
  let timer=null,firstAt=null,latest=null,closed=false,schedules=0,coalesced=0,executions=0;
  const flush=()=>{
    if(timer!==null){clearTimer(timer);timer=null;}
    const fn=latest;latest=null;firstAt=null;
    if(closed||!fn)return;
    executions++;fn();
  };
  return Object.freeze({
    schedule(fn){
      if(closed)return;
      if(typeof fn!=='function')throw Error('Render task must be a function');
      schedules++;
      if(latest)coalesced++;
      latest=fn;
      if(firstAt===null)firstAt=now();
      if(timer!==null)clearTimer(timer);
      const remaining=Math.max(0,maxWaitMs-(now()-firstAt));
      timer=setTimer(flush,Math.min(delayMs,remaining));
    },
    flush,
    cancel(){
      if(timer!==null)clearTimer(timer);
      timer=null;latest=null;firstAt=null;
    },
    close(){
      if(timer!==null)clearTimer(timer);
      timer=null;closed=true;latest=null;firstAt=null;
    },
    stats(){return {schedules,coalesced,executions,pending:!!latest,closed};},
  });
}
export class M6ZoomAnchor {
  constructor({requestFrame=cb=>requestAnimationFrame(cb),cancelFrame=id=>cancelAnimationFrame(id)}={}){
    this.queue=new WeakMap();this.requestFrame=requestFrame;this.cancelFrame=cancelFrame;
  }
  zoomAt(scroller,media,clientX,clientY,action){
    if(!scroller||!media||!media.isConnected||typeof action!=='function')return action?.();
    const rect=media.getBoundingClientRect();
    if(!rect.width||!rect.height)return action();
    const anchor=normalizedPagePosition({clientX,clientY},rect);
    const previous=this.queue.get(scroller);
    if(previous?.handle!=null)this.cancelFrame(previous.handle);
    const token={handle:null};
    this.queue.set(scroller,token);
    action();
    // Original viewer also schedules a layout rAF; a second frame reads the
    // final canvas size and compensates for flex-centered/stage padding shifts.
    token.handle=this.requestFrame(()=>{
      token.handle=this.requestFrame(()=>{
        if(this.queue.get(scroller)!==token || !media.isConnected)return;
        const changed=media.getBoundingClientRect();
        const next=clientPagePosition(anchor,changed);
        scroller.scrollLeft+=next.clientX-clientX;
        scroller.scrollTop+=next.clientY-clientY;
        this.queue.delete(scroller);
      });
    });
  }
  forget(scroller){
    const token=this.queue.get(scroller);
    if(token?.handle!=null)this.cancelFrame(token.handle);
    this.queue.delete(scroller);
  }
}
// Adaptive pen/touch policy for optional M6 private mode. The existing S Pen
// path stays authoritative. Do not convert or mutate stored ink objects.
export function isM6AccidentalPenContact(event) {
  return event?.pointerType==='pen' && event?.type==='pointerdown'
    && Number(event.buttons)===0 && !(Number(event.pressure)>0);
}
export function isM6LikelyPalmNearActiveStylus({pointerType,width=0,height=0}={},penActive=false) {
  if(pointerType!=='touch'||!penActive)return false;
  // Some devices report palm size 1x1; while a stylus stroke is actively in
  // progress, all secondary touch contacts are ignored for annotation input.
  return true;
}
export function currentM6DeviceInfo(win=window,nav=navigator){
  const vv=win.visualViewport;
  return {
    width:Math.max(1,Math.round(vv?.width||win.innerWidth||1366)),
    height:Math.max(1,Math.round(vv?.height||win.innerHeight||768)),
    hasTouch:(nav.maxTouchPoints||0)>0,
    coarse:!!win.matchMedia?.('(pointer: coarse)').matches,
    deviceMemory:Number.isFinite(nav.deviceMemory)?nav.deviceMemory:null,
    dpr:win.devicePixelRatio||1,
  };
}
