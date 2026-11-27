/* Stage 4: authenticated inter-server relay protocol, not a public browser API.
 * HMAC secret is independently provisioned in BOTH private script projects.
 * Requests are consumed by a durable nonce store before dispatch.
 */
var StudyNotificationRelay=(function(){
 'use strict';
 const ACTIONS=Object.freeze(['snapshot','save','preview','begin','finish','confirm','disconnect','history','test']);
 const hex64=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
 const small=(s,n)=>typeof s==='string'&&s.length>0&&s.length<=n;
 const must=(v,m)=>{if(!v)throw Error(m);};
 const same=(a,b)=>{if(!hex64(a)||!hex64(b))return false;let d=0;for(let i=0;i<64;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
 const reqText=r=>JSON.stringify(['PE_NOTIFY_REQ_V1',r.action,r.owner,r.binding,r.at,r.nonce,r.payload]);
 const resText=r=>JSON.stringify(['PE_NOTIFY_RES_V1',r.nonce,r.payload]);
 const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const validReq=r=>record(r)&&r.v===1&&ACTIONS.includes(r.action)&&small(r.owner,200)&&hex64(r.binding)&&Number.isSafeInteger(r.at)&&hex64(r.nonce)&&small(r.payload,24000)&&hex64(r.mac);
 function create(deps){
  for(const name of ['now','nonce','mac','consume'])must(typeof deps[name]==='function','relay dependency missing');
  const owner=deps.owner;must(small(owner,200),'relay owner missing');
  function request(action,binding,data){
   must(ACTIONS.includes(action)&&hex64(binding)&&record(data),'invalid relay action');
   const r={v:1,action,owner,binding,at:deps.now(),nonce:deps.nonce(),payload:JSON.stringify(data)};
   r.mac=deps.mac(reqText(r));must(validReq(r),'invalid relay envelope');return r;
  }
  function verify(r){
   must(validReq(r)&&r.owner===owner&&Math.abs(deps.now()-r.at)<=90000&&same(r.mac,deps.mac(reqText(r))),'relay authentication failed');
   const data=JSON.parse(r.payload);must(record(data),'invalid relay payload');
   must(deps.consume(r.nonce,r.at)===true,'relay replay or capacity');
   return {ctx:{verified:true,ownerId:owner,sessionBinding:r.binding},action:r.action,data};
  }
  function response(req,data){
   must(record(data),'relay response must be object');
   const r={v:1,nonce:req.nonce,payload:JSON.stringify(data)};
   must(r.payload.length<=90000,'relay response capacity exceeded');
   r.mac=deps.mac(resText(r));return r;
  }
  function verifyResponse(req,r){
   must(record(r)&&r.v===1&&r.nonce===req.nonce&&small(r.payload,90000)&&same(r.mac,deps.mac(resText(r))),'relay response authentication failed');
   const d=JSON.parse(r.payload);must(record(d),'invalid relay response');return d;
  }
  return Object.freeze({request,verify,response,verifyResponse});
 }
 return Object.freeze({create,ACTIONS});
})();
if(typeof module==='object'&&module.exports)module.exports=StudyNotificationRelay;
