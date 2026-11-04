// R3 standalone design candidate, NOT wired into production Apps Script.
// Only for existing signed ACTIVE mutations; registration uses a different Google
// code bootstrap and MUST be designed/tested separately before any integration.
// No real authentication, user data, API call or CacheService occurs in this file.
export class R3RegistrationRequiresSeparateReview extends Error {
 constructor(){super('REGISTERDEVICE_REQUIRES_SEPARATE_IDEMPOTENCY_DESIGN');this.name='R3RegistrationRequiresSeparateReview';}
}
function validateEnvelope(envelope){
 const requestId=String(envelope?.requestId??'').trim();
 const pollKey=String(envelope?.pollKey??'').trim();
 const action=String(envelope?.action??'').trim().toLowerCase();
 if(!requestId||!pollKey||pollKey.length<32||!action)throw Error('INVALID_REQUEST_SHAPE');
 if(action==='registerdevice')throw new R3RegistrationRequiresSeparateReview();
 return {requestId,pollKey,action};
}
/**
 * deps.withLock(fn): owns exactly one script-level lock over peek+verify+reserve.
 * deps.peek(id,key): read-only existing status, including in-flight 'processing'.
 * deps.verify(envelope,['ACTIVE']): validates canonical action/HMAC/TTL/nonce,
 *  consumes nonce and returns {auth,data}. It MUST be called only on NEW requests.
 * deps.authorize(auth,action): owner-only policy check after ACTIVE verification.
 * deps.reserve(id,key,processing): direct status cache put WITHOUT another lock.
 * deps.execute(action,data,auth): actual approved mutation callback (isolated mock).
 * deps.finish(id,key,status): writes the final status only after successful claim.
 *
 * In Apps Script an existing claimMutationRequest_() already acquires its own
 * ScriptLock and MUST NOT be called from withLock; use a separate unlocked put.
 * Never drop into real doPost without measured lock duration, quota and register
 * flow review. This module is an isolated, testable security design only.
 */
export async function r3SignedMutationCandidate(envelope,deps){
 const shape=validateEnvelope(envelope);
 const reservation=await deps.withLock(async()=>{
   const existing=await deps.peek(shape.requestId,shape.pollKey);
   if(existing)return {duplicate:true,status:{...existing,duplicateDelivery:true}};
   // Before this point, only a read occurs. Invalid signed requests MUST NOT
   // write a cache entry, even when they specify a guessed requestId/pollKey.
   const verified=await deps.verify(envelope,['ACTIVE']);
   if(typeof deps.authorize!=='function')throw Error('OWNER_POLICY_ADAPTER_REQUIRED');
   await deps.authorize(verified.auth,shape.action);
   const processing={ok:true,done:false,state:'processing'};
   await deps.reserve(shape.requestId,shape.pollKey,processing);
   return {duplicate:false,verified};
 });
 if(reservation.duplicate)return reservation.status;
 try{
   const result=await deps.execute(shape.action,reservation.verified.data,reservation.verified.auth);
   const status={ok:true,done:true,state:'success',...result};
   await deps.finish(shape.requestId,shape.pollKey,status);
   return status;
 }catch(error){
   // Error result is stored only for previously authenticated/claimed requests.
   const status={ok:false,done:true,state:'error',message:'SIGNED_MUTATION_FAILED'};
   await deps.finish(shape.requestId,shape.pollKey,status);
   return status;
 }
}
