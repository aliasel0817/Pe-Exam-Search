/* Stage 3 single-owner host candidate. No HTTP routes, timers or deployment.
 * A real host MUST supply a verifier that performs the existing ACTIVE/HMAC/
 * nonce checks and owner/session mapping. Never pass client JSON as auth context.
 */
(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./study-notification-core.js'),require('./study-notification-service.js'));
 else root.StudyNotificationHostFactory=factory;
})(typeof globalThis!=='undefined'?globalThis:this,function(core,service){
 'use strict';
 const NAME='제141회 정보관리 기술사 - 3회독 스케쥴링';
 const must=(v,m)=>{if(!v)throw Error(m);};
 function create(config,deps){
  must(config&&typeof config.ownerId==='string'&&config.ownerId.length>0&&typeof config.targetPlanId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(config.targetPlanId),'explicit owner and target plan required');
  for(const name of ['verifySignedRequest','now','releaseApproved','createProvider'])must(typeof deps?.[name]==='function','trusted host dependency required: '+name);
  must(deps.store&&typeof deps.store.exclusive==='function'&&deps.reader,'trusted store/reader required');
  const owner=config.ownerId,id=config.targetPlanId;
  let activeTx=null,cachedPlan=undefined;
  // One outer script lock for all journal and private vault actions.
  // Nested service calls reuse the current transaction; never acquire it again.
  const store={exclusive(work){
   if(activeTx)return work(activeTx);
   return deps.store.exclusive(tx=>{
    activeTx=tx;cachedPlan=undefined;
    try{return work(tx);}finally{activeTx=null;cachedPlan=undefined;}
   });
  }};
  function plan(){
   if(cachedPlan===undefined){
    const p=deps.reader.loadVerifiedPlan(owner,id);
    cachedPlan=p?.verified===true&&p.id===id&&p.name===NAME&&p.rounds===3?p:null;
   }
   return cachedPlan;
  }
  function current(p){return !!p&&deps.reader.isPlanCurrent(owner,p)===true;}
  function approved(target){
   const p=plan();
   return target===owner&&deps.releaseApproved(owner)===true&&current(p);
  }
  function testApproved(target){return target===owner&&typeof deps.testApproved==='function'&&deps.testApproved(owner)===true&&current(plan());}
  const provider=deps.createProvider({assertLocked:()=>activeTx!==null,approved,testApproved});
  const testKey=date=>'test|'+encodeURIComponent(owner)+'|'+date;
  function auth(request){
   const ctx=deps.verifySignedRequest(request);
   must(ctx&&ctx.verified===true&&ctx.ownerId===owner&&typeof ctx.sessionBinding==='string'&&ctx.sessionBinding.length>0,'authenticated owner required');
   return ctx;
  }
  function snapshot(ctx){
   const p=plan(),r=service.readSettings(store,owner),account=provider.status(ctx),date=core.kst(deps.now()).date;
   const day=p?.days.find(d=>d.date===date),stats=service.status(store,owner,date,day||{round:null,ids:[]});
   const ready=approved(owner)&&account.connected&&!account.refreshExpired;
   const now=deps.now(),start=Date.parse(date+'T08:30:00+09:00'),end=Date.parse(date+'T20:00:00+09:00');
   const candidate=Math.max(now,start,service.nextEligible(store,owner)||0);
   const nextCheckAt=ready&&account.armed===true&&r.settings?.enabled===true&&day?.ids.length>stats.confirmed&&candidate<end?candidate:null;
   const lastTest=activeTx.get(testKey(date));
   const testReady=testApproved(owner)&&account.connected&&!account.refreshExpired&&now>=start&&now<end&&(!lastTest||lastTest.state==='not-attempted');
   return {date,nextCheckAt,testReady,settingsVersion:r.version,settings:r.settings,plans:p&&current(p)?[{id:p.id,name:p.name,rounds:p.rounds,verified:true}]:[],
    account,releaseReady:ready,
    stats:p&&current(p)&&r.settings?.planId===id?{assigned:day?.ids.length||0,confirmed:stats.confirmed,pending:stats.pending,unknown:stats.unknown,rejected:stats.rejected}:null};
  }
  function save(ctx,data){
   must(data&&Number.isSafeInteger(data.expectedVersion),'expected settings version required');
   const s=core.cleanSettings(data.settings),old=service.readSettings(store,owner);
   if(old.version!==data.expectedVersion)return {ok:false,reason:'settings-conflict',version:old.version};
   must(s.planId===id||(!s.enabled&&s.planId===old.settings?.planId),'wrong plan ID');
   if(s.enabled){
    const status=provider.status(ctx);
    must(approved(owner)&&status.connected&&!status.refreshExpired,'enable gate not ready');
   }
   // Disarm before changing settings. A failed save cannot leave the prior
   // transport armed against a partially changed configuration.
   provider.arm(ctx,false);
   const result=service.saveSettings(store,owner,data.expectedVersion,s);
   if(result.ok&&s.enabled){
    try{provider.arm(ctx,true);}catch(_){
     // Both gates must agree before sends. A failed arm must not be claimed as success.
     provider.arm(ctx,false);return {ok:false,reason:'activation-held',version:result.version};
    }
   }
   return result;
  }
  function preview(data){
   const s=core.cleanSettings(data),p=plan();
   must(s.planId===id&&current(p),'verified plan required');
   const today=core.kst(deps.now()).date,day=p.days.find(d=>d.date===today);
   if(!day?.ids.length)return {parts:[],reason:'no-scheduled-topic'};
   const tid=day.ids[0],topic=deps.reader.loadTopic(owner,tid);
   must(topic&&topic.topicId===tid&&deps.reader.isTopicEligible(owner,tid)===true,'topic unavailable');
   return {parts:core.prepareTopic(topic,s).parts.map(x=>x.message)};
  }
  function test(ctx,data){
   must(data?.confirm===true&&Number.isSafeInteger(data.expectedVersion),'explicit test confirmation required');
   const version=service.readSettings(store,owner).version;
   if(version!==data.expectedVersion)return {ok:false,reason:'settings-conflict'};
   const n=deps.now(),local=core.kst(n),deadline=Date.parse(local.date+'T20:00:00+09:00');
   must(testApproved(owner)&&local.minute>=510&&local.minute<1200,'test gate not ready');
   const account=provider.status(ctx);
   must(account.connected&&!account.refreshExpired&&typeof provider.sendTest==='function','test account not ready');
   const key=testKey(local.date),prev=activeTx.get(key);
   if(prev&&prev.state!=='not-attempted')return {ok:false,reason:'test-already-attempted',confirmed:prev.state==='confirmed',unknown:['sending','unknown'].includes(prev.state)};
   activeTx.commit([{key,value:{state:'sending',at:n}}]);
   let state='unknown';
   try{
    const reply=provider.sendTest(ctx,deadline,()=>testApproved(owner)&&core.kst(deps.now()).date===local.date&&deps.now()<deadline);
    state=reply?.notAttempted===true?'not-attempted':core.classifyKakaoOutcome(reply?.httpStatus,reply?.body);
   }catch(_){}
   activeTx.commit([{key,value:{state,at:n}}]);
   return {ok:state==='confirmed',confirmed:state==='confirmed',unknown:state==='unknown',reason:state};
  }
  function disconnect(ctx){
   // provider disconnect erases local credentials and disarms before any unlink I/O.
   const result=provider.disconnect(ctx),old=service.readSettings(store,owner);
   if(old.settings?.enabled)service.saveSettings(store,owner,old.version,{...old.settings,enabled:false});
   return result;
  }
  // Only an already authenticated server router may call dispatch. The actual
  // production verifier/route adapter and redirect landing are NOT installed.
  function dispatch(action,request,data){
   const ctx=auth(request);
   return store.exclusive(()=>{
    switch(action){
     case 'snapshot':return snapshot(ctx);
     case 'save':return save(ctx,data);
     case 'preview':return preview(data);
     case 'begin':return provider.begin(ctx);
     case 'finish':return provider.finish(ctx,data);
     case 'confirm':return provider.confirm(ctx,data);
     case 'disconnect':return disconnect(ctx);
     case 'history':{
      if(data?.scope==='unconfirmed-today'){
       const today=core.kst(deps.now()).date,p=plan();
       must(data.date===today&&current(p),'verified current day required');
       return service.unconfirmedToday(store,owner,p,today,data.offset??0,data.limit??20,tid=>deps.reader.loadTopic(owner,tid));
      }
      must(!data?.scope,'unknown history scope');
      return service.history(store,owner,data?.date,data?.offset??0,data?.limit??20);
     }
     case 'test':return test(ctx,data);
     default:throw Error('unknown notification action');
    }
   });
  }
  // No client route maps to tick. Only a future explicitly activated trusted
  // scheduler may call this method. No manual arbitrary-message endpoint.
  function tick(){
   return service.runTick(store,owner,{now:deps.now,ready:target=>approved(target)&&provider.ready(target),
    loadVerifiedPlan:(target,planId)=>target===owner&&planId===id?plan():null,
    isPlanCurrent:(target,p)=>target===owner&&current(p),
    loadTopic:(target,tid)=>target===owner?deps.reader.loadTopic(owner,tid):null,
    isTopicEligible:(target,tid)=>target===owner&&deps.reader.isTopicEligible(owner,tid)===true,
    sendSelf:(target,message,deadline,guard)=>provider.sendSelf(target,message,deadline,guard)});
  }
  return Object.freeze({dispatch,tick});
 }
 return Object.freeze({create,NAME});
});
