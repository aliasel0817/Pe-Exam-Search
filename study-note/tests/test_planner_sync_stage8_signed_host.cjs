'use strict';
/*
 * Stage8 signed-host compatibility test: executes the actual trusted-device
 * verification functions extracted from the frozen repository backend in a
 * Node VM with synthetic key/table/cache. Does not call Google Apps Script.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../mupdf-migration/r5/source/Code.js');
const code=fs.readFileSync(base,'utf8');
const bridge=fs.readFileSync(path.resolve(__dirname,'../backend/planner-sync-stage8-isolated-host-bridge.addon.gs'),'utf8');
const signedFns=['validateSignedGet_','validateSignedMutation_','validateDeviceSignature_'];
function extract(name){
 const pat=new RegExp('function '+name+'\\([^]*?\\n\\}','m');
 const match=code.match(pat);
 assert(match, 'Missing or changed host validator: '+name);
 return match[0];
}
const hostSource=signedFns.map(extract).join('\n\n');
const secret='STAGE8-SYNTHETIC-KEY-NEVER-LIVE';
const deviceId='STAGE8TESTDEVICE0001';
const nonceSet=new Set();const traffic=[],calls=[];
let state='ACTIVE',isolated=true,touches=0;
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const sign=s=>crypto.createHmac('sha256',secret).update(s).digest('hex');
const clean=s=>String(s==null?'':s).trim();
function strictSame(a,b){
 const x=Buffer.from(a,'hex'),y=Buffer.from(b,'hex');
 return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
const sandbox={
 console,JSON,Math,Date,Number,String,Error,Array,Object,RegExp,parseInt,isNaN,
 STUDY_NOTE_CONFIG:{SECURITY_AUTH_SKEW_SECONDS:300,SECURITY_NONCE_TTL_SECONDS:600},
 clean_:clean,validateDeviceId_:s=>{if(s!==deviceId)throw Error('unknown synthetic device');return s;},
 readSecurityDeviceTable_:()=>({sheet:{},headerIndex:{}}),
 findSecurityDeviceRow_:()=>({row:[],sheetRow:2}),
 securityDeviceRowObject_:()=>({status:state,sessionExpiresAt:new Date(Date.now()+3600000).toISOString(),
  sessionKeyHash:sha(secret),deviceName:'SYNTHETIC',googleSub:'test',email:'synthetic@invalid.test'}),
 securityDeviceKeyPropertyName_:id=>'key:'+id,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='PLANNER_SYNC_MODE'?(isolated?'ISOLATED_TEST':'DISABLED'):
  k==='key:'+deviceId?secret:''})},
 CacheService:{getScriptCache:()=>({
   get:k=>nonceSet.has(k)?'1':null,
   put:(k,v,ttl)=>{assert(ttl>0);nonceSet.add(k);}
 })},
 sha256Hex_:sha,hmacSha256Hex_:(canonical,key)=>crypto.createHmac('sha256',key).update(canonical).digest('hex'),
 constantTimeEquals_:strictSame,
 touchSecurityDevice_:()=>{touches++},
 decodeBase64UrlJson_:s=>JSON.parse(Buffer.from(s,'base64url').toString('utf8')),
 decodeSignedPayloadJson_:s=>JSON.parse(Buffer.from(s,'base64url').toString('utf8')),
 PS3_get_:(action,data,verified)=>{traffic.push({kind:'GET',action,data,deviceId:verified.deviceId});return {ok:true,plannerSyncVersion:1,plans:[]};},
 PS3_post_:(action,data,auth)=>{traffic.push({kind:'POST',action,data,deviceId:auth.deviceId});return {ok:true,action};}
};
vm.createContext(sandbox);
vm.runInContext(hostSource+'\n'+bridge,sandbox);
const unique=()=>crypto.randomBytes(16).toString('hex');
function buildGet(action,details,opts={}){
 const timestamp=String(opts.timestamp??Date.now()),nonce=opts.nonce||unique();
 const authPayload=Buffer.from(JSON.stringify(details)).toString('base64url');
 const canonical=['GET',action,deviceId,timestamp,nonce,authPayload].join('\n');
 return {action,deviceId,timestamp,nonce,authPayload,signature:opts.badSig?'0'.repeat(64):sign(canonical)};
}
function buildPost(action,details,opts={}){
 const timestamp=String(opts.timestamp??Date.now()),nonce=opts.nonce||unique();
 const requestId='req-'+unique(),pollKey='poll-'+unique();
 const signedPayload=Buffer.from(JSON.stringify(details)).toString('base64url');
 const canonical=['POST',action,deviceId,requestId,pollKey,timestamp,nonce,signedPayload].join('\n');
 return {action,requestId,pollKey,signedPayload,auth:{deviceId,timestamp,nonce,signature:opts.badSig?'0'.repeat(64):sign(canonical)}};
}
const ok=sandbox.PS8_signedPlannerGet_(buildGet('studyplans',{}));
assert(ok.ok);
assert.equal(traffic[0].action,'studyplans');
assert.equal(touches,1);
const getReplay=buildGet('studyplanschedule',{planId:'fake'});
sandbox.PS8_signedPlannerGet_(getReplay);
assert.throws(()=>sandbox.PS8_signedPlannerGet_(getReplay),/이미 사용된 보안 요청/);
assert.throws(()=>sandbox.PS8_signedPlannerGet_(buildGet('studyprogress',{}, {badSig:true})),/서명 검증/);
assert.throws(()=>sandbox.PS8_signedPlannerGet_(buildGet('studyplans',{}, {timestamp:Date.now()-800000})),/요청 시간이/);
state='PENDING';
assert.throws(()=>sandbox.PS8_signedPlannerGet_(buildGet('studyplans',{})),/승인 대기/);
state='ACTIVE';
isolated=false;
assert.throws(()=>sandbox.PS8_signedPlannerGet_(buildGet('studyplans',{})),/ISOLATION_REQUIRED/);
isolated=true;
assert.throws(()=>sandbox.PS8_signedPlannerGet_(buildGet('topics',{})),/UNKNOWN_ACTION/);
const signedPost=buildPost('savestudyprogress',{changes:[{operationId:'synthetic-only'}]});
const verified=sandbox.validateSignedMutation_(signedPost,['ACTIVE']);
assert.equal(verified.auth.status,'ACTIVE');
assert.equal(sandbox.PS8_verifiedPlannerPost_(signedPost.action,verified).ok,true);
assert.equal(traffic.at(-1).action,'savestudyprogress');
assert.throws(()=>sandbox.validateSignedMutation_(signedPost,['ACTIVE']),/이미 사용된 보안 요청/);
assert.throws(()=>sandbox.validateSignedMutation_(buildPost('putstudyplanchunks',{}, {badSig:true}),['ACTIVE']),/서명 검증/);
assert.throws(()=>sandbox.PS8_verifiedPlannerPost_('savestudyprogress',{auth:{status:'PENDING',deviceId},data:{}}),/AUTH_REQUIRED/);
isolated=false;
assert.throws(()=>sandbox.PS8_verifiedPlannerPost_('savestudyprogress',verified),/ISOLATION_REQUIRED/);
assert(bridge.includes('validateSignedGet_')&&bridge.includes("PS3_post_"),'bridge wiring missing');
// This test must NOT be interpreted as actual Apps Script runtime or live nonce behavior.
console.log('STAGE8_SIGNED_HOST_SYNTHETIC_PASS',JSON.stringify({
 actualHostValidatorFunctions:signedFns, mockSignedGets:traffic.filter(x=>x.kind==='GET').length,
 mockSignedPosts:traffic.filter(x=>x.kind==='POST').length,
 hmacInvalidBlocked:true,nonceReplayBlocked:true,inactiveBlocked:true,expiredBlocked:true,
 isolationGuard:true,realAppsScript:'UNVERIFIED',actualTrustedDevice:'UNVERIFIED'
}));
