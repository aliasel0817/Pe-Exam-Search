'use strict';
// Fail-closed pre-publication scan. Never print source bytes, secret values or user data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const deny=[
 ['PEM_PRIVATE_KEY',/-----BEGIN(?: RSA| EC| OPENSSH)? PRIVATE KEY-----/gi],
 ['GOOGLE_API_KEY',/\bAIza[0-9A-Za-z_-]{32,}\b/g],
 ['AWS_ACCESS_ID',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
 ['JWT_TOKEN',/\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{12,}\b/g],
 ['PRIVATE_EMAIL_LITERAL',/['"][A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}['"]/gi],
 ['PRIVATE_URL_WITH_TOKEN',/https?:\/\/[^\s'"<>]+(?:access_token|signature|api_key|hmac|sessionkey|refresh_token)=[^\s'"<>]+/gi],
 ['EXPLICIT_PASSWORD_LITERAL',/(?:password|passphrase|clientSecret|hmacSecret|privateKey|refreshToken|api[_-]?key)\s*(?::|=)\s*['"](?!['"])[^'"\r\n]{8,}['"]/gi],
 ['LIKELY_OPAQUE_ID_LITERAL',/['"][A-Za-z0-9_-]{20,}['"]/g],
 ['HARDCODED_OWNER_SUB',/(?:ownerSub|ownerEmail|adminEmail)\s*(?::|=)\s*['"][^'"\r\n]{8,}['"]/gi],
 ['OAUTH_PRIVATE_SECRET',/['"](?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9_]{20,}|ya29\.[A-Za-z0-9_-]{20,})['"]/g],
];
function audit(input,{allowExtension='.js',requireBackend=true}={}){
 const filename=path.resolve(input);
 if(!fs.existsSync(filename)||path.extname(filename).toLowerCase()!==allowExtension)throw Error('EXISTING_PRIVATE_JS_REQUIRED');
 const src=fs.readFileSync(filename,'utf8');
 if(allowExtension==='.json')JSON.parse(src);
 const findings=deny.map(([type,re])=>({type,count:[...src.matchAll(re)]
   .filter(m=>type!=='LIKELY_OPAQUE_ID_LITERAL' || ((m[0].match(/[0-9]/g)||[]).length>=3
     && /[a-z]/.test(m[0]) && /[A-Z]/.test(m[0]) && !m[0].includes('_'))).length}))
   .filter(x=>x.count>0);
 const required={
  appsScriptBackend:src.includes('function doGet(')&&src.includes('function doPost('),
  propertiesBasedConfiguration:src.includes('getScriptProperties'),
  referencePdfSignedRoute:src.includes('referencePdfContent'),
  ownerOnlyPermission:src.includes('ownerSub'),
  idempotencyPath:src.includes('claimMutationRequest_'),
 };
 const sha256=crypto.createHash('sha256').update(src).digest('hex');
 // No source excerpt included in the result under any condition.
 return {schema:'r5-prepublication-source-scan-v1',sha256,bytes:Buffer.byteLength(src),
   lines:src.split(/\r?\n/).length,functions:(src.match(/^\s*function\s+[a-zA-Z_$][\w$]*\s*\(/gm)||[]).length,
   checks:required,findings,pass:findings.length===0&&(!requireBackend||Object.values(required).every(Boolean)),
   note:'HEURISTIC_ONLY: manual data/secret/license review remains mandatory; no publication authorization',
   publicationAuthorized:false};
}
if(require.main===module){
 try{
  if(process.argv.length<3||process.argv.length>4)throw Error('Usage: node r5-private-source-scan.cjs <Code.js|helper.js|appsscript.json> [--nonentrypoint]');
  const nonentry=process.argv[3]==='--nonentrypoint';
  const result=audit(process.argv[2],nonentry?{allowExtension:path.extname(process.argv[2]),requireBackend:false}:{});console.log(JSON.stringify(result,null,2));
  if(!result.pass)process.exitCode=2;
 }catch(e){console.error('R5_PRIVATE_SOURCE_AUDIT_ERROR '+e.message);process.exitCode=3;}
}
module.exports={audit};
