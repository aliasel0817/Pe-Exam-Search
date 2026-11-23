/* Personal Note signed cloud protocol candidate (inactive until authenticated server supports it).
 * Uses the existing ACTIVE/HMAC signed GET and signed POST transport.
 * No unauthenticated GET, no public Drive file URL, no destructive conflict force.
 * Server side must explicitly enable the isolated personal-note API first.
 */
(function personalNoteCloud() {
'use strict';
const CHUNK_SIZE = 16384;
const MAX_CHUNKS = 512;
const MAX_LENGTH = 8 * 1024 * 1024;
function transportReady() {
  return typeof buildSignedGetUrl === 'function' && typeof getApiUrl === 'function'
    && typeof sendSecureMutation === 'function' && typeof hasActiveSecuritySession === 'function'
    && hasActiveSecuritySession() && navigator.onLine && !!crypto?.subtle;
}
function bytesEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
function bytesDecode(encoded) {
  const raw = atob(encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4));
  const bytes = new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
async function hash(text) {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function encode(doc) { return bytesEncode(JSON.stringify(doc)); }
function decode(raw) { return JSON.parse(bytesDecode(raw)); }
async function signedGet(action,data) {
  const url = await buildSignedGetUrl(getApiUrl(),action,data);
  const response = await fetch(url,{method:'GET',cache:'no-store',redirect:'follow'});
  if(!response.ok)throw new Error('개인 노트 서버 조회 HTTP '+response.status);
  const json=await response.json();
  if(!json?.ok)throw new Error(json?.message||'개인 노트 서버 조회 실패');
  return json;
}
async function signedPost(action,data) {
  const result=await sendSecureMutation(getApiUrl(),action,data);
  if(!result?.ok)throw new Error(result?.message||'개인 노트 서버 저장 실패');
  return result;
}
async function available() {
  if(!transportReady())return false;
  try {
    const r=await signedGet('personalNoteStatus',{});
    return r.personalNoteSyncReady===true && Number(r.schemaVersion)===1
      && Number(r.chunkSize)===CHUNK_SIZE;
  }catch(_) {return false;}
}
async function remoteMeta(key) {return signedGet('personalNoteDoc',{key,mode:'meta'});}
async function fetchDocument(key) {
  const meta=await remoteMeta(key);
  if(!meta.exists)return {exists:false,revision:0};
  if(!Number.isSafeInteger(meta.revision)||meta.revision<1||meta.length<1
    ||meta.length>MAX_LENGTH||meta.totalChunks>MAX_CHUNKS||meta.totalChunks<1)
    throw new Error('서버 개인 노트 데이터 크기/버전이 유효하지 않습니다.');
  const parts=[];
  for(let i=0;i<meta.totalChunks;i++){
    const r=await signedGet('personalNoteDoc',{key,mode:'chunk',revision:meta.revision,index:i});
    if(r.revision!==meta.revision||r.index!==i||r.totalChunks!==meta.totalChunks
      ||!/^[A-Za-z0-9_-]+$/.test(r.chunk))throw new Error('개인 노트 청크 무결성 오류');
    parts.push(r.chunk);
  }
  const encoded=parts.join('');
  if(encoded.length!==meta.length||await hash(encoded)!==meta.hash)
    throw new Error('개인 노트 문서 SHA-256 검증 실패');
  const data=decode(encoded);
  if(!data||data.key!==key||data.schemaVersion!==1)throw new Error('개인 노트 문서 스키마 불일치');
  return {exists:true,revision:meta.revision,hash:meta.hash,data};
}
function buildKey(topicHash,kind,pageId=''){
  return kind==='global'?'global':kind==='index'?'index:'+topicHash:'page:'+topicHash+':'+pageId;
}
async function bundle(topicId,pages,background,enabled) {
  const topicHash=await hash(topicId), indexKey=buildKey(topicHash,'index');
  const list=[{key:'global',schemaVersion:1,background:background||null,enabled:enabled!==false}];
  const pageIds=pages.map(p=>p.id);
  for(const page of pages)list.push({key:buildKey(topicHash,'page',page.id),schemaVersion:1,topicId,page:page});
  list.push({key:indexKey,schemaVersion:1,topicId,pageIds});
  return {topicHash,indexKey,list};
}
async function putDocument(doc,known={}) {
  const encoded=encode(doc),sum=await hash(encoded),parts=Math.ceil(encoded.length/CHUNK_SIZE);
  if(encoded.length>MAX_LENGTH||parts>MAX_CHUNKS)throw new Error('개인 노트 문서가 서버 저장 한도를 초과했습니다. 이미지 크기를 줄여 주세요.');
  const meta=await remoteMeta(doc.key);
  if(meta.exists&&meta.hash===sum)return {revision:meta.revision,hash:sum};
  const base=Number(known.revision)||0;
  if((meta.exists?meta.revision:0)!==base) {
    const err=new Error('다른 기기에서 노트를 변경했습니다. 현재 노트는 로컬에 보존하고 서버 덮어쓰기를 중단합니다.');
    err.conflict=true;throw err;
  }
  const begin=await signedPost('personalNoteBegin',{key:doc.key,baseRevision:base,hash:sum,totalChunks:parts,length:encoded.length});
  if(begin.conflict){const err=new Error('노트 저장 시작 시 서버 수정 충돌');err.conflict=true;throw err;}
  if(!begin.uploadId)throw new Error('서버 업로드 ID가 반환되지 않았습니다.');
  for(let i=0;i<parts;i++){
    await signedPost('personalNotePart',{uploadId:begin.uploadId,index:i,chunk:encoded.slice(i*CHUNK_SIZE,(i+1)*CHUNK_SIZE)});
  }
  const committed=await signedPost('personalNoteCommit',{uploadId:begin.uploadId});
  if(committed.conflict){const err=new Error('노트 저장 중 다른 기기가 변경했습니다. 덮어쓰지 않았습니다.');err.conflict=true;throw err;}
  if(!committed.committed||committed.hash!==sum||!Number.isSafeInteger(committed.revision))throw new Error('저장 확정 응답이 유효하지 않습니다.');
  return {revision:committed.revision,hash:sum};
}
async function push(topicId,pages,background,enabled,localMeta={},onStep) {
  if(!await available())return {available:false,meta:localMeta};
  const docs=await bundle(topicId,pages,background,enabled);
  const next={...localMeta};
  for(const doc of docs.list){
    const updated=await putDocument(doc,next[doc.key]||{});
    next[doc.key]=updated;
    if(typeof onStep==='function')await onStep(next,doc.key);
  }
  return {available:true,meta:next};
}
async function pull(topicId,localPaper,localGlobal,localMeta={},force=false) {
  if(!await available())return {available:false};
  const topicHash=await hash(topicId),indexKey=buildKey(topicHash,'index');
  const [index,global]=await Promise.all([fetchDocument(indexKey),fetchDocument('global')]);
  const pageDocs=[];
  if(index.exists){
    if(index.data.topicId!==topicId||!Array.isArray(index.data.pageIds)
      ||index.data.pageIds.length>100||new Set(index.data.pageIds).size!==index.data.pageIds.length)
      throw new Error('서버 페이지 목록이 올바르지 않습니다.');
    for(const pageId of index.data.pageIds){
      if(!/^[A-Za-z0-9_-]{1,80}$/.test(pageId))throw new Error('서버 페이지 ID 오류');
      const p=await fetchDocument(buildKey(topicHash,'page',pageId));
      if(!p.exists||p.data.topicId!==topicId||p.data.page?.id!==pageId||!Array.isArray(p.data.page?.objects))
        throw new Error('서버 페이지 일부가 누락되었습니다. 로컬 데이터는 보존합니다.');
      pageDocs.push(p);
    }
  }
  const remoteMeta={};
  for(const doc of [index,global,...pageDocs])if(doc.exists)remoteMeta[doc.data.key]={revision:doc.revision,hash:doc.hash};
  const existing=Array.isArray(localPaper?.pages)&&localPaper.pages.length>0;
  let localDirty=false;
  if(existing) {
    const localDocs=await bundle(topicId,localPaper.pages,localGlobal?.background,localGlobal?.enabled);
    const indexRec=localDocs.list[localDocs.list.length-1];
    const indexHash=await hash(encode(indexRec));
    if(!localMeta[indexRec.key]||localMeta[indexRec.key].hash!==indexHash)localDirty=true;
    for(const doc of localDocs.list.slice(1,-1))
      if(!localMeta[doc.key]||localMeta[doc.key].hash!==await hash(encode(doc)))localDirty=true;
  }
  const remoteDiffers=index.exists&&(!localMeta[indexKey]||localMeta[indexKey].revision!==index.revision
    ||pageDocs.some(p=>!localMeta[p.data.key]||localMeta[p.data.key].revision!==p.revision));
  if(!force&&existing&&localDirty&&index.exists)return {available:true,conflict:true,reason:'서버 노트를 불러오면 이 기기의 미동기화 변경 내용이 손실될 수 있어 중단했습니다.'};
  const localBackgroundChanged=localGlobal!=null
    && (!localMeta.global||localMeta.global.hash!==await hash(encode({
      key:'global',schemaVersion:1,background:localGlobal.background||null,enabled:localGlobal.enabled!==false})));
  const remoteBgChanged=global.exists && (!localMeta.global||localMeta.global.revision!==global.revision);
  if(!force&&localBackgroundChanged&&global.exists)return {available:true,conflict:true,reason:'이 기기의 공통 배경 설정이 서버와 동기화되지 않아 덮어쓰지 않았습니다.'};
  return {
    available:true,conflict:false,hasRemoteIndex:index.exists,hasRemoteGlobal:global.exists,
    pages:index.exists?pageDocs.map(p=>p.data.page):null,
    background:global.exists?global.data.background:null,
    enabled:global.exists?global.data.enabled!==false:true,
    meta:{...localMeta,...remoteMeta}
  };
}
window.PEPersonalNoteCloud={available,push,pull,encode,hash};
})();
