/* Stage 6 status / guidance UX. Presentation only.
 * Server writes remain disabled unless Stage4 testEnabled() passes (loopback + synthetic).
 * No LIVE MASTER or existing learning DB modifications.
 */
(function(root){
'use strict';
const labels={
  plan:'학습계획·일정',progress:'회독별 진도',legacy:'일반 학습정보'
};
const $=id=>root.document?.getElementById(id);
const iso=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
const localTime=s=>{
 if(!iso(s))return '';
 const time=new Date(s);
 return Number.isNaN(time.getTime())?'':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(time);
};
const classifyError=(error)=>{
 const raw=String(error?.message||error||'');
 if(/offline|오프라인|network|Failed to fetch|연결/.test(raw))return '인터넷 연결을 확인하세요. 미전송 기록은 기기에 남아 있으며 연결 후 다시 시도할 수 있습니다.';
 if(/ACTIVE|신뢰기기|인증|401|403|session|HMAC|nonce/i.test(raw))return '승인된 신뢰기기·인증 상태를 확인하세요. 인증이 복구되기 전에는 서버에 쓰지 않습니다.';
 if(/unsupported|미지원|버전|API/i.test(raw))return '서버가 동기화 API를 지원하는지 확인하세요. 일반 학습정보와 로컬 학습계획은 계속 사용할 수 있습니다.';
 if(/해시|SHA|무결성|백업 파일/.test(raw))return '다운로드한 원본 JSON을 다시 선택하세요. 해시가 다르면 현재 기록으로 새 전체 백업을 생성해야 합니다.';
 if(/quota|저장공간|QuotaExceededError|25MB|용량/i.test(raw))return '브라우저 저장 공간을 확인하고 원본 JSON을 별도로 보관하세요. 기존 기록을 임의 삭제하지 마세요.';
 if(/CONFLICT|충돌|서로 다른|변경|revision|현재.*다릅/i.test(raw))return '로컬·서버 원본을 비교하고 충돌 보류 내역을 확인하세요. 자동 덮어쓰지 않습니다.';
 if(/ACK|응답|시도|실패|중단|잠정/.test(raw))return '서버 반영 여부가 불확실합니다. 새 작업을 만들지 말고 동일 작업 ID로 안전하게 재시도하세요.';
 return '오류를 확인한 후 재시도하세요. 미전송 또는 충돌 기록이 남아 있는지 확인해야 합니다.';
};
function areaFromCounts({enabled=false,migration='required',online=true,lastSuccess=null,
 pending=0,conflicts=0,lastResult=null,area='plan'}={}){
 if(!enabled)return {state:'disabled',label:'준비 중 · 현재 기기 로컬 보관'};
 if(!online)return {state:'offline',label:'오프라인 · 기기에 기록 보관'};
 if(migration!=='ready')return {state:'migration-required',label:'기기별 전체 백업·최초 통합 필요'};
 if(conflicts>0)return {state:'conflict',label:'충돌 '+conflicts+'건 · 사용자 확인 필요'};
 if(pending>0)return {state:'pending',label:'미전송 '+pending+'건 · 다음 동기화 대기'};
 if(lastResult?.state==='error')return {state:'error',label:'동기화 오류 · 재시도 필요'};
 if(lastResult?.state==='confirmed'&&iso(lastResult.at))return {state:'confirmed',label:'서버 확인 완료 · '+localTime(lastResult.at)};
 if(lastSuccess&&iso(lastSuccess))return {state:'confirmed-prior',label:'마지막 서버 확인 '+localTime(lastSuccess)+' · 이후 변경 확인 필요'};
 return {state:'ready',label:'동기화 준비 · 서버 처리 아직 미확인'};
}
function formatSyncStatus(backend,legacy){
 const online=root.navigator?.onLine!==false,enabled=Boolean(backend?.enabled),migration=backend?.migration||'required';
 const counts={plan:{pending:backend?.planPending||0,conflicts:backend?.planConflicts||0},
  progress:{pending:backend?.progressPending||0,conflicts:backend?.progressConflicts||0}};
 const plans=areaFromCounts({enabled,migration,online,...counts.plan,lastSuccess:backend?.lastSuccess,
  lastResult:backend?.planResult,area:'plan'});
 const progress=areaFromCounts({enabled,migration,online,...counts.progress,lastSuccess:backend?.lastSuccess,
  lastResult:backend?.progressResult,area:'progress'});
 const legacyStatus=legacy?.state||'not-run';
 const legacyLabel={
  confirmed: '서버 기록 확인 · '+localTime(legacy?.at),
  pending:'서버 확인 전 · 진행 중',unverified:'실행 후 서버 성공 기록 미확인',
  'auth-required':'신뢰기기 인증 필요',offline:'오프라인 · 서버 미확인',
  error:'동기화 오류 · 서버 미확인','not-run':'이번 세션 확인 결과 없음'
 }[legacyStatus]||'서버 확인 결과 없음';
 return {legacy:{state:legacyStatus,label:legacyLabel},plans,progress,counts,
  totalPending:Number(backend?.pending||0),totalConflicts:Number(backend?.conflicts||0)};
}
function addCss(){
 if($('plannerSyncStage6Css'))return;
 const style=root.document.createElement('style');style.id='plannerSyncStage6Css';
 style.textContent=[
 '#plannerSyncDetails{border:1px solid #dbe3ed;border-radius:9px;margin:6px 0 12px;padding:8px 10px;min-width:0}',
 '#plannerSyncDetails>summary{font-size:.8rem;cursor:pointer;font-weight:650;min-height:28px;display:list-item;line-height:1.45}',
 '.planner-sync-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}',
 '.planner-sync-area{min-width:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:9px;overflow-wrap:anywhere}',
 '.planner-sync-area strong{display:block;font-size:.77rem;color:#263548;margin-bottom:5px}',
 '.planner-sync-area span{font-size:.75rem;line-height:1.5;display:block;color:#475569}',
 '.planner-sync-footer{margin:10px 0 0;font-size:.74rem;color:#475569;overflow-wrap:anywhere}',
 '.planner-ux-warning{border-inline-start:3px solid #c18c36;padding-inline-start:8px}',
 '.planner-manage-section,#plannerFirstSyncWizard{min-width:0;overflow-wrap:anywhere}',
 '.planner-stats{overflow-wrap:anywhere;white-space:normal;min-width:0}',
 '#plannerFirstSyncWizard .planner-migrate-steps{margin:10px 0;padding:8px 8px 8px 26px;border:1px solid #d7e0eb;border-radius:8px;background:#fff;font-size:.77rem;line-height:1.7}',
 '#plannerFirstSyncWizard .planner-migrate-steps li{margin:2px 0;padding-inline:3px}',
 '#plannerFirstSyncWizard .planner-migrate-steps li[aria-current="step"]{font-weight:700;text-decoration:underline;text-underline-offset:3px}',
 '#plannerFirstSyncWizard .planner-migrate-steps li[data-state="done"]{color:#34705b}',
 '#plannerFirstSyncWizard .planner-migrate-steps li[data-state="blocked"]{color:#9a5c27}',
 '#plannerFirstSyncWizard .planner-conflict-list details{margin:7px 0;border:1px solid #dbe3ed;border-radius:7px;padding:8px;max-width:100%}',
 '#plannerFirstSyncWizard .planner-conflict-list pre{font-size:.71rem;line-height:1.5;overflow:auto;max-height:280px;white-space:pre-wrap;word-break:break-all;margin:7px 0}',
 '#plannerFirstSyncWizard button,#plannerFirstSyncWizard input[type=file]{min-height:40px}',
 '@media(max-width:900px){.planner-sync-grid{grid-template-columns:1fr}}',
 '@media(max-width:580px){#plannerFirstSyncWizard{padding:9px}#plannerFirstSyncWizard fieldset{min-width:0;box-sizing:border-box}#plannerFirstSyncWizard .planner-manager-actions{display:grid;grid-template-columns:minmax(0,1fr)}#plannerFirstSyncWizard .planner-manager-actions .btn{width:100%;white-space:normal;min-height:42px}}'
 ].join('');
 root.document.head.appendChild(style);
}
function mount(){
 if(!root.document||!$('plannerSyncStatus'))return null;
 addCss();const label=$('plannerSyncStatus');
 let parent=$('plannerSyncDetails');
 if(!parent){
  parent=root.document.createElement('details');parent.id='plannerSyncDetails';parent.className='planner-sync-details';
  parent.innerHTML='<summary id="plannerSyncHeading">동기화 상태 자세히 보기</summary>'+
   '<div class="planner-sync-grid" role="group" aria-label="영역별 동기화 상태">'+
   '<div class="planner-sync-area"><strong>일반 학습정보</strong><span id="plannerSyncAreaLegacy">확인 전</span></div>'+
   '<div class="planner-sync-area"><strong>학습계획·일정</strong><span id="plannerSyncAreaPlan">확인 전</span></div>'+
   '<div class="planner-sync-area"><strong>회독별 진도</strong><span id="plannerSyncAreaProgress">확인 전</span></div></div>'+
   '<p class="planner-sync-footer" id="plannerSyncGuide">백업 JSON은 서버 동기화와 별도의 안전장치입니다.</p>';
  label.after(parent);
 }
 return parent;
}
let lastLegacy={state:'not-run'},lastSync={};
function readLegacyMeta(){
 return new Promise((resolve,reject)=>{
  if(!root.indexedDB){resolve(null);return;}
  const r=root.indexedDB.open('pe-study-note-db');
  let created=false;
  r.onupgradeneeded=()=>{created=true;r.transaction.abort();};
  r.onsuccess=()=>{
   const database=r.result;
   if(created||!database.objectStoreNames.contains('meta')){database.close();resolve(null);return;}
   const tx=database.transaction('meta','readonly'),get=tx.objectStore('meta').get('lastLearningSyncAt');
   get.onsuccess=()=>{const value=get.result?.value;database.close();resolve(iso(value)?value:null);};
   get.onerror=()=>{database.close();reject(get.error);};
  };
  r.onerror=()=>resolve(null);
 });
}
async function syncLegacySafely(handler){
 if(!root.navigator?.onLine){lastLegacy={state:'offline'};return lastLegacy;}
 let before;try{before=await readLegacyMeta();}catch(_){before=null;}
 try{
  if(typeof handler!=='function')return lastLegacy={state:'unverified'};
  await handler();
  const after=await readLegacyMeta();
  // Legacy syncLearningStates swallows failures; only its persisted success
  // receipt proves that fetchLearningStates returned and dirty states were saved.
  lastLegacy=after&&after!==before?{state:'confirmed',at:after}:{state:'unverified'};
 }catch(error){
  lastLegacy={state:'error',message:error.message||String(error)};
 }
 return lastLegacy;
}
function publish({backend={},legacy=lastLegacy,plannerResult=null}={}){
 if(!$('plannerSyncStatus'))return null;
 mount();
 const value=formatSyncStatus(backend,legacy),label=$('plannerSyncStatus');
 const ready=backend?.enabled&&backend?.migration==='ready'&&root.navigator?.onLine!==false;
 let summary;
 if(!backend?.enabled)summary='학습계획 서버 연동 준비 중 · 지금은 기기별 로컬 저장';
 else if(root.navigator?.onLine===false)summary='오프라인 · 변경 내용은 이 기기에 보관';
 else if(backend?.migration!=='ready')summary='기기별 전체 백업·최초 통합 전 · 로컬 기록 보존';
 else if(value.totalConflicts)summary='충돌 '+value.totalConflicts+'건 확인 필요 · 자동 덮어쓰기 없음';
 else if(value.totalPending)summary='미전송 '+value.totalPending+'건 · 로컬에 보관';
 else if(plannerResult?.state==='synced')summary='학습계획·회독별 진도 서버 확인 완료';
 else summary='서버 동기화 대기 · 기록은 이 기기에 보관';
 const prior=backend?.lastSuccess&&iso(backend.lastSuccess)?' · 계획·진도 마지막 확인 '+localTime(backend.lastSuccess):'';
 label.textContent=summary+prior+(value.totalPending?' · 미전송 '+value.totalPending+'건':'');
 $('plannerSyncHeading').textContent='동기화 상태 자세히 보기 · 미전송 '+value.totalPending+'건 / 충돌 '+value.totalConflicts+'건';
 $('plannerSyncAreaLegacy').textContent=value.legacy.label;
 $('plannerSyncAreaPlan').textContent=value.plans.label;
 $('plannerSyncAreaProgress').textContent=value.progress.label;
 $('plannerSyncGuide').textContent=!backend?.enabled?'서버 기능이 비활성화되어 다른 기기와 계획·진도가 공유되지 않습니다. JSON을 별도로 백업하세요.':
  !ready?'최초 기기별 원본 백업·검증이 필요합니다. 검증 전 업로드·다운로드는 차단됩니다.':
  '오프라인 변경은 기기에 저장하며, 명시적 동기화 후 서버 확정 응답을 확인해야 공유됩니다. JSON 백업은 별도 안전장치입니다.';
 return value;
}
async function syncCombined({legacy,planner,getStatus,refresh}){
 if(!root.PEPlannerSyncClient?.testEnabled?.())return {legacy:{state:'unverified'},planner:{state:'disabled'}};
 // Existing learningStates API receives no code changes; no success assumed if
 // its handler does not produce a fresh persisted receipt.
 lastLegacy=await syncLegacySafely(legacy);
 let plannerResult;
 try{plannerResult=await planner();}catch(error){
  plannerResult={state:'error',message:error.message||String(error)};
 }
 lastSync=plannerResult;
 const backend=typeof getStatus==='function'?await getStatus():{};
 const result=publish({backend,legacy:lastLegacy,plannerResult});
 if(typeof refresh==='function')await refresh(result);
 return {legacy:lastLegacy,planner:plannerResult,display:result};
}
function legacyResult(){return {...lastLegacy};}
const api={mount,formatSyncStatus,areaFromCounts,classifyError,readLegacyMeta,syncLegacySafely,syncCombined,publish,legacyResult,localTime};
root.PEPlannerSyncUX=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
