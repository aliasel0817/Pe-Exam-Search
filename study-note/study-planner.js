/* Isolated study plan controller. Does not mutate MASTER or legacy learning records. */
(() => {
'use strict';
const DB='pe-study-planner-v1', PLAN='plans', PROGRESS='progress', PREF='peStudyPlanner.active.v1';
let db, loading=null, plans=[], active='', dayKey='', filter='all', group='all', search='', loaded=false, context=null;
// v2 defaults existing installations to 10 instead of keeping the old 20-topic preference.
const PAGE_SIZE_KEY='peStudyPlanner.pageSize.v2', PAGE_SIZES=[10,20,30,50];
let page=1, pageSize=Number(localStorage.getItem(PAGE_SIZE_KEY))||10;
if(!PAGE_SIZES.includes(pageSize))pageSize=10;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const openDb=()=>new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{let d=r.result;d.createObjectStore(PLAN,{keyPath:'id'});d.createObjectStore(PROGRESS,{keyPath:'key'});};r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result)});
function all(store){return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function put(store,object){return new Promise((resolve,reject)=>{const r=db.transaction(store,'readwrite').objectStore(store).put(object);r.onsuccess=resolve;r.onerror=()=>reject(r.error)})}
function normalise(item){
 const raw=(item.plans||[item])[0]; const p=item.meta&&item.days?{id:'pe141-100d-2026',name:item.meta.plan||'제141회 정보관리기술사 100일 5회독',start:item.meta.start,end:item.meta.end,groups:item.groups||{},days:item.days.map(d=>({date:d.date,round:d.round,ids:d.topics.map(t=>t.id),groups:d.topics.map(t=>t.group)}))}:raw; const days=p?.days;
 if(!p?.id||!Array.isArray(days)||!days.length)throw Error('계획 ID 또는 일별 데이터가 없습니다.');
 const dates=new Set(),slots=new Set();
 let entries=0;
 for(const d of days){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||dates.has(d.date))throw Error('날짜 형식 또는 중복 날짜 오류: '+d.date);
  dates.add(d.date);
  if(!Array.isArray(d.ids)||!Array.isArray(d.groups)||d.ids.length!==d.groups.length)throw Error('토픽/그룹 수량 불일치: '+d.date);
  for(const id of d.ids){if(!/^T\d{4}$/.test(id))throw Error('통합ID 오류: '+id);const k=d.date+':'+id;if(slots.has(k))throw Error('같은 날 중복 토픽: '+k);slots.add(k);}
  entries+=d.ids.length;
 }
 return {...p,name:p.name||p.id,days,entries};
}
function initUi(){
 const tabs=document.querySelector('.learning-view-tabs');
 if(!tabs||tabs.querySelector('[data-learning-view="plan"]'))return;
 const t=document.createElement('button');t.className='btn';t.type='button';t.dataset.learningView='plan';t.textContent='오늘의 학습 · 계획';tabs.insertBefore(t,tabs.firstChild);
 const old=tabs.querySelector('[data-learning-view="today"]');if(old)old.textContent='오늘 학습한 기록';
 t.addEventListener('click',()=>{learningView='plan';learningPage=1;renderLearningDashboard()});
 const pane=document.createElement('section');pane.id='studyPlannerPanel';pane.className='hidden';pane.innerHTML=`
 <div class="planner-toolbar"><select id="plannerSelect" aria-label="학습계획 선택"></select><input id="plannerDate" type="date" aria-label="학습일 선택"><button type="button" id="plannerToday" class="btn">오늘</button><button type="button" id="plannerManage" class="btn" title="새 계획 등록, 작성 양식 다운로드, 회독별 진도 백업 및 복원" aria-controls="plannerManagement" aria-expanded="false">계획 추가 · 진도 관리</button></div>
 <div id="plannerStats" class="planner-stats"></div>
 <details id="plannerManagement" class="planner-manager">
  <summary>학습계획 추가 · 진도 백업/복원 사용 안내</summary>
  <p class="planner-local-info">학습계획별 진도는 현재 기기에만 저장되며 기기 간 자동 동기화되지 않습니다. 기기를 변경하거나 브라우저 데이터를 삭제하기 전에는 아래에서 진도를 백업하세요.</p>
  <p class="planner-help">위의 <strong>계획 추가 · 진도 관리</strong> 버튼을 누르면 이 영역이 열리거나 닫힙니다. 여기서는 <strong>새 계획 등록</strong>과 <strong>회독별 진도 파일 백업/복원</strong>을 할 수 있습니다. 학습노트 MASTER 내용은 수정하지 않습니다.</p>
  <section class="planner-manage-section" aria-labelledby="plannerImportTitle">
    <h4 id="plannerImportTitle">① 새 학습계획 등록</h4>
    <p>먼저 아래의 <strong>CSV 작성 예제</strong>를 내려받으세요. Excel에서 행을 추가·수정하고 <strong>CSV UTF-8(.csv)</strong>로 저장한 후, 바로 아래의 <strong>학습계획 파일 선택</strong>으로 등록합니다. JSON 예제도 사용할 수 있습니다.</p>
    <div class="planner-manager-actions"><button type="button" id="plannerCsvSample" class="btn">CSV 작성 예제 다운로드</button><button type="button" id="plannerJsonSample" class="btn">JSON 예제 다운로드</button></div>
    <details class="planner-format-guide"><summary>작성 항목 · 입력 예시 자세히 보기</summary>
      <div class="planner-fields">
        <p><strong>planId</strong>: 영문·숫자·-·_로 만든 계획 고유 ID. 예: my-review-v1 (계획 수정본은 v2처럼 새 ID)</p>
        <p><strong>planName</strong>: 학습계획의 표시 이름. 예: 주말 보충 학습</p>
        <p><strong>date</strong>: 학습 날짜 YYYY-MM-DD. 예: 2026-10-24</p>
        <p><strong>round</strong>: 회독 번호(1 이상의 정수). 예: 1</p>
        <p><strong>groupCode</strong>: 직접 정한 그룹 코드. 예: A, B, G16</p>
        <p><strong>groupName</strong>: 그룹 설명. 예: SW 개발, 보안</p>
        <p><strong>topicId</strong>: 기존 MASTER의 통합ID. 예: T0692 (하나의 행에 토픽 하나씩 입력)</p>
      </div>
      <p>CSV 첫 행의 열 이름을 수정하지 마세요. 같은 계획의 모든 행은 planId와 planName이 같아야 하며, 동일 날짜에 동일 통합ID를 중복 등록할 수 없습니다. PDF나 XLSX는 직접 등록할 수 없습니다.</p>
    </details>
    <label for="plannerUpload" class="planner-file-label">학습계획 파일 선택 — 새 계획 등록용 (.csv / .json)</label>
    <input id="plannerUpload" type="file" accept=".csv,text/csv,.json,application/json" aria-label="새 학습계획 CSV 또는 JSON 파일 선택">
    <p class="planner-help">선택한 파일을 검사한 후 새 계획으로 추가하고 곧바로 선택합니다. 같은 ID의 기존 계획은 덮어쓰지 않으므로, 변경한 계획은 새 planId로 등록하세요.</p>
  </section>
  <section class="planner-manage-section" aria-labelledby="plannerBackupTitle">
    <h4 id="plannerBackupTitle">② 진도 백업 — 이 기기의 학습 진행상태 저장</h4>
    <p>여기서 <strong>진도</strong>란 계획별·날짜별 토픽의 <strong>완료(기억함) / 다시보기</strong> 기록입니다. 아래 버튼을 누르면 이 기기의 진도를 JSON 파일로 저장합니다. 브라우저 데이터 초기화나 다른 기기 사용 전 보관하세요. 원본 MASTER나 Google Sheets 학습정보를 내려받는 기능은 아닙니다.</p>
    <div class="planner-manager-actions"><button id="plannerExport" class="btn" type="button">진도 기록 백업 JSON 다운로드</button></div>
  </section>
  <section class="planner-manage-section" aria-labelledby="plannerRestoreTitle">
    <h4 id="plannerRestoreTitle">③ 진도 복원 — 전에 백업한 기록 불러오기</h4>
    <p>②에서 내려받은 <strong>study-plan-progress-backup.json</strong> 파일을 선택하면 이 기기에 진도를 복원합니다. 같은 계획·날짜·토픽에 이미 기록이 있으면 확인 후 덮어쓰므로 주의하세요. 새로운 학습계획 등록 파일과는 다릅니다.</p>
    <label for="plannerRestore" class="planner-file-label">진도 백업 파일 선택 — 완료/다시보기 복원용 (.json)</label>
    <input id="plannerRestore" type="file" accept=".json,application/json" aria-label="기존 진도 백업 JSON 파일 선택하여 복원">
  </section>
  <p id="plannerNotice" class="planner-notice" role="status" aria-live="polite"></p>
</details>
 <div class="planner-toolbar"><input id="plannerSearch" type="search" placeholder="토픽명 또는 통합ID 검색" aria-label="계획 토픽 검색"><label for="plannerGroup" class="planner-control-label">학습 그룹</label><select id="plannerGroup" aria-label="오늘의 학습 그룹 선택"><option value="all">전체 그룹</option></select><select id="plannerFilter" aria-label="진도 필터"><option value="all">전체 상태</option><option value="todo">미완료</option><option value="done">완료</option><option value="miss">다시보기</option></select><label for="plannerPageSize" class="planner-size-label">페이지당</label><select id="plannerPageSize" aria-label="한 페이지에 표시할 토픽 수"><option value="10">10개</option><option value="20">20개</option><option value="30">30개</option><option value="50">50개</option></select></div>
 <div id="plannerGroups" class="planner-groups"></div>
 <nav id="plannerPager" class="learning-pager planner-pager hidden" aria-label="오늘의 학습 페이지 이동"><button id="plannerPrevPage" class="btn" type="button">← 이전</button><span class="pager-center"><input id="plannerPageInput" class="pager-page-input" type="number" min="1" value="1" inputmode="numeric" aria-label="오늘의 학습 현재 페이지"> / <span id="plannerTotalPages">1</span></span><button id="plannerNextPage" class="btn" type="button">다음 →</button><span id="plannerPageRange" class="pager-range" aria-live="polite">0건</span></nav>
`;
 document.querySelector('.learning-view-tabs').after(pane);
 const style=document.createElement('style');style.textContent=`
 #studyPlannerPanel{padding:12px 0}#studyPlannerPanel.hidden{display:none!important}.planner-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}.planner-toolbar input,.planner-toolbar select{font:inherit;min-height:36px;border:1px solid #dbe2ea;background:#fff;color:#172033;border-radius:8px;padding:6px 8px;max-width:100%}#plannerSelect,#plannerSearch{flex:1;min-width:175px}.planner-stats{background:#f1f5f9;padding:8px 10px;border-radius:8px;line-height:1.5;margin:8px 0;font-size:.8rem;color:#334155}.planner-group{border:1px solid #dbe2ea;border-radius:10px;margin:8px 0;overflow:hidden}.planner-group summary{cursor:pointer;padding:12px;background:#f8fafc;font-weight:600}.planner-topic{display:flex;width:100%;text-align:left;justify-content:space-between;gap:10px;padding:10px 12px;border:0;border-top:1px solid #e2e8f0;background:#fff;cursor:pointer;color:#172033}.planner-topic small{color:#64748b;display:block;margin-top:4px}.planner-local-info{font-size:.8rem;line-height:1.5;color:#64748b;margin:8px 2px}.planner-size-label{color:var(--muted);font-size:.78rem;white-space:nowrap}.planner-pager{margin-top:14px;margin-bottom:12px}.planner-pager .btn{min-width:74px}.planner-pager .pager-range{font-size:.75rem}.planner-manager{margin:8px 0;padding:7px 10px;background:#f8fafc;border-radius:9px}.planner-manager>summary{font-size:.75rem;line-height:1.35;font-weight:600;color:#475569;cursor:pointer}.planner-manager:not([open]){margin-bottom:8px}.planner-manager input{display:block;max-width:100%;margin:12px 0}.planner-topic:hover{background:#eff6ff}
 #plannerGroup{flex:1 1 185px;min-width:135px;max-width:365px}
 .planner-control-label{color:var(--muted);font-size:.8rem;white-space:nowrap}
 .planner-manage-section{margin:12px 0;padding:12px;border:1px solid #dbe2ea;border-radius:9px;background:#fff}
 .planner-manage-section h4{margin:0 0 8px;color:#152238;font-size:.92rem}
 .planner-manage-section p,.planner-help{font-size:.8rem;line-height:1.55;color:#475569;margin:8px 0}
 .planner-manager-actions{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}
 .planner-file-label{display:block;font-size:.8rem;font-weight:700;line-height:1.5;margin:10px 0 5px}
 .planner-format-guide{font-size:.8rem;color:#475569;margin:10px 0}
 .planner-format-guide summary{font-weight:700;cursor:pointer}
 .planner-fields{background:#f8fafc;border-radius:8px;padding:6px 10px;margin-top:8px}
 .planner-notice{font-size:.83rem;font-weight:600;white-space:pre-wrap}
 @media(max-width:580px){#plannerGroup{flex:1 1 180px;max-width:100%}.planner-manage-section{padding:10px}.planner-manager-actions .btn{max-width:100%;white-space:normal;text-align:center}}
 `;document.head.appendChild(style);
 $('plannerToday').onclick=()=>{page=1;group='all';dayKey=today();$('plannerDate').value=dayKey;render()};
 $('plannerDate').onchange=e=>{page=1;group='all';dayKey=e.target.value;render()};
 $('plannerSelect').onchange=e=>{page=1;group='all';active=e.target.value;localStorage.setItem(PREF,active);const plan=plans.find(p=>p.id===active);dayKey=plan.days.find(d=>d.date===today())?today():plan.days[0].date;render()};
 $('plannerSearch').oninput=e=>{page=1;search=e.target.value.trim().toLowerCase();render()};
 $('plannerGroup').onchange=e=>{page=1;group=e.target.value;render()};
 $('plannerFilter').onchange=e=>{page=1;filter=e.target.value;render()};
 $('plannerPageSize').value=String(pageSize);
 $('plannerPageSize').onchange=e=>{const value=Number(e.target.value);if(!PAGE_SIZES.includes(value))return;pageSize=value;page=1;localStorage.setItem(PAGE_SIZE_KEY,String(pageSize));render()};
 $('plannerPrevPage').onclick=()=>goToPlannerPage(page-1);
 $('plannerNextPage').onclick=()=>goToPlannerPage(page+1);
 $('plannerPageInput').onchange=e=>goToPlannerPage(e.target.value);
 $('plannerPageInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();goToPlannerPage(e.target.value);e.target.blur()}};
 $('plannerManage').onclick=()=>{
  const panel=$('plannerManagement');
  panel.open=!panel.open;
  if(panel.open)panel.scrollIntoView({block:'nearest',behavior:'smooth'});
 };
 $('plannerManagement').addEventListener('toggle',()=>{
  $('plannerManage').setAttribute('aria-expanded',String($('plannerManagement').open));
 });
 $('plannerCsvSample').onclick=()=>download('학습계획_작성예제.csv',makeCsvExample(),'text/csv;charset=utf-8');
 $('plannerJsonSample').onclick=()=>download('학습계획_JSON_예제.json',JSON.stringify(makePlanExample(),null,2));
 $('plannerUpload').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
   const imported=await readPlanUpload(file);
   if(plans.some(x=>x.id===imported.id))throw Error('이미 등록된 planId ('+imported.id+')입니다. 기존 계획 보호를 위해 덮어쓰지 않습니다. 수정본은 새로운 planId(예: -v2)로 저장하세요.');
   const knownIds=new Set((typeof allTopics!=='undefined'?allTopics:[]).map(t=>t.topicId));
   const missing=[...new Set(imported.days.flatMap(d=>d.ids))].filter(id=>knownIds.size&&!knownIds.has(id));
   if(missing.length)throw Error('MASTER에 없는 통합ID '+missing.length+'개: '+missing.slice(0,8).join(', '));
   await put(PLAN,imported);
   plans.push(imported);active=imported.id;page=1;group='all';
   localStorage.setItem(PREF,active);dayKey=imported.days[0].date;await render();
   $('plannerNotice').textContent='새 학습계획 "'+imported.name+'" 등록 완료: '+imported.entries+'건. 기존 계획·MASTER·학습기록은 변경하지 않았습니다.';
  }catch(err){$('plannerNotice').textContent='학습계획 파일 등록 실패: '+err.message}
  finally{e.target.value=''}
 };
 $('plannerExport').onclick=async()=>{
  try{
   const progress=await all(PROGRESS);
   download('study-plan-progress-backup.json',JSON.stringify({format:'study-planner-progress-v1',progress},null,2));
   $('plannerNotice').textContent='진도 '+progress.length+'건을 JSON 파일로 백업했습니다. 다른 기기에서는 먼저 학습계획을 등록한 후 ③ 진도 복원으로 불러오세요.';
  }catch(err){$('plannerNotice').textContent='진도 백업 실패: '+err.message}
 };
 $('plannerRestore').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{await restoreProgressUpload(file)}
  catch(err){$('plannerNotice').textContent='진도 백업 복원 실패: '+err.message}
  finally{e.target.value=''}
 };
}

function makePlanExample(){
 return {
  id:'my-review-2026-v1',
  name:'나만의 복습 학습계획 (예제)',
  groups:{A:'SW 개발',B:'보안'},
  days:[
   {date:'2026-10-24',round:1,ids:['T0692','T3125'],groups:['A','B']},
   {date:'2026-10-25',round:2,ids:['T0692'],groups:['A']}
  ]
 };
}
function csvCell(value){
 const v=String(value??'');
 return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
}
function makeCsvExample(){
 const p=makePlanExample();
 const lines=[['planId','planName','date','round','groupCode','groupName','topicId']];
 for(const day of p.days){
  for(let i=0;i<day.ids.length;i++){
   const g=day.groups[i];
   lines.push([p.id,p.name,day.date,day.round,g,p.groups[g],day.ids[i]]);
  }
 }
 return '\uFEFF'+lines.map(columns=>columns.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
function parseCsv(text){
 const source=String(text).replace(/^\uFEFF/,'');
 const rows=[],row=[];let cell='',quoted=false;
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(quoted){
   if(c==='"'){if(source[i+1]==='"'){cell+='"';i++}else quoted=false}
   else cell+=c;
  }else if(c==='"'){
   if(cell.trim()!=='')throw Error('CSV 따옴표 위치가 잘못되었습니다.');
   quoted=true;
  }else if(c===','){
   row.push(cell);cell='';
  }else if(c==='\n'||c==='\r'){
   row.push(cell);if(row.some(v=>v.trim()))rows.push(row.slice());
   row.length=0;cell='';
   if(c==='\r'&&source[i+1]==='\n')i++;
  }else cell+=c;
 }
 if(quoted)throw Error('CSV 따옴표가 닫히지 않았습니다.');
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 return rows;
}
function validIsoDate(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const check=new Date(date+'T00:00:00Z');
 return !Number.isNaN(check.getTime())&&check.toISOString().slice(0,10)===date;
}
function csvToPlan(text){
 const rows=parseCsv(text);
 if(rows.length<2)throw Error('CSV에 열 이름과 최소 1개의 학습토픽 행을 입력하세요.');
 const header=rows.shift().map(v=>v.trim());
 const fields=['planId','planName','date','round','groupCode','groupName','topicId'];
 const missing=fields.filter(field=>!header.includes(field));
 if(missing.length)throw Error('CSV 필수 열 누락: '+missing.join(', ')+'. 제공된 양식의 첫 줄을 유지하세요.');
 const position=Object.fromEntries(fields.map(k=>[k,header.indexOf(k)]));
 const byDate=new Map(),groups={};let planId='',planName='';
 for(let i=0;i<rows.length;i++){
  const row=rows[i],obj=Object.fromEntries(fields.map(k=>[k,String(row[position[k]]??'').trim()]));
  const line=i+2;
  if(!obj.planId||!obj.planName||!obj.date||!obj.round||!obj.groupCode||!obj.topicId)throw Error('CSV '+line+'행: 필수 항목이 비어 있습니다.');
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(obj.planId))throw Error('CSV '+line+'행: planId는 영문·숫자로 시작하고 영문·숫자·-·_·.만 사용해야 합니다.');
  if(!/^[A-Za-z0-9_.-]{1,32}$/.test(obj.groupCode))throw Error('CSV '+line+'행: groupCode는 영문·숫자·-·_·.만 사용하세요.');
  if(!validIsoDate(obj.date))throw Error('CSV '+line+'행: 유효하지 않은 date ('+obj.date+')입니다.');
  if(!/^[1-9]\d*$/.test(obj.round))throw Error('CSV '+line+'행: round는 1 이상의 정수여야 합니다.');
  if(!/^T\d{4}$/.test(obj.topicId))throw Error('CSV '+line+'행: 통합ID는 T0692처럼 T와 숫자 네 자리로 입력하세요.');
  if(!planId){planId=obj.planId;planName=obj.planName}
  if(planId!==obj.planId||planName!==obj.planName)throw Error('CSV '+line+'행: planId와 planName은 전체 행에서 동일해야 합니다.');
  const groupName=obj.groupName||obj.groupCode;
  if(groups[obj.groupCode]&&groups[obj.groupCode]!==groupName)throw Error('CSV '+line+'행: 같은 groupCode의 groupName이 서로 다릅니다.');
  groups[obj.groupCode]=groupName;
  const round=Number(obj.round);
  if(round>99)throw Error('CSV '+line+'행: round가 너무 큽니다(최대 99).');
  if(!byDate.has(obj.date))byDate.set(obj.date,{date:obj.date,round,ids:[],groups:[]});
  const day=byDate.get(obj.date);
  if(day.round!==round)throw Error('CSV '+line+'행: 같은 날짜에 회독 번호가 다릅니다.');
  day.ids.push(obj.topicId);day.groups.push(obj.groupCode);
 }
 return normalise({id:planId,name:planName,groups,days:[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date))});
}
async function readPlanUpload(file){
 if(file.size>12*1024*1024)throw Error('학습계획 파일 크기는 12MB 이하만 지원합니다.');
 const name=file.name.toLowerCase(),body=await file.text();
 let plan;
 if(name.endsWith('.csv'))plan=csvToPlan(body);
 else if(name.endsWith('.json'))plan=normalise(JSON.parse(body.replace(/^\uFEFF/,'')));
 else throw Error('학습계획은 .csv 또는 .json 파일만 등록할 수 있습니다. PDF/XLSX는 CSV UTF-8로 저장하세요.');
 if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(plan.id))throw Error('planId는 영문·숫자·-·_·.만 사용할 수 있으며 2~80자여야 합니다.');
 for(const day of plan.days){
  if(!validIsoDate(day.date))throw Error('올바르지 않은 날짜입니다: '+day.date);
 }
 return plan;
}
function putMany(store,rows){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readwrite'),os=tx.objectStore(store);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  tx.onabort=()=>reject(tx.error||Error('진도 복원 거래 취소'));
  for(const row of rows)os.put(row);
 });
}
async function restoreProgressUpload(file){
 if(!file.name.toLowerCase().endsWith('.json'))throw Error('진도 복원에는 백업 JSON 파일만 선택하세요.');
 if(file.size>12*1024*1024)throw Error('백업 파일 크기는 12MB 이하만 지원합니다.');
 const obj=JSON.parse((await file.text()).replace(/^\uFEFF/,''));
 if(obj?.format!=='study-planner-progress-v1'||!Array.isArray(obj.progress))throw Error('올바른 진도 백업 파일이 아닙니다. ② 진도 백업에서 받은 파일을 사용하세요.');
 const keys=new Set(),unknownPlans=new Set();
 for(const row of obj.progress){
  if(!row||typeof row.planId!=='string'||typeof row.date!=='string'||typeof row.topicId!=='string'||
    !['done','miss'].includes(row.status)||!validIsoDate(row.date)||!/^T\d{4}$/.test(row.topicId)||
    row.key!==row.planId+'|'+row.date+'|'+row.topicId)throw Error('백업 파일에 잘못된 진도 항목이 있습니다. 기존 기록은 변경하지 않았습니다.');
  if(keys.has(row.key))throw Error('백업 파일에 중복된 진도 항목이 있습니다.');
  keys.add(row.key);
  if(!plans.some(p=>p.id===row.planId))unknownPlans.add(row.planId);
 }
 if(unknownPlans.size)throw Error('복원 전에 다음 학습계획을 먼저 등록하세요: '+[...unknownPlans].join(', '));
 const existingKeys=new Set((await all(PROGRESS)).map(row=>row.key));
 const overlaps=[...keys].filter(k=>existingKeys.has(k)).length;
 if(overlaps){
  const ok=window.confirm('이미 저장된 진도 '+overlaps+'건이 있습니다.\n이 파일의 동일 계획·날짜·토픽 기록으로 덮어쓸까요?\n다른 기록과 기존 MASTER는 유지됩니다.');
  if(!ok){$('plannerNotice').textContent='진도 복원이 취소되었습니다. 기존 기록은 그대로입니다.';return}
 }
 await putMany(PROGRESS,obj.progress);
 $('plannerNotice').textContent='진도 '+obj.progress.length+'건을 복원했습니다.'+(overlaps?' (기존 '+overlaps+'건 덮어씀)':'')+' 기존 MASTER/학습정보는 변경하지 않았습니다.';
 await render();
}

function goToPlannerPage(next){
 const value=Number(next);
 page=Number.isFinite(value)?Math.max(1,Math.trunc(value)):1;
 render().then(()=>{
  const card=$('learningModal')?.querySelector('.learning-dashboard-card');
  const list=$('plannerGroups');
  if(!card||!list)return;
  const top=card.scrollTop+list.getBoundingClientRect().top-card.getBoundingClientRect().top-12;
  card.scrollTop=Math.max(0,top);
 }).catch(console.error);
}
function download(name,content,type='application/json;charset=utf-8'){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
async function load(){
 if(loaded)return;
 if(loading)return loading;
 loading=(async()=>{
  db=await openDb();plans=await all(PLAN);
  if(!plans.some(p=>p.id==='pe141-100d-2026')){try{const r=await fetch('./study-plans/pe141-100days.json');if(r.ok){const p=normalise(await r.json());await put(PLAN,p);plans.push(p)}}catch(e){console.warn('Initial study plan unavailable',e)}}
  active=localStorage.getItem(PREF);if(!plans.find(p=>p.id===active))active=plans[0]?.id||'';
  const p=plans.find(p=>p.id===active);dayKey=p?.days.some(d=>d.date===today())?today():(p?.days[0]?.date||today());loaded=true;
 })();
 try{await loading}finally{loading=null}
}
async function render(){
 initUi(); if(!loaded)await load();
 const activeTab=typeof learningView!=='undefined'&&learningView==='plan';
 $('studyPlannerPanel').classList.toggle('hidden',!activeTab);
 const legacyList=$('learningList');if(legacyList)legacyList.classList.toggle('hidden',activeTab);
 const pager=$('learningPager');if(pager)pager.classList.toggle('hidden',activeTab);
 if(!activeTab)return;
 document.querySelectorAll('[data-learning-view]').forEach(b=>b.classList.toggle('active',b.dataset.learningView==='plan'));
 $('plannerSelect').innerHTML=plans.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');$('plannerSelect').value=active;$('plannerDate').value=dayKey;
 const p=plans.find(p=>p.id===active);if(!p){$('plannerGroups').textContent='등록된 학습계획이 없습니다. CSV 또는 JSON 계획 파일을 등록하세요.';$('plannerStats').textContent='';$('plannerGroup').innerHTML='<option value="all">전체 그룹</option>';$('plannerPager').classList.add('hidden');return}
 const d=p.days.find(d=>d.date===dayKey);const states=await all(PROGRESS),map=new Map(states.map(s=>[s.key,s]));
 if(!d){group='all';$('plannerGroup').innerHTML='<option value="all">전체 그룹 (0개)</option>';$('plannerGroups').textContent='이 날짜에는 계획된 토픽이 없습니다.';$('plannerStats').textContent=p.name+' · '+dayKey;$('plannerPager').classList.add('hidden');return}
 const dayGroupCounts=new Map();
 for(const code of d.groups)dayGroupCounts.set(code,(dayGroupCounts.get(code)||0)+1);
 if(group!=='all'&&!dayGroupCounts.has(group))group='all';
 $('plannerGroup').innerHTML='<option value="all">전체 그룹 ('+d.ids.length+'개)</option>'+
  [...dayGroupCounts.entries()].map(([code,count])=>
   '<option value="'+esc(code)+'">'+esc(code)+' · '+esc(p.groups?.[code]||code)+' ('+count+'개)</option>').join('');
 $('plannerGroup').value=group;
 const matching=[];let done=0,miss=0;const known=new Map((typeof allTopics!=='undefined'?allTopics:[]).map(t=>[t.topicId,t]));
 for(let i=0;i<d.ids.length;i++){let id=d.ids[i],g=d.groups[i],state=map.get(active+'|'+d.date+'|'+id),status=state?.status||'todo';if(status==='done')done++;if(status==='miss')miss++;
  let topic=known.get(id),name=topic?.topicName||id;if(group!=='all'&&g!==group)continue;if(search&&!(id.toLowerCase().includes(search)||name.toLowerCase().includes(search)))continue;if(filter==='done'&&status!=='done'||filter==='miss'&&status!=='miss'||filter==='todo'&&status==='done')continue;
  matching.push({id,name,status,group:g,missing:!topic});
 }
 const total=matching.length, totalPages=Math.max(1,Math.ceil(total/pageSize));
 page=Math.min(Math.max(1,page),totalPages);
 const start=(page-1)*pageSize, visible=matching.slice(start,start+pageSize);
 const byGroup=new Map(), groupCounts=new Map();
 for(const row of matching)groupCounts.set(row.group,(groupCounts.get(row.group)||0)+1);
 for(const row of visible){if(!byGroup.has(row.group))byGroup.set(row.group,[]);byGroup.get(row.group).push(row)}
 $('plannerPageInput').max=String(totalPages);
 $('plannerPageInput').value=String(page);
 $('plannerTotalPages').textContent=String(totalPages);
 $('plannerPrevPage').disabled=page<=1;
 $('plannerNextPage').disabled=page>=totalPages;
 $('plannerPageRange').textContent=total?(start+1)+'–'+Math.min(start+pageSize,total)+' / '+total+'개':'0개';
 $('plannerPager').classList.toggle('hidden',total<=pageSize);
 $('plannerStats').textContent=p.name+' · '+d.date+' · '+(d.round?d.round+'회독':'최종 점검')+' · 계획 '+d.ids.length+'개 / 완료 '+done+'개 / 다시보기 '+miss+'개 / 남은 '+(d.ids.length-done)+'개'+(group==='all'?'':' · 선택 그룹 '+dayGroupCounts.get(group)+'개');
 $('plannerGroups').innerHTML=[...byGroup.entries()].map(([g,rows])=>'<details open class="planner-group"><summary>'+esc(g)+' · '+esc(p.groups?.[g]||g)+' (이 페이지 '+rows.length+'개 / 해당 그룹 '+groupCounts.get(g)+'개)</summary>'+rows.map(r=>'<button class="planner-topic" data-plan-topic="'+esc(r.id)+'" type="button"><span>'+esc(r.name)+'<small>'+esc(r.id)+(r.missing?' · MASTER에 없음':'')+'</small></span><span>'+({done:'완료',miss:'다시보기',todo:'미학습'}[r.status])+'</span></button>').join('')+'</details>').join('')||'<p>조건에 맞는 토픽이 없습니다.</p>';
 $('plannerGroups').querySelectorAll('[data-plan-topic]').forEach(btn=>btn.onclick=()=>{let id=btn.dataset.planTopic;context={planId:active,date:d.date,topicId:id};if(!(typeof allTopics!=='undefined'&&allTopics.some(t=>t.topicId===id))){alert('MASTER에 없는 토픽입니다: '+id);return}navigateToLearningTopic(id)});
}
async function record(topicId,result){
 if(!loaded)await load();
 const selected=context?.topicId===topicId?context:{planId:active,date:today(),topicId};
 const plan=plans.find(p=>p.id===selected.planId);
 const day=plan?.days.find(d=>d.date===selected.date);
 if(!day?.ids.includes(topicId))return;
 const key=selected.planId+'|'+selected.date+'|'+topicId;
 await put(PROGRESS,{key,planId:selected.planId,date:selected.date,topicId,status:result==='암기'?'done':'miss',updatedAt:new Date().toISOString()});
}
window.StudyPlanner={render,record};
window.addEventListener('DOMContentLoaded',()=>{initUi();load().catch(console.error)});
})();