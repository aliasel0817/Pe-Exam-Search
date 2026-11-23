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
const PAPER_WIDTH = 794; // A4, 210 mm at 96 CSS pixels per inch
const PAPER_HEIGHT = 1123; // A4, 297 mm at 96 CSS pixels per inch
const LEGACY_PAPER_WIDTH = 900;
const DEFAULT_BACKGROUND = './assets/personal-note-answer-sheet-a4.svg';
const MIN_ZOOM = 25;
const MAX_ZOOM = 300;
const ZOOM_STEP = 25;
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
let zoomPercent = 100;
let panDrag = null;
let currentTool = 'pen';
let stroke = null;
let selectDrag = null;
let selectedObjectIndex = -1;
let stageObserver = null;
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
let opening = false;
let cloudMeta = {};
let editSerial = 0;
let cloudCapability = false;

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
function persistAll(topicId, rows, config, meta = {}) {
  return openDb().then(db => new Promise((resolve,reject)=>{
    const tx = db.transaction([PAPER_STORE,SETTINGS_STORE],'readwrite');
    tx.objectStore(PAPER_STORE).put({topicId,version:1,pages:rows,cloudMeta:meta,updatedAt:new Date().toISOString()});
    tx.objectStore(SETTINGS_STORE).put({key:'global',version:1,background:config.background,enabled:config.enabled,cloudMeta:meta,updatedAt:new Date().toISOString()});
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
function refreshDirty() { dirty=true; editSerial++; setStatus('저장하지 않은 변경 사항'); updateUi(); }
function recordHistory() {
  history.push(clone(pages)); if(history.length>40) history.shift();
  redo.length=0;
}
function undoAction() {
  if(!history.length)return;
  redo.push(clone(pages));pages=history.pop();
  activePage=clamp(activePage,0,pages.length-1);
  selectedObjectIndex=-1;refreshDirty();render();
}
function redoAction() {
  if(!redo.length)return;
  history.push(clone(pages));pages=redo.pop();
  activePage=clamp(activePage,0,pages.length-1);
  selectedObjectIndex=-1;refreshDirty();render();
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
function drawBackgroundContain(src,W,H,target) {
  let img=imageCache.get(src);
  if(!img){
    img=new Image();imageCache.set(src,img);
    img.onload=()=>{if(isOpen())render();};
    img.onerror=()=>imageCache.delete(src);
    img.src=src;
  }
  if(!img.complete || !img.naturalWidth || !img.naturalHeight)return;
  const factor=Math.min(W/img.naturalWidth,H/img.naturalHeight);
  const w=img.naturalWidth*factor,h=img.naturalHeight*factor;
  target.drawImage(img,(W-w)/2,(H-h)/2,w,h);
}
function renderTo(target, items, background, enabled) {
  const W=target.canvas.width,H=target.canvas.height;
  target.save();
  target.fillStyle='#fff';
  target.fillRect(0,0,W,H);
  if(enabled && background)drawBackgroundContain(background,W,H,target);
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
  const displayWidth=Math.round(PAPER_WIDTH*zoomPercent/100);
  const paper=q('#pnPaper');
  paper.style.width=displayWidth+'px';
  canvas.style.width='100%';
  canvas.width=PAPER_WIDTH;canvas.height=PAPER_HEIGHT;
  ctx=canvas.getContext('2d');
  renderTo(ctx,page().objects,pendingBackground,pendingEnabled);
  if(selectedObjectIndex>=0) {
    const obj=page().objects[selectedObjectIndex],b=obj&&getObjectBounds(obj);
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
  q('#pnZoomLabel').textContent=zoomPercent+'%';
  q('#pnCloudRestore').disabled = !cloudCapability;
  q('#pnBackgroundEnabled').disabled=false;
  popup.querySelectorAll('[data-pn-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pnTool===currentTool)));
  canvas.dataset.tool=currentTool;
}
function setZoom(next) {
  const stage=q('#pnStage');
  const oldWidth=PAPER_WIDTH*zoomPercent/100;
  const centerX=stage.scrollLeft+stage.clientWidth/2;
  const centerY=stage.scrollTop+stage.clientHeight/2;
  const nx=centerX/oldWidth,ny=centerY/(oldWidth*PAPER_HEIGHT/PAPER_WIDTH);
  zoomPercent=clamp(Math.round(Number(next)/ZOOM_STEP)*ZOOM_STEP,MIN_ZOOM,MAX_ZOOM);
  render();
  const newWidth=PAPER_WIDTH*zoomPercent/100;
  stage.scrollLeft=Math.max(0,nx*newWidth-stage.clientWidth/2);
  stage.scrollTop=Math.max(0,ny*newWidth*PAPER_HEIGHT/PAPER_WIDTH-stage.clientHeight/2);
}
function chooseTool(tool) {
  if(!tools.includes(tool))return;
  currentTool=tool;selectDrag=null;panDrag=null;
  if(tool!=='select')selectedObjectIndex=-1;
  render();
}
function onPointerDown(ev) {
  if(saving)return;
  if(ev.pointerType==='mouse'&&ev.button!==0)return;
  if(ev.pointerType==='touch'&&ev.isPrimary===false)return;
  if(currentTool==='pan'){
    ev.preventDefault();
    const stage=q('#pnStage');
    panDrag={pointerId:ev.pointerId,x:ev.clientX,y:ev.clientY,left:stage.scrollLeft,top:stage.scrollTop};
    try{canvas.setPointerCapture(ev.pointerId);}catch(_){}
    return;
  }
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
    selectedObjectIndex=i;
    selectDrag=i<0?null:{index:i,pointerId:ev.pointerId,from:p,initial:clone(page().objects[i]),changed:false,kind:'move'};
    if(selectDrag)try{canvas.setPointerCapture(ev.pointerId);}catch(_){}
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
  if(saving)return;
  if(panDrag && panDrag.pointerId===ev.pointerId){
    ev.preventDefault();
    const stage=q('#pnStage');
    stage.scrollLeft=panDrag.left+panDrag.x-ev.clientX;
    stage.scrollTop=panDrag.top+panDrag.y-ev.clientY;
    return;
  }
  const p=pointerPoint(ev);if(!p)return;
  if(stroke&&stroke.pointerId===ev.pointerId) {
    ev.preventDefault();
    if(stroke.obj.type==='stroke')stroke.obj.points.push(p);else stroke.obj.end=p;
    render();return;
  }
  if(selectDrag && selectDrag.pointerId===ev.pointerId) {
    ev.preventDefault();
    const dx=p.x-selectDrag.from.x,dy=p.y-selectDrag.from.y;
    const obj=page().objects[selectDrag.index];
    if(!obj)return;
    if(!selectDrag.changed){recordHistory();selectDrag.changed=true;}
    const initial=clone(selectDrag.initial);
    if(initial.type==='image') {
      initial.x=clamp(initial.x+dx,0,Math.max(0,1-initial.w));
      initial.y=clamp(initial.y+dy,0,Math.max(0,1-initial.h));
    }
    if(initial.type==='text') {initial.x=clamp(initial.x+dx,0,1);initial.y=clamp(initial.y+dy,0,1);}
    if(initial.type==='shape') {for(const k of ['start','end']) {initial[k].x=clamp(initial[k].x+dx,0,1);initial[k].y=clamp(initial[k].y+dy,0,1);}}
    if(initial.type==='stroke')initial.points.forEach(pt=>{pt.x=clamp(pt.x+dx,0,1);pt.y=clamp(pt.y+dy,0,1);});
    page().objects[selectDrag.index]=initial;render();
  }
}
function onPointerUp(ev) {
  if(panDrag&&panDrag.pointerId===ev.pointerId)panDrag=null;
  if(stroke&&stroke.pointerId===ev.pointerId){stroke=null;refreshDirty();render();}
  if(selectDrag&&selectDrag.pointerId===ev.pointerId){if(selectDrag.changed)refreshDirty();selectDrag=null;render();}
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
    if(!isOpen()||!current||saving)return;
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
      <div class="personal-note-zoom" role="group" aria-label="A4 페이지 배율">
        <button type="button" id="pnZoomOut" aria-label="축소" title="축소">−</button>
        <span id="pnZoomLabel" aria-live="polite">100%</span>
        <button type="button" id="pnZoomIn" aria-label="확대" title="확대">＋</button>
        <button type="button" id="pnZoomReset" title="100%로 복원">100%</button>
      </div>
    </div>
    <div class="personal-note-stage" id="pnStage" tabindex="0" aria-label="A4 개인 노트 화면, 스크롤로 이동">
      <div class="personal-note-paper" id="pnPaper"><canvas id="pnCanvas" width="794" height="1123" aria-label="A4 개인 노트 그림판"></canvas></div>
    </div>
    <div class="personal-note-toolbar-head"><button type="button" id="pnToggleTools">도구 접기 ▼</button><span class="personal-note-toolbar-status">선택 도구로 개별 객체를 이동할 수 있습니다.</span></div>
    <div class="personal-note-toolbar" id="pnTools" role="toolbar" aria-label="그림판 도구">
      <button type="button" data-pn-tool="pen" aria-pressed="true" title="펜">✏</button>
      <button type="button" data-pn-tool="highlighter" aria-pressed="false" title="형광펜">🖍</button>
      <button type="button" data-pn-tool="line" aria-pressed="false" title="직선">／</button>
      <button type="button" data-pn-tool="arrow" aria-pressed="false" title="화살표">➜</button>
      <button type="button" data-pn-tool="rect" aria-pressed="false" title="사각형">□</button>
      <button type="button" data-pn-tool="ellipse" aria-pressed="false" title="타원">○</button>
      <button type="button" data-pn-tool="text" aria-pressed="false" title="글자">T</button>
      <button type="button" data-pn-tool="image" aria-pressed="false" title="사진 첨부·붙여넣기">▣</button>
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
      <button type="button" id="pnBackup" title="편집 가능한 전체 노트와 배경 JSON 백업">JSON 백업</button>
      <button type="button" id="pnImport" title="JSON 백업 파일 불러오기">JSON 복원</button>
      <button type="button" id="pnCloudRestore" title="인증된 개인 노트 서버가 활성화된 경우에만 사용 가능" disabled>서버 복원</button>
      <button type="button" id="pnCancel">취소</button>
      <button type="button" id="pnSave">저장</button>
    </footer>
    <div class="personal-note-hint">현재 개인 노트는 이 기기의 브라우저에 저장됩니다. 다른 기기와 자동 공유되지 않으므로 중요한 노트는 JSON 백업을 보관하세요. 서버 동기화는 운영 서버에서 지원할 때만 활성화됩니다.</div>
    <input type="file" class="personal-note-file-input" id="pnBackgroundFile" accept="image/png,image/jpeg,image/webp">
    <input type="file" class="personal-note-file-input" id="pnImageFile" accept="image/png,image/jpeg,image/webp">
    <input type="file" class="personal-note-file-input" id="pnBackupFile" accept="application/json,.json">
  </section>`;
  document.body.appendChild(layer);
  popup=layer;canvas=q('#pnCanvas');ctx=canvas.getContext('2d');
  backgroundInput=q('#pnBackgroundFile');fileInput=q('#pnImageFile');
  layer.addEventListener('pointerdown',ev=>{if(ev.target===layer){ev.preventDefault();}});
  q('#pnBackgroundButton').addEventListener('click',()=>backgroundInput.click());
  backgroundInput.addEventListener('change',async()=>{if(backgroundInput.files?.[0])await loadPhoto(backgroundInput.files[0],true);backgroundInput.value='';});
  fileInput.addEventListener('change',async()=>{if(fileInput.files?.[0])await loadPhoto(fileInput.files[0],false);fileInput.value='';});
  q('#pnBackgroundEnabled').addEventListener('change',ev=>{pendingEnabled=ev.target.checked;refreshDirty();render();});
  q('#pnPrev').addEventListener('click',()=>{if(activePage>0){activePage--;selectDrag=null;selectedObjectIndex=-1;render();}});
  q('#pnNext').addEventListener('click',()=>{if(activePage<pages.length-1){activePage++;selectDrag=null;selectedObjectIndex=-1;render();}});
  q('#pnAdd').addEventListener('click',()=>{if(pages.length>=MAX_PAGES)return;recordHistory();pages.splice(activePage+1,0,newPage());activePage++;selectedObjectIndex=-1;refreshDirty();render();});
  q('#pnDelete').addEventListener('click',()=>{
    if(pages.length<=1)return;
    if(!confirm('현재 페이지를 삭제하시겠습니까? (저장 전까지는 실행 취소 가능)'))return;
    recordHistory();pages.splice(activePage,1);activePage=Math.min(activePage,pages.length-1);selectedObjectIndex=-1;refreshDirty();render();
  });
  q('#pnTools').addEventListener('click',ev=>{const tool=ev.target.closest('[data-pn-tool]');if(tool)chooseTool(tool.dataset.pnTool);});
  q('#pnToggleTools').addEventListener('click',()=>{const t=q('#pnTools');t.hidden=!t.hidden;q('#pnToggleTools').textContent=t.hidden?'도구 펼치기 ▲':'도구 접기 ▼';});
  q('#pnZoomOut').addEventListener('click',()=>setZoom(zoomPercent-ZOOM_STEP));
  q('#pnZoomIn').addEventListener('click',()=>setZoom(zoomPercent+ZOOM_STEP));
  q('#pnZoomReset').addEventListener('click',()=>setZoom(100));
  q('#pnUndo').addEventListener('click',undoAction);q('#pnRedo').addEventListener('click',redoAction);
  q('#pnResizeImage').addEventListener('click',()=>{
    if(selectedObjectIndex<0||page().objects[selectedObjectIndex]?.type!=='image'){alert('먼저 선택(↖) 도구로 사진을 선택하세요.');return;}
    const obj=page().objects[selectedObjectIndex];const pct=prompt('사진 너비 (%): 10~95',Math.round(obj.w*100));
    if(pct==null)return;const next=Number(pct);
    if(!Number.isFinite(next)||next<10||next>95){alert('10~95 사이 숫자를 입력하세요.');return;}
    recordHistory();const ratio=obj.h/obj.w;obj.w=next/100;obj.h=clamp(obj.w*ratio,.03,.95);
    obj.x=clamp(obj.x,0,Math.max(0,1-obj.w));obj.y=clamp(obj.y,0,Math.max(0,1-obj.h));
    refreshDirty();render();
  });
  q('#pnExport').addEventListener('click',()=>{
    const out=document.createElement('canvas');out.width=PAPER_WIDTH;out.height=PAPER_HEIGHT;
    renderTo(out.getContext('2d'),page().objects,pendingBackground,pendingEnabled);
    const link=document.createElement('a');link.href=out.toDataURL('image/png');link.download='personal-note-'+current.topicId+'-'+(activePage+1)+'.png';link.click();
  });
  q('#pnBackup').addEventListener('click',exportBackup);
  q('#pnImport').addEventListener('click',()=>q('#pnBackupFile').click());
  q('#pnBackupFile').addEventListener('change',async ev=>{const file=ev.target.files?.[0];if(file)await importBackup(file);ev.target.value='';});
  q('#pnCloudRestore').addEventListener('click',restoreFromCloud);
  q('#pnCancel').addEventListener('click',cancel);
  q('#pnSave').addEventListener('click',save);
  canvas.addEventListener('pointerdown',onPointerDown);
  canvas.addEventListener('pointermove',onPointerMove);
  canvas.addEventListener('pointerup',onPointerUp);
  canvas.addEventListener('pointercancel',onPointerUp);
  window.addEventListener('keydown',handleKeys,true);
  layer.addEventListener('paste',ev=>{
    if(!isOpen()||ev.target.closest('input,textarea,[contenteditable]'))return;
    const item=[...(ev.clipboardData?.items||[])].find(x=>ALLOWED_TYPES.has(x.type));
    if(!item)return;
    const file=item.getAsFile();if(!file)return;
    ev.preventDefault();loadPhoto(file,false);
  });
  if(typeof ResizeObserver!=='undefined'){stageObserver=new ResizeObserver(()=>{if(isOpen())render();});stageObserver.observe(q('#pnStage'));}
}
function close() {
  if(!popup)return;
  popup.hidden=true;stageObserver?.disconnect();stageObserver=null;window.removeEventListener('keydown',handleKeys,true);canvas=null;popup.remove();popup=null;current=null;
  history=[];redo=[];stroke=null;panDrag=null;selectDrag=null;selectedObjectIndex=-1;cloudMeta={};cloudCapability=false;imageCache.clear();
  if(lastFocus?.isConnected)lastFocus.focus();
}
function cancel() {
  if(saving)return;
  if(dirty&&!confirm('저장하지 않은 개인 노트 변경 사항이 있습니다. 저장하지 않고 닫으시겠습니까?'))return;
  close();
}
function validUnit(value) { return Number.isFinite(value) && value>=0 && value<=1; }
function validateBackgroundAsset(value) {
  if(value==null || value==='')return null;
  const pattern=new RegExp('^data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$');
  if(value===DEFAULT_BACKGROUND)return value;
  if(typeof value!=='string' || value.length>9*1024*1024 || !pattern.test(value))
    throw new Error('이미지 데이터 형식이 유효하지 않습니다. 원본을 덮어쓰지 않습니다.');
  return value;
}
function validatePage(record) {
  if(!record||typeof record!=='object'||!/^[A-Za-z0-9_-]{1,80}$/.test(String(record.id||''))
    ||!Array.isArray(record.objects)||record.objects.length>5000)
    throw new Error('저장된 개인 노트 페이지 스키마가 올바르지 않습니다.');
  for(const obj of record.objects) {
    if(!obj||typeof obj!=='object'||typeof obj.id!=='string')throw new Error('개인 노트 객체 ID 오류');
    if(obj.type==='stroke') {
      if(!Array.isArray(obj.points)||obj.points.length<1||obj.points.length>50000
        ||obj.points.some(p=>!validUnit(p.x)||!validUnit(p.y)))throw new Error('개인 노트 필기 좌표 오류');
    } else if(obj.type==='shape') {
      if(!['line','arrow','rect','ellipse'].includes(obj.shape)||!obj.start||!obj.end
        ||!validUnit(obj.start.x)||!validUnit(obj.start.y)
        ||!validUnit(obj.end.x)||!validUnit(obj.end.y))throw new Error('개인 노트 도형 좌표 오류');
    } else if(obj.type==='text') {
      if(typeof obj.text!=='string'||obj.text.length>2000
        ||!validUnit(obj.x)||!validUnit(obj.y)
        ||!Number.isFinite(obj.size)||obj.size<1||obj.size>200)throw new Error('개인 노트 글자 객체 오류');
    } else if(obj.type==='image') {
      validateBackgroundAsset(obj.src);
      if(!validUnit(obj.x)||!validUnit(obj.y)||!validUnit(obj.w)||!validUnit(obj.h)
        ||obj.w<=0||obj.h<=0)throw new Error('개인 노트 사진 위치 오류');
    } else throw new Error('지원하지 않는 개인 노트 객체 형식');
  }
  return {id:String(record.id),objects:clone(record.objects)};
}
async function open(topicId,topicName) {
  if(isOpen()||opening)return;
  if(!topicId){alert('먼저 토픽을 선택하세요.');return;}
  opening=true;
  try {
    lastFocus=document.activeElement;
    const [stored,global]=await Promise.all([dbRead(PAPER_STORE,topicId),dbRead(SETTINGS_STORE,'global')]);
    pages=(Array.isArray(stored?.pages)&&stored.pages.length?stored.pages:[newPage()]).slice(0,MAX_PAGES).map(validatePage);
    activePage=0;current={topicId,topicName:String(topicName||topicId)};
    pendingBackground=global?.background||DEFAULT_BACKGROUND;
    cloudMeta={...(stored?.cloudMeta||{}),...(global?.cloudMeta||{})};
    savedBackground=pendingBackground;
    pendingEnabled=global?.enabled!==false;
    savedEnabled=pendingEnabled;
    dirty=false;editSerial=0;history=[];redo=[];saving=false;cloudCapability=false;currentTool='pen';selectedObjectIndex=-1;zoomPercent=100;panDrag=null;
    createUi();q('#pnTopic').textContent=current.topicName+' · 개인 노트';
    popup.hidden=false;q('#pnCancel').focus();
    setStatus(stored?'저장된 노트 불러옴 · 로컬 저장':'새 개인 노트 · 로컬 저장');
    render();
    void refreshFromCloud(topicId,stored,global);
  }catch(error){if(isOpen())close();alert('개인 노트 열기 실패: '+(error.message||error));}
  finally{opening=false;}
}
function exportBackup() {
  if(!current)return;
  try {
    const payload={schemaVersion:1,kind:'personal-note-backup',topicId:current.topicId,
      topicName:current.topicName,exportedAt:new Date().toISOString(),
      pages:clone(pages),background:pendingBackground,enabled:pendingEnabled};
    const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='personal-note-'+current.topicId+'-backup.json';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
    setStatus('개인 노트 JSON 백업 다운로드 요청됨 · 실제 파일 저장 여부를 확인하세요');
  }catch(error){alert('개인 노트 백업 실패: '+(error.message||error));}
}

async function importBackup(file) {
  if(!current||saving)return;
  try {
    if(file.size>25*1024*1024)throw new Error('JSON 백업 크기가 25MB를 초과합니다.');
    const data=JSON.parse(await file.text());
    if(data?.kind!=='personal-note-backup'||data.schemaVersion!==1
      ||data.topicId!==current.topicId||!Array.isArray(data.pages)
      ||data.pages.length<1||data.pages.length>MAX_PAGES)throw new Error('현재 토픽의 개인 노트 백업이 아닙니다.');
    const restored=data.pages.map(validatePage),background=validateBackgroundAsset(data.background);
    if(!isOpen()||saving)return;
    if(!confirm('현재 개인 노트 페이지를 JSON 백업 내용으로 교체할까요? 저장 전에는 취소할 수 있습니다.'))return;
    recordHistory();pages=restored;activePage=0;selectedObjectIndex=-1;
    pendingBackground=background;pendingEnabled=data.enabled!==false;
    refreshDirty();render();setStatus('백업을 편집기에 불러왔습니다 · 저장을 눌러 확정하세요');
  }catch(error){alert('JSON 백업 복원 실패: '+(error.message||error));}
}
async function restoreFromCloud() {
  if(!current||saving)return;
  const cloud=window.PEPersonalNoteCloud;
  if(!cloud||!await cloud.available()){alert('현재 ACTIVE 인증 또는 개인 노트 서버 연결이 준비되지 않았습니다.');return;}
  if(!confirm('서버 노트로 복원하기 전에 현재 개인 노트의 JSON 백업을 다운로드하시겠습니까?'))return;
  exportBackup();
  if(!confirm('백업 JSON 파일이 기기에 실제로 저장됐는지 확인해 주세요. 계속하면 현재 노트가 서버 저장본으로 대체됩니다.'))return;
  const topicId=current.topicId,controls=[...popup.querySelectorAll('button,input,select')];
  saving=true;controls.forEach(el=>el.disabled=true);setStatus('서버 저장본 확인 중...');
  try {
    const localPaper={topicId,pages:clone(pages)};
    const localGlobal={background:pendingBackground,enabled:pendingEnabled};
    const result=await cloud.pull(topicId,localPaper,localGlobal,cloudMeta,true);
    if(!result.available||!result.hasRemoteIndex)throw new Error('서버에 이 토픽의 개인 노트가 없습니다.');
    if(!isOpen()||current?.topicId!==topicId)throw new Error('개인 노트 화면이 변경되었습니다.');
    const nextPages=result.pages.map(validatePage);
    if(!nextPages.length)throw new Error('서버 페이지가 비어 있습니다.');
    const bg=result.hasRemoteGlobal?validateBackgroundAsset(result.background):pendingBackground;
    const en=result.hasRemoteGlobal?result.enabled:pendingEnabled;
    await persistAll(topicId,clone(nextPages),{background:bg,enabled:en},result.meta);
    pages=nextPages;activePage=0;selectedObjectIndex=-1;pendingBackground=bg;pendingEnabled=en;
    savedBackground=bg;savedEnabled=en;cloudMeta=result.meta;dirty=false;
    render();setStatus('서버 저장본 복원 및 로컬 저장 완료');
  }catch(error){setStatus('서버 복원 실패 · 기존 로컬 노트 유지');alert('서버 복원 실패: '+(error.message||error));}
  finally{saving=false;if(isOpen()){controls.forEach(el=>el.disabled=false);updateUi();}}
}

async function refreshFromCloud(topicId,stored,global) {
  const cloud=window.PEPersonalNoteCloud;
  if(!cloud)return;
  const canApply=()=>isOpen()&&current?.topicId===topicId&&!dirty&&!saving;
  try {
    const result=await cloud.pull(topicId,stored,global,cloudMeta);
    if(!canApply())return;
    if(!result.available){setStatus('로컬 노트 · 서버 동기화 미활성/오프라인');return;}
    cloudCapability=true;updateUi();
    if(result.conflict){setStatus('⚠ '+result.reason+' JSON 백업 후 확인 필요');return;}
    if(!result.hasRemoteIndex&&!result.hasRemoteGlobal){
      setStatus('서버에 개인 노트 없음 · 저장하면 서버로 전송');return;
    }
    const nextPages=result.hasRemoteIndex?result.pages.map(validatePage):clone(pages);
    if(!nextPages.length)nextPages.push(newPage());
    const nextBackground=result.hasRemoteGlobal?validateBackgroundAsset(result.background):pendingBackground;
    const nextEnabled=result.hasRemoteGlobal?result.enabled:pendingEnabled;
    const nextMeta=result.meta||{};
    // Never replace in-memory edits made while awaiting network reads.
    if(!canApply())return;
    await persistAll(topicId,clone(nextPages),{background:nextBackground,enabled:nextEnabled},nextMeta);
    if(!canApply())return;
    pages=nextPages;activePage=0;selectedObjectIndex=-1;
    pendingBackground=nextBackground;savedBackground=nextBackground;
    pendingEnabled=nextEnabled;savedEnabled=nextEnabled;cloudMeta=nextMeta;
    render();
    setStatus('서버 개인 노트 확인·복원 완료 · 이 기기 로컬에도 저장됨');
  }catch(error){if(canApply())setStatus('로컬 노트 유지 · 서버 조회 오류: '+(error.message||error));}
}
async function save() {
  if(saving||!current)return;
  const topicId=current.topicId,rows=clone(pages),background=pendingBackground,enabled=pendingEnabled;
  const config={background,enabled};
  const serial=editSerial,controls=[...popup.querySelectorAll('button,input,select')];
  saving=true;controls.forEach(el=>el.disabled=true);setStatus('로컬 저장 중...');
  try {
    await persistAll(topicId,rows,config,cloudMeta);
    if(serial===editSerial)dirty=false;
    savedBackground=background;savedEnabled=enabled;
    setStatus('로컬 저장 완료 · 서버 저장 여부 확인 중...');
    const cloud=window.PEPersonalNoteCloud;
    if(!cloud){setStatus('로컬 저장 완료 · 서버 동기화 모듈 없음');return;}
    try {
      const result=await cloud.push(topicId,rows,background,enabled,cloudMeta,async (next)=>{
        cloudMeta={...next};
        await persistAll(topicId,rows,config,cloudMeta);
      });
      if(result.available){
        cloudCapability=true;
        cloudMeta={...result.meta};
        await persistAll(topicId,rows,config,cloudMeta);
        setStatus('로컬 및 서버 저장 완료 · 검증된 동기화 응답');
      }else{
        setStatus('로컬 저장 완료 · 서버 동기화 미지원/오프라인 (추후 재저장 필요)');
      }
    }catch(error){
      setStatus('⚠ 로컬 저장 완료 · 서버 동기화 실패: '+(error.message||error));
      if(error.conflict)alert('다른 기기의 변경 내용과 충돌하여 서버를 덮어쓰지 않았습니다. 로컬 데이터는 유지됩니다. JSON 백업 후 동기화를 확인해 주세요.');
    }
  }catch(error){
    setStatus('저장 실패 · 로컬 내용은 편집기에 유지됨');
    alert('개인 노트 로컬 저장 실패: '+(error.message||error));
  }finally{
    saving=false;
    if(isOpen()){controls.forEach(el=>el.disabled=false);updateUi();}
  }
}
window.PEPersonalNote = {open, isOpen};
})();
