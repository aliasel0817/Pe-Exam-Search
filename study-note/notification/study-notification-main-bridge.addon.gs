/* Candidate addon for the EXISTING verified study-note backend.
 * Call only after validateSignedMutation_(envelope,['ACTIVE']) succeeds.
 * Do not install in the independent project. No doGet/doPost replacement.
 */
var PN4_ACTIONS_=Object.freeze({notificationsnapshot:'snapshot',notificationsave:'save',
 notificationpreview:'preview',notificationbegin:'begin',notificationfinish:'finish',
 notificationconfirm:'confirm',notificationdisconnect:'disconnect',notificationhistory:'history',notificationtest:'test'});
function PN4_isNotificationPost_(action){
 return Object.prototype.hasOwnProperty.call(PN4_ACTIONS_,String(action||'').toLowerCase());
}
// The v25 host verifies timestamp/HMAC and consumes a cache nonce. For this
// new route only, hold a durable, bounded claim for the original signed
// browser nonce throughout the host's five-minute authentication window.
// This is not a replacement for validateSignedMutation_ or its other routes.
function PN6_claimVerifiedNotificationNonce_(p,auth,envelope){
 const raw=envelope&&envelope.auth,now=Date.now(),skew=300000;
 const stamp=Number(raw&&raw.timestamp),nonce=String(raw&&raw.nonce||'').trim();
 if(!raw||String(raw.deviceId||'').trim()!==auth.deviceId||!Number.isSafeInteger(stamp)||
    Math.abs(now-stamp)>skew||!/^[A-Za-z0-9_-]{16,128}$/.test(nonce))throw Error('verified nonce unavailable');
 const fingerprint=StudyNotificationRelayGas.hmac(StudyNotificationRelayGas.secret(p),
   JSON.stringify(['PE_NOTIFY_BROWSER_NONCE_V1',auth.deviceId,nonce]));
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw Error('notification lock busy');
 try{
  const key='PE_NOTIFICATION_BROWSER_NONCES',stored=p.getProperty(key),previous=stored?JSON.parse(stored):[];
  if(!Array.isArray(previous)||previous.length>80||!previous.every(r=>Array.isArray(r)&&r.length===2&&/^[a-f0-9]{64}$/.test(r[0])&&Number.isSafeInteger(r[1])))throw Error('invalid notification nonce ledger');
  const rows=previous.filter(r=>r[1]>=now);
  if(rows.some(r=>r[0]===fingerprint)||rows.length>=80)throw Error('notification nonce held');
  rows.push([fingerprint,stamp+skew]);
  const value=JSON.stringify(rows);
  if(Utilities.newBlob(value).getBytes().length>8500)throw Error('notification nonce capacity');
  p.setProperty(key,value);
  if(p.getProperty(key)!==value)throw Error('notification nonce write failed');
 }finally{lock.releaseLock();}
}
function PN4_verifiedNotificationPost_(action,verified,envelope){
 try{
  action=String(action||'').toLowerCase();
  if(!PN4_isNotificationPost_(action))throw Error('invalid action');
  const p=StudyNotificationRelayGas.props(),get=k=>StudyNotificationRelayGas.requireProp(p,k);
  if(p.getProperty('PE_NOTIFICATION_BRIDGE_ENABLED')!=='YES')throw Error('bridge disabled');
  const auth=verified&&verified.auth,data=verified&&verified.data;
  if(!auth||auth.status!=='ACTIVE'||typeof auth.deviceId!=='string'||!auth.deviceId||
     typeof auth.googleSub!=='string'||auth.googleSub!==get('OWNER_GOOGLE_SUB')||
     !data||typeof data!=='object'||Array.isArray(data))throw Error('owner authorization required');
  // Obtain a session binding from server-side credential material ONLY. Never
  // relay the session key, Google subject, email, or browser-supplied auth.
  // This accessor is present in the verified historical host source; exact
  // current deployed host must be read back before installing this addon.
  const deviceKey=p.getProperty(securityDeviceKeyPropertyName_(auth.deviceId));
  if(typeof deviceKey!=='string'||!deviceKey)throw Error('session unavailable');
  const binding=StudyNotificationRelayGas.hmac(StudyNotificationRelayGas.secret(p),
    JSON.stringify(['PE_NOTIFY_SESSION_V1',auth.deviceId,deviceKey]));
  PN6_claimVerifiedNotificationNonce_(p,auth,envelope);
  const relay=StudyNotificationRelayGas.create(p,false);
  const request=relay.request(PN4_ACTIONS_[action],binding,data);
  const reply=relay.verifyResponse(request,StudyNotificationRelayGas.safeFetch(get('RELAY_URL'),request));
  if(Utilities.newBlob(JSON.stringify(reply)).getBytes().length>60000)throw Error('response too large');
  // Namespace the inner result: existing mutation poller's ok/done fields
  // must not be overwritten by notification CAS/conflict responses.
  return {notificationVersion:1,notificationResult:reply};
 }catch(_){
  // Never expose raw request, code, state, token, URL, or exception text.
  throw Error('학습 알림 요청을 완료할 수 없습니다. 인증·서버 설정을 확인하세요.');
 }
}
