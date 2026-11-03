/**
 * M1 PATCH CANDIDATE ONLY — DO NOT DEPLOY OR INSERT AUTOMATICALLY.
 * Called after validateSignedMutation_(envelope, ['ACTIVE']) has authenticated
 * the signed device. Checks CURRENT owner for every subsequent data mutation.
 * This is defense in depth; it is not a replacement for HMAC, nonce or
 * Google identity checks.
 *
 * Proposed insertion in the existing doPost non-registerDevice branch:
 *   const verified = validateSignedMutation_(envelope, ['ACTIVE']);
 *   requireCurrentOwnerForWrite_(verified.auth);
 *   authContext = verified.auth;
 *
 * Keep existing public doGet read actions and signed original-PDF GET rules.
 */
function requireCurrentOwnerForWrite_(auth) {
  const props = PropertiesService.getScriptProperties();
  const ownerSub = String(props.getProperty(STUDY_NOTE_CONFIG.SECURITY_OWNER_SUB_PROPERTY) || '').trim();
  const actorSub = String(auth && auth.googleSub || '').trim();
  if (!ownerSub || !actorSub || actorSub !== ownerSub) {
    throw new Error('이 계정에는 학습노트 변경 권한이 없습니다.');
  }
  if (!auth || auth.status !== 'ACTIVE') {
    throw new Error('승인된 신뢰기기만 학습정보를 변경할 수 있습니다.');
  }
  return true;
}
