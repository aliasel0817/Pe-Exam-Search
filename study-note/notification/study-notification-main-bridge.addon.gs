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
function PN4_verifiedNotificationPost_(action,verified){
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
