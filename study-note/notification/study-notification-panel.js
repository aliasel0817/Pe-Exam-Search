/* Explicitly mounted UI candidate. Does not access network, localStorage, credentials
 * or the operating page on its own. Host must supply authenticated actions.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.StudyNotificationPanel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PLAN_NAME='제141회 정보관리 기술사 - 3회독 스케쥴링';
 function availablePlans(snapshot){
  return (Array.isArray(snapshot?.plans)?snapshot.plans:[]).filter(p=>p&&p.name===PLAN_NAME&&p.rounds===3&&p.verified===true&&typeof p.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(p.id));
 }
 function mount(container,transport,core,options={}){
  if(!container||!transport||!core)throw Error('explicit host and transport required');
  const doc=container.ownerDocument, el=(tag,text)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;return n;};
  const add=(parent,tag,text)=>{const n=el(tag,text);parent.append(n);return n;};
  const row=(label,control)=>{const n=el('label');n.append(el('span',label),control);return n;};
  const panel=el('section');panel.className='pe-notification-panel';panel.setAttribute('aria-label','카카오톡 학습 알림');
  const css=add(panel,'style',".pe-notification-panel{font:inherit;color:inherit;max-width:680px;padding:12px;border:1px solid #aab4c2;border-radius:10px;display:grid;gap:10px}.pe-notification-panel h2,.pe-notification-panel p{margin:0}.pe-notification-panel label{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pe-notification-panel select,.pe-notification-panel button{font:inherit;max-width:100%;min-height:36px;border:1px solid #aab4c2;border-radius:6px;padding:4px 8px}.pe-notification-panel fieldset{min-width:0;border:1px solid #aab4c2;border-radius:6px;padding:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px}.pe-notification-panel .actions{display:flex;gap:6px;flex-wrap:wrap}.pe-notification-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;border:1px solid #aab4c2;border-radius:6px;padding:8px;margin:0}.pe-notification-panel progress{width:100%}.pe-notification-panel select{min-width:0}.pe-notification-panel [role=status]{overflow-wrap:anywhere}.pe-notification-panel button:disabled{opacity:.55}");
  add(panel,'h2','학습 알림');
  add(panel,'p',options.demo===true?'개발 미리보기 · 합성 데이터 · 실제 발송 없음':'카카오톡 나와의 채팅 · 08:30~20:00 (한국 시간) · 발송 완료는 학습 완료와 별도');
  const account=add(panel,'p','카카오 계정: 확인 중');
  const state=add(panel,'p','서버 확인 중');state.setAttribute('role','status');state.setAttribute('aria-live','polite');
  const plan=el('select');panel.append(row('3회독 학습계획',plan));
  const enabled=el('input');enabled.type='checkbox';panel.append(row('자동 발송 사용',enabled));
  const interval=el('select');
  for(const n of core.INTERVALS){const o=add(interval,'option',n+'분');o.value=String(n);}
  panel.append(row('발송 주기',interval));
  const order=el('select');for(const [v,t] of [['schedule','학습계획 순서'],['random','무작위 (중복 제외)']]){const o=add(order,'option',t);o.value=v;}
  panel.append(row('발송 순서',order));
  const fields=add(panel,'fieldset');add(fields,'legend','발송 항목 · 토픽명 기본 포함');
  const checks=core.FIELDS.map(([id,name])=>{const c=el('input');c.type='checkbox';c.value=id;fields.append(row(name,c));return c;});
  const actions=add(panel,'div');actions.className='actions';
  const buttons={};for(const [k,name] of [['save','설정 저장'],['pause','자동 발송 중지'],['refresh','최신 설정 조회'],['preview','메시지 미리보기'],['connect','카카오 계정 연결'],['disconnect','계정 연결 해제'],['test','테스트 발송']]){const b=add(actions,'button',name);b.type='button';buttons[k]=b;}
  const summary=add(panel,'p','오늘의 발송 현황: 확인 중');
  const next=add(panel,'p','다음 확인 예정: —');
  const progress=add(panel,'progress');progress.max=1;progress.value=0;progress.setAttribute('aria-label','오늘의 발송 진행률');
  const preview=add(panel,'pre','미리보기를 선택하면 분할 메시지를 확인할 수 있습니다.');
  const historySection=add(panel,'details');add(historySection,'summary','발송 이력 (일자별)');
  const historyDate=el('input');historyDate.type='date';historySection.append(row('조회 날짜',historyDate));
  const historyButton=add(historySection,'button','이력 조회');historyButton.type='button';
  const historyNext=add(historySection,'button','다음 20건');historyNext.type='button';historyNext.disabled=true;
  const historyText=add(historySection,'pre','날짜를 선택하여 이력을 조회하세요.');
  let historyOffset=null;
  container.append(panel);
  let snapshot=null,busy=false,dirty=false,stale=false,disposed=false;
  function settings(){
   const old=snapshot?.settings||core.DEFAULTS;
   return core.cleanSettings({enabled:enabled.checked,planId:plan.value,intervalMinutes:Number(interval.value),selectionOrder:order.value,fields:checks.filter(c=>c.checked).map(c=>c.value),maxTopicsPerSlot:old.maxTopicsPerSlot,maxMessagesPerSlot:old.maxMessagesPerSlot});
  }
  function updateControls(){
   if(disposed)return;
   const available=availablePlans(snapshot),hasPlan=available.some(p=>p.id===plan.value),connected=snapshot?.account?.connected===true;
   const allow=hasPlan&&connected&&snapshot?.releaseReady===true;
   if(!allow&&enabled.checked&&!snapshot?.settings?.enabled)enabled.checked=false;
   for(const control of [plan,interval,order,...checks])control.disabled=busy||!snapshot||stale;
   enabled.disabled=busy||!snapshot||stale||(!allow&&!enabled.checked);
   buttons.save.disabled=busy||!snapshot||stale||!hasPlan||(enabled.checked&&!allow);
   buttons.preview.disabled=busy||!snapshot||stale||!hasPlan||typeof transport.preview!=='function';
   buttons.refresh.disabled=busy;
   historyButton.disabled=busy||!snapshot||typeof transport.history!=='function';
   historyNext.disabled=historyButton.disabled||historyOffset===null;
   buttons.pause.disabled=busy||!snapshot||stale||snapshot.settings?.enabled!==true;
   buttons.connect.disabled=busy||!snapshot||stale||connected||typeof transport.begin!=='function';
   buttons.disconnect.disabled=busy||!snapshot||stale||!connected||typeof transport.disconnect!=='function';
   buttons.test.disabled=busy||!snapshot||stale||dirty||!allow||typeof transport.test!=='function';
  }
  function render(s){
   if(!s||!Number.isSafeInteger(s.settingsVersion)||s.settingsVersion<0)throw Error('설정 응답 확인 실패');
   snapshot=s;dirty=false;stale=false;
   const list=availablePlans(s),old=s.settings||core.DEFAULTS;
   plan.replaceChildren();const first=add(plan,'option',list.length?'학습계획 선택':'클라우드에 검증된 3회독 계획 없음');first.value='';
   for(const p of list){const o=add(plan,'option',p.name);o.value=p.id;}
   plan.value=list.some(p=>p.id===old.planId)?old.planId:list.length===1?list[0].id:'';
   enabled.checked=old.enabled===true;interval.value=String(old.intervalMinutes);order.value=old.selectionOrder;
   for(const c of checks)c.checked=old.fields.includes(c.value);
   account.textContent='카카오 계정: '+(s.account?.connected===true?'연결됨'+(s.account.refreshExpired?' · 재인증 필요':''):'미연동');
   const stats=s.stats||{},total=Number(stats.assigned),done=Number(stats.confirmed);
   if(typeof s.date==='string'&&!historyDate.value)historyDate.value=s.date;
   next.textContent='다음 확인 예정: '+(Number.isSafeInteger(s.nextCheckAt)?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s.nextCheckAt))+' 이후 (예상)':'—');
   progress.max=Number.isSafeInteger(total)&&total>0?total:1;
   progress.value=Number.isSafeInteger(done)&&done>=0?Math.min(done,progress.max):0;
   summary.textContent=Number.isSafeInteger(total)&&Number.isSafeInteger(done)?'오늘 배정 '+total+' · 발송 완료 '+done+' · 미발송 '+Math.max(0,total-done)+' · 확인 필요 '+(Number(stats.unknown)||0)+' · 거절 '+(Number(stats.rejected)||0):'오늘의 발송 현황: 실제 계획 확인 필요';
   state.textContent=!list.length?'3회독 계획의 클라우드 동기화가 필요합니다. 기존 계획을 먼저 백업하세요.':s.releaseReady===true?'최신 서버 설정을 확인했습니다.':'자동 발송 활성화 조건이 충족되지 않았습니다.';
   updateControls();
  }
  async function perform(work){
   if(busy||disposed)return;busy=true;updateControls();
   try{await work();}catch(_){state.textContent='요청을 완료하지 못했습니다. 최신 설정을 다시 조회하세요.';}
   finally{busy=false;updateControls();}
  }
  function edited(){dirty=true;preview.textContent='변경된 설정을 미리보기할 수 있습니다.';updateControls();}
  [plan,enabled,interval,order,...checks].forEach(c=>c.addEventListener('change',edited));
  buttons.refresh.onclick=()=>perform(async()=>{
   if(dirty&&(typeof options.confirmDiscard!=='function'||options.confirmDiscard()!==true))return;
   render(await transport.snapshot());
  });
  buttons.save.onclick=()=>perform(async()=>{
   const reply=await transport.save({expectedVersion:snapshot.settingsVersion,settings:settings()});
   if(reply?.reason==='settings-conflict'){stale=true;state.textContent='다른 기기에서 설정이 변경되었습니다. 최신 설정 조회 후 다시 수정하세요.';return;}
   if(reply?.ok!==true)throw Error('save failed');
   render(await transport.snapshot());state.textContent='설정 저장 확인 완료';
  });
  buttons.pause.onclick=()=>perform(async()=>{
   const reply=await transport.save({expectedVersion:snapshot.settingsVersion,settings:{...snapshot.settings,enabled:false}});
   if(reply?.reason==='settings-conflict'){stale=true;state.textContent='다른 기기에서 설정이 변경되었습니다. 최신 설정 조회 후 중지하세요.';return;}
   if(reply?.ok!==true)throw Error('pause failed');
   render(await transport.snapshot());state.textContent='자동 발송 중지 설정 저장 확인';
  });
  buttons.preview.onclick=()=>perform(async()=>{
   const res=await transport.preview(settings());
   if(!Array.isArray(res?.parts)||res.parts.some(p=>typeof p!=='string'||p.length>200))throw Error('preview response invalid');
   preview.textContent=res.parts.map((p,i)=>'['+(i+1)+'/'+res.parts.length+']\n'+p).join('\n\n');
  });
  buttons.connect.onclick=()=>{
   if(busy||disposed)return;
   if(typeof options.prepareAuthorization==='function'&&options.prepareAuthorization()!==true)return;
   return perform(async()=>{
    try{
     const r=await transport.begin();
     const url=new URL(r?.authorizationUrl||'');
     if(url.origin!=='https://kauth.kakao.com'||url.pathname!=='/oauth/authorize')throw Error('authorization URL invalid');
     if(typeof options.navigate!=='function')throw Error('OAuth callback not installed');
     options.navigate(url.href);
    }catch(e){options.cancelAuthorization?.();throw e;}
   });
  };
  buttons.disconnect.onclick=()=>perform(async()=>{
   if(typeof options.confirmDisconnect!=='function'||options.confirmDisconnect()!==true)return;
   const r=await transport.disconnect();render(await transport.snapshot());
   state.textContent=r?.providerRevoked===true?'카카오 연결 해제 완료':'로컬 발송 중지·계정 연결 해제 확인. 카카오 측 동의 철회 여부는 별도 확인하세요.';
  });
  buttons.test.onclick=()=>perform(async()=>{
   if(typeof options.confirmTest!=='function'||options.confirmTest()!==true)return;
   const r=await transport.test({expectedVersion:snapshot.settingsVersion});
   state.textContent=r?.confirmed===true?'테스트 메시지 API 성공 응답 확인':r?.unknown===true?'테스트 발송 결과 불명 · 자동 재전송하지 않습니다.':'테스트 발송 미확인';
  });
  const states={confirmed:'API 수락',pending:'미발송/부분 완료',unknown:'확인 필요',rejected:'거절'};
  async function showHistory(offset){
   const date=historyDate.value;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('date required');
   const r=await transport.history({date,offset,limit:20});
   if(r?.date!==date||!Array.isArray(r.rows)||r.rows.length>20||!Number.isSafeInteger(r.total))throw Error('history response invalid');
   historyOffset=Number.isSafeInteger(r.nextOffset)&&r.nextOffset>offset?r.nextOffset:null;
   historyText.textContent=(r.total+'건 · '+date+'\n')+(r.rows.length?r.rows.map(j=>String(j.topicId)+' '+String(j.topicName)+' · '+(states[j.status]||'확인 필요')+' · '+j.confirmedParts+'/'+j.partCount+'편').join('\n'):'예약 이력 없음');
  }
  historyDate.addEventListener('change',()=>{historyOffset=null;historyText.textContent='이력 조회를 선택하세요.';updateControls();});
  historyButton.onclick=()=>perform(()=>showHistory(0));
  historyNext.onclick=()=>perform(()=>showHistory(historyOffset));
  updateControls();
  const loaded=perform(async()=>render(await transport.snapshot()));
  return {loaded,reload:()=>perform(async()=>render(await transport.snapshot())),setMessage:value=>{if(!disposed)state.textContent=String(value);},unmount(){disposed=true;panel.remove();}};
 }
 return Object.freeze({mount,availablePlans,PLAN_NAME});
});
