/* Read-only candidate, grounded in the existing planner snapshot protocol.
 * No writes, no fallback plan; only a trusted server can construct the adapter.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.StudyNotificationPlanReader=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PLAN_HEADERS=['planId','name','start','end','rounds','activeRevision','nextRevision','activeHash','dayCount','slotCount','groupCount','progressSeq','status','createdAt','updatedAt','schemaVersion'];
 const CHUNK_HEADERS=['planId','revision','chunkKey','kind','date','round','partIndex','partCount','payloadJson','chunkHash','stageId','createdAt'];
 const TOPIC_HEADERS=['통합ID','구분','도메인','도메인명','대분류','대분류코드','코드','중요도','통합토픽','개념','키워드','암기법','관련토픽','상태','원본도메인','서브노트페이지','교재페이지','원본/연결행수','다중도메인','비고','학습대상','학습제외사유','등장배경','특징','기술요소·구성요소','필요성'];
 const must=(v,m)=>{if(!v)throw Error(m);};
 const isDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 const planId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(id);
 const tid=id=>typeof id==='string'&&/^T\d{4}$/.test(id);
 const hash=h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h);
 const int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
 function metadata(rows,id){
  must(planId(id)&&Array.isArray(rows),'exact plan ID required');
  const matches=rows.filter(r=>r[0]===id);
  if(!matches.length)return null;
  must(matches.length===1,'duplicate plan ID');
  const r=matches[0],v={id:r[0],name:r[1],start:r[2],end:r[3],rounds:Number(r[4]),activeRevision:Number(r[5]),activeHash:r[7],dayCount:Number(r[8]),slotCount:Number(r[9]),groupCount:Number(r[10])};
  must(typeof v.name==='string'&&v.name.length&&isDate(v.start)&&isDate(v.end)&&v.end>=v.start&&v.rounds===3&&r[12]==='ACTIVE'&&Number(r[15])===1&&int(v.activeRevision,1,Number.MAX_SAFE_INTEGER)&&hash(v.activeHash)&&int(v.dayCount,1,730)&&int(v.slotCount,0,100000)&&int(v.groupCount,0,10000),'plan not active/valid three-round revision');
  return v;
 }
 function verifySnapshot(meta,rows,sha){
  must(meta&&Array.isArray(rows)&&typeof sha==='function','snapshot required');
  const groupsParts=new Map(),daysParts=new Map(),keys=new Set();
  const selected=rows.filter(r=>r[0]===meta.id&&Number(r[1])===meta.activeRevision);
  must(selected.length>0&&selected.length<=10000,'missing/oversized active chunks');
  for(const r of selected){
    const kind=r[3],date=r[4],round=r[5]===''||r[5]==null?null:Number(r[5]),idx=Number(r[6]),count=Number(r[7]),payload=r[8],key=r[2];
    must((kind==='GROUPS'&&date===''&&round===null)||(kind==='DAY'&&isDate(date)&&(round===null||int(round,1,3))),'invalid chunk metadata');
    must(int(count,1,1000)&&int(idx,0,count-1)&&key===(kind==='GROUPS'?'GROUPS:':'DAY:'+date+':')+String(idx).padStart(3,'0')&&!keys.has(key),'chunk identity invalid');
    must(typeof payload==='string'&&hash(r[9])&&sha(payload)===r[9],'chunk SHA-256 mismatch');
    const items=JSON.parse(payload);must(Array.isArray(items)&&items.every(x=>Array.isArray(x)&&x.length===2&&typeof x[0]==='string'&&typeof x[1]==='string'),'invalid chunk items');
    keys.add(key);
    const target=kind==='GROUPS'?groupsParts:daysParts,k=kind==='GROUPS'?'GROUPS':date;
    if(!target.has(k))target.set(k,{count,round,parts:new Map()});
    const p=target.get(k);must(p.count===count&&p.round===round&&!p.parts.has(idx),'chunk part conflict');
    p.parts.set(idx,items);
  }
  function flatten(p){
   must(p&&p.parts.size===p.count,'missing chunk parts');
   const rows=[];for(let i=0;i<p.count;i++){must(p.parts.has(i),'missing chunk');rows.push(...p.parts.get(i));}return rows;
  }
  const groups=new Map();
  for(const [k,v] of flatten(groupsParts.get('GROUPS'))){must(k.length&&!groups.has(k),'duplicate group');groups.set(k,v);}
  const days=[...daysParts.keys()].sort().map(date=>{
   const p=daysParts.get(date),entries=flatten(p),seen=new Set();
   for(const [id,g] of entries){must(tid(id)&&groups.has(g)&&!seen.has(id),'invalid/duplicate schedule topic');seen.add(id);}
   must(p.round!==null||entries.length===0,'unassigned round with topics');
   return {date,round:p.round,entries};
  });
  must(days.length===meta.dayCount&&days[0]?.date===meta.start&&days[days.length-1]?.date===meta.end&&groups.size===meta.groupCount&&days.reduce((n,d)=>n+d.entries.length,0)===meta.slotCount,'snapshot counts/period mismatch');
  for(let i=1;i<days.length;i++)must(Date.parse(days[i].date)-Date.parse(days[i-1].date)===86400000,'nonconsecutive schedule dates');
  const canonical=JSON.stringify({id:meta.id,name:meta.name,start:meta.start,end:meta.end,rounds:meta.rounds,groups:[...groups.keys()].sort().map(k=>[k,groups.get(k)]),days});
  must(sha(canonical)===meta.activeHash,'active snapshot SHA-256 mismatch');
  return {...meta,verified:true,days:days.map(d=>({date:d.date,round:d.round,ids:d.entries.map(x=>x[0]),groups:d.entries.map(x=>x[1])}))};
 }
 function createGasReader(masterId){
  must(typeof masterId==='string'&&/^[A-Za-z0-9_-]{20,}$/.test(masterId),'explicit source ID required');
  const ss=SpreadsheetApp.openById(masterId);
  must(ss.getName()==='topic_study_data','wrong master source');
  const sha=s=>Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(n=>('0'+(n&255).toString(16)).slice(-2)).join('');
  function read(tab,headers,dates,maxRows){
   const sh=ss.getSheetByName(tab);must(sh&&JSON.stringify(sh.getRange(1,1,1,headers.length).getValues()[0])===JSON.stringify(headers),'source schema mismatch');
   const n=sh.getLastRow();must(n>=1&&n<=maxRows+1,'source capacity exceeded');
   const rows=n===1?[]:sh.getRange(2,1,n-1,headers.length).getValues();
   for(const r of rows)for(const i of dates)if(Object.prototype.toString.call(r[i])==='[object Date]')r[i]=Utilities.formatDate(r[i],ss.getSpreadsheetTimeZone(),'yyyy-MM-dd');
   return rows;
  }
  const getMeta=id=>metadata(read('학습계획',PLAN_HEADERS,[2,3],10000),id);
  function isCurrent(_owner,p){
   if(!p)return false;
   const m=getMeta(p.id);
   return !!m&&m.activeRevision===p.activeRevision&&m.activeHash===p.activeHash&&m.rounds===3;
  }
  function loadVerifiedPlan(owner,id){
   const m=getMeta(id);if(!m)return null;
   const p=verifySnapshot(m,read('학습계획일정',CHUNK_HEADERS,[4],50000),sha);
   return isCurrent(owner,p)?p:null;
  }
  // No caching across invocations: latest source is used for newly reserved topics.
  // Already-reserved parts are intentionally immutable; deleted/excluded topics
  // require an explicit policy check in the production integration.
  let topicRows=null;
  function loadTopic(_owner,id){
   must(tid(id),'invalid topic ID');
   if(!topicRows)topicRows=read('암기장',TOPIC_HEADERS,[],20000);
   const matches=topicRows.filter(r=>r[0]===id);
   if(matches.length!==1)return null;
   const r=matches[0];
   if(r[20]!=='Y')return null;
   const text=v=>v==null?'':String(v);
   return {topicId:r[0],topicName:text(r[8]),concept:text(r[9]),keywords:text(r[10]),mnemonic:text(r[11]),relatedTopics:text(r[12]),background:text(r[22]),features:text(r[23]),technicalComponents:text(r[24]),necessity:text(r[25])};
  }
  // Fresh exact-ID lookup: a deleted, duplicated or excluded topic must not
  // resume a previously reserved message. No old source contents are rewritten.
  function isTopicEligible(_owner,id){
   must(tid(id),'invalid topic ID');
   const sh=ss.getSheetByName('암기장');
   must(sh&&JSON.stringify(sh.getRange(1,1,1,TOPIC_HEADERS.length).getValues()[0])===JSON.stringify(TOPIC_HEADERS),'source schema mismatch');
   const n=sh.getLastRow();if(n<2)return false;
   must(n<=20001,'source capacity exceeded');
   const matches=sh.getRange(2,1,n-1,1).createTextFinder(id).matchEntireCell(true).matchCase(true).useRegularExpression(false).findAll();
   if(matches.length!==1)return false;
   const r=sh.getRange(matches[0].getRow(),1,1,21).getValues()[0];
   return r[0]===id&&r[20]==='Y';
  }
  return {loadVerifiedPlan,isPlanCurrent:isCurrent,loadTopic,isTopicEligible};
 }
 return Object.freeze({metadata,verifySnapshot,createGasReader});
});
