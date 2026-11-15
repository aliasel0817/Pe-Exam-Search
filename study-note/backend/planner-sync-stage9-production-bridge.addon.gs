/*
 * Stage9 guarded OPERATING candidate (not connected to running Apps Script).
 * The existing Code.js host owns HMAC/nonce/ACTIVE validation, claim and poll.
 * Both script property PLANNER_SYNC_MODE=PRODUCTION and
 * PLANNER_SYNC_PRODUCTION_READY=READY:<STUDY_NOTE_SPREADSHEET_ID> must be present.
 * Never load this as an unguarded doGet/doPost replacement.
 */
var PS9_GET_ACTIONS_=Object.freeze({studyplans:true,studyplanschedule:true,studyprogress:true});
var PS9_POST_ACTIONS_=Object.freeze({beginstudyplanrevision:true,putstudyplanchunks:true,
 commitstudyplanrevision:true,savestudyprogress:true});
function PS9_isPlannerGet_(action){
 return Object.prototype.hasOwnProperty.call(PS9_GET_ACTIONS_,String(action||'').toLowerCase());
}
function PS9_isPlannerPost_(action){
 return Object.prototype.hasOwnProperty.call(PS9_POST_ACTIONS_,String(action||'').toLowerCase());
}
function PS9_operatingGate_(){
 if(PropertiesService.getScriptProperties().getProperty('PLANNER_SYNC_MODE')!=='PRODUCTION')
   throw new Error('RELEASE_BLOCKED: planner synchronization is not enabled');
}
function PS9_signedPlannerGet_(params){
 var action=String(params&&params.action||'').toLowerCase();
 if(!PS9_isPlannerGet_(action))throw new Error('UNKNOWN_PLANNER_ACTION');
 PS9_operatingGate_();
 var verified=validateSignedGet_(params,['ACTIVE']);
 if(!verified||verified.status!=='ACTIVE'||!verified.deviceId||
    !verified.data||typeof verified.data!=='object')throw new Error('AUTH_REQUIRED');
 return PS3_get_(action,verified.data,verified);
}
function PS9_verifiedPlannerPost_(action,verified){
 action=String(action||'').toLowerCase();
 if(!PS9_isPlannerPost_(action))throw new Error('UNKNOWN_PLANNER_ACTION');
 PS9_operatingGate_();
 // Caller MUST pass validated output of doPost.validateSignedMutation_
 // (never client-supplied "auth").
 if(!verified||!verified.auth||verified.auth.status!=='ACTIVE'||
    !verified.auth.deviceId||!verified.data||typeof verified.data!=='object')
  throw new Error('AUTH_REQUIRED');
 return PS3_post_(action,verified.data,verified.auth);
}
