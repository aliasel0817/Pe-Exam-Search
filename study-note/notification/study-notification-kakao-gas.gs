/* Independent Apps Script server adapter candidate.
 * No doGet/doPost, no installable triggers, no property writes on load.
 * The dedicated host must provide one verified exclusive-lock contract for
 * OAuth, settings and send ticks. Do not attach this to the public PWA.
 */
var StudyNotificationKakaoGas=(function(){
 'use strict';
 var must=function(v,m){if(!v)throw Error(m);};
 var hex=function(bytes){return bytes.map(function(n){return ('0'+(n&255).toString(16)).slice(-2);}).join('');};
 var sha=function(s){return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8));};
 var allowed={
  'https://kauth.kakao.com/oauth/token':'POST',
  'https://kapi.kakao.com/v1/user/access_token_info':'GET',
  'https://kapi.kakao.com/v1/user/unlink':'POST',
  'https://kapi.kakao.com/v2/api/talk/memo/default/send':'POST',
  'https://kapi.kakao.com/v2/user/scopes?scopes=%5B%22talk_message%22%5D':'GET'
 };
 function create(host){
  must(host&&typeof host.assertLocked==='function'&&typeof host.approved==='function','trusted host required');
  var props=PropertiesService.getScriptProperties();
  // Explicit isolated project marker prevents accidental installation into main GAS.
  must(props.getProperty('PE_NOTIFICATION_PROJECT_MODE')==='DEDICATED_NOTIFICATION','dedicated project marker required');
  function get(k){var v=props.getProperty('PE_NOTIFICATION_'+k);must(typeof v==='string'&&v.length>0,'notification configuration missing: '+k);return v;}
  var owner=get('OWNER_ID'),stateSecret=get('STATE_SECRET');
  must(/^[a-f0-9]{64,128}$/i.test(stateSecret),'provision strong independent state secret');
  var key='PE_NOTIFICATION_PRIVATE_VAULT_'+sha(owner);
  function locked(){must(host.assertLocked()===true,'shared exclusive lock required');}
  var vault={
   read:function(id){locked();must(id===owner,'owner mismatch');var s=props.getProperty(key);return s?JSON.parse(s):null;},
   write:function(id,v){locked();must(id===owner,'owner mismatch');var s=JSON.stringify(v);
    must(Utilities.newBlob(s).getBytes().length<=8500,'private vault capacity exceeded');
    props.setProperty(key,s);must(props.getProperty(key)===s,'private vault write verification failed');
   }
  };
  function request(r){
   locked();must(r&&allowed[r.url]===r.method,'provider endpoint not allowed');
   var options={method:r.method.toLowerCase(),headers:r.headers||{},muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true};
   if(r.method==='POST')options.payload=r.body||'';
   try{
    var res=UrlFetchApp.fetch(r.url,options),status=res.getResponseCode(),body=null;
    var s=res.getContentText();if(s.length<=65536){try{body=JSON.parse(s);}catch(_){body=null;}}
    return {httpStatus:status,body:body};
   }catch(_){return {httpStatus:0,body:null};}
  }
  var deps={vault:vault,now:function(){return Date.now();},sha256:sha,
   randomState:function(){locked();return hex(Utilities.computeHmacSha256Signature(Utilities.getUuid()+':'+Date.now(),stateSecret,Utilities.Charset.UTF_8));},
   request:request,sleep:function(ms){must(ms>=0&&ms<=1000,'bounded sleep only');Utilities.sleep(ms);},
   approved:function(id){return id===owner&&props.getProperty('PE_NOTIFICATION_RELEASE_APPROVED')==='YES'&&host.approved(id)===true;},
   testApproved:function(id){return id===owner&&props.getProperty('PE_NOTIFICATION_TEST_APPROVED')==='YES'&&typeof host.testApproved==='function'&&host.testApproved(id)===true;},
   assertLocked:host.assertLocked};
  return StudyNotificationKakao.create({ownerId:owner,clientId:get('KAKAO_CLIENT_ID'),clientSecret:get('KAKAO_CLIENT_SECRET'),appId:get('KAKAO_APP_ID'),
   redirectUri:get('KAKAO_REDIRECT_URI'),linkUrl:get('LINK_URL'),dailyBudget:Number(get('DAILY_BUDGET')),monthlyBudget:Number(get('MONTHLY_BUDGET'))},deps);
 }
 return Object.freeze({create:create});
})();
