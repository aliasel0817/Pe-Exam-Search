/* Personal Note (local-first). No writes to MASTER, existing annotations or learning state.
 * Schema v1 stores editable objects, per-topic pages and a single global background.
 * Cloud replication is intentionally NOT claimed or enabled without a reviewed server API.
 */
(function personalNoteModule() {
'use strict';
const DB_NAME = 'pe-personal-note-db';
const DB_VERSION = 1;
const PAPER_STORE = 'papers';
const SETTINGS_STORE = 'settings';
const PAPER_WIDTH = 900;
const PAPER_HEIGHT = 1200;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 100;
const ALLOWED_TYPES = new Set(['image/png','image/jpeg','image/webp']);
const tools = ['pen','highlighter','line','arrow','rect','ellipse','text','image','select','eraser','pan'];
let databasePromise = null;
let current = null;
let popup = null;
let canvas = null;
let ctx = null;
let fileInput = null;
let backgroundInput = null;
let viewWidth = PAPER_WIDTH;
let currentTool = 'pen';
let stroke = null;
let selectDrag = null;
let dirty = false;
let history = [];
let redo = [];
let pendingBackground = null;
let pendingEnabled = true;
let savedBackground = null;
let savedEnabled = true;
let pages = [];
let activePage = 0;
let lastFocus = null;
let saving = false;

function id() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID() : 'pn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}
function openDb() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve,reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PAPER_STORE)) db.createObjectStore(PAPER_STORE,{keyPath:'topicId'});
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE,{keyPath:'key'});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('개인 노트 저장소를 열 수 없습니다.'));
    req.onblocked = () => reject(new Error('다른 탭에서 개인 노트 저장소 사용 중입니다.'));
  }).catch(err => { databasePromise = null; throw err; });
  return databasePromise;
}
function dbRead(store,key) {
  return openDb().then(db => new Promise((resolve,reject) => {
    const tx = db.transaction(store,'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess=()=>resolve(req.result ?? null);
    req.onerror=()=>reject(req.error);
  }));
}
function persistAll(topicId, rows, config) {
  return openDb().then(db => new Promise((resolve,reject)=>{
    const tx = db.transaction([PAPER_STORE,SETTINGS_STORE],'readwrite');
    tx.objectStore(PAPER_STORE).put({topicId,version:1,pages:rows,updatedAt:new Date().toISOString()});
    tx.objectStore(SETTINGS_STORE).put({key:'global',version:1,background:config.background,enabled:config.enabled,updatedAt:new Date().toISOString()});
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error||new Error('저장 실패'));
    tx.onabort=()=>reject(tx.error||new Error('저장 취소'));
  }));
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function clamp(v,min,max) { return Math.max(min,Math.min(max,v)); }
function page() { return pages[activePage]; }
function newPage() { return {id:id(),objects:[]}; }
function isOpen() { return !!popup && !popup.hidden; }
function q(selector) { return popup.querySelector(selector); }
function setStatus(msg) { const el=q('#pnStatus'); if(el) el.textContent=msg; }
function refreshDirty() { dirty=true; setStatus('저장하지 않은 변경 사항'); updateUi(); }
function recordHistory() {
  history.push(clone(pages)); if(history.length>40) history.shift();
  redo.length=0;
}
function undoAction() {
  if(!history.length)return;
  redo.push(clone(pages));pages=history.pop();
  activePage=clamp(activePage,0,pages.length-1);
  refreshDirty();render();
}
function redoAction() {
  if(!redo.length)return;
  history.push(clone(pages));pages=redo.pop();
  activePage=clamp(activePage,0,pages.length-1);
  refreshDirty();render();
}
function pointerPoint(event) {
  const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return null;
  return {x:clamp((event.clientX-rect.left)/rect.width,0,1),y:clamp((event.clientY-rect.top)/rect.height,0,1)};
}
function color() { return q('#pnColor').value; }
function lineWidth() { return Number(q('#pnWidth').value)||4; }
function getObjectBounds(obj) {
  if(obj.type==='image') return {x:obj.x,y:obj.y,w:obj.w,h:obj.h};
  if(obj.type==='text') return {x:obj.x,y:obj.y-obj.size/PAPER_HEIGHT,w:Math.max(.06,Math.min(.85,obj.text.length*obj.size*.62/PAPER_WIDTH)),h:obj.size/PAPER_HEIGHT*1.3};
  if(obj.type==='shape') return {x:Math.min(obj.start.x,obj.end.x),y:Math.min(obj.start.y,obj.end.y),w:Math.abs(obj.start.x-obj.end.x),h:Math.abs(obj.start.y-obj.end.y)};
  if(obj.type==='stroke') {
    const xs=obj.points.map(p=>p.x),ys=obj.points.map(p=>p.y);
    return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  }
  return {x:0,y:0,w:0,h:0};
}
function hit(p) {
  const objects=page().objects;
  for(let i=objects.length-1;i>=0;i--) {
    const b=getObjectBounds(objects[i]);
    const margin=.018;
    if(p.x>=b.x-margin&&p.x<=b.x+b.w+margin&&p.y>=b.y-margin&&p.y<=b.y+b.h+margin)return i;
  }
  return -1;
}
const imageCache=new Map();
function drawImageSafe(src,x,y,w,h,targetCtx) {
  if(!src)return;
  let img=imageCache.get(src);
  if(!img) {
    img=new Image();
    imageCache.set(src,img);
    img.onload=()=>{if(isOpen())render();};
    img.onerror=()=>imageCache.delete(src);
    img.src=src;
  }
  if(img.complete&&img.naturalWidth)targetCtx.drawImage(img,x,y,w,h);
}
function renderTo(target, items, background, enabled) {
  const W=target.canvas.width,H=target.canvas.height;
  target.save();
  target.fillStyle='#fff';
  target.fillRect(0,0,W,H);
  if(enabled && background)drawImageSafe(background,0,0,W,H,target);
  for(const obj of items) {
    target.save();
    target.globalAlpha=obj.opacity??1;
    target.strokeStyle=obj.color||'#172033';
    target.fillStyle=obj.color||'#172033';
    target.lineCap='round';target.lineJoin='round';
    target.lineWidth=(obj.width||4)*W/PAPER_WIDTH;
    if(obj.type==='stroke') {
      const points=obj.points||[];
      if(points.length) {
        target.beginPath();
        target.moveTo(points[0].x*W,points[0].y*H);
        if(points.length===1)target.lineTo(points[0].x*W+.05,points[0].y*H+.05);
        for(let i=1;i<points.length;i++)target.lineTo(points[i].x*W,points[i].y*H);
        target.stroke();
      }
    } else if(obj.type==='shape') {
      const x=obj.start.x*W,y=obj.start.y*H,dx=(obj.end.x-obj.start.x)*W,dy=(obj.end.y-obj.start.y)*H;
      target.beginPath();
      if(obj.shape==='rect')target.rect(x,y,dx,dy);
      else if(obj.shape==='ellipse')target.ellipse(x+dx/2,y+dy/2,Math.max(.1,Math.abs(dx)/2),Math.max(.1,Math.abs(dy)/2),0,0,Math.PI*2);
      else {target.moveTo(x,y);target.lineTo(x+dx,y+dy);}
      target.stroke();
      if(obj.shape==='arrow') {
        const angle=Math.atan2(dy,dx),size=Math.max(12,target.lineWidth*5);
        target.beginPath();target.moveTo(x+dx,y+dy);
        target.lineTo(x+dx-size*Math.cos(angle-.48),y+dy-size*Math.sin(angle-.48));
        target.moveTo(x+dx,y+dy);
        target.lineTo(x+dx-size*Math.cos(angle+.48),y+dy-size*Math.sin(angle+.48));target.stroke();
      }
    } else if(obj.type==='text') {
      target.font=(obj.size*W/PAPER_WIDTH)+'px sans-serif';target.textBaseline='alphabetic';
      const lines=String(obj.text||'').split('\n');
      lines.forEach((line,i)=>target.fillText(line,obj.x*W,obj.y*H+i*obj.size*1.35*W/PAPER_WIDTH));
    } else if(obj.type==='image') {
      drawImageSafe(obj.src,obj.x*W,obj.y*H,obj.w*W,obj.h*H,target);
    }
    target.restore();
  }
  target.restore();
}
function render() {
  if(!canvas||!isOpen()||!pages.length)return;
  const width=Math.max(260,Math.floor(q('#pnStage').clientWidth-28));
  viewWidth=Math.min(PAPER_WIDTH,width);
  canvas.style.width=viewWidth+'px';
  canvas.width=PAPER_WIDTH;canvas.height=PAPER_HEIGHT;
  ctx=canvas.getContext('2d');
  renderTo(ctx,page().objects,pendingBackground,pendingEnabled);
  if(selectDrag&&selectDrag.index>=0) {
    const obj=page().objects[selectDrag.index],b=obj&&getObjectBounds(obj);
    if(b) {ctx.save();ctx.strokeStyle='#2563eb';ctx.setLineDash([7,5]);ctx.lineWidth=2;
      ctx.strokeRect(b.x*PAPER_WIDTH-5,b.y*PAPER_HEIGHT-5,b.w*PAPER_WIDTH+10,b.h*PAPER_HEIGHT+10);ctx.restore();}
  }
  updateUi();
}
function updateUi() {
  if(!isOpen())return;
  q('#pnPageLabel').textContent=(activePage+1)+' / '+pages.length+' 페이지';
  q('#pnPrev').disabled=activePage===0;
  q('#pnNext').disabled=activePage>=pages.length-1;
  q('#pnDelete').disabled=pages.length<=1;
  q('#pnAdd').disabled=pages.length>=MAX_PAGES;
  q('#pnUndo').disabled=history.length===0;
  q('#pnRedo').disabled=redo.length===0;
  q('#pnBackgroundEnabled').checked=pendingEnabled;
  q('#pnBackgroundEnabled').disabled=false;
  popup.querySelectorAll('[data-pn-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pnTool===currentTool)));
  canvas.dataset.tool=currentTool;
}
function chooseTool(tool) {
  if(!tools.includes(tool))return;
  currentTool=tool;selectDrag=null;render();
}
function onPointerDown(ev) {
  if(ev.pointerType==='mouse'&&ev.button!==0)return;
  if(currentTool==='pan'||(ev.pointerType==='touch'&&ev.isPrimary===false))return;
  const p=pointerPoint(ev);if(!p)return;
  ev.preventDefault();
  if(currentTool==='image') {q('#pnImageFile').click();return;}
  if(currentTool==='text') {
    const text=prompt('개인 노트에 넣을 글자 또는 문장을 입력하세요.');
    if(text) {recordHistory();page().objects.push({id:id(),type:'text',text:text.slice(0,2000),x:p.x,y:p.y,color:color(),size:Math.max(14,lineWidth()*5)});refreshDirty();render();}
    return;
  }
  if(currentTool==='select') {
    const i=hit(p);
    selectDrag=i<0?null:{index:i,from:p,initial:clone(page().objects[i]),changed:false,kind:'move'};
    render();return;
  }
  if(currentTool==='eraser') {
    const index=hit(p);
    if(index>=0){recordHistory();page().objects.splice(index,1);refreshDirty();render();}
    return;
  }
  recordHistory();
  const common={id:id(),color:color(),width:lineWidth(),opacity:currentTool==='highlighter'?.35:1};
  let obj;
  if(currentTool==='pen'||currentTool==='highlighter')obj={...common,type:'stroke',points:[p]};
  else obj={...common,type:'shape',shape:currentTool,start:p,end:p};
  page().objects.push(obj);
  stroke={pointerId:ev.pointerId,obj};
  try{canvas.setPointerCapture(ev.pointerId);}catch(_){}
  render();
}
function onPointerMove(ev) {
  const p=pointerPoint(ev);if(!p)return;
  if(stroke&&stroke.pointerId===ev.pointerId) {
    ev.preventDefault();
    if(stroke.obj.type==='stroke')stroke.obj.points.push(p);else stroke.obj.end=p;
    render();return;
  }
  if(selectDrag) {
    ev.preventDefault();
    const dx=p.x-selectDrag.from.x,dy=p.y-selectDrag.from.y;
    const obj=page().objects[selectDrag.index];
    if(!obj)return;
    if(!selectDrag.changed){recordHistory();selectDrag.changed=true;}
    const initial=clone(selectDrag.initial);
    if(initial.type==='image'||initial.type==='text') {initial.x=clamp(initial.x+dx,0,1);initial.y=clamp(initial.y+dy,0,1);}
    if(initial.type==='shape') {for(const k of ['start','end']) {initial[k].x=clamp(initial[k].x+dx,0,1);initial[k].y=clamp(initial[k].y+dy,0,1);}}
    if(initial.type==='stroke')initial.points.forEach(pt=>{pt.x=clamp(pt.x+dx,0,1);pt.y=clamp(pt.y+dy,0,1);});
    page().objects[selectDrag.index]=initial;render();
  }
}
function onPointerUp(ev) {
  if(stroke&&stroke.pointerId===ev.pointerId){stroke=null;refreshDirty();render();}
  if(selectDrag){if(selectDrag.changed)refreshDirty();selectDrag=null;render();}
}
function imageFromFile(file) {
  if(!file||!ALLOWED_TYPES.has(file.type)||file.size>MAX_IMAGE_BYTES)throw new Error('PNG/JPG/WebP 이미지 5MB 이하만 지원합니다.');
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error||new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}
function getImageSize(data) {
  return new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve({w:img.naturalWidth,h:img.naturalHeight});
    img.onerror=()=>reject(new Error('이미지 형식이 올바르지 않습니다.'));img.src=data;
  });
}
async function loadPhoto(file,background) {
  try {
    const data=await imageFromFile(file);
    const size=await getImageSize(data);
    if(background) {
      pendingBackground=data;
      refreshDirty();render();
      setStatus('공통 배경 변경됨 · 저장 후 전체 토픽에 적용');
    } else {
      const ratio=size.w/size.h;
      const w=Math.min(.68,Math.max(.18,.30*ratio));
      const h=Math.min(.55,w*PAPER_WIDTH/PAPER_HEIGHT/ratio);
      recordHistory();
      page().objects.push({id:id(),type:'image',src:data,x:.08,y:.08,w,h,opacity:1});
      refreshDirty();render();
    }
  } catch(error) {alert('이미지 등록 실패: '+(error.message||error));}
}
function handleKeys(ev) {
  if(!isOpen())return;
  if(ev.key==='Escape'){ev.stopImmediatePropagation();ev.preventDefault();return;}
  if((ev.ctrlKey||ev.metaKey)&&!ev.target.matches('input,textarea,select')){
    if(ev.key.toLowerCase()==='z'){ev.preventDefault();ev.stopPropagation();ev.shiftKey?redoAction():undoAction();}
    else if(ev.key.toLowerCase()==='y'){ev.preventDefault();ev.stopPropagation();redoAction();}
  }
}
function createUi() {
  const layer=document.createElement('div');
  layer.id='personalNoteModal';layer.hidden=true;
  layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');
  layer.setAttribute('aria-labelledby','pnTopic');
  layer.innerHTML=`
  <section class="personal-note-card" tabindex="-1">
    <header class="personal-note-header">
      <div class="personal-note-topic" id="pnTopic"></div>
      <label class="personal-note-check"><input type="checkbox" id="pnBackgroundEnabled" checked>배경</label>
      <button id="pnBackgroundButton" type="button">이미지 등록</button>
    </header>
    <div class="personal-note-pages" aria-label="개인 노트 페이지 이동">
      <button type="button" id="pnPrev" aria-label="이전 페이지">◀</button>
      <span class="pn-page-label" id="pnPageLabel">1 / 1 페이지</span>
      <button type="button" id="pnNext" aria-label="다음 페이지">▶</button>
      <button type="button" id="pnAdd" title="새 페이지">＋ 페이지</button>
      <button type="button" id="pnDelete" title="현재 페이지 삭제">삭제</button>
    </div>
    <div class="personal-note-stage" id="pnStage"><div class="personal-note-paper"><canvas id="pnCanvas" width="900" height="1200" aria-label="개인 노트 그림판"></canvas></div></div>
    <div class="personal-note-toolbar-head"><button type="button" id="pnToggleTools">도구 접기 ▲</button><span class="personal-note-toolbar-status">선택 도구로 개별 객체를 이동할 수 있습니다.</span></div>
    <div class="personal-note-toolbar" id="pnTools" role="toolbar" aria-label="그림판 도구">
      <button type="button" data-pn-tool="pen" aria-pressed="true" title="펜">✏</button>
      <button type="button" data-pn-tool="highlighter" aria-pressed="false" title="형광펜">🖍</button>
      <button type="button" data-pn-tool="line" aria-pressed="false" title="직선">／</button>
      <button type="button" data-pn-tool="arrow" aria-pressed="false" title="화살표">➜</button>
      <button type="button" data-pn-tool="rect" aria-pressed="false" title="사각형">□</button>
      <button type="button" data-pn-tool="ellipse" aria-pressed="false" title="타원">○</button>
      <button type="button" data-pn-tool="text" aria-pressed="false" title="글자">T</button>
      <button type="button" data-pn-tool="image" aria-pressed="false" title="사진 붙여넣기">🖼</button>
      <button type="button" data-pn-tool="select" aria-pressed="false" title="객체 선택 및 이동">↖</button>
      <button type="button" data-pn-tool="eraser" aria-pressed="false" title="객체 지우개">⌫</button>
      <button type="button" data-pn-tool="pan" aria-pressed="false" title="화면 스크롤">✋</button>
      <label title="펜 및 글자 색상">색 <input type="color" id="pnColor" value="#172033"></label>
      <label title="도구 굵기">굵기 <select id="pnWidth"><option value="2">2</option><option value="4" selected>4</option><option value="8">8</option><option value="12">12</option><option value="18">18</option></select></label>
      <button type="button" id="pnUndo" title="실행 취소">↶</button><button type="button" id="pnRedo" title="다시 실행">↷</button>
      <button type="button" id="pnResizeImage" title="선택된 사진 크기 조절">사진 크기</button>
    </div>
    <footer class="personal-note-footer">
      <span id="pnStatus" class="personal-note-status">로컬 노트</span>
      <button type="button" id="pnExport">PNG 저장</button>
      <button type="button" id="pnCancel">취소</button>
      <button type="button" id="pnSave">저장</button>
    </footer>
    <div class="personal-note-hint">현재 버전은 이 기기의 브라우저에 저장됩니다. 다른 기기와의 공유는 아직 지원하지 않습니다.</div>
    <input type="file" class="personal-note-file-input" id="pnBackgroundFile" accept="image/png,image/jpeg,image/webp">
    <input type="file" class="personal-note-file-input" id="pnImageFile" accept="image/png,image/jpeg,image/webp">
  </section>`;
  document.body.appendChild(layer);
  popup=layer;canvas=q('#pnCanvas');ctx=canvas.getContext('2d');
  backgroundInput=q('#pnBackgroundFile');fileInput=q('#pnImageFile');
  layer.addEventListener('pointerdown',ev=>{if(ev.target===layer){ev.preventDefault();}});
  q('#pnBackgroundButton').addEventListener('click',()=>backgroundInput.click());
  backgroundInput.addEventListener('change',async()=>{if(backgroundInput.files?.[0])await loadPhoto(backgroundInput.files[0],true);backgroundInput.value='';});
  fileInput.addEventListener('change',async()=>{if(fileInput.files?.[0])await loadPhoto(fileInput.files[0],false);fileInput.value='';});
  q('#pnBackgroundEnabled').addEventListener('change',ev=>{pendingEnabled=ev.target.checked;refreshDirty();render();});
  q('#pnPrev').addEventListener('click',()=>{if(activePage>0){activePage--;selectDrag=null;render();}});
  q('#pnNext').addEventListener('click',()=>{if(activePage<pages.length-1){activePage++;selectDrag=null;render();}});
  q('#pnAdd').addEventListener('click',()=>{if(pages.length>=MAX_PAGES)return;recordHistory();pages.splice(activePage+1,0,newPage());activePage++;refreshDirty();render();});
  q('#pnDelete').addEventListener('click',()=>{
    if(pages.length<=1)return;
    if(!confirm('현재 페이지를 삭제하시겠습니까? (저장 전까지는 실행 취소 가능)'))return;
    recordHistory();pages.splice(activePage,1);activePage=Math.min(activePage,pages.length-1);refreshDirty();render();
  });
  q('#pnTools').addEventListener('click',ev=>{const tool=ev.target.closest('[data-pn-tool]');if(tool)chooseTool(tool.dataset.pnTool);});
  q('#pnToggleTools').addEventListener('click',()=>{const t=q('#pnTools');t.hidden=!t.hidden;q('#pnToggleTools').textContent=t.hidden?'도구 펼치기 ▼':'도구 접기 ▲';});
  q('#pnUndo').addEventListener('click',undoAction);q('#pnRedo').addEventListener('click',redoAction);
  q('#pnResizeImage').addEventListener('click',()=>{
    if(!selectDrag||selectDrag.index<0||page().objects[selectDrag.index]?.type!=='image'){alert('먼저 선택(↖) 도구로 사진을 선택하세요.');return;}
    const obj=page().objects[selectDrag.index];const pct=prompt('사진 너비 (%): 10~95',Math.round(obj.w*100));
    if(pct==null)return;const next=Number(pct);
    if(!Number.isFinite(next)||next<10||next>95){alert('10~95 사이 숫자를 입력하세요.');return;}
    recordHistory();const ratio=obj.h/obj.w;obj.w=next/100;obj.h=clamp(obj.w*ratio,.03,.95);refreshDirty();render();
  });
  q('#pnExport').addEventListener('click',()=>{
    const out=document.createElement('canvas');out.width=PAPER_WIDTH;out.height=PAPER_HEIGHT;
    renderTo(out.getContext('2d'),page().objects,pendingBackground,pendingEnabled);
    const link=document.createElement('a');link.href=out.toDataURL('image/png');link.download='personal-note-'+current.topicId+'-'+(activePage+1)+'.png';link.click();
  });
  q('#pnCancel').addEventListener('click',cancel);
  q('#pnSave').addEventListener('click',save);
  canvas.addEventListener('pointerdown',onPointerDown);
  canvas.addEventListener('pointermove',onPointerMove);
  canvas.addEventListener('pointerup',onPointerUp);
  canvas.addEventListener('pointercancel',onPointerUp);
  window.addEventListener('keydown',handleKeys,true);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(isOpen())render();}).observe(q('#pnStage'));
}
function close() {
  if(!popup)return;
  popup.hidden=true;canvas=null;popup.remove();popup=null;current=null;
  history=[];redo=[];stroke=null;selectDrag=null;imageCache.clear();
  if(lastFocus?.isConnected)lastFocus.focus();
}
function cancel() {
  if(saving)return;
  if(dirty&&!confirm('저장하지 않은 개인 노트 변경 사항이 있습니다. 저장하지 않고 닫으시겠습니까?'))return;
  close();
}
function validatePage(record) {
  if(!record||typeof record!=='object'||!Array.isArray(record.objects))return newPage();
  const safe=record.objects.filter(o=>o&&typeof o==='object'&&['stroke','shape','text','image'].includes(o.type));
  return {id:String(record.id||id()),objects:safe};
}
async function open(topicId,topicName) {
  if(isOpen())return;
  if(!topicId){alert('먼저 토픽을 선택하세요.');return;}
  try {
    lastFocus=document.activeElement;
    const [stored,global]=await Promise.all([dbRead(PAPER_STORE,topicId),dbRead(SETTINGS_STORE,'global')]);
    pages=(Array.isArray(stored?.pages)&&stored.pages.length?stored.pages:[newPage()]).slice(0,MAX_PAGES).map(validatePage);
    activePage=0;current={topicId,topicName:String(topicName||topicId)};
    pendingBackground=global?.background||null;
    savedBackground=pendingBackground;
    pendingEnabled=global?.enabled!==false;
    savedEnabled=pendingEnabled;
    dirty=false;history=[];redo=[];saving=false;currentTool='pen';
    createUi();q('#pnTopic').textContent=current.topicName+' · 개인 노트';
    popup.hidden=false;q('#pnCancel').focus();
    setStatus(stored?'저장된 노트 불러옴 · 로컬 저장':'새 개인 노트 · 로컬 저장');
    render();
  }catch(error){if(isOpen())close();alert('개인 노트 열기 실패: '+(error.message||error));}
}
async function save() {
  if(saving||!current)return;
  saving=true;q('#pnSave').disabled=true;setStatus('저장 중...');
  try {
    await persistAll(current.topicId,clone(pages),{background:pendingBackground,enabled:pendingEnabled});
    dirty=false;savedBackground=pendingBackground;savedEnabled=pendingEnabled;
    setStatus('저장 완료 · 이 기기 브라우저');
  }catch(error){setStatus('저장 실패 · 다시 시도해 주세요');alert('개인 노트 저장 실패: '+(error.message||error));}
  finally{saving=false;if(isOpen())q('#pnSave').disabled=false;}
}
window.PEPersonalNote = {open, isOpen};
})();
