/* Stage 2 candidate: server-only service. No real transport, timers or global routes. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./study-notification-core.js'));
  else root.StudyNotificationServiceFactory=factory;
})(typeof globalThis!=='undefined'?globalThis:this,function(core){
  'use strict';
  const must=(ok,msg)=>{if(!ok)throw Error(msg);};
  const enc=s=>encodeURIComponent(s);
  const clone=o=>JSON.parse(JSON.stringify(o));
  const scope=(kind,owner)=>kind+'|'+enc(owner)+'|';
  const settingsKey=o=>scope('settings',o);
  const slotKey=o=>scope('slot',o);
  const jobPrefix=o=>scope('job',o);
  const jobKey=(o,p,d,t)=>jobPrefix(o)+[p,d,t].map(enc).join('|');
  const partPrefix=j=>'part|'+j+'|';
  const partKey=(j,i)=>partPrefix(j)+String(i).padStart(8,'0');
  const isOwner=o=>typeof o==='string'&&o.length>0&&o.length<=200;
  const patch=(key,value)=>({key,value});
  function checkOwner(owner){must(isOwner(owner),'verified server owner required');}
  function saveSettings(store,owner,expectedVersion,raw){
    checkOwner(owner);
    const next=core.cleanSettings(raw);
    must(Number.isSafeInteger(expectedVersion)&&expectedVersion>=0,'expected version required');
    return store.exclusive(tx=>{
      const k=settingsKey(owner),old=tx.get(k),v=old?old.version:0;
      if(v!==expectedVersion)return {ok:false,reason:'settings-conflict',version:v};
      must(v<Number.MAX_SAFE_INTEGER,'settings version exhausted');
      const value={version:v+1,settings:next};
      tx.commit([patch(k,value)]);
      return {ok:true,...clone(value)};
    });
  }
  function readSettings(store,owner){
    checkOwner(owner);
    return store.exclusive(tx=>clone(tx.get(settingsKey(owner))||{version:0,settings:null}));
  }
  function listJobs(tx,owner){
    const rows=tx.list(jobPrefix(owner));
    for(const r of rows)must(r&&r.value&&r.value.ownerId===owner&&r.key===jobKey(owner,r.value.planId,r.value.date,r.value.topicId),'job identity mismatch');
    return rows.map(r=>({...r.value,key:r.key}));
  }
  function readParts(tx,job){
    const rows=tx.list(partPrefix(job.key)).sort((a,b)=>a.key.localeCompare(b.key));
    must(rows.length===job.partCount&&rows.every((r,i)=>r.key===partKey(job.key,i+1)&&r.value.part===i+1&&r.value.total===job.partCount&&typeof r.value.message==='string'&&r.value.message.length<=200&&['pending','sending','confirmed','rejected','unknown'].includes(r.value.state)),'persisted part set invalid');
    return rows;
  }
  function recoverJob(tx,job){
    const rows=readParts(tx,job),changes=[];
    for(const r of rows)if(r.value.state==='sending'){
      r.value={...r.value,state:'unknown'};
      changes.push(patch(r.key,r.value));
    }
    const states=rows.map(r=>r.value.state);
    const status=states.includes('unknown')?'unknown':states.includes('rejected')?'rejected':states.every(s=>s==='confirmed')?'confirmed':'pending';
    if(job.status!==status){job={...job,status};const {key,...value}=job;changes.push(patch(key,value));}
    if(changes.length)tx.commit(changes);
    return {job,rows};
  }
  function reserve(tx,candidate,prepared,settingsVersion){
    const key=jobKey(candidate.ownerId,candidate.planId,candidate.date,candidate.topicId);
    must(!tx.get(key),'duplicate reservation');
    must(prepared.topicId===candidate.topicId&&prepared.parts.length>0,'message identity mismatch');
    const job={...candidate,settingsVersion,status:'pending',partCount:prepared.parts.length};
    const changes=[patch(key,job)];
    for(const p of prepared.parts)changes.push(patch(partKey(key,p.part),{part:p.part,total:p.total,message:p.message,state:'pending'}));
    tx.commit(changes);
    return {...job,key};
  }
  function runTick(store,owner,deps){
    checkOwner(owner);
    for(const name of ['now','ready','loadVerifiedPlan','isPlanCurrent','loadTopic','sendSelf'])must(typeof deps?.[name]==='function','trusted adapter required: '+name);
    return store.exclusive(tx=>{
      const record=tx.get(settingsKey(owner));
      const result={reason:'disabled',attempted:0,confirmedParts:0,held:0,reserved:0};
      if(!record?.settings?.enabled)return result;
      const settings=core.cleanSettings(record.settings),now=deps.now();
      const slot=core.slotAt(now,settings.intervalMinutes);
      if(!slot.inWindow)return {...result,reason:'outside-window'};
      if(deps.ready(owner)!==true)return {...result,reason:'not-ready'};
      const last=tx.get(slotKey(owner));
      if(last&&(!Number.isFinite(last.nextEligibleAt)||typeof last.claimedKey!=='string'))throw Error('slot state invalid');
      if(last&&now<last.nextEligibleAt)return {...result,reason:'rate-held'};
      const plan=deps.loadVerifiedPlan(owner,settings.planId);
      const jobs=listJobs(tx,owner);
      const proposal=core.proposeSlot({settings,now,ownerId:owner,plan,records:jobs,claimedSlotKeys:last?[last.claimedKey]:[]});
      if(!['ready','nothing-to-send'].includes(proposal.reason))return {...result,reason:proposal.reason};
      const day=plan.days.find(d=>d.date===slot.date);
      if(deps.isPlanCurrent(owner,plan)!==true)return {...result,reason:'plan-changed'};
      // Only current day's still-assigned pending jobs may resume.
      const due=jobs.filter(j=>j.planId===settings.planId&&j.date===slot.date&&j.round===day.round&&day.ids.includes(j.topicId)&&j.status!=='confirmed');
      const pending=[];
      for(const job of due){
        const recovered=recoverJob(tx,job);
        if(recovered.job.status==='pending')pending.push(recovered.job);
        else if(recovered.job.status!=='confirmed')result.held++;
      }
      if(!pending.length&&!proposal.candidates.length)return {...result,reason:'nothing-to-send'};
      // Claim durable slot before any external call. Crash here loses a slot, not a message.
      const fresh=core.slotAt(deps.now(),settings.intervalMinutes);
      if(!fresh.inWindow||fresh.date!==slot.date||fresh.index!==slot.index)return {...result,reason:'slot-expired'};
      tx.commit([patch(slotKey(owner),{claimedKey:proposal.slotKey,nextEligibleAt:now+settings.intervalMinutes*60000,settingsVersion:record.version})]);
      let processed=0,stop=false;
      function canSend(){
        const n=core.slotAt(deps.now(),settings.intervalMinutes);
        return n.inWindow&&n.date===slot.date&&n.index===slot.index&&deps.ready(owner)===true&&deps.isPlanCurrent(owner,plan)===true;
      }
      function deliver(job){
        processed++;
        const {rows}=recoverJob(tx,job);
        for(const r of rows){
          if(r.value.state==='confirmed')continue;
          if(r.value.state!=='pending'){result.held++;return;}
          if(result.attempted>=settings.maxMessagesPerSlot||!canSend()){stop=true;return;}
          // Persist the uncertain marker before the request; on crash never resend blindly.
          tx.commit([patch(r.key,{...r.value,state:'sending'})]);
          if(!canSend()){
            tx.commit([patch(r.key,{...r.value,state:'pending'})]);
            stop=true;return;
          }
          result.attempted++;
          let outcome='unknown';
          try{
            const reply=deps.sendSelf(owner,r.value.message);
            outcome=core.classifyKakaoOutcome(reply?.httpStatus,reply?.body);
          }catch(_){/* request may have reached Kakao; do not retry */}
          tx.commit([patch(r.key,{...r.value,state:outcome})]);
          if(outcome==='confirmed')result.confirmedParts++;
          else {result.held++;recoverJob(tx,job);stop=true;return;}
        }
        recoverJob(tx,job);
      }
      for(const j of pending){
        if(stop||processed>=settings.maxTopicsPerSlot||result.attempted>=settings.maxMessagesPerSlot)break;
        deliver(j);
      }
      for(const candidate of proposal.candidates){
        if(stop||processed>=settings.maxTopicsPerSlot||result.attempted>=settings.maxMessagesPerSlot||!canSend())break;
        const topic=deps.loadTopic(owner,candidate.topicId);
        if(!topic||topic.topicId!==candidate.topicId){result.held++;continue;}
        const prepared=core.prepareTopic(topic,settings);
        if(!canSend())break;
        const job=reserve(tx,candidate,prepared,record.version);
        result.reserved++;
        deliver(job);
      }
      return {...result,reason:'processed',capacityRisk:proposal.capacityRisk===true};
    });
  }
  function status(store,owner,date){
    checkOwner(owner);
    must(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date),'date required');
    return store.exclusive(tx=>{
      const s=tx.get(settingsKey(owner)),planId=s?.settings?.planId;
      const result={settingsVersion:s?.version||0,planId:planId||null,date,reserved:0,confirmed:0,pending:0,rejected:0,unknown:0};
      for(const j of listJobs(tx,owner).filter(j=>j.planId===planId&&j.date===date)){
        const states=readParts(tx,j).map(r=>r.value.state);
        const state=states.some(x=>x==='unknown'||x==='sending')?'unknown':states.includes('rejected')?'rejected':states.every(x=>x==='confirmed')?'confirmed':'pending';
        result.reserved++;result[state]++;
      }
      return result;
    });
  }
  return Object.freeze({saveSettings,readSettings,runTick,status});
});
