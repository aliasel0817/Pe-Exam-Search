/* Isolated study plan controller. Does not mutate MASTER or legacy learning records. */
(() => {
'use strict';
const DB='pe-study-planner-v1', PLAN='plans', PROGRESS='progress', PREF='peStudyPlanner.active.v1';
let db, loading=null, plans=[], active='', dayKey='', filter='all', search='', loaded=false, context=null;
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
 <div class="planner-toolbar"><select id="plannerSelect" aria-label="학습계획 선택"></select><input id="plannerDate" type="date" aria-label="학습일 선택"><button type="button" id="plannerToday" class="btn">오늘</button><button type="button" id="plannerManage" class="btn">계획 등록·관리</button></div>
 <div id="plannerStats" class="planner-stats"></div>
 <p class="planner-local-info">학습계획별 진도는 현재 기기에 저장됩니다. 다른 기기와 자동으로 동기화되지 않으므로 기기 변경 전에 진도를 백업하세요.</p>
 <div class="planner-toolbar"><input id="plannerSearch" type="search" placeholder="토픽명 또는 통합ID 검색" aria-label="계획 토픽 검색"><select id="plannerFilter" aria-label="진도 필터"><option value="all">전체</option><option value="todo">미완료</option><option value="done">완료</option><option value="miss">다시보기</option></select></div>
 <div id="plannerGroups" class="planner-groups"></div>
 <details id="plannerManagement" class="planner-manager"><summary>학습계획 관리</summary><p>기존 계획은 보존합니다. 새 계획을 JSON으로 가져오면 별도 계획으로 등록할 수 있습니다.</p><input id="plannerUpload" type="file" accept=".json,application/json"><button id="plannerExport" class="btn" type="button">진도 백업 내려받기</button><input id="plannerRestore" type="file" accept=".json,application/json" aria-label="진도 백업 복원"><p id="plannerNotice" role="status"></p></details>`;
 document.querySelector('.learning-view-tabs').after(pane);
 const style=document.createElement('style');style.textContent=`
 #studyPlannerPanel{padding:12px 0}#studyPlannerPanel.hidden{display:none!important}.planner-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}.planner-toolbar input,.planner-toolbar select{font:inherit;min-height:36px;border:1px solid #dbe2ea;background:#fff;color:#172033;border-radius:8px;padding:6px 8px;max-width:100%}#plannerSelect,#plannerSearch{flex:1;min-width:175px}.planner-stats{background:#f1f5f9;padding:12px;border-radius:10px;line-height:1.6;margin:10px 0}.planner-group{border:1px solid #dbe2ea;border-radius:10px;margin:8px 0;overflow:hidden}.planner-group summary{cursor:pointer;padding:12px;background:#f8fafc;font-weight:600}.planner-topic{display:flex;width:100%;text-align:left;justify-content:space-between;gap:10px;padding:10px 12px;border:0;border-top:1px solid #e2e8f0;background:#fff;cursor:pointer;color:#172033}.planner-topic small{color:#64748b;display:block;margin-top:4px}.planner-local-info{font-size:.8rem;line-height:1.5;color:#64748b;margin:8px 2px}.planner-manager{margin:20px 0;padding:12px;background:#f8fafc;border-radius:10px}.planner-manager input{display:block;max-width:100%;margin:12px 0}.planner-topic:hover{background:#eff6ff}`;document.head.appendChild(style);
 $('plannerToday').onclick=()=>{dayKey=today();$('plannerDate').value=dayKey;render()};
 $('plannerDate').onchange=e=>{dayKey=e.target.value;render()};
 $('plannerSelect').onchange=e=>{active=e.target.value;localStorage.setItem(PREF,active);const plan=plans.find(p=>p.id===active);dayKey=plan.days.find(d=>d.date===today())?today():plan.days[0].date;render()};
 $('plannerSearch').oninput=e=>{search=e.target.value.trim().toLowerCase();render()};
 $('plannerFilter').onchange=e=>{filter=e.target.value;render()};
 $('plannerManage').onclick=()=>{$('plannerManagement').open=!$('plannerManagement').open};
 $('plannerUpload').onchange=async e=>{try{let j=JSON.parse(await e.target.files[0].text());let p=normalise(j);if(plans.some(x=>x.id===p.id))throw Error('이미 존재하는 계획 ID입니다. 기존 계획을 덮어쓰지 않도록 새 ID로 등록하세요.');await put(PLAN,p);plans.push(p);active=p.id;localStorage.setItem(PREF,active);dayKey=p.days[0].date;await render();$('plannerNotice').textContent=p.name+' 등록 완료 ('+p.entries+'건)';}catch(err){$('plannerNotice').textContent='등록 실패: '+err.message}e.target.value=''};
 $('plannerExport').onclick=async()=>{let payload={format:'study-planner-progress-v1',progress:await all(PROGRESS)};download('study-plan-progress-backup.json',JSON.stringify(payload))};
 $('plannerRestore').onchange=async e=>{try{let j=JSON.parse(await e.target.files[0].text());if(j.format!=='study-planner-progress-v1'||!Array.isArray(j.progress))throw Error('잘못된 백업 형식');for(let row of j.progress){if(typeof row.key!=='string'||!['done','miss'].includes(row.status))throw Error('진도 백업 항목 오류');await put(PROGRESS,row)}$('plannerNotice').textContent=j.progress.length+'건 복원 완료';await render()}catch(err){$('plannerNotice').textContent='복원 실패: '+err.message}e.target.value=''};
}
function download(name,content){const blob=new Blob([content],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
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
 const p=plans.find(p=>p.id===active);if(!p){$('plannerGroups').textContent='등록된 학습계획이 없습니다. 계획 JSON을 등록하세요.';$('plannerStats').textContent='';return}
 const d=p.days.find(d=>d.date===dayKey);const states=await all(PROGRESS),map=new Map(states.map(s=>[s.key,s]));
 if(!d){$('plannerGroups').textContent='이 날짜에는 계획된 토픽이 없습니다.';$('plannerStats').textContent=p.name+' · '+dayKey;return}
 const byGroup=new Map();let done=0,miss=0;const known=new Map((typeof allTopics!=='undefined'?allTopics:[]).map(t=>[t.topicId,t]));
 for(let i=0;i<d.ids.length;i++){let id=d.ids[i],g=d.groups[i],state=map.get(active+'|'+d.date+'|'+id),status=state?.status||'todo';if(status==='done')done++;if(status==='miss')miss++;
  let topic=known.get(id),name=topic?.topicName||id;if(search&&!(id.toLowerCase().includes(search)||name.toLowerCase().includes(search)))continue;if(filter==='done'&&status!=='done'||filter==='miss'&&status!=='miss'||filter==='todo'&&status==='done')continue;
  if(!byGroup.has(g))byGroup.set(g,[]);byGroup.get(g).push({id,name,status,group:g,missing:!topic});
 }
 $('plannerStats').textContent=p.name+' · '+d.date+' · '+(d.round?d.round+'회독':'최종 점검')+' · 계획 '+d.ids.length+'개 / 완료 '+done+'개 / 다시보기 '+miss+'개 / 남은 '+(d.ids.length-done)+'개';
 $('plannerGroups').innerHTML=[...byGroup.entries()].map(([g,rows])=>'<details open class="planner-group"><summary>'+esc(g)+' · '+esc(p.groups?.[g]||g)+' ('+rows.length+'개)</summary>'+rows.map(r=>'<button class="planner-topic" data-plan-topic="'+esc(r.id)+'" type="button"><span>'+esc(r.name)+'<small>'+esc(r.id)+(r.missing?' · MASTER에 없음':'')+'</small></span><span>'+({done:'완료',miss:'다시보기',todo:'미학습'}[r.status])+'</span></button>').join('')+'</details>').join('')||'<p>조건에 맞는 토픽이 없습니다.</p>';
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