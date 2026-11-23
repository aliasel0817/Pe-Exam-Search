/**
 * Personal Note isolated cloud-store candidate. NOT DEPLOYED.
 * IMPORTANT: This module is NOT a web app. Call PN1_get_ / PN1_post_
 * only AFTER existing host validateSignedGet_ / validateSignedMutation_ succeeds.
 *
 * Required Script Properties (test only):
 *  PERSONAL_NOTE_SYNC_MODE=ISOLATED_TEST
 *  PERSONAL_NOTE_SYNC_FOLDER_ID=<separate, private test Drive folder>
 *  PERSONAL_NOTE_SYNC_READY=READY:<same folder id>
 * The folder MUST contain a marker named PERSONAL_NOTE_ISOLATED_TEST_ONLY.
 * Never point to a live content/PDF/learning Drive folder.
 */
var PN1_MAX_ENCODED_LENGTH_ = 8 * 1024 * 1024;
var PN1_CHUNK_SIZE_ = 16384;
var PN1_MAX_CHUNKS_ = 512;
var PN1_STAGE_TTL_MS_ = 60 * 60 * 1000;
var PN1_MARKER_ = 'PERSONAL_NOTE_ISOLATED_TEST_ONLY';

function PN1_error_(code, message) {
  var error = new Error(message || code);
  error.code = code;
  throw error;
}
function PN1_clean_(s) { return s === null || s === undefined ? '' : String(s).trim(); }
function PN1_sha_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function PN1_auth_(auth) {
  if (!auth || auth.status !== 'ACTIVE' || !/^[A-Za-z0-9_-]{10,150}$/.test(PN1_clean_(auth.deviceId))) {
    PN1_error_('AUTH_REQUIRED', '서명 검증된 ACTIVE 기기만 개인 노트를 동기화할 수 있습니다.');
  }
  return PN1_clean_(auth.deviceId);
}
function PN1_key_(value) {
  var s = PN1_clean_(value);
  if (s === 'global') return s;
  if (!/^(?:index|page):[A-Za-z0-9_-]{1,64}(?::[A-Za-z0-9_-]{1,80})?$/.test(s)) {
    PN1_error_('INVALID_KEY', '잘못된 개인 노트 문서 키');
  }
  if (s.indexOf('index:') === 0 && s.split(':').length !== 2) PN1_error_('INVALID_KEY');
  if (s.indexOf('page:') === 0 && s.split(':').length !== 3) PN1_error_('INVALID_KEY');
  return s;
}
function PN1_folder_() {
  var props = PropertiesService.getScriptProperties();
  var mode = PN1_clean_(props.getProperty('PERSONAL_NOTE_SYNC_MODE'));
  var id = PN1_clean_(props.getProperty('PERSONAL_NOTE_SYNC_FOLDER_ID'));
  var approved = PN1_clean_(props.getProperty('PERSONAL_NOTE_SYNC_READY'));
  if (mode !== 'ISOLATED_TEST' || !/^[A-Za-z0-9_-]{20,}$/.test(id) || approved !== 'READY:' + id) {
    PN1_error_('DISABLED', '개인 노트 저장소가 격리 시험용으로 활성화되지 않았습니다.');
  }
  var folder = DriveApp.getFolderById(id);
  if (!folder || !folder.getFilesByName(PN1_MARKER_).hasNext()) PN1_error_('FOLDER_NOT_APPROVED', '격리 시험용 폴더 확인 실패');
  return folder;
}
function PN1_file_(folder, name) {
  var it = folder.getFilesByName(name);
  var found = null;
  while (it.hasNext()) {
    if (found) PN1_error_('DUPLICATE_FILE', '개인 노트 파일이 중복되어 안전하게 중단합니다.');
    found = it.next();
  }
  return found;
}
function PN1_readJson_(file) {
  if (!file) return null;
  try { return JSON.parse(file.getBlob().getDataAsString('UTF-8')); }
  catch (e) { PN1_error_('CORRUPT_FILE', '개인 노트 파일 내용 손상'); }
}
function PN1_docName_(key) { return 'pn1-doc-' + PN1_sha_(key) + '.json'; }
function PN1_stageName_(id) { return 'pn1-stage-' + id + '.json'; }
function PN1_getDoc_(folder, key) {
  var raw = PN1_readJson_(PN1_file_(folder, PN1_docName_(key)));
  if (raw && (raw.key !== key || !Number.isSafeInteger(raw.revision) || raw.revision < 1
      || typeof raw.encoded !== 'string' || !/^[A-Za-z0-9_-]+$/.test(raw.encoded)
      || raw.encoded.length > PN1_MAX_ENCODED_LENGTH_ || PN1_sha_(raw.encoded) !== raw.hash)) {
    PN1_error_('CORRUPT_FILE', '저장된 개인 노트 문서가 잘못되어 덮어쓰기를 중단합니다.');
  }
  return raw;
}
function PN1_get_(action, data, verifiedAuth) {
  PN1_auth_(verifiedAuth);
  var name = PN1_clean_(action).toLowerCase();
  var folder = PN1_folder_();
  if (name === 'personalnotestatus') return {ok:true,personalNoteSyncReady:true,schemaVersion:1,chunkSize:PN1_CHUNK_SIZE_};
  if (name !== 'personalnotedoc') PN1_error_('INVALID_ACTION');
  var key = PN1_key_(data && data.key);
  var doc = PN1_getDoc_(folder, key);
  if (!doc) return {ok:true,key,exists:false,revision:0};
  var mode = PN1_clean_(data && data.mode) || 'meta';
  if (mode === 'meta') return {ok:true,key,exists:true,revision:doc.revision,hash:doc.hash,length:doc.encoded.length,
    totalChunks:Math.ceil(doc.encoded.length/PN1_CHUNK_SIZE_),updatedAt:doc.updatedAt,deviceId:doc.deviceId};
  if (mode !== 'chunk') PN1_error_('INVALID_ACTION', '지원하지 않는 개인 노트 조회 방식');
  var wantedRev = Number(data && data.revision);
  var index = Number(data && data.index);
  if (!Number.isSafeInteger(wantedRev) || wantedRev !== doc.revision) PN1_error_('REVISION_CHANGED','조회 중 서버 문서가 변경되었습니다.');
  var count = Math.ceil(doc.encoded.length/PN1_CHUNK_SIZE_);
  if (!Number.isSafeInteger(index) || index < 0 || index >= count) PN1_error_('INVALID_CHUNK');
  var chunk = doc.encoded.slice(index*PN1_CHUNK_SIZE_,(index+1)*PN1_CHUNK_SIZE_);
  return {ok:true,key,revision:doc.revision,index,chunk,totalChunks:count};
}
function PN1_lock_(run) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return run(); } finally { lock.releaseLock(); }
}
function PN1_uploadId_(value) {
  var v = PN1_clean_(value);
  if (!/^[0-9a-f-]{36}$/i.test(v)) PN1_error_('INVALID_UPLOAD');
  return v;
}
function PN1_stage_(folder, uploadId, deviceId) {
  var file = PN1_file_(folder, PN1_stageName_(PN1_uploadId_(uploadId)));
  if (!file) PN1_error_('UPLOAD_NOT_FOUND', '업로드 세션을 찾을 수 없습니다.');
  var stage = PN1_readJson_(file);
  if (stage.deviceId !== deviceId) PN1_error_('UPLOAD_OWNER_MISMATCH');
  if (Date.now() - Date.parse(stage.createdAt) > PN1_STAGE_TTL_MS_) PN1_error_('UPLOAD_EXPIRED');
  if (!Array.isArray(stage.chunks) || !Number.isSafeInteger(stage.totalChunks)) PN1_error_('INVALID_UPLOAD');
  return {stage:stage,file:file};
}
function PN1_begin_(d, deviceId, folder) {
  var key = PN1_key_(d.key);
  var base = Number(d.baseRevision), count = Number(d.totalChunks), len = Number(d.length);
  var hash = PN1_clean_(d.hash);
  if (!Number.isSafeInteger(base) || base < 0 || !Number.isSafeInteger(count) || count < 1
      || count > PN1_MAX_CHUNKS_ || !Number.isSafeInteger(len) || len < 1
      || len > PN1_MAX_ENCODED_LENGTH_ || count !== Math.ceil(len/PN1_CHUNK_SIZE_)
      || !/^[0-9a-f]{64}$/.test(hash)) PN1_error_('INVALID_MANIFEST','개인 노트 업로드 정보가 올바르지 않습니다.');
  var doc = PN1_getDoc_(folder,key), serverRevision = doc ? doc.revision : 0;
  if (base !== serverRevision) return {ok:true,conflict:true,key,serverRevision};
  var uploadId = Utilities.getUuid();
  var stage = {uploadId,key,baseRevision:base,hash,length:len,totalChunks:count,chunks:[],deviceId,createdAt:new Date().toISOString()};
  folder.createFile(PN1_stageName_(uploadId),JSON.stringify(stage),'application/json');
  return {ok:true,uploadId,key,baseRevision:base,totalChunks:count};
}
function PN1_part_(d,deviceId,folder) {
  var index = Number(d.index), chunk = PN1_clean_(d.chunk);
  return PN1_lock_(function(){
    var state = PN1_stage_(folder,d.uploadId,deviceId), stage = state.stage;
    var expectedSize = index===stage.totalChunks-1
      ? stage.length-index*PN1_CHUNK_SIZE_ : PN1_CHUNK_SIZE_;
    if (!Number.isSafeInteger(index) || index < 0 || index >= stage.totalChunks
        || !/^[A-Za-z0-9_-]+$/.test(chunk) || chunk.length!==expectedSize) PN1_error_('INVALID_CHUNK');
    if (stage.chunks[index] && stage.chunks[index]!==chunk) PN1_error_('CHUNK_CONFLICT','같은 위치의 서로 다른 업로드 조각');
    stage.chunks[index]=chunk;
    state.file.setContent(JSON.stringify(stage));
    return {ok:true,uploadId:stage.uploadId,index,received:stage.chunks.filter(Boolean).length};
  });
}
function PN1_finish_(d,deviceId,folder) {
  return PN1_lock_(function(){
    var state = PN1_stage_(folder,d.uploadId,deviceId), stage=state.stage;
    var encoded = stage.chunks.join('');
    if (stage.chunks.length!==stage.totalChunks || stage.chunks.some(function(x){return !x;})
        || encoded.length!==stage.length || PN1_sha_(encoded)!==stage.hash) PN1_error_('HASH_MISMATCH','업로드 데이터 해시/조각 검증 실패');
    var payload;
    try {payload=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(encoded)).getDataAsString('UTF-8'));}
    catch(e){PN1_error_('INVALID_PAYLOAD','개인 노트 JSON 복원 실패');}
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || PN1_clean_(payload.key)!==stage.key || Number(payload.schemaVersion)!==1) PN1_error_('INVALID_PAYLOAD');
    var old = PN1_getDoc_(folder,stage.key),revision = old?old.revision:0;
    if (revision!==stage.baseRevision) return {ok:true,conflict:true,key:stage.key,serverRevision:revision};
    var next={key:stage.key,revision:revision+1,hash:stage.hash,
      encoded:encoded,deviceId:deviceId,updatedAt:new Date().toISOString()};
    var file=PN1_file_(folder,PN1_docName_(stage.key));
    if(file)file.setContent(JSON.stringify(next));
    else folder.createFile(PN1_docName_(stage.key),JSON.stringify(next),'application/json');
    state.file.setTrashed(true);
    return {ok:true,committed:true,key:stage.key,revision:next.revision,hash:next.hash,updatedAt:next.updatedAt};
  });
}
function PN1_post_(action,data,verifiedAuth) {
  var deviceId=PN1_auth_(verifiedAuth),folder=PN1_folder_();
  var name=PN1_clean_(action).toLowerCase(),d=data||{};
  if(name==='personalnotebegin')return PN1_lock_(function(){return PN1_begin_(d,deviceId,folder);});
  if(name==='personalnotepart')return PN1_part_(d,deviceId,folder);
  if(name==='personalnotecommit')return PN1_finish_(d,deviceId,folder);
  PN1_error_('INVALID_ACTION');
}
