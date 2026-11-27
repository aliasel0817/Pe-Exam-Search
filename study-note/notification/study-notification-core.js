/* Pure stage-1 candidate. No network, storage, credentials, timers or production hooks. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.StudyNotificationCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FIELDS=Object.freeze([
    ['concept','개념'],['background','등장배경'],['necessity','필요성'],
    ['features','특징'],['technicalComponents','기술요소/구성요소'],
    ['keywords','키워드'],['mnemonic','암기법'],['relatedTopics','관련토픽']
  ].map(Object.freeze));
  const START=510, END=1200, INTERVALS=Object.freeze([1,3,5,10,15,30,60]);
  const PLAN=/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/, TOPIC=/^T\d{4}$/, HASH=/^[a-f0-9]{64}$/i;
  const DEFAULTS=Object.freeze({enabled:false,intervalMinutes:5,selectionOrder:'schedule',
    fields:Object.freeze(['concept','keywords','mnemonic']),maxTopicsPerSlot:5,maxMessagesPerSlot:20});
  function requireValue(ok,message){if(!ok)throw new Error(message);}
  function isDate(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const d=new Date(value+'T00:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
  }
  function integer(value,min,max){return Number.isInteger(value)&&value>=min&&value<=max;}
  function cleanSettings(raw){
    requireValue(raw&&typeof raw==='object','settings required');
    requireValue(typeof raw.enabled==='boolean','enabled must be boolean');
    requireValue(PLAN.test(raw.planId||''),'explicit plan ID required');
    requireValue(INTERVALS.includes(raw.intervalMinutes),'unsupported interval');
    requireValue(['schedule','random'].includes(raw.selectionOrder),'unsupported order');
    requireValue(Array.isArray(raw.fields)&&raw.fields.every(x=>FIELDS.some(f=>f[0]===x)),'unknown field');
    requireValue(new Set(raw.fields).size===raw.fields.length,'duplicate field');
    requireValue(integer(raw.maxTopicsPerSlot,1,20),'invalid topic cap');
    requireValue(integer(raw.maxMessagesPerSlot,1,100),'invalid message cap');
    return {enabled:raw.enabled,planId:raw.planId,intervalMinutes:raw.intervalMinutes,
      selectionOrder:raw.selectionOrder,fields:FIELDS.map(f=>f[0]).filter(k=>raw.fields.includes(k)),
      maxTopicsPerSlot:raw.maxTopicsPerSlot,maxMessagesPerSlot:raw.maxMessagesPerSlot};
  }
  function kst(now){
    const instant=now instanceof Date?now.getTime():now;
    requireValue(typeof instant==='number'&&Number.isFinite(instant),'explicit epoch milliseconds required');
    const d=new Date(instant+9*3600000);
    requireValue(Number.isFinite(d.getTime()),'invalid instant');
    return {date:d.toISOString().slice(0,10),minute:d.getUTCHours()*60+d.getUTCMinutes()};
  }
  function slotAt(now,interval){
    requireValue(INTERVALS.includes(interval),'unsupported interval');
    const local=kst(now);
    if(local.minute<START||local.minute>=END)return {...local,inWindow:false};
    const index=Math.floor((local.minute-START)/interval),total=Math.ceil((END-START)/interval);
    return {...local,inWindow:true,index,total,remainingSlots:total-index,scheduledMinute:START+index*interval};
  }
  const key=(...parts)=>JSON.stringify(parts);
  function dailyKey(ownerId,planId,date,topicId){
    requireValue(typeof ownerId==='string'&&ownerId.length>0,'owner required');
    requireValue(PLAN.test(planId||'')&&isDate(date)&&TOPIC.test(topicId||''),'invalid daily identity');
    return key(ownerId,planId,date,topicId);
  }
  function roundKey(ownerId,planId,round,topicId){
    requireValue(typeof ownerId==='string'&&ownerId.length>0,'owner required');
    requireValue(PLAN.test(planId||'')&&integer(round,1,3)&&TOPIC.test(topicId||''),'invalid round identity');
    return key(ownerId,planId,round,topicId);
  }
  function stableRank(str){
    let h=2166136261;
    for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
    return h>>>0;
  }
  /* The trusted server adapter must verify revision/chunk hashes before providing this envelope.
     A verified flag from a browser or arbitrary caller is NOT authentication. */
  function proposeSlot(input){
    requireValue(input&&typeof input==='object','input required');
    const s=cleanSettings(input.settings),slot=slotAt(input.now,s.intervalMinutes);
    const empty=(reason,extra)=>({reason,slot,candidates:[],...extra});
    if(!s.enabled)return empty('disabled');
    if(!slot.inWindow)return empty('outside-window');
    const owner=input.ownerId;
    requireValue(typeof owner==='string'&&owner.length>0,'owner required');
    requireValue(Array.isArray(input.records)&&Array.isArray(input.claimedSlotKeys),'durable history required');
    const plan=input.plan;
    if(!plan||plan.verified!==true||plan.id!==s.planId||plan.rounds!==3||
      !integer(plan.activeRevision,1,Number.MAX_SAFE_INTEGER)||!HASH.test(plan.activeHash||'')||
      !Array.isArray(plan.days))return empty('plan-unavailable');
    const days=plan.days.filter(d=>d&&d.date===slot.date);
    if(days.length===0)return empty('no-scheduled-day');
    if(days.length!==1)return empty('invalid-schedule');
    const day=days[0];
    if(!Array.isArray(day.ids)||!day.ids.every(id=>typeof id==='string'&&TOPIC.test(id))||
      new Set(day.ids).size!==day.ids.length)return empty('invalid-schedule');
    if(day.ids.length===0)return empty('no-topics');
    if(!integer(day.round,1,3))return empty('invalid-schedule');
    // Interval changes do not create a second claim for an identical wall-clock minute.
    // The adapter also enforces an atomic next-eligible-at rule across settings revisions.
    const slotKey=key(owner,s.planId,slot.date,slot.scheduledMinute);
    if(input.claimedSlotKeys.includes(slotKey))return empty('slot-already-claimed',{slotKey});
    const daySeen=new Set(),roundSeen=new Set();
    for(const row of input.records){
      if(!row||row.ownerId!==owner||row.planId!==s.planId)continue;
      requireValue(isDate(row.date)&&integer(row.round,1,3)&&TOPIC.test(row.topicId||''),'invalid persisted identity');
      // Every durable reservation blocks a new allocation, even partial/unknown/failed.
      // Confirmed retryable failures resume the original persisted parts, not a new reservation.
      if(row.date===slot.date)daySeen.add(row.topicId);
      if(row.round===day.round)roundSeen.add(row.topicId);
    }
    const available=day.ids.filter(id=>!daySeen.has(id)&&!roundSeen.has(id));
    if(s.selectionOrder==='random')available.sort((a,b)=>{
      const prefix=key(owner,s.planId,slot.date,day.round);
      return stableRank(prefix+a)-stableRank(prefix+b)||a.localeCompare(b);
    });
    if(!available.length)return empty('nothing-to-send',{slotKey,remaining:0});
    const wanted=Math.ceil(available.length/slot.remainingSlots);
    const candidates=available.slice(0,Math.min(wanted,s.maxTopicsPerSlot)).map(topicId=>({
      ownerId:owner,planId:s.planId,date:slot.date,round:day.round,topicId,
      dailyKey:dailyKey(owner,s.planId,slot.date,topicId),
      roundKey:roundKey(owner,s.planId,day.round,topicId),
      activeRevision:plan.activeRevision,activeHash:plan.activeHash
    }));
    return {reason:'ready',slot,slotKey,candidates,remaining:available.length,
      wanted,capacityRisk:available.length>slot.remainingSlots*s.maxTopicsPerSlot};
  }
  function buildBody(topic,fields){
    requireValue(topic&&TOPIC.test(topic.topicId||'')&&typeof topic.topicName==='string'&&topic.topicName.trim(),'verified topic required');
    requireValue(Array.isArray(fields)&&fields.every(k=>FIELDS.some(f=>f[0]===k))&&new Set(fields).size===fields.length,'unknown/duplicate field');
    const blocks=['토픽: '+topic.topicName];
    for(const [k,label] of FIELDS){
      if(!fields.includes(k))continue;
      const value=topic[k];
      requireValue(value===undefined||value===null||typeof value==='string','text field required: '+k);
      blocks.push('['+label+']\n'+(value===undefined||value===null||value===''?'(미등록)':value));
    }
    return blocks.join('\n\n');
  }
  /* Limit UTF-16 units conservatively; never split surrogate pairs or delete body text.
     For an unusually long title the prefix uses only the ID; full title remains in body. */
  function splitBody(body,topic,max=200){
    requireValue(typeof body==='string'&&body.length>0&&topic&&TOPIC.test(topic.topicId||''),'invalid body/ID');
    requireValue(integer(max,40,200),'invalid template limit');
    const title=typeof topic.topicName==='string'&&topic.topicName.length<=Math.floor(max/3)?' '+topic.topicName:'';
    const prefix=(part,total)=>'['+topic.topicId+title+' '+part+'/'+total+']\n';
    const digits=String(body.length).length;
    const worst=prefix('9'.repeat(digits),'9'.repeat(digits)).length;
    const capacity=max-worst;
    requireValue(capacity>=2,'message header too long');
    const chunks=[];let chunk='';
    for(const cp of body){
      if(chunk.length+cp.length>capacity){chunks.push(chunk);chunk='';}
      chunk+=cp;
    }
    if(chunk)chunks.push(chunk);
    return chunks.map((text,index)=>{
      const header=prefix(index+1,chunks.length),message=header+text;
      requireValue(message.length<=max,'template overflow');
      return {part:index+1,total:chunks.length,header,text,message};
    });
  }
  function prepareTopic(topic,settings){
    const s=cleanSettings(settings),body=buildBody(topic,s.fields),parts=splitBody(body,topic);
    return {topicId:topic.topicId,body,parts,exceedsSlotCap:parts.length>s.maxMessagesPerSlot};
  }
  // Conservative transport outcome. Never blindly resend a timeout, 5xx, or malformed response.
  function classifyKakaoOutcome(httpStatus,body){
    if(httpStatus>=200&&httpStatus<300&&body&&body.result_code===0)return 'confirmed';
    if(integer(httpStatus,400,499)&&body&&Number.isInteger(body.code)&&body.code<0)return 'rejected';
    return 'unknown';
  }
  return Object.freeze({FIELDS,DEFAULTS,START,END,INTERVALS,cleanSettings,kst,slotAt,dailyKey,roundKey,
    proposeSlot,buildBody,splitBody,prepareTopic,classifyKakaoOutcome});
});
