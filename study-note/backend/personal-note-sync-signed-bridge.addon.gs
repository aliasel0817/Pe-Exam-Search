/**
 * Signed personal-note routing bridge. This file is NOT registered or deployed.
 * Wire only after comparing against the ACTUAL CURRENT operating Apps Script.
 * The legacy R5/Code.js snapshot is reference only, not a deployable source.
 */
var PN1_GET_ACTIONS_ = ['personalnotestatus','personalnotedoc'];
var PN1_POST_ACTIONS_ = ['personalnotebegin','personalnotepart','personalnotecommit'];
function PN1_isGet_(action) { return PN1_GET_ACTIONS_.indexOf(String(action).toLowerCase()) >= 0; }
function PN1_isPost_(action) { return PN1_POST_ACTIONS_.indexOf(String(action).toLowerCase()) >= 0; }
function PN1_signedGet_(params) {
  var action=String(params && params.action || '').toLowerCase();
  if(!PN1_isGet_(action)) PN1_error_('INVALID_ACTION','허용하지 않은 개인 노트 읽기 action');
  if(typeof validateSignedGet_!=='function') PN1_error_('HOST_AUTH_MISSING');
  var verified=validateSignedGet_(params,['ACTIVE']);
  return PN1_get_(action,verified.data,verified);
}
function PN1_verifiedPost_(action,verified) {
  var name=String(action || '').toLowerCase();
  if(!PN1_isPost_(name)) PN1_error_('INVALID_ACTION','허용하지 않은 개인 노트 쓰기 action');
  if(!verified||!verified.auth||verified.auth.status!=='ACTIVE'||!verified.data)
    PN1_error_('HOST_AUTH_MISSING','서명 검증된 쓰기 컨텍스트만 허용');
  return PN1_post_(name,verified.data,verified.auth);
}
/*
 * Conditional host integration schematic:
 *
 * GET (inside doGet only, after existing public/signed branches):
 * if (PN1_isGet_(action)) return jsonOutput_(PN1_signedGet_(params));
 *
 * POST (inside EXISTING validateSignedMutation_(envelope, ['ACTIVE']) branch):
 * if (PN1_isPost_(action)) result = PN1_verifiedPost_(action, verified);
 * else ... preserve existing update/save/etc dispatch unchanged.
 *
 * Never add a public GET for note payloads.
 * Do not edit mutationStatus polling, HMAC, nonce, cache or authentication logic.
 * Do not add personal note data to LIVE MASTER or its existing attachment sheets.
 */
