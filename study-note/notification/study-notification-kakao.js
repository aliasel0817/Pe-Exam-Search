/* Stage 3: server-only Kakao adapter candidate. All operations require one
 * trusted host's exclusive lock (including the service tick); no routes or timers.
 * No tokens are returned to UI or written to the notification journal.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.StudyNotificationKakao=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const AUTH='https://kauth.kakao.com/oauth/authorize',TOKEN='https://kauth.kakao.com/oauth/token';
 const INFO='https://kapi.kakao.com/v1/user/access_token_info',SCOPES='https://kapi.kakao.com/v2/user/scopes';
 const SEND='https://kapi.kakao.com/v2/api/talk/memo/default/send',UNLINK='https://kapi.kakao.com/v1/user/unlink';
 const must=(v,m)=>{if(!v)throw Error(m);};
 const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max;
 const account=v=>Number.isSafeInteger(v)&&v>0?String(v):typeof v==='string'&&/^[1-9]\d{0,19}$/.test(v)?v:null;
 const form=o=>Object.keys(o).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(o[k])).join('&');
 const windowOpen=n=>{const d=new Date(n+9*3600000),m=d.getUTCHours()*60+d.getUTCMinutes();return m>=510&&m<1200;};
 const keyDate=n=>new Date(n+9*3600000).toISOString().slice(0,10);
 const success=r=>r&&r.httpStatus>=200&&r.httpStatus<300&&r.body&&typeof r.body==='object';
 const seconds=v=>Number.isSafeInteger(v)&&v>0&&v<=366*86400;
 function create(config,deps){
  must(config&&text(config.ownerId,200)&&text(config.clientId,300)&&text(config.clientSecret,300)&&account(config.appId),'server app configuration required');
  must(/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[^?#\s]*$/.test(config.redirectUri||''),'fixed HTTPS redirect required');
  must(/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[^\s]*$/.test(config.linkUrl||''),'fixed HTTPS link required');
  must(Number.isSafeInteger(config.dailyBudget)&&config.dailyBudget>=1&&config.dailyBudget<=30000&&Number.isSafeInteger(config.monthlyBudget)&&config.monthlyBudget>=config.dailyBudget&&config.monthlyBudget<=3000000,'explicit free-budget ceiling required');
  for(const k of ['now','randomState','sha256','request','sleep','approved','assertLocked'])must(typeof deps?.[k]==='function','trusted adapter required: '+k);
  must(deps.vault&&typeof deps.vault.read==='function'&&typeof deps.vault.write==='function','private vault required');
  const owner=config.ownerId,appId=account(config.appId);
  function lock(){must(deps.assertLocked()===true,'host exclusive lock required');}
  function clock(){const n=deps.now();must(Number.isSafeInteger(n)&&n>0,'trusted clock required');return n;}
  function auth(ctx){
   lock();
   // ctx MUST be supplied by the existing server's validated ACTIVE/HMAC/nonce
   // session, never JSON accepted from a caller. No HTTP handler is provided.
   must(ctx&&ctx.verified===true&&ctx.ownerId===owner&&text(ctx.sessionBinding,300),'authenticated owner session required');
  }
  function read(){
   lock();const v=deps.vault.read(owner);
   if(v==null)return {schema:1,boundId:null,armed:false,pending:null,token:null,budget:null};
   must(v.schema===1&&typeof v.armed==='boolean'&&(v.boundId===null||!!account(v.boundId)),'private vault invalid');
   return v;
  }
  function write(v){lock();deps.vault.write(owner,v);}
  function budget(v,n){
   const day=keyDate(n),month=day.slice(0,7),old=v.budget;
   if(old){
    must(/^\d{4}-\d{2}-\d{2}$/.test(old.day)&&/^\d{4}-\d{2}$/.test(old.month)&&Number.isSafeInteger(old.dayCount)&&old.dayCount>=0&&Number.isSafeInteger(old.monthCount)&&old.monthCount>=0&&Number.isSafeInteger(old.lastAt)&&old.lastAt<=n,'quota clock/state invalid');
    must(day>=old.day&&month>=old.month,'quota clock rollback');
   }
   return {day,month,dayCount:old?.day===day?old.dayCount:0,monthCount:old?.month===month?old.monthCount:0,lastAt:old?.lastAt||0};
  }
  const remaining=(b)=>b.dayCount<config.dailyBudget&&b.monthCount<config.monthlyBudget;
  // Debit every outbound API attempt before I/O; no refunds or automatic retry.
  function call(v,url,method,params,access,deadline,guard){
   const n=clock(),b=budget(v,n);
   if(!remaining(b)||(deadline!=null&&n>=deadline))return {notAttempted:true};
   v.budget={...b,dayCount:b.dayCount+1,monthCount:b.monthCount+1,lastAt:n};
   write(v);
   if((deadline!=null&&clock()>=deadline)||(guard&&guard()!==true))return {notAttempted:true};
   if(deadline!=null&&clock()>=deadline)return {notAttempted:true};
   const headers={};if(access)headers.Authorization='Bearer '+access;
   if(method==='POST')headers['Content-Type']='application/x-www-form-urlencoded;charset=utf-8';
   // Only fixed endpoints in this module may reach the trusted request adapter.
   try{return deps.request({url,method,headers,body:method==='POST'?form(params||{}):undefined});}
   catch(_){return {httpStatus:0,body:null};}
  }
  function tokenBody(v,p){
   return call(v,TOKEN,'POST',{...p,client_id:config.clientId,client_secret:config.clientSecret});
  }
  function parseToken(r,old){
   if(!success(r))return null;
   const b=r.body,n=clock();
   if(!text(b.access_token,4000)||String(b.token_type).toLowerCase()!=='bearer'||!seconds(b.expires_in))return null;
   let refresh=old?.refreshToken,refreshUntil=old?.refreshUntil;
   if(b.refresh_token!==undefined){
    if(!text(b.refresh_token,4000)||!seconds(b.refresh_token_expires_in))return null;
    refresh=b.refresh_token;refreshUntil=n+b.refresh_token_expires_in*1000;
   }
   if(!text(refresh,4000)||!Number.isSafeInteger(refreshUntil)||refreshUntil<=n)return null;
   return {accessToken:b.access_token,accessUntil:n+b.expires_in*1000,refreshToken:refresh,refreshUntil};
  }
  function verifyAccount(v,t){
   const info=call(v,INFO,'GET',null,t.accessToken);
   if(!success(info)||account(info.body.app_id)!==appId||!account(info.body.id))return null;
   const id=account(info.body.id);
   const scopes=call(v,SCOPES+'?'+form({scopes:JSON.stringify(['talk_message'])}),'GET',null,t.accessToken);
   if(!success(scopes)||account(scopes.body.id)!==id||!Array.isArray(scopes.body.scopes)||!scopes.body.scopes.some(s=>s.id==='talk_message'&&s.agreed===true))return null;
   return id;
  }
  function begin(ctx){
   auth(ctx);const v=read();
   must(!v.token&&!v.armed,'disconnect current account before reconnect');
   const state=deps.randomState();must(/^[a-f0-9]{64}$/.test(state),'strong random state required');
   v.pending={stateHash:deps.sha256(state),sessionHash:deps.sha256(ctx.sessionBinding),expiresAt:clock()+600000,phase:'started'};
   write(v);
   return {authorizationUrl:AUTH+'?'+form({response_type:'code',client_id:config.clientId,redirect_uri:config.redirectUri,scope:'talk_message',state,prompt:'login'})};
  }
  function finish(ctx,input){
   auth(ctx);const v=read(),p=v.pending;
   must(p?.phase==='started'&&p.expiresAt>clock()&&p.sessionHash===deps.sha256(ctx.sessionBinding)&&typeof input?.state==='string'&&p.stateHash===deps.sha256(input.state),'OAuth state/session mismatch or expired');
   // Consume before token exchange. A failed or interrupted attempt must restart.
   v.pending=null;write(v);
   if(input.error)return {ok:false,reason:'authorization-denied'};
   must(text(input.code,2000),'authorization code required');
   const r=tokenBody(v,{grant_type:'authorization_code',redirect_uri:config.redirectUri,code:input.code});
   const t=parseToken(r,null);
   if(!t)return {ok:false,reason:'token-exchange-failed'};
   const id=verifyAccount(v,t);
   if(!id||(v.boundId&&v.boundId!==id))return {ok:false,reason:'account-or-consent-mismatch'};
   v.pending={phase:'confirm',sessionHash:deps.sha256(ctx.sessionBinding),expiresAt:clock()+300000,accountId:id,token:t};
   write(v);
   return {ok:true,needsConfirmation:true,accountId:id};
  }
  function confirm(ctx,input){
   auth(ctx);const v=read(),p=v.pending;
   must(p?.phase==='confirm'&&p.expiresAt>clock()&&p.sessionHash===deps.sha256(ctx.sessionBinding)&&input?.confirm===true&&input.accountId===p.accountId,'explicit same-session account confirmation required');
   must(!v.boundId||v.boundId===p.accountId,'different recipient forbidden');
   v.boundId=p.accountId;v.token=p.token;v.pending=null;v.armed=false;write(v);
   return {ok:true,connected:true,armed:false};
  }
  function status(ctx){
   auth(ctx);const v=read();
   return {connected:!!v.token,armed:v.armed===true,accountId:v.boundId,refreshExpired:!!v.token&&v.token.refreshUntil<=clock()};
  }
  function arm(ctx,on){
   auth(ctx);must(typeof on==='boolean','explicit boolean required');const v=read();
   if(on)must(v.token&&v.boundId&&v.token.refreshUntil>clock()&&deps.approved(owner)===true,'release/plan/consent approval required');
   v.armed=on;write(v);return {ok:true,armed:on};
  }
  function refresh(v){
   const n=clock(),old=v.token;
   if(!old||old.refreshUntil<=n)return null;
   if(old.accessUntil>n+120000)return old;
   if(v.refreshAfter&&n<v.refreshAfter)return null;
   v.refreshAfter=n+600000;write(v);
   const reply=tokenBody(v,{grant_type:'refresh_token',refresh_token:old.refreshToken});
   const t=parseToken(reply,old);
   if(!t){if(reply?.body?.error==='invalid_grant'){v.armed=false;v.token=null;write(v);}return null;}
   // Persist rotated refresh token BEFORE additional verification/network calls.
   // Keep sending disarmed if the identity check is interrupted or fails.
   const wasArmed=v.armed;v.armed=false;v.token=t;write(v);
   if(verifyAccount(v,t)!==v.boundId){v.token=null;write(v);return null;}
   v.armed=wasArmed;write(v);return t;
  }
  function ready(target){
   lock();if(target!==owner||deps.approved(owner)!==true)return false;
   const v=read(),n=clock();
   return !!(v.armed&&v.token&&v.boundId&&v.token.refreshUntil>n&&windowOpen(n)&&remaining(budget(v,n)));
  }
  function sendSelf(target,message,deadline,guard){
   lock();must(target===owner&&text(message,200)&&Number.isSafeInteger(deadline)&&typeof guard==='function','invalid self-message');
   deadline=Math.min(deadline,Date.parse(keyDate(clock())+'T20:00:00+09:00'));
   const skip={notAttempted:true};
   if(!ready(target)||clock()>=deadline||guard()!==true)return skip;
   const v=read(),t=refresh(v);
   if(!t||!v.armed||deps.approved(owner)!==true)return skip;
   const wait=1000-(clock()-budget(v,clock()).lastAt);
   if(wait>0){if(clock()+wait>=deadline)return skip;deps.sleep(wait);}
   if(!windowOpen(clock())||clock()>=deadline||deps.approved(owner)!==true||guard()!==true)return skip;
   const template={object_type:'text',text:message,link:{web_url:config.linkUrl,mobile_web_url:config.linkUrl},button_title:'학습노트 보기'};
   const reply=call(v,SEND,'POST',{template_object:JSON.stringify(template)},t.accessToken,deadline,()=>deps.approved(owner)===true&&windowOpen(clock())&&guard()===true);
   if(reply?.notAttempted===true)return skip;
   const body=reply?.body;
   // Provider failures are never returned with token or raw error text.
   if(reply?.httpStatus===401||reply?.httpStatus===403||reply?.httpStatus===429){v.armed=false;write(v);}
   return {httpStatus:reply?.httpStatus||0,body:body&&typeof body==='object'?{result_code:body.result_code,code:body.code}:null};
  }
  // Separate, explicit test gate. Fixed text only; no automatic send arming.
  function sendTest(ctx,deadline,guard){
   auth(ctx);must(Number.isSafeInteger(deadline)&&typeof guard==='function','invalid test request');
   const skip={notAttempted:true},allow=()=>typeof deps.testApproved==='function'&&deps.testApproved(owner)===true&&guard()===true;
   deadline=Math.min(deadline,Date.parse(keyDate(clock())+'T20:00:00+09:00'));
   if(!allow()||!windowOpen(clock())||clock()>=deadline)return skip;
   const v=read();
   if(!v.token||!v.boundId||v.token.refreshUntil<=clock()||!remaining(budget(v,clock())))return skip;
   const t=refresh(v);if(!t||!allow())return skip;
   const wait=1000-(clock()-budget(v,clock()).lastAt);
   if(wait>0){if(clock()+wait>=deadline)return skip;deps.sleep(wait);}
   if(!windowOpen(clock())||clock()>=deadline||!allow())return skip;
   const template={object_type:'text',text:'학습노트 카카오톡 연결 테스트입니다. 자동 학습 알림과 학습 진도는 변경하지 않았습니다.',link:{web_url:config.linkUrl,mobile_web_url:config.linkUrl},button_title:'학습노트 보기'};
   const reply=call(v,SEND,'POST',{template_object:JSON.stringify(template)},t.accessToken,deadline,()=>allow()&&windowOpen(clock()));
   if(reply?.notAttempted===true)return skip;
   if([401,403,429].includes(reply?.httpStatus)){v.armed=false;write(v);}
   return {httpStatus:reply?.httpStatus||0,body:reply?.body&&typeof reply.body==='object'?{result_code:reply.body.result_code,code:reply.body.code}:null};
  }
  function disconnect(ctx){
   auth(ctx);const v=read(),t=v.token,id=v.boundId;
   // Local disable and credential destruction first; do not revive on failure.
   v.armed=false;v.pending=null;v.token=null;write(v);
   if(!t||t.accessUntil<=clock())return {connected:false,providerRevoked:false};
   const r=call(v,UNLINK,'POST',{},t.accessToken);
   return {connected:false,providerRevoked:!!(success(r)&&account(r.body.id)===id)};
  }
  return Object.freeze({begin,finish,confirm,status,arm,ready,sendSelf,sendTest,disconnect});
 }
 return Object.freeze({create});
});
