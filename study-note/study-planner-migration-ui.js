/* Stage 5 first-sync wizard, visible only on loopback/synthetic transport. */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
function mount({db,onApplied,transport}){
 const api=root.PEPlannerMigration,client=root.PEPlannerSyncClient;
 if(!api||!client?.testEnabled?.())return null;
 if($('plannerFirstSyncWizard'))return $('plannerFirstSyncWizard');
 const parent=$('plannerManagement');if(!parent)return null;
 const section=document.createElement('section');section.id='plannerFirstSyncWizard';section.className='planner-migrate-section';
 section.innerHTML=[
 '<h4>⑥ 모든 기기 학습기록 최초 통합 — 격리 시험</h4>',
 '<p class="planner-help">실사용 MASTER·운영 서버와 연결하지 않습니다. <strong>현재 기기 전체 백업 파일을 내려받은 후 다시 선택하여 확인</strong>해야 최초 통합을 진행할 수 있습니다. 충돌은 자동으로 덮어쓰지 않습니다.</p>',
 '<div class="planner-manager-actions">',
 '<button id="plannerMigBackup" class="btn" type="button">① 계획·진도 전체 백업 다운로드</button>',
 '<label class="planner-file-label" for="plannerMigVerify">② 다운로드한 파일 재선택·해시 확인</label>',
 '<input id="plannerMigVerify" type="file" accept=".json,application/json">',
 '<button id="plannerMigCompare" class="btn" disabled type="button">③ 서버와 전체 비교</button></div>',
 '<div id="plannerMigPreview" class="planner-help" role="status" aria-live="polite"></div>',
 '<fieldset id="plannerMigChoices" disabled style="margin-top:8px;border:1px solid #cbd5e1;border-radius:8px;padding:8px">',
 '<legend>④ 미리보기 확인 후 통합할 항목 선택 (충돌 제외)</legend>',
 '<label><input type="checkbox" id="plannerMigUpPlan" checked> 기기에만 있거나 안전하게 추가된 계획 업로드</label>',
 '<label><input type="checkbox" id="plannerMigDownPlan" checked> 서버의 안전한 새 계획·확장 일정 내려받기</label>',
 '<label><input type="checkbox" id="plannerMigUpProgress" checked> 기기에만 있는 완료·다시보기 진도 업로드</label>',
 '<label><input type="checkbox" id="plannerMigDownProgress" checked> 서버에만 있는 날짜별 진도 내려받기</label></fieldset>',
 '<div class="planner-manager-actions">',
 '<button id="plannerMigApprove" class="btn primary" disabled type="button">⑤ 승인한 항목만 통합·검증</button>',
 '<button id="plannerMigRetry" class="btn" disabled type="button">중단된 통합 재시도</button>',
 '<button id="plannerMigCancel" class="btn" disabled type="button">통합 전 취소·로컬 유지</button></div>',
 '<details><summary>전체 백업 JSON 안전 복원 (기존 항목 덮어쓰기 없음)</summary>',
 '<label class="planner-file-label" for="plannerMigRestore">검증된 전체 백업 JSON 파일 선택</label>',
 '<input id="plannerMigRestore" type="file" accept=".json,application/json">',
 '<p class="planner-help">누락 기록만 추가합니다. 같은 키의 다른 값은 충돌함에 보존하고 서버에는 전송하지 않습니다.</p></details>',
 '<div id="plannerMigMessage" class="planner-notice" role="status" aria-live="polite"></div>'
 ].join('');
 parent.appendChild(section);
 const css=document.createElement('style');css.textContent='#plannerFirstSyncWizard{margin:12px 0;padding:12px;border:1px solid #cbd5e1;border-radius:9px;background:#f8fafc}#plannerFirstSyncWizard h4{margin:0 0 8px}#plannerMigChoices label{display:block;font-size:.8rem;padding:3px}#plannerFirstSyncWizard button:disabled{opacity:.6}#plannerFirstSyncWizard input[type=file]{margin:6px 0}';
 document.head.appendChild(css);
 let snapId=null,preview=null,busy=false;
 const say=message=>{$('plannerMigMessage').textContent=message;};
 const update=()=>{$('plannerMigCompare').disabled=busy||!snapId;$('plannerMigChoices').disabled=busy||!preview;
  $('plannerMigApprove').disabled=busy||!preview;$('plannerMigRetry').disabled=busy||!snapId;$('plannerMigCancel').disabled=busy||!snapId;};
 function withBusy(task){return async e=>{
  if(busy)return;busy=true;update();say('격리된 합성 데이터를 안전하게 처리 중입니다.');
  try{await task(e)}catch(ex){console.error('Stage5 migration',ex);say('통합 보류 · 기존 기록 보존: '+ex.message)}
  finally{busy=false;update();}
 };}
 const ownTransport=()=>transport||root.PE_PLANNER_SYNC_TEST_TRANSPORT;
 const readJson=async file=>{
  if(!file||!file.name.toLowerCase().endsWith('.json')||file.size>25*1024*1024)throw Error('25MB 이하 JSON 백업 파일만 선택하세요.');
  return JSON.parse((await file.text()).replace(/^\uFEFF/,''));
 };
 const selection=()=>({uploadPlans:$('plannerMigUpPlan').checked,downloadPlans:$('plannerMigDownPlan').checked,
  uploadProgress:$('plannerMigUpProgress').checked,downloadProgress:$('plannerMigDownProgress').checked});
 function showPreview(p){
  const c=p.counts,lines=p.conflicts.slice(0,6).map(x=>'• '+x.kind+' '+x.key+' — '+x.reason);
  $('plannerMigPreview').textContent='기기 계획 '+c.localPlans+'개 · 서버 계획 '+c.remotePlans+'개 · 계획 업로드 '+c.planUploads+'개 / 다운로드 '+c.planDownloads+
   '개 · 진도 업로드 '+c.progressUploads+'건 / 다운로드 '+c.progressDownloads+'건 · 충돌 '+c.conflicts+'건.'+
   (lines.length?'\n보류 예정:\n'+lines.join('\n'):'\n충돌 없는 항목만 사용자 승인 후 처리합니다.');
 }
 $('plannerMigBackup').onclick=withBusy(async()=>{
  const file=await api.backup(db),snap=await api.storeBackup(db,file);snapId=snap.id;preview=null;api.downloadBackup(file);
  $('plannerMigPreview').textContent='백업: 계획 '+file.counts.plans+'개 · 배정 '+file.counts.slots+'회 · 진도 '+file.counts.progress+'건. 저장된 JSON을 ②에서 다시 선택하세요.';
  say('백업 다운로드를 시작했습니다. 실제 파일 재선택·해시 확인 전에는 통합할 수 없습니다.');
 });
 $('plannerMigVerify').onchange=withBusy(async e=>{
  const file=await readJson(e.target.files?.[0]);if(!snapId)throw Error('① 현재 기기 전체 백업을 먼저 실행하세요.');
  await api.confirmBackup(db,snapId,file);say('백업 재선택·SHA-256 검증 완료. 서버 비교 가능.');e.target.value='';
 });
 $('plannerMigCompare').onclick=withBusy(async()=>{
  const stage=await api.state(db);if(!['backed_up','review_required'].includes(stage.state))throw Error('다운로드한 백업 파일을 실제로 재선택·확인해야 합니다.');
  let base=[];try{const r=await fetch('./study-plans/pe141-100days.json',{cache:'no-store'});if(r.ok){const p=await r.json();if(p?.id&&Array.isArray(p.days))base=[p];}}catch(_){}
  preview=await api.compare(db,snapId,ownTransport(),base);
  showPreview(preview);say('충돌은 보류합니다. ④ 안전한 통합 항목을 확인하세요.');
 });
 $('plannerMigApprove').onclick=withBusy(async()=>{
  if(!preview)throw Error('비교 미리보기가 필요합니다.');
  const opts=selection();if(!Object.values(opts).some(Boolean))throw Error('통합할 항목을 선택하세요.');
  if(!root.confirm('백업 파일을 실제로 저장하고 검증했습니까?\n미리보기에 나타난 충돌 없는 선택 항목만 격리 서버로 통합할까요?')){say('취소됨: 기존 기기 기록 유지');return;}
  const result=await api.apply(db,snapId,opts,ownTransport());
  say(result.ready?'첫 통합 검증 완료 · 이 합성 기기의 동기화 준비됨':'부분 통합 완료 · 충돌과 미선택 항목 보존');
  if(typeof onApplied==='function')await onApplied(result);
 });
 $('plannerMigRetry').onclick=withBusy(async()=>{
  const s=await new Promise((resolve,reject)=>{const r=db.transaction('preSyncSnapshots').objectStore('preSyncSnapshots').get(snapId);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  if(s?.state!=='PENDING_RETRY')throw Error('재시도할 미완료 작업이 없습니다.');
  const result=await api.apply(db,snapId,s.approval,ownTransport());
  say(result.ready?'재시도·서버 검증 완료':'부분 적용 후 충돌 보류');if(typeof onApplied==='function')await onApplied(result);
 });
 $('plannerMigCancel').onclick=withBusy(async()=>{
  await api.cancel(db,snapId);preview=null;say('사용자 취소 · 서버 추가 쓰기 없이 기존 기록 유지');
 });
 $('plannerMigRestore').onchange=withBusy(async e=>{
  const file=await readJson(e.target.files?.[0]),proof=await api.verifyBackup(file);
  if(!root.confirm('전체 백업의 계획 '+proof.counts.plans+'개 · 진도 '+proof.counts.progress+'건. 누락된 로컬 기록만 복원하고 충돌을 보류할까요?'))return;
  const result=await api.restore(db,file,true);
  say('로컬 안전 복원: 계획 '+result.restored.plans+'개 / 진도 '+result.restored.progress+'건, 충돌 '+result.conflicts+'건. 서버 전송 없음.');
  if(typeof onApplied==='function')await onApplied(result);e.target.value='';
 });
 update();return section;
}
root.PEPlannerMigrationUI={mount};
if(typeof module!=='undefined'&&module.exports)module.exports={mount};
})(typeof window!=='undefined'?window:globalThis);
