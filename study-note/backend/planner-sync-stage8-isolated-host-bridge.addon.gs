/*
 * Stage 8 test-only host ROUTING CANDIDATE, not connected to doGet/doPost.
 * Upload to a DIFFERENT, isolated Apps Script project ONLY after separate validation.
 * Do not merge this into any operating Code.js without the release gate and user approval.
 *
 * Existing production host owns actual ACTIVE/HMAC/nonce checks. This adapter
 * does not implement cryptography; it reuses verified values from that host.
 */
var PS8_PLANNER_GET_ACTIONS_={
  studyplans:true,studyplanschedule:true,studyprogress:true
};
var PS8_PLANNER_POST_ACTIONS_={
  beginstudyplanrevision:true,putstudyplanchunks:true,
  commitstudyplanrevision:true,savestudyprogress:true
};
function PS8_action_(action){
  return String(action||'').toLowerCase();
}
function PS8_isPlannerGet_(action){
  return Object.prototype.hasOwnProperty.call(PS8_PLANNER_GET_ACTIONS_,PS8_action_(action));
}
function PS8_isPlannerPost_(action){
  return Object.prototype.hasOwnProperty.call(PS8_PLANNER_POST_ACTIONS_,PS8_action_(action));
}
function PS8_requireIsolated_(){
  if(typeof PropertiesService==='undefined'||!PropertiesService.getScriptProperties||
    PropertiesService.getScriptProperties().getProperty('PLANNER_SYNC_MODE')!=='ISOLATED_TEST'){
    throw new Error('ISOLATION_REQUIRED: test-only planner route');
  }
}
function PS8_signedPlannerGet_(params){
  var action=PS8_action_(params&&params.action);
  if(!PS8_isPlannerGet_(action))throw new Error('UNKNOWN_ACTION');
  PS8_requireIsolated_();
  // The existing production/isolated host must verify ACTIVE, HMAC, nonce and
  // timestamp in validateSignedGet_ BEFORE reaching the planner addon.
  var verified=validateSignedGet_(params,['ACTIVE']);
  if(!verified||verified.status!=='ACTIVE'||!verified.deviceId||
    !verified.data||typeof verified.data!=='object'){
    throw new Error('AUTH_REQUIRED');
  }
  return PS3_get_(action,verified.data,verified);
}
function PS8_verifiedPlannerPost_(action,verified){
  action=PS8_action_(action);
  if(!PS8_isPlannerPost_(action))throw new Error('UNKNOWN_ACTION');
  PS8_requireIsolated_();
  // CRITICAL: verified must be the result of the existing
  // validateSignedMutation_(envelope,['ACTIVE']) in doPost.
  // Never feed client-supplied "auth" into this function.
  if(!verified||!verified.auth||verified.auth.status!=='ACTIVE'||
    !verified.auth.deviceId||!verified.data||typeof verified.data!=='object'){
    throw new Error('AUTH_REQUIRED');
  }
  return PS3_post_(action,verified.data,verified.auth);
}
