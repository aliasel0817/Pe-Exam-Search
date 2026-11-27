/* Stage 4 browser glue: reuses the existing signed mutation function.
 * No standalone credential storage, unsigned endpoints or automatic requests.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.StudyNotificationClient=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const ORIGIN='https://aliasel0817.github.io';
 const PATH='/Pe-Exam-Search/study-note/study-note.html';
 const CALLBACK=ORIGIN+'/Pe-Exam-Search/study-note/notification/kakao-callback.html';
 const ACTIONS=Object.freeze({snapshot:'notificationSnapshot',save:'notificationSave',preview:'notificationPreview',
  begin:'notificationBegin',finish:'notificationFinish',confirm:'notificationConfirm',disconnect:'notificationDisconnect',history:'notificationHistory'});
 const must=(v,m)=>{if(!v)throw Error(m);};
 function createTransport(host){
  for(const k of ['getApiUrl','ensureActive','sendSecureMutation','location'])must(typeof host[k]==='function','existing host dependency missing');
  must(typeof host.defaultApiUrl==='string'&&/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(host.defaultApiUrl),'approved main endpoint required');
  async function call(action,data={}){
   const loc=host.location();
   must(loc.origin===ORIGIN&&loc.pathname===PATH,'unsupported study-note origin');
   must(host.getApiUrl()===host.defaultApiUrl,'notification requires approved default API');
   must(await host.ensureActive()===true,'ACTIVE device required');
   // Recheck after async auth. Never sign an OAuth code for a custom endpoint.
   must(host.getApiUrl()===host.defaultApiUrl,'main endpoint changed');
   const r=await host.sendSecureMutation(host.defaultApiUrl,ACTIONS[action],data);
   must(r?.notificationVersion===1&&r.notificationResult&&typeof r.notificationResult==='object'&&!Array.isArray(r.notificationResult),'notification route unavailable');
   if(r.notificationResult.reason==='notification-request-failed')throw Error('notification request failed');
   return r.notificationResult;
  }
  return Object.freeze({snapshot:()=>call('snapshot'),save:d=>call('save',d),preview:d=>call('preview',d),begin:()=>call('begin'),
   finish:d=>call('finish',d),confirm:d=>call('confirm',d),disconnect:()=>call('disconnect'),history:d=>call('history',d)});
 }
 function mount(container,host,core,panel,win=window){
  const transport=createTransport(host);
  let popup=null,state=null,timeout=null,disposed=false,view=null,finishing=false;
  function closePopup(){
   state=null;
   if(timeout!==null){win.clearTimeout(timeout);timeout=null;}
   try{if(popup&&!popup.closed)popup.close();}catch(_){}
   popup=null;
  }
  function message(text){view?.setMessage(text);}
  function prepareAuthorization(){
   if(disposed||finishing)return false;
   closePopup();
   // Must run synchronously on a trusted user click before the signed request.
   popup=win.open('about:blank','_blank','popup,width=520,height=720');
   if(!popup){message('팝업을 허용한 후 다시 계정 연결을 선택하세요.');return false;}
   try{popup.document.title='카카오 계정 연결 준비';popup.document.body.textContent='카카오 인증 연결을 준비하고 있습니다.';}catch(_){}
   return true;
  }
  function navigate(url){
   const u=new URL(url);
   must(popup&&!popup.closed&&u.origin==='https://kauth.kakao.com'&&u.pathname==='/oauth/authorize'&&u.searchParams.get('redirect_uri')===CALLBACK,'OAuth callback configuration mismatch');
   state=u.searchParams.get('state');must(/^[a-f0-9]{64}$/.test(state||''),'OAuth state invalid');
   timeout=win.setTimeout(()=>{closePopup();message('카카오 인증 시간이 만료되었습니다. 다시 연결하세요.');},600000);
   popup.location.replace(u.href);
  }
  async function onMessage(e){
   if(disposed||finishing||!popup||!state||e.source!==popup||e.origin!==ORIGIN)return;
   const v=e.data;
   if(v?.type!=='pe-notification-oauth-v1'||v.state!==state)return;
   const goodCode=typeof v.code==='string'&&v.code.length>0&&v.code.length<=2000&&!v.error;
   const goodError=typeof v.error==='string'&&v.error.length>0&&v.error.length<=100&&!v.code;
   if(!goodCode&&!goodError)return;
   const data={state,code:goodCode?v.code:null,error:goodError?v.error:null};
   finishing=true;closePopup();
   try{
    const r=await transport.finish(data);
    if(disposed)return;
    if(r?.ok!==true||r.needsConfirmation!==true||typeof r.accountId!=='string'||!/^[1-9]\d{0,19}$/.test(r.accountId)){message('카카오 계정 연결이 완료되지 않았습니다. 다시 시도하세요.');return;}
    if(win.confirm('카카오 회원번호 '+r.accountId+' 계정을 본인의 학습 알림 수신 계정으로 연결할까요? 자동 발송은 시작되지 않습니다.')!==true){
     message('계정 연결을 확정하지 않았습니다.');return;
    }
    const c=await transport.confirm({confirm:true,accountId:r.accountId});
    if(disposed)return;
    if(c?.ok!==true||c.connected!==true||c.armed!==false)throw Error('account confirmation failed');
    await view.reload();message('카카오 계정 연결 확인 완료 · 자동 발송은 아직 비활성 상태입니다.');
   }catch(_){if(!disposed)message('카카오 연결 결과를 확인하지 못했습니다. 최신 설정 조회 후 다시 시도하세요.');}
   finally{finishing=false;}
  }
  win.addEventListener('message',onMessage);
  try{
   view=panel.mount(container,transport,core,{prepareAuthorization,navigate,cancelAuthorization:closePopup,
    confirmDiscard:()=>win.confirm('저장하지 않은 변경을 버리고 최신 설정을 조회할까요?'),
    confirmDisconnect:()=>win.confirm('자동 발송을 중지하고 카카오 계정 연결을 해제할까요?')});
  }catch(e){win.removeEventListener('message',onMessage);closePopup();throw e;}
  return Object.freeze({loaded:view.loaded,unmount(){disposed=true;win.removeEventListener('message',onMessage);closePopup();view.unmount();}});
 }
 return Object.freeze({createTransport,mount,ORIGIN,PATH,CALLBACK});
});
