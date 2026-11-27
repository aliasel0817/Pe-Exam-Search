/* Shared GAS helpers for the dedicated server and the verified main-server
 * relay addon. No property access or network I/O on file load.
 */
var StudyNotificationRelayGas=(function(){
 'use strict';
 const must=(v,m)=>{if(!v)throw Error(m);};
 const hex=bytes=>bytes.map(n=>('0'+(n&255).toString(16)).slice(-2)).join('');
 function props(){return PropertiesService.getScriptProperties();}
 function requireProp(p,k){const s=p.getProperty('PE_NOTIFICATION_'+k);must(typeof s==='string'&&s.length>0,'notification configuration missing');return s;}
 function hmac(secret,text){return hex(Utilities.computeHmacSha256Signature(text,secret,Utilities.Charset.UTF_8));}
 function secret(p){const s=requireProp(p,'RELAY_SECRET');must(/^[a-f0-9]{64}$/i.test(s),'invalid relay secret');return s;}
 function durableConsume(nonce,at){
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return false;
  try{
   const p=props(),key='PE_NOTIFICATION_RELAY_NONCES',now=Date.now(),raw=p.getProperty(key),prev=raw?JSON.parse(raw):[];
   must(Array.isArray(prev)&&prev.length<=100&&prev.every(r=>Array.isArray(r)&&/^[a-f0-9]{64}$/.test(r[0])&&Number.isSafeInteger(r[1])),'invalid relay nonce ledger');
   // Keep until the request's latest acceptable timestamp, including future skew.
   const rows=prev.filter(r=>r[1]>=now);
   if(rows.some(r=>r[0]===nonce)||rows.length>=100||Math.abs(now-at)>90000)return false;
   rows.push([nonce,at+90000]);const value=JSON.stringify(rows);
   must(Utilities.newBlob(value).getBytes().length<=8500,'relay nonce ledger full');
   p.setProperty(key,value);return p.getProperty(key)===value;
  }finally{lock.releaseLock();}
 }
 function create(p,receiver){
  const s=secret(p),owner=requireProp(p,'OWNER_ID');
  return StudyNotificationRelay.create({owner,now:()=>Date.now(),
    nonce:()=>hmac(s,'nonce:'+Utilities.getUuid()+':'+Date.now()),
    mac:v=>hmac(s,v),consume:receiver?durableConsume:()=>false});
 }
 function safeFetch(url,envelope){
  must(/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url),'relay endpoint invalid');
  let r=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify(envelope),muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true});
  if([302,303].includes(r.getResponseCode())){
   const headers=r.getHeaders(),loc=headers.Location||headers.location;
   must(typeof loc==='string'&&/^https:\/\/script\.googleusercontent\.com\/[^\s]*$/.test(loc),'relay redirect denied');
   r=UrlFetchApp.fetch(loc,{method:'get',muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true});
  }
  must(r.getResponseCode()===200,'notification relay unavailable');
  const raw=r.getContentText();must(Utilities.newBlob(raw).getBytes().length<=92000,'relay response too large');return JSON.parse(raw);
 }
 return Object.freeze({props,requireProp,secret,hmac,create,safeFetch});
})();
