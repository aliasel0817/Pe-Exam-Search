'use strict';
/* R7 candidate only. Does not alter R5 historical v21 snapshot or deployed Apps Script. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const r7=__dirname,r5=path.resolve(r7,'../r5/source');
const original=fs.readFileSync(path.join(r5,'Code.js'));
const sha=crypto.createHash('sha256').update(original).digest('hex');
if(sha!=='e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f')throw Error('R7_REFUSE_V21_BASE_CHANGED');
let source=original.toString('utf8');
const eol=source.includes('\r\n')?'\r\n':'\n';
source=source.replace(/\r\n/g,'\n');
function once(from,to){const count=source.split(from).length-1;if(count!==1)throw Error('R7_UNEXPECTED_SOURCE_SHAPE '+count+':'+from.slice(0,55));source=source.replace(from,to);}
once(
`    const duplicateStatus = claimMutationRequest_(requestId, pollKey);
    if (duplicateStatus) return jsonOutput_({ ...duplicateStatus, duplicateDelivery: true });

    let result;
    if (action === 'registerdevice') {
      const data = envelope.data && typeof envelope.data === 'object' ? envelope.data : {};
      result = registerDeviceFromGoogle_(data);
    } else {
      const verified = validateSignedMutation_(envelope, ['ACTIVE']);
      authContext = verified.auth;
      const payload = { action, ...verified.data };`,
`    // R7: duplicates are a read-only lookup. Invalid requests must never
    // reserve a cache entry, including in the catch block below.
    const prior = getMutationStatusRaw_(requestId, pollKey);
    if (prior) return jsonOutput_({ ...prior, duplicateDelivery: true });
    let result;
    let verified;
    if (action === 'registerdevice') {
      // OAuth code verification precedes any cache writes. Registration has its
      // own Google bootstrap rules, distinct from signed ACTIVE mutations.
      const data = envelope.data && typeof envelope.data === 'object' ? envelope.data : {};
      const identity = authenticateGoogleCode_(data);
      const duplicateStatus = claimMutationRequest_(requestId, pollKey);
      if (duplicateStatus) return jsonOutput_({ ...duplicateStatus, duplicateDelivery: true });
      r7Claimed = true;
      result = registerDeviceFromGoogle_(data, identity);
    } else {
      // Serializing peek + HMAC/nonce + owner check + reservation avoids an
      // unauthorized cache entry AND concurrent signed duplicate execution.
      const claim = r7ClaimVerifiedSignedMutation_(envelope, requestId, pollKey);
      if (claim.duplicate) return jsonOutput_({ ...claim.status, duplicateDelivery: true });
      verified = claim.verified;
      authContext = verified.auth;
      r7Claimed = true;
      const payload = { action, ...verified.data };`);
once(`  let authContext = null;
  let action = '';`,`  let authContext = null;
  let action = '';
  let r7Claimed = false;`);
once(`    if (requestId && pollKey) setMutationStatus_(requestId, pollKey, status);`,`    // R7: authentication/authorization/shape failures never poison status cache.
    if (r7Claimed && requestId && pollKey) setMutationStatus_(requestId, pollKey, status);`);
once(`function registerDeviceFromGoogle_(data) {`,`function registerDeviceFromGoogle_(data, r7VerifiedIdentity) {`);
once(`  const identity = authenticateGoogleCode_(data);
  const props = PropertiesService.getScriptProperties();`,
`  // The verified identity is produced only by doPost's Google code exchange.
  // The browser cannot set this server-local parameter.
  const identity = r7VerifiedIdentity || authenticateGoogleCode_(data);
  const props = PropertiesService.getScriptProperties();`);
once(`function claimMutationRequest_(requestId, pollKey) {`,`// R7 candidate: atomic duplicate check, signed validation, owner-only authorization,
 // and reservation. Lock is released before any actual user data mutation.
function r7ClaimVerifiedSignedMutation_(envelope, requestId, pollKey) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const existing = getMutationStatusRaw_(requestId, pollKey);
    if (existing) return { duplicate: true, status: existing };
    const verified = validateSignedMutation_(envelope, ['ACTIVE']);
    const auth = verified.auth || {};
    const ownerSub = clean_(PropertiesService.getScriptProperties()
      .getProperty(STUDY_NOTE_CONFIG.SECURITY_OWNER_SUB_PROPERTY));
    // All signed write actions are owner-only for the single-user study note.
    if (!ownerSub || !auth.googleSub || auth.googleSub !== ownerSub) {
      throw new Error('소유자 전용 변경 권한을 확인할 수 없습니다.');
    }
    setMutationStatus_(requestId, pollKey, { ok: true, done: false, state: 'processing' });
    return { duplicate: false, verified };
  } finally { lock.releaseLock(); }
}

function claimMutationRequest_(requestId, pollKey) {`);
const out=path.join(r7,'source','Code.js');
if(fs.existsSync(out))throw Error('REFUSE_OVERWRITE_EXISTING_R7_CANDIDATE');
fs.writeFileSync(out,source.replace(/\n/g,eol),'utf8');
const meta={schema:'r7-appsscript-candidate-v1',from:'r5/source/Code.js',
 originalSha256:sha,sha256:crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex'),
 appScriptDeployed:false,change:'signed mutation cache/auth ordering with owner-only guard; registration verified before claim'};
fs.writeFileSync(path.join(r7,'R7-CODE-PROVENANCE.json'),JSON.stringify(meta,null,2)+'\n');
console.log(JSON.stringify({status:'PATCHED_CANDIDATE_ONLY',fromSha256:sha,toSha256:meta.sha256,bytes:fs.statSync(out).size,productionChanged:false},null,2));
