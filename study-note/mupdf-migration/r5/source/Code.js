/**
 * 정보관리기술사 학습노트 - v4.5.3 주석 클라우드 동기화 API
 * 대상 Google Spreadsheet: 내 드라이브/topic/topic_study_data
 * 대상 시트: 암기장
 *
 * 4-3단계 주요 기능
 * - MASTER 전체 조회 / 단건 조회
 * - 통합ID 기반 토픽 수정
 * - 신규 토픽 추가 (통합ID/코드 서버 자동 발급)
 * - 삭제 대신 학습대상=N 처리
 * - Google OAuth 2.0 + 신뢰기기 세션 인증 (관리 PIN은 최초등록/복구 전용)
 * - 첨부자료 시트 + topic_files 기반 이미지/PDF 등록/삭제/조회
 * - PDF페이지연결_20260928 기반 서브노트/교재 1페이지 PDF 연결 조회
 * - PDF페이지파일_20260928 기반 원본 연속 페이지 이동 메타데이터 조회
 * - 토픽 P/Q 저장 시 원본 PDF 연결행 자동 생성/갱신
 * - 원본 1페이지 PDF 바이너리 온디맨드 조회(PDF.js 뷰어용)
 */

const STUDY_NOTE_CONFIG = Object.freeze({
  EXPECTED_PARENT_FOLDER_NAME: 'topic',
  EXPECTED_SPREADSHEET_NAME: 'topic_study_data',
  TOPIC_SHEET_NAME: '암기장',
  LEARNING_SHEET_NAME: '학습정보',
  ATTACHMENT_SHEET_NAME: '첨부자료',
  PDF_PAGE_LINK_SHEET_NAME: 'PDF페이지연결_20260928',
  PDF_PAGE_FILE_SHEET_NAME: 'PDF페이지파일_20260928',
  PDF_PAGE_KEY_SHEET_NAME: 'PDF페이지키_20260930',
  PDF_PAGE_RELATION_SHEET_NAME: 'PDF페이지관계_20260930',
  SECURITY_DEVICE_SHEET_NAME: '관리기기',
  SECURITY_AUDIT_SHEET_NAME: '보안감사로그',
  ANNOTATION_SYNC_SHEET_NAME: '주석동기화',
  MEDIA_FOLDER_NAME: 'topic_files',
  MEDIA_FOLDER_ID_PROPERTY: 'STUDY_NOTE_MEDIA_FOLDER_ID',
  OAUTH_CLIENT_ID: '1054197140509-60r8da165v63qghfn6558o5d48crl02g.apps.googleusercontent.com',
  OAUTH_CLIENT_SECRET_PROPERTY: 'STUDY_NOTE_OAUTH_CLIENT_SECRET',
  SECURITY_OWNER_SUB_PROPERTY: 'STUDY_NOTE_SECURITY_OWNER_SUB',
  SECURITY_OWNER_EMAIL_PROPERTY: 'STUDY_NOTE_SECURITY_OWNER_EMAIL',
  SECURITY_ALLOWED_EMAIL_PROPERTY: 'STUDY_NOTE_SECURITY_ALLOWED_EMAIL',
  SECURITY_DEVICE_KEY_PREFIX: 'STUDY_NOTE_DEVICE_KEY_',
  ALLOWED_AUTH_ORIGINS: Object.freeze(['https://aliasel0817.github.io']),
  SECURITY_SESSION_DAYS: 365,
  SECURITY_PENDING_DAYS: 7,
  SECURITY_AUTH_SKEW_SECONDS: 300,
  SECURITY_NONCE_TTL_SECONDS: 600,
  SECURITY_PIN_MAX_ATTEMPTS: 5,
  SECURITY_PIN_BLOCK_SECONDS: 1800,
  MAX_MEDIA_BYTES: 25 * 1024 * 1024,
  MAX_REFERENCE_PAGE_BYTES: 8 * 1024 * 1024,
  SCHEMA_VERSION: 15,
  ANNOTATION_SYNC_CHUNK_SIZE: 30000,
  ANNOTATION_SYNC_MAX_DOCUMENT_CHARS: 600000,
  ANNOTATION_SYNC_MAX_BATCH: 20,
  ANNOTATION_SYNC_PAGE_SIZE: 20,
  ANNOTATION_SYNC_MAX_RESPONSE_CHARS: 1800000,
  MUTATION_STATUS_TTL_SECONDS: 120,
});

const EDITABLE_FIELD_MAP = Object.freeze({
  importance: '중요도',
  topicName: '통합토픽',
  concept: '개념',
  background: '등장배경',
  necessity: '필요성',
  features: '특징',
  technicalComponents: '기술요소·구성요소',
  keywords: '키워드',
  mnemonic: '암기법',
  relatedTopics: '관련토픽',
  status: '상태',
  subnotePages: '서브노트페이지',
  textbookPages: '교재페이지',
  notes: '비고',
  studyTarget: '학습대상',
  studyExclusionReason: '학습제외사유',
});

const LEARNING_HEADERS_V3 = Object.freeze(['통합ID','즐겨찾기','학습상태','개인메모','최종학습일시','복습횟수','미암기횟수','업데이트일시','수정버전']);
const LEARNING_HEADERS = Object.freeze([...LEARNING_HEADERS_V3, '최종미암기일시']);
const ATTACHMENT_HEADERS = Object.freeze(['첨부ID','통합ID','유형','순번','Drive파일ID','파일명','원본파일명','MIME','파일크기','등록일시','사용여부','삭제일시']);
const SECURITY_DEVICE_HEADERS = Object.freeze(['기기ID','기기명','Google사용자ID','사용자이메일','브라우저정보','플랫폼','최초등록일시','마지막접속일시','상태','세션키해시','세션발급일시','세션만료일시','등록방식','차단일시','승인기기ID']);
const SECURITY_AUDIT_HEADERS = Object.freeze(['로그ID','일시','Google사용자ID','사용자이메일','기기ID','기기명','작업','대상','결과','상세']);
const PDF_PAGE_KEY_HEADERS = Object.freeze(['출처유형','페이지키','기준페이지키','자료유형','Drive폴더ID','통합원본Drive파일ID','생성일시','사용여부']);
const PDF_PAGE_RELATION_HEADERS = Object.freeze(['관계ID','출처유형','페이지토큰','자료유형','기준페이지키','기준페이지토큰','삽입위치','대체대상페이지토큰','논리순서','판본','활성여부','등록일시']);
const ANNOTATION_SYNC_HEADERS = Object.freeze(['문서키','리비전','업데이트일시','수정기기ID','청크번호','청크수','데이터청크','SHA256']);


function setupStage1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('topic_study_data 스프레드시트에서 Apps Script를 열고 실행해 주세요.');
  if (ss.getName() !== STUDY_NOTE_CONFIG.EXPECTED_SPREADSHEET_NAME) {
    throw new Error(`스프레드시트 파일명이 '${STUDY_NOTE_CONFIG.EXPECTED_SPREADSHEET_NAME}'이 아닙니다. 현재: '${ss.getName()}'`);
  }

  const sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.TOPIC_SHEET_NAME);
  if (!sheet) throw new Error(`'${STUDY_NOTE_CONFIG.TOPIC_SHEET_NAME}' 시트를 찾을 수 없습니다.`);

  const file = DriveApp.getFileById(ss.getId());
  const parents = file.getParents();
  let parentMatched = false;
  while (parents.hasNext()) {
    if (parents.next().getName() === STUDY_NOTE_CONFIG.EXPECTED_PARENT_FOLDER_NAME) {
      parentMatched = true;
      break;
    }
  }
  if (!parentMatched) {
    throw new Error(`스프레드시트가 '${STUDY_NOTE_CONFIG.EXPECTED_PARENT_FOLDER_NAME}' 폴더 안에 있는지 확인해 주세요.`);
  }

  PropertiesService.getScriptProperties().setProperty('STUDY_NOTE_SPREADSHEET_ID', ss.getId());

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    topicCount: Math.max(0, sheet.getLastRow() - 1),
  };
}

function setupStage2() {
  const base = setupStage1();
  const props = PropertiesService.getScriptProperties();
  let pin = props.getProperty('STUDY_NOTE_ADMIN_PIN');
  if (!pin) {
    pin = String(Math.floor(100000 + Math.random() * 900000));
    props.setProperty('STUDY_NOTE_ADMIN_PIN', pin);
  }
  console.log(`학습노트 관리 PIN: ${pin}`);
  return { ...base, schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION, adminPin: pin };
}

function setupStage3() {
  const base = setupStage2();
  const learningSheet = ensureLearningSheet_();
  console.log(`학습정보 시트 준비 완료: ${learningSheet.getName()}`);
  return { ...base, learningSheetName: learningSheet.getName() };
}

function setupStage4_1() {
  const base = setupStage3();
  const attachmentSheet = ensureAttachmentSheet_();
  const mediaFolder = ensureMediaFolder_();
  console.log(`첨부자료 시트 준비 완료: ${attachmentSheet.getName()}`);
  console.log(`첨부자료 폴더 준비 완료: ${mediaFolder.getName()} (${mediaFolder.getId()})`);
  return {
    ...base,
    attachmentSheetName: attachmentSheet.getName(),
    mediaFolderId: mediaFolder.getId(),
    mediaFolderName: mediaFolder.getName(),
  };
}

function setupStage4_2() {
  const base = setupStage4_1();
  const { ss } = getStudySheet_();
  const linkSheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_LINK_SHEET_NAME);
  const fileSheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME);
  if (!linkSheet) throw new Error(`'${STUDY_NOTE_CONFIG.PDF_PAGE_LINK_SHEET_NAME}' 시트를 찾을 수 없습니다.`);
  if (!fileSheet) throw new Error(`'${STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME}' 시트를 찾을 수 없습니다.`);
  const linkPayload = buildPdfPageLinksPayload_();
  console.log(`원본 PDF 페이지 연결 준비 완료: ${linkPayload.linkCount}건`);
  return {
    ...base,
    pdfPageLinkSheetName: linkSheet.getName(),
    pdfPageLinkCount: linkPayload.linkCount,
    pdfPageFileSheetName: fileSheet.getName(),
    pdfPageFileCount: Math.max(0, fileSheet.getLastRow() - 1),
  };
}


function setupStage4_3() {
  const base = setupStage4_2();
  const pageFilePayload = buildPdfPageFilesPayload_();
  console.log(`원본 PDF 연속 페이지 메타데이터 준비 완료: ${pageFilePayload.pageFileCount}건`);
  return {
    ...base,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    pdfPageFilePayloadCount: pageFilePayload.pageFileCount,
  };
}


function setupStage5Security() {
  const base = setupStage4_3();
  const deviceSheet = ensureSecurityDeviceSheet_();
  const auditSheet = ensureSecurityAuditSheet_();
  const props = PropertiesService.getScriptProperties();
  const secretConfigured = Boolean(props.getProperty(STUDY_NOTE_CONFIG.OAUTH_CLIENT_SECRET_PROPERTY));
  const ownerConfigured = Boolean(props.getProperty(STUDY_NOTE_CONFIG.SECURITY_OWNER_SUB_PROPERTY));
  console.log(`신뢰기기 보안 준비 완료: ${deviceSheet.getName()} / ${auditSheet.getName()}`);
  console.log(`OAuth Client Secret 설정: ${secretConfigured ? '완료' : '필요'}`);
  console.log(`허용 관리자 이메일 설정: ${props.getProperty(STUDY_NOTE_CONFIG.SECURITY_ALLOWED_EMAIL_PROPERTY) ? '완료' : '필요'}`);
  console.log(`최초 관리자 등록: ${ownerConfigured ? '완료' : '대기'}`);
  if (!secretConfigured) console.log(`Script Properties에 ${STUDY_NOTE_CONFIG.OAUTH_CLIENT_SECRET_PROPERTY}를 추가하세요.`);
  if (!props.getProperty(STUDY_NOTE_CONFIG.SECURITY_ALLOWED_EMAIL_PROPERTY)) console.log(`Script Properties에 ${STUDY_NOTE_CONFIG.SECURITY_ALLOWED_EMAIL_PROPERTY}을 추가하세요.`);
  return {
    ...base,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    oauthClientId: STUDY_NOTE_CONFIG.OAUTH_CLIENT_ID,
    oauthClientSecretConfigured: secretConfigured,
    allowedEmailConfigured: Boolean(props.getProperty(STUDY_NOTE_CONFIG.SECURITY_ALLOWED_EMAIL_PROPERTY)),
    ownerConfigured,
    securityDeviceSheetName: deviceSheet.getName(),
    securityAuditSheetName: auditSheet.getName(),
  };
}

function setupStage9AnnotationSync() {
  const base = setupStage1();
  const sheet = ensureAnnotationSyncSheet_();
  sheet.getRange('A:H').setNumberFormat('@');
  const result = {
    ...base,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    annotationSyncSheetName: sheet.getName(),
    annotationSyncChunkCount: sheetDataRowCount_(sheet),
    annotationSyncReady: true,
  };
  console.log(JSON.stringify(result));
  return result;
}

function testStage9AnnotationSyncStorage() {
  const sheet = ensureAnnotationSyncSheet_();
  const headers = sheet.getRange(1, 1, 1, ANNOTATION_SYNC_HEADERS.length).getDisplayValues()[0].map(clean_);
  if (headers.join('|') !== ANNOTATION_SYNC_HEADERS.join('|')) throw new Error('주석동기화 시트 헤더 검증 실패');
  const result = {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    sheetName: sheet.getName(),
    chunkRows: sheetDataRowCount_(sheet),
    headerCount: headers.length,
  };
  console.log(JSON.stringify(result));
  return result;
}

function setupStage7ReferencePdfFlow() {
  const { ss, sheet } = getStudySheet_();
  const keySheet = ensureReferencePdfPageKeySheet_();
  const relationSheet = ensureReferencePdfRelationSheet_();
  const result = {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    topicCount: Math.max(0, sheet.getLastRow() - 1),
    pdfPageFileCount: sheetDataRowCount_(ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME)),
    pdfPageLinkCount: sheetDataRowCount_(ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_LINK_SHEET_NAME)),
    pdfPageKeySheetName: keySheet.getName(),
    pdfPageKeyCount: Math.max(0, keySheet.getLastRow() - 1),
    pdfPageRelationSheetName: relationSheet.getName(),
    pdfPageRelationCount: Math.max(0, relationSheet.getLastRow() - 1),
  };
  console.log(JSON.stringify(result));
  return result;
}

function createStage7RollbackSnapshot() {
  const props = PropertiesService.getScriptProperties();
  const propName = 'STUDY_NOTE_STAGE7_ROLLBACK_SNAPSHOT_ID';
  const existingId = clean_(props.getProperty(propName));
  if (existingId) {
    try {
      const existing = DriveApp.getFileById(existingId);
      if (!existing.isTrashed()) {
        const result = { ok: true, reused: true, snapshotId: existing.getId(), snapshotName: existing.getName(), snapshotUrl: existing.getUrl(), createdNewSnapshot: false };
        console.log(JSON.stringify(result));
        return result;
      }
    } catch (error) { console.warn(`기존 Stage7 롤백 스냅샷 확인 실패: ${error}`); }
  }
  const { ss } = getStudySheet_();
  const sourceFile = DriveApp.getFileById(ss.getId());
  const parents = sourceFile.getParents();
  const timeZone = Session.getScriptTimeZone() || 'Asia/Seoul';
  const stamp = Utilities.formatDate(new Date(), timeZone, 'yyyyMMdd_HHmmss');
  const snapshotName = `${ss.getName()}_PRE_V448_${stamp}`;
  const copy = parents.hasNext() ? sourceFile.makeCopy(snapshotName, parents.next()) : sourceFile.makeCopy(snapshotName);
  props.setProperty(propName, copy.getId());
  const result = { ok: true, reused: false, snapshotId: copy.getId(), snapshotName: copy.getName(), snapshotUrl: copy.getUrl(), createdNewSnapshot: true };
  console.log(JSON.stringify(result));
  return result;
}

function createStage8RollbackSnapshot() {
  const props = PropertiesService.getScriptProperties();
  const propName = 'STUDY_NOTE_STAGE8_ROLLBACK_SNAPSHOT_ID';
  const existingId = clean_(props.getProperty(propName));
  if (existingId) {
    try {
      const existing = DriveApp.getFileById(existingId);
      if (!existing.isTrashed()) {
        const result = { ok: true, reused: true, snapshotId: existing.getId(), snapshotName: existing.getName(), snapshotUrl: existing.getUrl(), createdNewSnapshot: false };
        console.log(JSON.stringify(result));
        return result;
      }
    } catch (error) { console.warn(`기존 Stage8 롤백 스냅샷 확인 실패: ${error}`); }
  }
  const { ss } = getStudySheet_();
  const sourceFile = DriveApp.getFileById(ss.getId());
  const parents = sourceFile.getParents();
  const timeZone = Session.getScriptTimeZone() || 'Asia/Seoul';
  const stamp = Utilities.formatDate(new Date(), timeZone, 'yyyyMMdd_HHmmss');
  const snapshotName = `${ss.getName()}_PRE_V449_${stamp}`;
  const copy = parents.hasNext() ? sourceFile.makeCopy(snapshotName, parents.next()) : sourceFile.makeCopy(snapshotName);
  props.setProperty(propName, copy.getId());
  const result = { ok: true, reused: false, snapshotId: copy.getId(), snapshotName: copy.getName(), snapshotUrl: copy.getUrl(), createdNewSnapshot: true };
  console.log(JSON.stringify(result));
  return result;
}

function showStage7RollbackStatus() {
  const { ss } = getStudySheet_();
  const keySheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_KEY_SHEET_NAME);
  const relationSheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_RELATION_SHEET_NAME);
  const snapshotId = clean_(PropertiesService.getScriptProperties().getProperty('STUDY_NOTE_STAGE7_ROLLBACK_SNAPSHOT_ID'));
  let snapshotReady = false;
  let snapshotName = '';
  if (snapshotId) {
    try { const file = DriveApp.getFileById(snapshotId); snapshotReady = !file.isTrashed(); snapshotName = file.getName(); } catch (error) { snapshotReady = false; }
  }
  const result = {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    snapshotReady,
    snapshotId: snapshotReady ? snapshotId : '',
    snapshotName: snapshotReady ? snapshotName : '',
    keySheetReady: Boolean(keySheet),
    keyRows: sheetDataRowCount_(keySheet),
    relationSheetReady: Boolean(relationSheet),
    relationRows: sheetDataRowCount_(relationSheet),
    codeRollbackSafe: true,
    note: 'v4.4.8/schemaVersion 13 코드로 재배포하면 v4.4.9 기능을 코드 수준에서 롤백할 수 있습니다. 이미 사용자가 저장한 새 토픽/새 대분류 데이터는 자동 삭제하지 않습니다.',
  };
  console.log(JSON.stringify(result));
  return result;
}

function rollbackStage7EmptyMetadataSheets() {
  const { ss } = getStudySheet_();
  const names = [STUDY_NOTE_CONFIG.PDF_PAGE_RELATION_SHEET_NAME, STUDY_NOTE_CONFIG.PDF_PAGE_KEY_SHEET_NAME];
  const blocked = [];
  names.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheetDataRowCount_(sheet) > 0) blocked.push(`${name}:${sheetDataRowCount_(sheet)}건`);
  });
  if (blocked.length) throw new Error(`메타데이터가 이미 존재하여 자동 삭제를 중단합니다: ${blocked.join(', ')}. v4.4.7 코드 롤백은 가능하며 데이터 시트는 그대로 두세요.`);
  const deleted = [];
  names.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) { ss.deleteSheet(sheet); deleted.push(name); }
  });
  const result = { ok: true, deleted, schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION };
  console.log(JSON.stringify(result));
  return result;
}

function testStage5SecurityStorage() {
  const table = readSecurityDeviceTable_();
  if (!table.sheet || typeof table.sheet.appendRow !== 'function') {
    throw new Error('Security device sheet binding failed.');
  }
  const auditSheet = ensureSecurityAuditSheet_();
  if (!auditSheet || typeof auditSheet.appendRow !== 'function') {
    throw new Error('Security audit sheet binding failed.');
  }
  const result = {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    deviceSheet: table.sheet.getName(),
    deviceRows: table.rows.length,
    auditSheet: auditSheet.getName(),
  };
  console.log(JSON.stringify(result));
  return result;
}

function showStage5SecurityStatus() {
  const props = PropertiesService.getScriptProperties();
  const { ss } = getStudySheet_();
  const deviceSheet = ss.getSheetByName(STUDY_NOTE_CONFIG.SECURITY_DEVICE_SHEET_NAME);
  const auditSheet = ss.getSheetByName(STUDY_NOTE_CONFIG.SECURITY_AUDIT_SHEET_NAME);
  const result = {
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    oauthClientId: STUDY_NOTE_CONFIG.OAUTH_CLIENT_ID,
    oauthClientSecretConfigured: Boolean(props.getProperty(STUDY_NOTE_CONFIG.OAUTH_CLIENT_SECRET_PROPERTY)),
    allowedEmailConfigured: Boolean(props.getProperty(STUDY_NOTE_CONFIG.SECURITY_ALLOWED_EMAIL_PROPERTY)),
    ownerConfigured: Boolean(props.getProperty(STUDY_NOTE_CONFIG.SECURITY_OWNER_SUB_PROPERTY)),
    deviceCount: sheetDataRowCount_(deviceSheet),
    auditCount: sheetDataRowCount_(auditSheet),
  };
  console.log(JSON.stringify(result));
  return result;
}

function showStage2AdminPin() {
  const pin = PropertiesService.getScriptProperties().getProperty('STUDY_NOTE_ADMIN_PIN');
  if (!pin) throw new Error('setupStage2()를 먼저 실행해 주세요.');
  console.log(`학습노트 관리 PIN: ${pin}`);
  return pin;
}

function resetStage2AdminPin() {
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  PropertiesService.getScriptProperties().setProperty('STUDY_NOTE_ADMIN_PIN', pin);
  console.log(`새 학습노트 관리 PIN: ${pin}`);
  return pin;
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = String(params.action || 'health').toLowerCase();
    if (action === 'health') return jsonOutput_(buildHealth_());
    if (action === 'topics') return jsonOutput_(buildTopicsPayload_());
    if (action === 'topic') return jsonOutput_(buildTopicPayload_(params.topicId));
    if (action === 'attachments') return jsonOutput_(buildAttachmentsPayload_(params.topicId));
    if (action === 'pdfpagelinks') return jsonOutput_(buildPdfPageLinksPayload_(params.topicId));
    if (action === 'pdfpagefiles') return jsonOutput_(buildPdfPageFilesPayload_());
    if (action === 'referencepdfpagecatalog') {
      validateSignedGet_(params, ['ACTIVE']);
      return jsonOutput_(buildReferencePdfPageCatalogPayload_());
    }
    if (action === 'referencepdfpageinfo') {
      const verified = validateSignedGet_(params, ['ACTIVE']);
      return jsonOutput_(buildReferencePdfPageInfoPayload_(verified.data.sourceType, verified.data.pageKey, verified.data.pageNumber));
    }
    if (action === 'referencepdfregistrationplan') {
      const verified = validateSignedGet_(params, ['ACTIVE']);
      return jsonOutput_(buildReferencePdfRegistrationPlan_(verified.data));
    }
    if (action === 'referencepdfcontent') {
      const verified = validateSignedGet_(params, ['ACTIVE']);
      const { ss } = getStudySheet_();
      const pageFilesSheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME);
      return jsonOutput_(readReferencePdfPageForSignedGet_(
        { authenticated: true, status: verified.status }, pageFilesSheet, verified.data
      ));
    }
    if (action === 'mediacontent') return jsonOutput_(buildMediaContentPayload_(params.attachmentId));
    if (action === 'learningstates') {
      validateSignedGet_(params, ['ACTIVE']);
      return jsonOutput_(buildLearningStatesPayload_());
    }
    if (action === 'securitystatus') {
      const auth = validateSignedGet_(params, ['ACTIVE', 'PENDING']);
      return jsonOutput_(buildSecurityStatusPayload_(auth));
    }
    if (action === 'securitydevices') {
      const auth = validateSignedGet_(params, ['ACTIVE']);
      return jsonOutput_(buildSecurityDevicesPayload_(auth));
    }
    if (action === 'annotationsync') {
      const verified = validateSignedGet_(params, ['ACTIVE']);
      return jsonOutput_(buildAnnotationSyncPayload_(verified.data));
    }
    if (action === 'mutationstatus') return jsonOutput_(getMutationStatus_(params.requestId, params.pollKey));
    return jsonOutput_({ ok: false, message: `지원하지 않는 action: ${action}` });
  } catch (error) {
    console.error(error);
    return jsonOutput_({ ok: false, message: error && error.message ? error.message : String(error) });
  }
}

function doPost(e) {
  let requestId = '';
  let pollKey = '';
  let authContext = null;
  let action = '';
  try {
    const envelope = parsePostPayload_(e);
    requestId = clean_(envelope.requestId);
    pollKey = clean_(envelope.pollKey);
    action = clean_(envelope.action).toLowerCase();
    if (!requestId) throw new Error('requestId가 없습니다.');
    if (!pollKey || pollKey.length < 32) throw new Error('pollKey가 올바르지 않습니다.');
    if (!action) throw new Error('action이 없습니다.');

    const duplicateStatus = claimMutationRequest_(requestId, pollKey);
    if (duplicateStatus) return jsonOutput_({ ...duplicateStatus, duplicateDelivery: true });

    let result;
    if (action === 'registerdevice') {
      const data = envelope.data && typeof envelope.data === 'object' ? envelope.data : {};
      result = registerDeviceFromGoogle_(data);
    } else {
      const verified = validateSignedMutation_(envelope, ['ACTIVE']);
      authContext = verified.auth;
      const payload = { action, ...verified.data };
      if (action === 'updatetopic') result = updateTopic_(payload);
      else if (action === 'addtopic') result = addTopic_(payload);
      else if (action === 'deactivatetopic') result = deactivateTopic_(payload);
      else if (action === 'uploadattachment') result = uploadAttachment_(payload);
      else if (action === 'uploadreferencepdfpage') result = uploadReferencePdfPage_(payload);
      else if (action === 'replacereferencepdfpage') result = replaceReferencePdfPage_(payload);
      else if (action === 'deleteattachment') result = deleteAttachment_(payload);
      else if (action === 'savelearningstates') result = saveLearningStates_(payload);
      else if (action === 'saveannotations') result = saveAnnotationDocuments_(payload, authContext);
      else if (action === 'approvedevice') result = approveSecurityDevice_(payload, authContext);
      else if (action === 'revokedevice') result = revokeSecurityDevice_(payload, authContext);
      else if (action === 'renamedevice') result = renameSecurityDevice_(payload, authContext);
      else throw new Error(`지원하지 않는 쓰기 action: ${action}`);

      if (!['savelearningstates','saveannotations'].includes(action)) {
        appendSecurityAudit_(authContext, action, auditTargetForAction_(action, payload, result), 'SUCCESS', auditDetailForAction_(action, result));
      }
    }

    const status = { ok: true, done: true, state: 'success', ...result };
    setMutationStatus_(requestId, pollKey, status);
    return jsonOutput_(status);
  } catch (error) {
    console.error(error);
    if (authContext && action && !['savelearningstates','saveannotations'].includes(action)) {
      try { appendSecurityAudit_(authContext, action, '', 'ERROR', error && error.message ? error.message : String(error)); } catch (auditError) { console.error(auditError); }
    }
    const status = {
      ok: false,
      done: true,
      state: 'error',
      message: error && error.message ? error.message : String(error),
    };
    if (requestId && pollKey) setMutationStatus_(requestId, pollKey, status);
    return jsonOutput_(status);
  }
}

function buildHealth_() {
  const { ss, sheet } = getStudySheet_();
  return {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    topicCount: Math.max(0, sheet.getLastRow() - 1),
    writeEnabled: Boolean(PropertiesService.getScriptProperties().getProperty(STUDY_NOTE_CONFIG.OAUTH_CLIENT_SECRET_PROPERTY) && PropertiesService.getScriptProperties().getProperty(STUDY_NOTE_CONFIG.SECURITY_ALLOWED_EMAIL_PROPERTY)),
    learningSheetReady: Boolean(getStudySheet_().ss.getSheetByName(STUDY_NOTE_CONFIG.LEARNING_SHEET_NAME)),
    attachmentSheetReady: Boolean(ss.getSheetByName(STUDY_NOTE_CONFIG.ATTACHMENT_SHEET_NAME)),
    pdfPageLinkSheetReady: Boolean(ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_LINK_SHEET_NAME)),
    pdfPageLinkCount: sheetDataRowCount_(ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_LINK_SHEET_NAME)),
    pdfPageFileSheetReady: Boolean(ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME)),
    pdfPageFileCount: sheetDataRowCount_(ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME)),
    referencePdfContentReady: Boolean(ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME) && typeof readReferencePdfPageForSignedGet_ === 'function'),
    pdfPageKeySheetReady: Boolean(ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_KEY_SHEET_NAME)),
    pdfPageKeyCount: sheetDataRowCount_(ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_KEY_SHEET_NAME)),
    pdfPageRelationSheetReady: Boolean(ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_RELATION_SHEET_NAME)),
    pdfPageRelationCount: sheetDataRowCount_(ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_RELATION_SHEET_NAME)),
    securityDeviceSheetReady: Boolean(ss.getSheetByName(STUDY_NOTE_CONFIG.SECURITY_DEVICE_SHEET_NAME)),
    securityAuditSheetReady: Boolean(ss.getSheetByName(STUDY_NOTE_CONFIG.SECURITY_AUDIT_SHEET_NAME)),
    annotationSyncSheetReady: Boolean(ss.getSheetByName(STUDY_NOTE_CONFIG.ANNOTATION_SYNC_SHEET_NAME)),
    annotationSyncReady: Boolean(ss.getSheetByName(STUDY_NOTE_CONFIG.ANNOTATION_SYNC_SHEET_NAME)),
    annotationSyncChunkCount: sheetDataRowCount_(ss.getSheetByName(STUDY_NOTE_CONFIG.ANNOTATION_SYNC_SHEET_NAME)),
    oauthClientIdConfigured: Boolean(STUDY_NOTE_CONFIG.OAUTH_CLIENT_ID),
    oauthClientSecretConfigured: Boolean(PropertiesService.getScriptProperties().getProperty(STUDY_NOTE_CONFIG.OAUTH_CLIENT_SECRET_PROPERTY)),
    allowedAdminEmailConfigured: Boolean(PropertiesService.getScriptProperties().getProperty(STUDY_NOTE_CONFIG.SECURITY_ALLOWED_EMAIL_PROPERTY)),
    securityOwnerConfigured: Boolean(PropertiesService.getScriptProperties().getProperty(STUDY_NOTE_CONFIG.SECURITY_OWNER_SUB_PROPERTY)),
    generatedAt: new Date().toISOString(),
  };
}

function buildTopicsPayload_() {
  const { ss, sheet } = getStudySheet_();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) throw new Error('암기장 시트에 데이터가 없습니다.');

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const headers = values[0].map(value => String(value).trim());
  const topicIdIndex = headers.indexOf('통합ID');
  if (topicIdIndex < 0) throw new Error("'통합ID' 컬럼을 찾을 수 없습니다.");

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!clean_(row[topicIdIndex])) continue;
    rows.push(row);
  }

  return {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    generatedAt: new Date().toISOString(),
    topicCount: rows.length,
    headers,
    rows,
  };
}


function buildPdfPageLinksPayload_(topicId) {
  const { ss } = getStudySheet_();
  const sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_LINK_SHEET_NAME);
  if (!sheet) throw new Error(`'${STUDY_NOTE_CONFIG.PDF_PAGE_LINK_SHEET_NAME}' 시트를 찾을 수 없습니다.`);

  const requiredHeaders = ['연결ID','통합ID','출처유형','원본열','페이지토큰','페이지번호','Drive파일ID','파일명'];
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) throw new Error('PDF 페이지 연결 시트가 비어 있습니다.');

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const allHeaders = values[0].map(value => clean_(value));
  const headerIndex = Object.fromEntries(allHeaders.map((header, index) => [header, index]));
  const missingHeaders = requiredHeaders.filter(header => headerIndex[header] === undefined);
  if (missingHeaders.length) throw new Error(`PDF 페이지 연결 필수 컬럼 누락: ${missingHeaders.join(', ')}`);

  const requestedTopicId = clean_(topicId);
  const seenConnectionIds = new Set();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const sourceRow = values[i];
    const connectionId = clean_(sourceRow[headerIndex['연결ID']]);
    const rowTopicId = clean_(sourceRow[headerIndex['통합ID']]);
    if (!connectionId || !rowTopicId) continue;
    if (requestedTopicId && rowTopicId !== requestedTopicId) continue;
    if (seenConnectionIds.has(connectionId)) throw new Error(`PDF 페이지 연결ID 중복: ${connectionId}`);
    seenConnectionIds.add(connectionId);

    const sourceType = clean_(sourceRow[headerIndex['출처유형']]);
    const sourceColumn = clean_(sourceRow[headerIndex['원본열']]).toUpperCase();
    const pageToken = clean_(sourceRow[headerIndex['페이지토큰']]);
    const driveFileId = clean_(sourceRow[headerIndex['Drive파일ID']]);
    if (!['서브노트','교재'].includes(sourceType)) throw new Error(`${connectionId} · 출처유형이 올바르지 않습니다.`);
    if (!['P','Q'].includes(sourceColumn)) throw new Error(`${connectionId} · 원본열이 P/Q가 아닙니다.`);
    if (!pageToken) throw new Error(`${connectionId} · 페이지토큰이 비어 있습니다.`);
    if (!driveFileId) throw new Error(`${connectionId} · Drive파일ID가 비어 있습니다.`);

    rows.push(requiredHeaders.map(header => sourceRow[headerIndex[header]]));
  }

  return {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    generatedAt: new Date().toISOString(),
    linkCount: rows.length,
    headers: requiredHeaders,
    rows,
  };
}


function buildPdfPageFilesPayload_() {
  const { ss } = getStudySheet_();
  const sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME);
  if (!sheet) throw new Error(`'${STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME}' 시트를 찾을 수 없습니다.`);

  const requiredHeaders = ['출처유형','페이지키','페이지번호','페이지토큰','페이지Drive파일ID','페이지파일명'];
  const flowHeaders = ['자료유형','기준페이지키','기준페이지토큰','삽입위치','대체대상페이지토큰','논리순서','판본','활성여부'];
  const validationHeaders = ['로컬분할검증','Drive업로드검증'];
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) throw new Error('PDF 페이지 파일 시트가 비어 있습니다.');

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const allHeaders = values[0].map(value => clean_(value));
  const headerIndex = Object.fromEntries(allHeaders.map((header, index) => [header, index]));
  const missingHeaders = [...requiredHeaders, ...validationHeaders].filter(header => headerIndex[header] === undefined);
  if (missingHeaders.length) throw new Error(`PDF 페이지 파일 필수 컬럼 누락: ${missingHeaders.join(', ')}`);
  const relationMap = readReferencePdfRelationMap_(false);

  const seen = new Set();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const sourceRow = values[i];
    const sourceType = clean_(sourceRow[headerIndex['출처유형']]);
    const pageKey = clean_(sourceRow[headerIndex['페이지키']]);
    const pageNumber = Number(sourceRow[headerIndex['페이지번호']]) || 0;
    const pageToken = clean_(sourceRow[headerIndex['페이지토큰']]);
    const driveFileId = clean_(sourceRow[headerIndex['페이지Drive파일ID']]);
    if (!sourceType && !pageToken && !driveFileId) continue;
    if (!['서브노트','교재'].includes(sourceType)) throw new Error(`PDF 페이지 파일 ${i + 1}행 · 출처유형 오류`);
    if (!pageKey || !pageNumber || !pageToken || !driveFileId) throw new Error(`PDF 페이지 파일 ${i + 1}행 · 필수값 누락`);
    if (clean_(sourceRow[headerIndex['로컬분할검증']]) !== 'OK') throw new Error(`${sourceType} ${pageToken} · 로컬분할검증 오류`);
    if (clean_(sourceRow[headerIndex['Drive업로드검증']]) !== 'OK') throw new Error(`${sourceType} ${pageToken} · Drive업로드검증 오류`);
    const key = pdfPageLookupKey_(sourceType, pageToken);
    if (seen.has(key)) throw new Error(`PDF 페이지 파일 중복: ${sourceType} ${pageToken}`);
    seen.add(key);
    const relation = relationMap.get(key) || null;
    const flow = relation ? [
      relation.materialType,
      relation.basePageKey,
      relation.anchorPageToken,
      relation.insertionPosition,
      relation.replacementTarget,
      relation.logicalOrder,
      relation.versionTag,
      relation.active,
    ] : ['원본', pageKey, '', '', '', 0, '', 'Y'];
    rows.push(requiredHeaders.map(header => sourceRow[headerIndex[header]]).concat(flow));
  }

  return {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    generatedAt: new Date().toISOString(),
    pageFileCount: rows.length,
    headers: requiredHeaders.concat(flowHeaders),
    rows,
  };
}

function normalizeReferencePdfPageInput_(sourceType, pageKey, pageNumber) {
  const normalizedSourceType = clean_(sourceType);
  if (!['서브노트','교재'].includes(normalizedSourceType)) throw new Error('원본 PDF 출처유형은 서브노트 또는 교재만 사용할 수 있습니다.');

  const normalizedPageKey = clean_(pageKey).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(normalizedPageKey)) {
    throw new Error('페이지키 형식이 올바르지 않습니다. 영문 대문자/숫자/하이픈/밑줄만 사용할 수 있습니다.');
  }

  const normalizedPageNumber = Number(pageNumber);
  if (!Number.isInteger(normalizedPageNumber) || normalizedPageNumber < 1 || normalizedPageNumber > 999999) {
    throw new Error('페이지번호는 1~999999 범위의 정수여야 합니다.');
  }
  const pageToken = `${normalizedPageKey}:${normalizedPageNumber}`;
  return {
    sourceType: normalizedSourceType,
    pageKey: normalizedPageKey,
    pageNumber: normalizedPageNumber,
    pageToken,
    storedFileName: `${normalizedPageKey}_${String(normalizedPageNumber).padStart(4, '0')}.pdf`,
  };
}

function readReferencePdfPageUploadTable_() {
  const { ss } = getStudySheet_();
  const sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME);
  if (!sheet) throw new Error(`'${STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME}' 시트를 찾을 수 없습니다.`);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) throw new Error('PDF 페이지 파일 시트가 비어 있습니다.');
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const headers = values[0].map(clean_);
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const required = ['출처유형','페이지키','페이지번호','페이지토큰','통합원본Drive파일ID','페이지Drive파일ID','페이지파일명','Drive파일URL','Drive폴더ID','로컬분할검증','Drive업로드검증','등록일'];
  const missing = required.filter(header => headerIndex[header] === undefined);
  if (missing.length) throw new Error(`PDF 페이지 파일 등록 필수 컬럼 누락: ${missing.join(', ')}`);
  return { sheet, headers, headerIndex, rows: values.slice(1) };
}

function readReferencePdfPageUploadState_() {
  const table = readReferencePdfPageUploadTable_();
  const mappings = new Map();
  const existingPages = new Map();
  table.rows.forEach((row, rowOffset) => {
    const sourceType = clean_(row[table.headerIndex['출처유형']]);
    const pageKey = clean_(row[table.headerIndex['페이지키']]).toUpperCase();
    const pageNumber = Number(row[table.headerIndex['페이지번호']]) || 0;
    const pageToken = clean_(row[table.headerIndex['페이지토큰']]);
    const driveFolderId = clean_(row[table.headerIndex['Drive폴더ID']]);
    const originalDriveFileId = clean_(row[table.headerIndex['통합원본Drive파일ID']]);
    const pageDriveFileId = clean_(row[table.headerIndex['페이지Drive파일ID']]);
    const pageFileName = clean_(row[table.headerIndex['페이지파일명']]);
    const driveUrl = clean_(row[table.headerIndex['Drive파일URL']]);
    if (!sourceType && !pageKey && !pageToken && !pageDriveFileId) return;
    if (!['서브노트','교재'].includes(sourceType) || !pageKey || !pageNumber || !pageToken || !pageDriveFileId || !driveFolderId || !originalDriveFileId) {
      throw new Error(`PDF 페이지 파일 ${rowOffset + 2}행의 필수값을 확인해 주세요.`);
    }
    const expected = normalizeReferencePdfPageInput_(sourceType, pageKey, pageNumber);
    if (expected.pageToken !== pageToken) throw new Error(`PDF 페이지 파일 ${rowOffset + 2}행의 페이지토큰이 페이지키/페이지번호와 일치하지 않습니다.`);
    if (pageFileName !== expected.storedFileName) throw new Error(`PDF 페이지 파일 ${rowOffset + 2}행의 파일명이 규칙과 일치하지 않습니다: ${pageFileName}`);
    const pageLookupKey = pdfPageLookupKey_(sourceType, pageToken);
    if (existingPages.has(pageLookupKey)) throw new Error(`PDF 페이지 파일 중복: ${sourceType} ${pageToken}`);
    existingPages.set(pageLookupKey, {
      sourceType, pageKey, pageNumber, pageToken, driveFolderId, originalDriveFileId,
      pageDriveFileId, pageFileName, driveUrl, sheetRow: rowOffset + 2,
    });

    const mappingKey = `${sourceType}\u0001${pageKey}`;
    let mapping = mappings.get(mappingKey);
    if (!mapping) {
      mapping = { sourceType, pageKey, folderIds: new Set(), originalDriveFileIds: new Set(), minPage: pageNumber, maxPage: pageNumber, pageCount: 0, pageNumbers: [] };
      mappings.set(mappingKey, mapping);
    }
    if (driveFolderId) mapping.folderIds.add(driveFolderId);
    if (originalDriveFileId) mapping.originalDriveFileIds.add(originalDriveFileId);
    mapping.minPage = Math.min(mapping.minPage, pageNumber);
    mapping.maxPage = Math.max(mapping.maxPage, pageNumber);
    mapping.pageCount += 1;
    mapping.pageNumbers.push(pageNumber);
  });

  const normalizedMappings = new Map();
  mappings.forEach((mapping, key) => {
    if (mapping.folderIds.size !== 1) throw new Error(`${mapping.sourceType} ${mapping.pageKey} · Drive폴더ID 매핑이 ${mapping.folderIds.size}개입니다. 자동 등록을 중단합니다.`);
    if (mapping.originalDriveFileIds.size > 1) throw new Error(`${mapping.sourceType} ${mapping.pageKey} · 통합원본Drive파일ID가 여러 개입니다. 자동 등록을 중단합니다.`);
    normalizedMappings.set(key, {
      sourceType: mapping.sourceType,
      pageKey: mapping.pageKey,
      driveFolderId: Array.from(mapping.folderIds)[0],
      originalDriveFileId: mapping.originalDriveFileIds.size ? Array.from(mapping.originalDriveFileIds)[0] : '',
      minPage: mapping.minPage,
      maxPage: mapping.maxPage,
      pageCount: mapping.pageCount,
      pageNumbers: mapping.pageNumbers.slice().sort((a, b) => a - b),
    });
  });
  const registryRows = readReferencePdfPageKeyRegistry_(false);
  registryRows.forEach(item => {
    const key = referencePdfMappingKey_(item.sourceType, item.pageKey);
    const existing = normalizedMappings.get(key);
    if (existing) {
      if (item.driveFolderId && existing.driveFolderId !== item.driveFolderId) throw new Error(`${item.sourceType} ${item.pageKey} · 페이지키 레지스트리와 PDF페이지파일의 Drive폴더ID가 다릅니다.`);
      if (item.originalDriveFileId && existing.originalDriveFileId && existing.originalDriveFileId !== item.originalDriveFileId) throw new Error(`${item.sourceType} ${item.pageKey} · 페이지키 레지스트리와 PDF페이지파일의 원본Drive파일ID가 다릅니다.`);
      existing.basePageKey = item.basePageKey || existing.pageKey;
      existing.materialType = item.materialType || '원본';
      existing.registryRow = item.sheetRow;
      return;
    }
    normalizedMappings.set(key, {
      sourceType: item.sourceType,
      pageKey: item.pageKey,
      driveFolderId: item.driveFolderId,
      originalDriveFileId: item.originalDriveFileId,
      minPage: 0,
      maxPage: 0,
      pageCount: 0,
      pageNumbers: [],
      basePageKey: item.basePageKey || item.pageKey,
      materialType: item.materialType || '원본',
      registryRow: item.sheetRow,
    });
  });
  normalizedMappings.forEach(mapping => {
    if (!mapping.basePageKey) mapping.basePageKey = mapping.pageKey;
    if (!mapping.materialType) mapping.materialType = '원본';
  });
  return { ...table, mappings: normalizedMappings, existingPages };
}

function referencePdfMappingKey_(sourceType, pageKey) {
  return `${clean_(sourceType)}\u0001${clean_(pageKey).toUpperCase()}`;
}

function compressReferencePdfPageRanges_(pageNumbers) {
  const numbers = Array.from(new Set((pageNumbers || []).map(Number).filter(Number.isInteger))).sort((a, b) => a - b);
  if (!numbers.length) return [];
  const ranges = [];
  let start = numbers[0];
  let end = numbers[0];
  for (let i = 1; i < numbers.length; i++) {
    const value = numbers[i];
    if (value === end + 1) { end = value; continue; }
    ranges.push(start === end ? [start] : [start, end]);
    start = value;
    end = value;
  }
  ranges.push(start === end ? [start] : [start, end]);
  return ranges;
}

function buildReferencePdfPageCatalogPayload_() {
  const state = readReferencePdfPageUploadState_();
  const pageKeys = Array.from(state.mappings.values())
    .map(item => ({
      sourceType: item.sourceType,
      pageKey: item.pageKey,
      minPage: item.minPage,
      maxPage: item.maxPage,
      pageCount: item.pageCount,
      ranges: compressReferencePdfPageRanges_(item.pageNumbers),
      basePageKey: item.basePageKey || item.pageKey,
      materialType: item.materialType || '원본',
    }))
    .sort((a, b) => a.sourceType.localeCompare(b.sourceType, 'ko') || a.pageKey.localeCompare(b.pageKey, 'en'));
  return {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    pageKeys,
    generatedAt: new Date().toISOString(),
  };
}

function buildReferencePdfPageInfoPayload_(sourceType, pageKey, pageNumber) {
  const normalized = normalizeReferencePdfPageInput_(sourceType, pageKey, pageNumber);
  const state = readReferencePdfPageUploadState_();
  const mapping = state.mappings.get(referencePdfMappingKey_(normalized.sourceType, normalized.pageKey));
  if (!mapping) {
    return {
      ok: true,
      schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
      ...normalized,
      pageKeyMapped: false,
      exists: false,
      message: '등록된 페이지키/Drive 폴더 매핑이 없습니다.',
    };
  }
  const existing = state.existingPages.get(pdfPageLookupKey_(normalized.sourceType, normalized.pageToken));
  return {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    ...normalized,
    pageKeyMapped: true,
    exists: Boolean(existing),
    existing: existing ? {
      driveFileId: existing.pageDriveFileId,
      fileName: existing.pageFileName,
      driveUrl: existing.driveUrl || `https://drive.google.com/file/d/${existing.pageDriveFileId}/view`,
    } : null,
    generatedAt: new Date().toISOString(),
  };
}

function validateReferencePdfBinary_(bytes, mime, clientPageCount) {
  if (clean_(mime).toLowerCase() !== 'application/pdf') throw new Error('원본 페이지 파일은 PDF만 등록할 수 있습니다.');
  if (!bytes || !bytes.length) throw new Error('원본 PDF 페이지 파일이 비어 있습니다.');
  if (bytes.length > STUDY_NOTE_CONFIG.MAX_REFERENCE_PAGE_BYTES) throw new Error('원본 1페이지 PDF는 파일당 8MB 이하만 등록할 수 있습니다.');
  const headerLength = Math.min(8, bytes.length);
  const headerBytes = bytes.slice(0, headerLength).map(value => value & 255);
  const header = String.fromCharCode.apply(null, headerBytes);
  if (!header.startsWith('%PDF-')) throw new Error('업로드 파일의 PDF 헤더를 확인할 수 없습니다.');
  const pageCount = Number(clientPageCount);
  if (!Number.isInteger(pageCount) || pageCount !== 1) throw new Error('원본 페이지 등록은 1페이지 PDF만 허용합니다. 업로드 전에 PDF 페이지 수를 확인해 주세요.');
}

function ensureSheetWithHeaders_(name, headers) {
  const { ss } = getStudySheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const width = headers.length;
  const existing = sheet.getLastRow() >= 1 ? sheet.getRange(1, 1, 1, Math.max(width, sheet.getLastColumn())).getDisplayValues()[0].map(clean_) : [];
  const actual = existing.slice(0, width);
  if (!actual.some(Boolean)) {
    sheet.getRange(1, 1, 1, width).setValues([headers.slice()]);
    sheet.setFrozenRows(1);
  } else {
    const mismatch = headers.filter((header, index) => actual[index] !== header);
    if (mismatch.length) throw new Error(`${name} 헤더 구조가 예상과 다릅니다: ${mismatch.join(', ')}`);
  }
  return sheet;
}

function ensureReferencePdfPageKeySheet_() {
  return ensureSheetWithHeaders_(STUDY_NOTE_CONFIG.PDF_PAGE_KEY_SHEET_NAME, PDF_PAGE_KEY_HEADERS);
}

function ensureReferencePdfRelationSheet_() {
  return ensureSheetWithHeaders_(STUDY_NOTE_CONFIG.PDF_PAGE_RELATION_SHEET_NAME, PDF_PAGE_RELATION_HEADERS);
}

function readReferencePdfPageKeyRegistry_(createIfMissing) {
  const { ss } = getStudySheet_();
  let sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_KEY_SHEET_NAME);
  if (!sheet && createIfMissing) sheet = ensureReferencePdfPageKeySheet_();
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), PDF_PAGE_KEY_HEADERS.length).getDisplayValues();
  const headers = values[0].map(clean_);
  const idx = Object.fromEntries(headers.map((header, index) => [header, index]));
  return values.slice(1).map((row, offset) => ({
    sourceType: clean_(row[idx['출처유형']]),
    pageKey: clean_(row[idx['페이지키']]).toUpperCase(),
    basePageKey: clean_(row[idx['기준페이지키']]).toUpperCase(),
    materialType: clean_(row[idx['자료유형']]) || '원본',
    driveFolderId: clean_(row[idx['Drive폴더ID']]),
    originalDriveFileId: clean_(row[idx['통합원본Drive파일ID']]),
    active: clean_(row[idx['사용여부']]) || 'Y',
    sheetRow: offset + 2,
  })).filter(item => item.sourceType && item.pageKey && item.driveFolderId && item.active !== 'N');
}

function readReferencePdfRelationRows_(createIfMissing) {
  const { ss } = getStudySheet_();
  let sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_RELATION_SHEET_NAME);
  if (!sheet && createIfMissing) sheet = ensureReferencePdfRelationSheet_();
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), PDF_PAGE_RELATION_HEADERS.length).getDisplayValues();
  const headers = values[0].map(clean_);
  const idx = Object.fromEntries(headers.map((header, index) => [header, index]));
  const seen = new Set();
  return values.slice(1).map((row, offset) => {
    const item = {
      relationId: clean_(row[idx['관계ID']]),
      sourceType: clean_(row[idx['출처유형']]),
      pageToken: clean_(row[idx['페이지토큰']]),
      materialType: clean_(row[idx['자료유형']]) || '원본',
      basePageKey: clean_(row[idx['기준페이지키']]).toUpperCase(),
      anchorPageToken: clean_(row[idx['기준페이지토큰']]),
      insertionPosition: clean_(row[idx['삽입위치']]),
      replacementTarget: clean_(row[idx['대체대상페이지토큰']]),
      logicalOrder: Number(row[idx['논리순서']]) || 0,
      versionTag: clean_(row[idx['판본']]),
      active: clean_(row[idx['활성여부']]) || 'Y',
      sheetRow: offset + 2,
    };
    if (!item.pageToken) return null;
    const key = pdfPageLookupKey_(item.sourceType, item.pageToken);
    if (seen.has(key)) throw new Error(`PDF 페이지 관계 중복: ${item.sourceType} ${item.pageToken}`);
    seen.add(key);
    return item;
  }).filter(Boolean);
}

function readReferencePdfRelationMap_(createIfMissing) {
  return new Map(readReferencePdfRelationRows_(createIfMissing).map(item => [pdfPageLookupKey_(item.sourceType, item.pageToken), item]));
}

function normalizeReferencePdfMaterialType_(value) {
  const raw = clean_(value).toLowerCase();
  if (['missing-original','original-missing','원본','원본누락'].includes(raw)) return '원본';
  if (['supplement','보강','보강페이지'].includes(raw)) return '보강';
  if (['revision','개정','개정페이지'].includes(raw)) return '개정';
  if (['new-original','neworiginal','신규원본','새원본'].includes(raw)) return '원본';
  return '원본';
}

function normalizeReferencePdfMaterialInput_(payload, normalized) {
  const rawType = clean_(payload.materialType || 'missing-original');
  const materialType = normalizeReferencePdfMaterialType_(rawType);
  const basePageKey = clean_(payload.basePageKey || normalized.pageKey).toUpperCase();
  const anchorPageToken = clean_(payload.anchorPageToken);
  const insertionPosition = clean_(payload.insertionPosition || '뒤');
  const replacementTarget = clean_(payload.replacementTarget);
  const logicalOrder = Math.max(0, Number(payload.logicalOrder) || 0);
  const versionTag = clean_(payload.versionTag).toUpperCase();
  const allowCreatePageKey = String(payload.allowCreatePageKey || '').toLowerCase() === 'true' || payload.allowCreatePageKey === true;
  if (materialType === '보강') {
    if (!basePageKey || !anchorPageToken) throw new Error('보강페이지는 기준 페이지키와 기준 페이지토큰이 필요합니다.');
    if (!['앞','뒤'].includes(insertionPosition)) throw new Error('보강페이지 삽입위치는 앞/뒤만 사용할 수 있습니다.');
  }
  if (materialType === '개정') {
    if (!basePageKey || !replacementTarget) throw new Error('개정페이지는 기준 페이지키와 대체대상 페이지토큰이 필요합니다.');
  }
  return { rawType, materialType, basePageKey, anchorPageToken, insertionPosition, replacementTarget, logicalOrder, versionTag, allowCreatePageKey };
}

function pageTokenPartsServer_(pageToken) {
  const match = clean_(pageToken).match(/^([A-Za-z0-9_-]+):(\d+)$/);
  return match ? { pageKey: match[1].toUpperCase(), pageNumber: Number(match[2]) } : null;
}

function nextNumberedKey_(prefix, keys, startAt) {
  const exact = new RegExp(`^${String(prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-(\\d+))?$`, 'i');
  let max = 0;
  let hasExact = false;
  keys.forEach(key => {
    const match = clean_(key).match(exact);
    if (!match) return;
    if (match[1]) max = Math.max(max, Number(match[1]) || 0);
    else hasExact = true;
  });
  const next = Math.max(startAt || 1, max + 1, hasExact ? 2 : 1);
  return `${prefix}-${next}`.toUpperCase();
}

function referencePdfExistingKeyNames_(state, sourceType) {
  return Array.from(state.mappings.values()).filter(item => item.sourceType === sourceType).map(item => item.pageKey);
}

function pickReferencePdfBaseMapping_(state, sourceType, basePageKey, domainPrefix) {
  if (basePageKey) {
    const mapping = state.mappings.get(referencePdfMappingKey_(sourceType, basePageKey));
    if (mapping) return mapping;
  }
  const prefix = clean_(domainPrefix).toUpperCase();
  const candidates = Array.from(state.mappings.values()).filter(item => item.sourceType === sourceType && (!prefix || item.pageKey === prefix || item.pageKey.startsWith(`${prefix}-`)));
  candidates.sort((a, b) => a.pageKey.localeCompare(b.pageKey, 'en', { numeric: true }));
  return candidates[0] || null;
}

function buildReferencePdfRegistrationPlan_(data) {
  const sourceType = clean_(data.sourceType);
  if (!['서브노트','교재'].includes(sourceType)) throw new Error('출처유형은 서브노트 또는 교재만 사용할 수 있습니다.');
  const rawType = clean_(data.materialType || 'missing-original').toLowerCase();
  const basePageKey = clean_(data.basePageKey).toUpperCase();
  const requestedPageKey = clean_(data.requestedPageKey).toUpperCase();
  const domainPrefix = clean_(data.domainPrefix).toUpperCase();
  const insertionPosition = clean_(data.insertionPosition || '뒤');
  const state = readReferencePdfPageUploadState_();
  const keys = referencePdfExistingKeyNames_(state, sourceType);
  const baseMapping = pickReferencePdfBaseMapping_(state, sourceType, basePageKey, domainPrefix);
  if (!baseMapping) throw new Error(`${sourceType} · 새 PDF 저장 위치의 기준이 될 기존 페이지키/Drive 폴더를 찾을 수 없습니다.`);

  let pageKey = '';
  let pageNumber = 0;
  let anchorPageToken = '';
  let replacementTarget = '';
  let logicalOrder = 0;
  let versionTag = '';
  let materialType = '원본';

  if (['missing-original','original-missing','원본누락'].includes(rawType)) {
    pageKey = basePageKey || baseMapping.pageKey;
    pageNumber = Number(data.requestedPageNumber);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('기존 원본의 누락 페이지는 실제 페이지번호를 입력해야 합니다.');
  } else if (['supplement','보강','보강페이지'].includes(rawType)) {
    materialType = '보강';
    const anchorNumber = Number(data.anchorPageNumber) || (pageTokenPartsServer_(data.anchorPageToken || '')?.pageNumber || 0);
    if (!Number.isInteger(anchorNumber) || anchorNumber < 1) throw new Error('보강자료를 삽입할 기준 페이지번호를 입력해 주세요.');
    const base = basePageKey || baseMapping.pageKey;
    anchorPageToken = `${base}:${anchorNumber}`;
    if (!state.existingPages.has(pdfPageLookupKey_(sourceType, anchorPageToken))) throw new Error(`${sourceType} ${anchorPageToken} · 보강 기준 원본 페이지가 존재하지 않습니다.`);
    if (!['앞','뒤'].includes(insertionPosition)) throw new Error('삽입위치는 앞/뒤만 사용할 수 있습니다.');
    const addRegex = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-ADD(\\d+)$`, 'i');
    if (requestedPageKey && !addRegex.test(requestedPageKey)) throw new Error(`보강 페이지키는 ${base}-ADD숫자 형식만 사용할 수 있습니다.`);
    const addKeys = keys.map(key => ({ key, match: key.match(addRegex) })).filter(item => item.match).sort((a, b) => Number(a.match[1]) - Number(b.match[1]));
    const nextAddNumber = addKeys.reduce((max, item) => Math.max(max, Number(item.match[1]) || 0), 0) + 1;
    pageKey = requestedPageKey || `${base}-ADD${Math.max(1, nextAddNumber)}`;
    const mapping = state.mappings.get(referencePdfMappingKey_(sourceType, pageKey));
    pageNumber = mapping && mapping.pageNumbers.length ? Math.max(...mapping.pageNumbers) + 1 : 1;
    const relations = readReferencePdfRelationRows_(false).filter(item => item.sourceType === sourceType && item.materialType === '보강' && item.anchorPageToken === anchorPageToken && item.insertionPosition === insertionPosition && item.active !== 'N');
    logicalOrder = relations.reduce((max, item) => Math.max(max, item.logicalOrder || 0), 0) + 1;
  } else if (['revision','개정','개정페이지'].includes(rawType)) {
    materialType = '개정';
    const targetNumber = Number(data.anchorPageNumber) || (pageTokenPartsServer_(data.replacementTarget || '')?.pageNumber || 0);
    if (!Number.isInteger(targetNumber) || targetNumber < 1) throw new Error('개정할 원본 페이지번호를 입력해 주세요.');
    const base = basePageKey || baseMapping.pageKey;
    replacementTarget = `${base}:${targetNumber}`;
    if (!state.existingPages.has(pdfPageLookupKey_(sourceType, replacementTarget))) throw new Error(`${sourceType} ${replacementTarget} · 개정 대상 원본 페이지가 존재하지 않습니다.`);
    const revRegex = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-R(\\d+)$`, 'i');
    if (requestedPageKey && !revRegex.test(requestedPageKey)) throw new Error(`개정 페이지키는 ${base}-R숫자 형식만 사용할 수 있습니다.`);
    const revisions = keys.map(key => ({ key, match: key.match(revRegex) })).filter(item => item.match).sort((a, b) => Number(a.match[1]) - Number(b.match[1]));
    let candidate = requestedPageKey || (revisions.length ? revisions[revisions.length - 1].key : `${base}-R2`);
    let candidateMatch = candidate.match(revRegex);
    let candidateVersion = candidateMatch ? Number(candidateMatch[1]) : 2;
    while (state.existingPages.has(pdfPageLookupKey_(sourceType, `${candidate}:${targetNumber}`))) {
      candidateVersion += 1;
      candidate = `${base}-R${candidateVersion}`;
    }
    pageKey = candidate;
    pageNumber = targetNumber;
    versionTag = `R${candidateVersion}`;
    logicalOrder = candidateVersion;
  } else if (['new-original','neworiginal','신규원본','새원본'].includes(rawType)) {
    const prefix = (requestedPageKey ? '' : domainPrefix) || baseMapping.pageKey.replace(/-(?:\d+|ADD\d+|R\d+)$/i, '');
    pageKey = requestedPageKey || nextNumberedKey_(prefix, keys, 1);
    if (state.mappings.has(referencePdfMappingKey_(sourceType, pageKey))) throw new Error(`${sourceType} ${pageKey} · 이미 존재하는 페이지키입니다. 신규 원본은 새 페이지키를 사용해 주세요.`);
    pageNumber = 1;
  } else {
    throw new Error(`지원하지 않는 PDF 자료유형: ${data.materialType}`);
  }

  const normalized = normalizeReferencePdfPageInput_(sourceType, pageKey, pageNumber);
  const exists = state.existingPages.has(pdfPageLookupKey_(sourceType, normalized.pageToken));
  const mapped = state.mappings.has(referencePdfMappingKey_(sourceType, pageKey));
  return {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    sourceType,
    materialType,
    rawMaterialType: rawType,
    basePageKey: basePageKey || baseMapping.pageKey,
    pageKey,
    pageNumber,
    pageToken: normalized.pageToken,
    storedFileName: normalized.storedFileName,
    anchorPageToken,
    insertionPosition: materialType === '보강' ? insertionPosition : '',
    replacementTarget,
    logicalOrder,
    versionTag,
    exists,
    pageKeyMapped: mapped,
    allowCreatePageKey: !mapped,
    folderReferencePageKey: baseMapping.pageKey,
    generatedAt: new Date().toISOString(),
  };
}

function createReferencePdfPageKeyMapping_(material, normalized, state) {
  const baseMapping = pickReferencePdfBaseMapping_(state, normalized.sourceType, material.basePageKey, '');
  if (!baseMapping) throw new Error(`${normalized.sourceType} ${normalized.pageKey} · 새 페이지키 폴더를 만들 기준 페이지키가 없습니다.`);
  const baseFolder = DriveApp.getFolderById(baseMapping.driveFolderId);
  const parents = baseFolder.getParents();
  if (!parents.hasNext()) throw new Error(`${baseMapping.pageKey} Drive 폴더의 상위 폴더를 찾을 수 없습니다.`);
  const parent = parents.next();
  const sameName = parent.getFoldersByName(normalized.pageKey);
  if (sameName.hasNext()) throw new Error(`${normalized.pageKey} 이름의 Drive 폴더가 이미 존재하지만 페이지키 레지스트리에 없습니다. 자동 생성을 중단합니다.`);
  const folder = parent.createFolder(normalized.pageKey);
  const sheet = ensureReferencePdfPageKeySheet_();
  const now = new Date().toISOString();
  const originalDriveFileId = material.materialType === '보강' || material.materialType === '개정' ? clean_(baseMapping.originalDriveFileId) : '';
  const row = [normalized.sourceType, normalized.pageKey, material.basePageKey || baseMapping.pageKey, material.materialType, folder.getId(), originalDriveFileId, now, 'Y'];
  sheet.appendRow(row);
  return { sheetRow: sheet.getLastRow(), folderId: folder.getId(), pageKey: normalized.pageKey, sourceType: normalized.sourceType };
}

function updateReferencePdfPageKeyOriginalFileId_(sourceType, pageKey, originalDriveFileId) {
  const sheet = ensureReferencePdfPageKeySheet_();
  const rows = readReferencePdfPageKeyRegistry_(true);
  const item = rows.find(row => row.sourceType === sourceType && row.pageKey === pageKey);
  if (!item) return;
  const idx = PDF_PAGE_KEY_HEADERS.indexOf('통합원본Drive파일ID') + 1;
  sheet.getRange(item.sheetRow, idx).setValue(originalDriveFileId);
}

function rollbackCreatedReferencePdfPageKey_(createdKey) {
  const { ss } = getStudySheet_();
  const sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_KEY_SHEET_NAME);
  if (sheet && createdKey.sheetRow && createdKey.sheetRow <= sheet.getLastRow()) sheet.deleteRow(createdKey.sheetRow);
  if (createdKey.folderId) {
    const folder = DriveApp.getFolderById(createdKey.folderId);
    if (!folder.getFiles().hasNext() && !folder.getFolders().hasNext()) folder.setTrashed(true);
  }
}

function validateReferencePdfMaterialAgainstState_(material, normalized, state) {
  if (material.materialType === '보강') {
    const anchor = pageTokenPartsServer_(material.anchorPageToken);
    if (!anchor || anchor.pageKey !== material.basePageKey) throw new Error('보강 기준 페이지토큰과 기준 페이지키가 일치하지 않습니다.');
    if (!state.existingPages.has(pdfPageLookupKey_(normalized.sourceType, material.anchorPageToken))) throw new Error(`${material.anchorPageToken} 보강 기준페이지가 존재하지 않습니다.`);
  }
  if (material.materialType === '개정') {
    const target = pageTokenPartsServer_(material.replacementTarget);
    if (!target || target.pageKey !== material.basePageKey) throw new Error('개정 대상 페이지토큰과 기준 페이지키가 일치하지 않습니다.');
    if (!state.existingPages.has(pdfPageLookupKey_(normalized.sourceType, material.replacementTarget))) throw new Error(`${material.replacementTarget} 개정 대상페이지가 존재하지 않습니다.`);
  }
}

function nextReferencePdfRelationId_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return 'RPFREL000001';
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat();
  let max = 0;
  ids.forEach(id => { const m = clean_(id).match(/^RPFREL(\d+)$/i); if (m) max = Math.max(max, Number(m[1]) || 0); });
  return `RPFREL${String(max + 1).padStart(6, '0')}`;
}

function appendReferencePdfRelation_(normalized, material, now) {
  const sheet = ensureReferencePdfRelationSheet_();
  if (material.materialType === '보강') {
    const existing = readReferencePdfRelationRows_(true).filter(item => item.sourceType === normalized.sourceType && item.materialType === '보강' && item.anchorPageToken === material.anchorPageToken && item.insertionPosition === material.insertionPosition && item.active !== 'N');
    material.logicalOrder = existing.reduce((max, item) => Math.max(max, Number(item.logicalOrder) || 0), 0) + 1;
  } else if (material.materialType === '개정') {
    const rank = clean_(material.versionTag).match(/^R(\d+)$/i);
    material.logicalOrder = rank ? Number(rank[1]) || material.logicalOrder || 0 : material.logicalOrder || 0;
  }
  const relationId = nextReferencePdfRelationId_(sheet);
  const anchor = material.materialType === '보강' ? material.anchorPageToken : material.replacementTarget;
  const row = [
    relationId,
    normalized.sourceType,
    normalized.pageToken,
    material.materialType,
    material.basePageKey,
    anchor,
    material.materialType === '보강' ? material.insertionPosition : '대체',
    material.materialType === '개정' ? material.replacementTarget : '',
    material.logicalOrder || 0,
    material.versionTag || '',
    'Y',
    now.toISOString(),
  ];
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function uploadReferencePdfPage_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let createdFile = null;
  let writtenRow = 0;
  let relationRow = 0;
  let createdKey = null;
  try {
    const normalized = normalizeReferencePdfPageInput_(payload.sourceType, payload.pageKey, payload.pageNumber);
    const material = normalizeReferencePdfMaterialInput_(payload, normalized);
    const originalFileName = clean_(payload.fileName);
    const dataUrl = String(payload.dataUrl || '');
    const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) throw new Error('원본 PDF 파일 데이터 형식이 올바르지 않습니다.');
    const mime = clean_(match[1]).toLowerCase();
    let bytes;
    try { bytes = Utilities.base64Decode(match[2]); }
    catch (error) { throw new Error('원본 PDF 파일의 Base64 데이터를 해석할 수 없습니다.'); }
    validateReferencePdfBinary_(bytes, mime, payload.pageCount);

    let state = readReferencePdfPageUploadState_();
    let mapping = state.mappings.get(referencePdfMappingKey_(normalized.sourceType, normalized.pageKey));
    if (!mapping) {
      if (!material.allowCreatePageKey) {
        throw new Error(`${normalized.sourceType} ${normalized.pageKey} · 기존 Drive 폴더 매핑이 없습니다. 새 페이지키 생성이 승인된 등록 흐름을 사용해 주세요.`);
      }
      createdKey = createReferencePdfPageKeyMapping_(material, normalized, state);
      state = readReferencePdfPageUploadState_();
      mapping = state.mappings.get(referencePdfMappingKey_(normalized.sourceType, normalized.pageKey));
    }
    if (!mapping) throw new Error(`${normalized.sourceType} ${normalized.pageKey} · 페이지키/Drive 폴더 매핑 생성 후 확인에 실패했습니다.`);
    validateReferencePdfMaterialAgainstState_(material, normalized, state);
    if (state.existingPages.has(pdfPageLookupKey_(normalized.sourceType, normalized.pageToken))) {
      throw new Error(`${normalized.sourceType} ${normalized.pageToken} · 이미 등록된 페이지입니다. 기존 페이지를 연결해 주세요.`);
    }

    let folder;
    try { folder = DriveApp.getFolderById(mapping.driveFolderId); }
    catch (error) { throw new Error(`${normalized.sourceType} ${normalized.pageKey} · 등록된 Drive 폴더에 접근할 수 없습니다.`); }
    const sameNameFiles = folder.getFilesByName(normalized.storedFileName);
    if (sameNameFiles.hasNext()) {
      throw new Error(`${normalized.storedFileName} 파일이 Drive 폴더에 이미 존재하지만 페이지 MASTER에는 없습니다. 중복/고아 파일 여부를 먼저 확인해 주세요.`);
    }

    const blob = Utilities.newBlob(bytes, 'application/pdf', normalized.storedFileName);
    createdFile = folder.createFile(blob);
    if (clean_(createdFile.getMimeType()).toLowerCase() !== 'application/pdf') throw new Error('Drive에 생성된 파일의 MIME 검증에 실패했습니다.');
    if (Number(createdFile.getSize()) !== bytes.length) throw new Error('Drive에 생성된 파일의 크기 검증에 실패했습니다.');

    let originalDriveFileId = clean_(mapping.originalDriveFileId);
    if (!originalDriveFileId) {
      originalDriveFileId = createdFile.getId();
      updateReferencePdfPageKeyOriginalFileId_(normalized.sourceType, normalized.pageKey, originalDriveFileId);
    }

    const driveUrl = `https://drive.google.com/file/d/${createdFile.getId()}/view`;
    const now = new Date();
    const timeZone = Session.getScriptTimeZone() || 'Asia/Seoul';
    const registrationDate = Utilities.formatDate(now, timeZone, 'yyyy-MM-dd');
    const rowObject = {
      '출처유형': normalized.sourceType,
      '페이지키': normalized.pageKey,
      '페이지번호': normalized.pageNumber,
      '페이지토큰': normalized.pageToken,
      '통합원본Drive파일ID': originalDriveFileId,
      '페이지Drive파일ID': createdFile.getId(),
      '페이지파일명': normalized.storedFileName,
      'Drive파일URL': driveUrl,
      'Drive폴더ID': mapping.driveFolderId,
      '로컬분할검증': 'OK',
      'Drive업로드검증': 'OK',
      '등록일': registrationDate,
    };
    const rowValues = state.headers.map(header => Object.prototype.hasOwnProperty.call(rowObject, header) ? rowObject[header] : '');
    writtenRow = state.sheet.getLastRow() + 1;
    state.sheet.getRange(writtenRow, 1, 1, state.headers.length).setValues([rowValues]);

    if (material.materialType === '보강' || material.materialType === '개정') {
      relationRow = appendReferencePdfRelation_(normalized, material, now);
    }
    SpreadsheetApp.flush();

    const verify = buildReferencePdfPageInfoPayload_(normalized.sourceType, normalized.pageKey, normalized.pageNumber);
    if (!verify.exists || !verify.existing || verify.existing.driveFileId !== createdFile.getId()) {
      throw new Error('PDF 페이지 MASTER 등록 후 재조회 검증에 실패했습니다.');
    }
    return {
      action: 'uploadReferencePdfPage',
      sourceType: normalized.sourceType,
      pageKey: normalized.pageKey,
      pageNumber: normalized.pageNumber,
      pageToken: normalized.pageToken,
      originalFileName,
      storedFileName: normalized.storedFileName,
      driveFileId: createdFile.getId(),
      driveUrl,
      size: bytes.length,
      pageCount: 1,
      materialType: material.materialType,
      basePageKey: material.basePageKey || normalized.pageKey,
      anchorPageToken: material.anchorPageToken || '',
      insertionPosition: material.insertionPosition || '',
      replacementTarget: material.replacementTarget || '',
      logicalOrder: material.logicalOrder || 0,
      versionTag: material.versionTag || '',
      active: 'Y',
      createdPageKey: Boolean(createdKey),
      registeredAt: now.toISOString(),
    };
  } catch (error) {
    if (relationRow > 0) {
      try {
        const sheet = getStudySheet_().ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_RELATION_SHEET_NAME);
        if (sheet && relationRow <= sheet.getLastRow()) sheet.deleteRow(relationRow);
      } catch (cleanupError) { console.error(`PDF 페이지 관계 롤백 실패: ${cleanupError}`); }
    }
    if (writtenRow > 0) {
      try {
        const state = readReferencePdfPageUploadTable_();
        if (writtenRow <= state.sheet.getLastRow()) state.sheet.deleteRow(writtenRow);
      } catch (cleanupError) { console.error(`PDF 페이지 시트 롤백 실패: ${cleanupError}`); }
    }
    if (createdFile) {
      try { createdFile.setTrashed(true); }
      catch (cleanupError) { console.error(`PDF 페이지 Drive 파일 롤백 실패: ${cleanupError}`); }
    }
    if (createdKey) {
      try { rollbackCreatedReferencePdfPageKey_(createdKey); }
      catch (cleanupError) { console.error(`PDF 페이지키 생성 롤백 실패: ${cleanupError}`); }
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}


function replaceReferencePdfPage_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let createdFile = null;
  let pageRowBackup = null;
  let pageSheetRef = null;
  let pageSheetRow = 0;
  let pageHeaderIndex = null;
  let oldOriginalDriveFileId = '';
  const linkBackups = [];
  const originalIdBackups = [];
  try {
    const normalized = normalizeReferencePdfPageInput_(payload.sourceType, payload.pageKey, payload.pageNumber);
    const dataUrl = String(payload.dataUrl || '');
    const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) throw new Error('교체 PDF 파일 데이터 형식이 올바르지 않습니다.');
    const mime = clean_(match[1]).toLowerCase();
    let bytes;
    try { bytes = Utilities.base64Decode(match[2]); }
    catch (error) { throw new Error('교체 PDF 파일의 Base64 데이터를 해석할 수 없습니다.'); }
    validateReferencePdfBinary_(bytes, mime, payload.pageCount);

    const state = readReferencePdfPageUploadState_();
    const lookupKey = pdfPageLookupKey_(normalized.sourceType, normalized.pageToken);
    const existing = state.existingPages.get(lookupKey);
    if (!existing) throw new Error(`${normalized.sourceType} ${normalized.pageToken} · 교체할 기존 페이지를 찾을 수 없습니다.`);
    if (existing.pageKey !== normalized.pageKey || existing.pageNumber !== normalized.pageNumber) throw new Error('교체 대상 페이지 식별정보가 일치하지 않습니다.');

    let folder;
    try { folder = DriveApp.getFolderById(existing.driveFolderId); }
    catch (error) { throw new Error(`${normalized.sourceType} ${normalized.pageKey} · Drive 폴더에 접근할 수 없습니다.`); }
    const blob = Utilities.newBlob(bytes, 'application/pdf', normalized.storedFileName);
    createdFile = folder.createFile(blob);
    if (clean_(createdFile.getMimeType()).toLowerCase() !== 'application/pdf') throw new Error('Drive에 생성된 교체 파일의 MIME 검증에 실패했습니다.');
    if (Number(createdFile.getSize()) !== bytes.length) throw new Error('Drive에 생성된 교체 파일의 크기 검증에 실패했습니다.');

    const newDriveFileId = createdFile.getId();
    const newDriveUrl = `https://drive.google.com/file/d/${newDriveFileId}/view`;
    const pageSheet = state.sheet;
    pageSheetRef = pageSheet;
    pageSheetRow = existing.sheetRow;
    pageHeaderIndex = state.headerIndex;
    oldOriginalDriveFileId = existing.originalDriveFileId;
    pageRowBackup = pageSheet.getRange(existing.sheetRow, 1, 1, state.headers.length).getValues()[0];
    const pageRow = pageRowBackup.slice();
    pageRow[state.headerIndex['페이지Drive파일ID']] = newDriveFileId;
    pageRow[state.headerIndex['페이지파일명']] = normalized.storedFileName;
    pageRow[state.headerIndex['Drive파일URL']] = newDriveUrl;
    pageRow[state.headerIndex['로컬분할검증']] = 'OK';
    pageRow[state.headerIndex['Drive업로드검증']] = 'OK';
    pageSheet.getRange(existing.sheetRow, 1, 1, state.headers.length).setValues([pageRow]);

    // 신규 원본의 첫 페이지처럼 통합원본Drive파일ID가 페이지 파일 자신을 가리키는 경우에는
    // 같은 페이지키 전체와 페이지키 레지스트리의 통합원본 ID도 새 파일로 맞춘다.
    if (existing.originalDriveFileId === existing.pageDriveFileId) {
      const originalIdCol = state.headerIndex['통합원본Drive파일ID'] + 1;
      state.rows.forEach((row, offset) => {
        if (clean_(row[state.headerIndex['출처유형']]) !== normalized.sourceType) return;
        if (clean_(row[state.headerIndex['페이지키']]).toUpperCase() !== normalized.pageKey) return;
        const rowNum = offset + 2;
        const oldValue = state.sheet.getRange(rowNum, originalIdCol).getValue();
        originalIdBackups.push({ rowNum, oldValue });
        state.sheet.getRange(rowNum, originalIdCol).setValue(newDriveFileId);
      });
      updateReferencePdfPageKeyOriginalFileId_(normalized.sourceType, normalized.pageKey, newDriveFileId);
    }

    const { ss } = getStudySheet_();
    const linkSheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_LINK_SHEET_NAME);
    if (!linkSheet) throw new Error(`'${STUDY_NOTE_CONFIG.PDF_PAGE_LINK_SHEET_NAME}' 시트를 찾을 수 없습니다.`);
    const linkLastRow = linkSheet.getLastRow();
    const linkLastColumn = linkSheet.getLastColumn();
    const linkValues = linkSheet.getRange(1, 1, linkLastRow, linkLastColumn).getValues();
    const linkHeaders = linkValues[0].map(clean_);
    const linkIndex = Object.fromEntries(linkHeaders.map((h, i) => [h, i]));
    for (const required of ['출처유형','페이지토큰','Drive파일ID','파일명','Drive파일URL']) {
      if (linkIndex[required] === undefined) throw new Error(`PDF 페이지 연결 필수 컬럼 누락: ${required}`);
    }
    for (let i = 1; i < linkValues.length; i++) {
      const row = linkValues[i];
      if (clean_(row[linkIndex['출처유형']]) !== normalized.sourceType || clean_(row[linkIndex['페이지토큰']]) !== normalized.pageToken) continue;
      linkBackups.push({ rowNum: i + 1, row: row.slice() });
      const next = row.slice();
      next[linkIndex['Drive파일ID']] = newDriveFileId;
      next[linkIndex['파일명']] = normalized.storedFileName;
      next[linkIndex['Drive파일URL']] = newDriveUrl;
      linkSheet.getRange(i + 1, 1, 1, linkLastColumn).setValues([next]);
    }
    SpreadsheetApp.flush();

    const verify = buildReferencePdfPageInfoPayload_(normalized.sourceType, normalized.pageKey, normalized.pageNumber);
    if (!verify.exists || !verify.existing || verify.existing.driveFileId !== newDriveFileId) throw new Error('교체 후 PDF 페이지 MASTER 재조회 검증에 실패했습니다.');
    const refreshedLinks = buildPdfPageLinksPayload_('');
    const driveIdPos = refreshedLinks.headers.indexOf('Drive파일ID');
    const sourcePos = refreshedLinks.headers.indexOf('출처유형');
    const tokenPos = refreshedLinks.headers.indexOf('페이지토큰');
    const staleLinks = refreshedLinks.rows.filter(row => row[sourcePos] === normalized.sourceType && row[tokenPos] === normalized.pageToken && row[driveIdPos] !== newDriveFileId);
    if (staleLinks.length) throw new Error('교체 후 PDF 연결행의 Drive 파일ID 동기화 검증에 실패했습니다.');

    let oldFileCleanup = true;
    try { DriveApp.getFileById(existing.pageDriveFileId).setTrashed(true); }
    catch (cleanupError) { oldFileCleanup = false; console.warn(`교체 전 PDF 파일 휴지통 이동 실패: ${cleanupError}`); }
    return {
      action: 'replaceReferencePdfPage',
      sourceType: normalized.sourceType,
      pageKey: normalized.pageKey,
      pageNumber: normalized.pageNumber,
      pageToken: normalized.pageToken,
      storedFileName: normalized.storedFileName,
      oldDriveFileId: existing.pageDriveFileId,
      driveFileId: newDriveFileId,
      driveUrl: newDriveUrl,
      size: bytes.length,
      pageCount: 1,
      updatedLinkCount: linkBackups.length,
      oldFileCleanup,
      replacedAt: new Date().toISOString(),
    };
  } catch (error) {
    try {
      if (pageRowBackup && pageSheetRef && pageSheetRow) {
        pageSheetRef.getRange(pageSheetRow, 1, 1, pageRowBackup.length).setValues([pageRowBackup]);
      }
      if (originalIdBackups.length && pageSheetRef && pageHeaderIndex) {
        const col = pageHeaderIndex['통합원본Drive파일ID'] + 1;
        originalIdBackups.forEach(item => pageSheetRef.getRange(item.rowNum, col).setValue(item.oldValue));
        const normalized = normalizeReferencePdfPageInput_(payload.sourceType, payload.pageKey, payload.pageNumber);
        if (oldOriginalDriveFileId) updateReferencePdfPageKeyOriginalFileId_(normalized.sourceType, normalized.pageKey, oldOriginalDriveFileId);
      }
      if (linkBackups.length) {
        const { ss } = getStudySheet_();
        const linkSheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_LINK_SHEET_NAME);
        linkBackups.forEach(item => linkSheet.getRange(item.rowNum, 1, 1, item.row.length).setValues([item.row]));
      }
      SpreadsheetApp.flush();
    } catch (rollbackError) { console.error(`PDF 교체 메타데이터 롤백 실패: ${rollbackError}`); }
    if (createdFile) {
      try { createdFile.setTrashed(true); }
      catch (cleanupError) { console.error(`교체용 새 PDF 파일 롤백 실패: ${cleanupError}`); }
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function testStage6ReferencePdfPageUploadSupport() {
  const state = readReferencePdfPageUploadState_();
  const mappings = Array.from(state.mappings.values()).sort((a, b) => a.sourceType.localeCompare(b.sourceType, 'ko') || a.pageKey.localeCompare(b.pageKey, 'en'));
  if (!mappings.length) throw new Error('원본 PDF 페이지키 매핑이 없습니다.');
  const sample = mappings[0];
  const folder = DriveApp.getFolderById(sample.driveFolderId);
  if (!folder) throw new Error('샘플 Drive 폴더를 확인할 수 없습니다.');
  const existingSample = Array.from(state.existingPages.values()).find(item => item.sourceType === sample.sourceType && item.pageKey === sample.pageKey);
  if (!existingSample) throw new Error('샘플 원본 PDF 페이지를 찾을 수 없습니다.');
  const expectedName = normalizeReferencePdfPageInput_(existingSample.sourceType, existingSample.pageKey, existingSample.pageNumber).storedFileName;
  if (existingSample.pageFileName !== expectedName) throw new Error(`파일명 규칙 검증 실패: ${existingSample.pageFileName} != ${expectedName}`);
  const info = buildReferencePdfPageInfoPayload_(existingSample.sourceType, existingSample.pageKey, existingSample.pageNumber);
  const ok = Boolean(info.exists && info.existing && info.existing.driveFileId === existingSample.pageDriveFileId);
  const result = {
    ok,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    pageKeyCount: mappings.length,
    pageFileCount: state.existingPages.size,
    sample: {
      sourceType: existingSample.sourceType,
      pageKey: existingSample.pageKey,
      pageToken: existingSample.pageToken,
      fileName: existingSample.pageFileName,
    },
    contentMutationPerformed: false,
    metadataSetupMayCreateEmptySheets: true,
  };
  console.log(JSON.stringify(result));
  if (!ok) throw new Error(`원본 PDF 페이지 등록 지원 테스트 실패: ${JSON.stringify(result)}`);
  return result;
}

function testStage7ReferencePdfFlowSupport() {
  const keySheet = ensureReferencePdfPageKeySheet_();
  const relationSheet = ensureReferencePdfRelationSheet_();
  const state = readReferencePdfPageUploadState_();
  const mappings = Array.from(state.mappings.values()).filter(item => item.pageCount > 0).sort((a, b) => a.sourceType.localeCompare(b.sourceType, 'ko') || a.pageKey.localeCompare(b.pageKey, 'en', { numeric: true }));
  if (!mappings.length) throw new Error('테스트할 기존 PDF 페이지키가 없습니다.');
  const sampleMapping = mappings[0];
  const samplePage = Array.from(state.existingPages.values()).find(page => page.sourceType === sampleMapping.sourceType && page.pageKey === sampleMapping.pageKey);
  if (!samplePage) throw new Error('테스트할 기존 PDF 페이지를 찾을 수 없습니다.');
  const supplementPlan = buildReferencePdfRegistrationPlan_({ sourceType: samplePage.sourceType, materialType: 'supplement', basePageKey: samplePage.pageKey, anchorPageNumber: samplePage.pageNumber, insertionPosition: '뒤' });
  const revisionPlan = buildReferencePdfRegistrationPlan_({ sourceType: samplePage.sourceType, materialType: 'revision', basePageKey: samplePage.pageKey, anchorPageNumber: samplePage.pageNumber });
  const payload = buildPdfPageFilesPayload_();
  const result = {
    ok: Boolean(supplementPlan.pageToken && revisionPlan.pageToken && payload.pageFileCount === state.existingPages.size),
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    pageFileCount: payload.pageFileCount,
    pageKeyCount: state.mappings.size,
    metadataKeyRows: Math.max(0, keySheet.getLastRow() - 1),
    relationRows: Math.max(0, relationSheet.getLastRow() - 1),
    sample: { sourceType: samplePage.sourceType, pageToken: samplePage.pageToken },
    supplementPlan: { pageToken: supplementPlan.pageToken, allowCreatePageKey: supplementPlan.allowCreatePageKey, logicalOrder: supplementPlan.logicalOrder },
    revisionPlan: { pageToken: revisionPlan.pageToken, allowCreatePageKey: revisionPlan.allowCreatePageKey, versionTag: revisionPlan.versionTag },
    contentMutationPerformed: false,
    metadataSetupMayCreateEmptySheets: true,
  };
  console.log(JSON.stringify(result));
  if (!result.ok) throw new Error(`Stage7 PDF 흐름 테스트 실패: ${JSON.stringify(result)}`);
  return result;
}

function findPdfPageFileRecord_(sourceType, pageToken) {
  const normalizedSourceType = clean_(sourceType);
  const normalizedPageToken = clean_(pageToken);
  if (!['서브노트','교재'].includes(normalizedSourceType)) throw new Error('원본 PDF 출처유형이 올바르지 않습니다.');
  if (!normalizedPageToken) throw new Error('원본 PDF 페이지토큰이 없습니다.');

  const { ss } = getStudySheet_();
  const sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME);
  if (!sheet) throw new Error(`'${STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME}' 시트를 찾을 수 없습니다.`);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2) throw new Error('원본 PDF 페이지 데이터가 없습니다.');

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(clean_);
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const required = ['출처유형','페이지키','페이지번호','페이지토큰','페이지Drive파일ID','페이지파일명','로컬분할검증','Drive업로드검증'];
  const missing = required.filter(header => headerIndex[header] === undefined);
  if (missing.length) throw new Error(`PDF 페이지 파일 필수 컬럼 누락: ${missing.join(', ')}`);

  const tokenMatches = sheet.getRange(2, headerIndex['페이지토큰'] + 1, lastRow - 1, 1)
    .createTextFinder(normalizedPageToken)
    .matchEntireCell(true)
    .findAll();
  for (const match of tokenMatches) {
    const rowNumber = match.getRow();
    const row = sheet.getRange(rowNumber, 1, 1, lastColumn).getDisplayValues()[0];
    if (clean_(row[headerIndex['출처유형']]) !== normalizedSourceType) continue;
    const driveFileId = clean_(row[headerIndex['페이지Drive파일ID']]);
    if (!driveFileId) throw new Error(`${normalizedSourceType} ${normalizedPageToken} · Drive파일ID가 없습니다.`);
    if (clean_(row[headerIndex['로컬분할검증']]) !== 'OK' || clean_(row[headerIndex['Drive업로드검증']]) !== 'OK') {
      throw new Error(`${normalizedSourceType} ${normalizedPageToken} · 분할/업로드 검증상태를 확인해 주세요.`);
    }
    return {
      sourceType: normalizedSourceType,
      pageKey: clean_(row[headerIndex['페이지키']]),
      pageNumber: Number(row[headerIndex['페이지번호']]) || 0,
      pageToken: normalizedPageToken,
      driveFileId,
      fileName: clean_(row[headerIndex['페이지파일명']]),
    };
  }
  throw new Error(`${normalizedSourceType} 페이지 '${normalizedPageToken}'을 찾을 수 없습니다.`);
}

function buildReferencePdfContentPayload_(sourceType, pageToken) {
  const page = findPdfPageFileRecord_(sourceType, pageToken);
  const file = DriveApp.getFileById(page.driveFileId);
  const mime = clean_(file.getMimeType()).toLowerCase();
  if (mime !== 'application/pdf') throw new Error(`${page.pageToken} · PDF 파일이 아닙니다.`);
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  if (!bytes.length) throw new Error(`${page.pageToken} · PDF 파일이 비어 있습니다.`);
  if (bytes.length > STUDY_NOTE_CONFIG.MAX_REFERENCE_PAGE_BYTES) {
    throw new Error(`${page.pageToken} · 1페이지 PDF가 허용 크기(8MB)를 초과합니다.`);
  }
  return {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    sourceType: page.sourceType,
    pageKey: page.pageKey,
    pageNumber: page.pageNumber,
    pageToken: page.pageToken,
    driveFileId: page.driveFileId,
    fileName: page.fileName || file.getName(),
    mime: 'application/pdf',
    size: bytes.length,
    base64: Utilities.base64Encode(bytes),
    generatedAt: new Date().toISOString(),
  };
}

function pdfPageLookupKey_(sourceType, pageToken) {
  return `${clean_(sourceType)}\u0001${clean_(pageToken)}`;
}

function splitPageTokensServer_(value) {
  const text = clean_(value);
  if (!text) return [];
  return text.split(/[,;\n]+/).map(token => clean_(token)).filter(Boolean);
}

function readPdfPageFileLookup_() {
  const { ss } = getStudySheet_();
  const sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME);
  if (!sheet) throw new Error(`'${STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME}' 시트를 찾을 수 없습니다.`);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) throw new Error('PDF 페이지 파일 데이터가 없습니다.');
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const headers = values[0].map(clean_);
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const required = ['출처유형','페이지키','페이지번호','페이지토큰','페이지Drive파일ID','페이지파일명','Drive파일URL','로컬분할검증','Drive업로드검증'];
  const missing = required.filter(header => headerIndex[header] === undefined);
  if (missing.length) throw new Error(`PDF 페이지 파일 필수 컬럼 누락: ${missing.join(', ')}`);

  const lookup = new Map();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const sourceType = clean_(row[headerIndex['출처유형']]);
    const pageToken = clean_(row[headerIndex['페이지토큰']]);
    const driveFileId = clean_(row[headerIndex['페이지Drive파일ID']]);
    if (!sourceType && !pageToken && !driveFileId) continue;
    if (!['서브노트','교재'].includes(sourceType) || !pageToken || !driveFileId) continue;
    const key = pdfPageLookupKey_(sourceType, pageToken);
    if (lookup.has(key)) throw new Error(`PDF 페이지 파일 중복: ${sourceType} ${pageToken}`);
    lookup.set(key, {
      sourceType,
      pageKey: clean_(row[headerIndex['페이지키']]),
      pageNumber: Number(row[headerIndex['페이지번호']]) || 0,
      pageToken,
      driveFileId,
      fileName: clean_(row[headerIndex['페이지파일명']]),
      driveUrl: clean_(row[headerIndex['Drive파일URL']]) || `https://drive.google.com/file/d/${driveFileId}/view`,
      localValidation: clean_(row[headerIndex['로컬분할검증']]),
      driveValidation: clean_(row[headerIndex['Drive업로드검증']]),
    });
  }
  return lookup;
}

function prepareTopicReferencePdfSpecs_(topicId, topicName, subnotePages, textbookPages) {
  const pageLookup = readPdfPageFileLookup_();
  const specs = [];
  const addSource = (sourceType, sourceColumn, rawValue) => {
    const tokens = splitPageTokensServer_(rawValue);
    tokens.forEach(pageToken => {
      const page = pageLookup.get(pdfPageLookupKey_(sourceType, pageToken));
      if (!page) {
        throw new Error(`${sourceType} 페이지 '${pageToken}'을 '${STUDY_NOTE_CONFIG.PDF_PAGE_FILE_SHEET_NAME}'에서 찾을 수 없습니다.`);
      }
      if (!page.pageKey || !page.pageNumber || page.localValidation !== 'OK' || page.driveValidation !== 'OK') {
        throw new Error(`${sourceType} 페이지 '${pageToken}'의 분할/업로드 검증상태를 확인해 주세요.`);
      }
      specs.push({
        topicId: clean_(topicId),
        topicName: clean_(topicName),
        sourceType,
        sourceColumn,
        originalPageCellValue: clean_(rawValue),
        pageToken: page.pageToken,
        pageKey: page.pageKey,
        pageNumber: page.pageNumber,
        driveFileId: page.driveFileId,
        fileName: page.fileName,
        driveUrl: page.driveUrl,
      });
    });
  };
  addSource('서브노트', 'P', subnotePages);
  addSource('교재', 'Q', textbookPages);
  return specs;
}

function syncTopicReferencePdfLinks_(topicId, specs) {
  const { ss } = getStudySheet_();
  const sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.PDF_PAGE_LINK_SHEET_NAME);
  if (!sheet) throw new Error(`'${STUDY_NOTE_CONFIG.PDF_PAGE_LINK_SHEET_NAME}' 시트를 찾을 수 없습니다.`);
  const headers = ['연결ID','통합ID','통합토픽','출처유형','원본열','원본페이지셀값','페이지토큰','페이지키','페이지번호','Drive파일ID','파일명','Drive파일URL','파일접근검증','페이지범위검증','페이지직접점프상태'];
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < headers.length) throw new Error('PDF 페이지 연결 시트 구조가 올바르지 않습니다.');
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const actualHeaders = values[0].map(clean_);
  const headerIndex = Object.fromEntries(actualHeaders.map((header, index) => [header, index]));
  const missing = headers.filter(header => headerIndex[header] === undefined);
  if (missing.length) throw new Error(`PDF 페이지 연결 필수 컬럼 누락: ${missing.join(', ')}`);

  let maxConnectionNumber = 0;
  const existingTopicRows = [];
  const connectionIdsByKey = new Map();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const connectionId = clean_(row[headerIndex['연결ID']]);
    const idMatch = connectionId.match(/^PDF(\d+)$/i);
    if (idMatch) maxConnectionNumber = Math.max(maxConnectionNumber, Number(idMatch[1]));
    if (clean_(row[headerIndex['통합ID']]) !== clean_(topicId)) continue;
    existingTopicRows.push(i + 1);
    const key = pdfPageLookupKey_(clean_(row[headerIndex['출처유형']]), clean_(row[headerIndex['페이지토큰']]));
    if (connectionId) {
      if (!connectionIdsByKey.has(key)) connectionIdsByKey.set(key, []);
      connectionIdsByKey.get(key).push(connectionId);
    }
  }

  const desiredRows = specs.map(spec => {
    const key = pdfPageLookupKey_(spec.sourceType, spec.pageToken);
    const existingIds = connectionIdsByKey.get(key) || [];
    let connectionId = existingIds.length ? existingIds.shift() : '';
    if (!connectionId) connectionId = `PDF${String(++maxConnectionNumber).padStart(6, '0')}`;
    const rowObj = {
      '연결ID': connectionId,
      '통합ID': spec.topicId,
      '통합토픽': spec.topicName,
      '출처유형': spec.sourceType,
      '원본열': spec.sourceColumn,
      '원본페이지셀값': spec.originalPageCellValue,
      '페이지토큰': spec.pageToken,
      '페이지키': spec.pageKey,
      '페이지번호': spec.pageNumber,
      'Drive파일ID': spec.driveFileId,
      '파일명': spec.fileName,
      'Drive파일URL': spec.driveUrl,
      '파일접근검증': 'OK',
      '페이지범위검증': 'OK',
      '페이지직접점프상태': '1페이지 PDF 직접연결 자동갱신완료',
    };
    return actualHeaders.map(header => Object.prototype.hasOwnProperty.call(rowObj, header) ? rowObj[header] : '');
  });

  const reuseCount = Math.min(existingTopicRows.length, desiredRows.length);
  for (let i = 0; i < reuseCount; i++) {
    sheet.getRange(existingTopicRows[i], 1, 1, actualHeaders.length).setValues([desiredRows[i]]);
  }
  if (desiredRows.length > existingTopicRows.length) {
    const appendRows = desiredRows.slice(existingTopicRows.length);
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, appendRows.length, actualHeaders.length).setValues(appendRows);
  }
  if (existingTopicRows.length > desiredRows.length) {
    const deleteRows = existingTopicRows.slice(desiredRows.length).sort((a, b) => b - a);
    deleteRows.forEach(rowNumber => sheet.deleteRow(rowNumber));
  }
  SpreadsheetApp.flush();
  return { linkCount: desiredRows.length };
}

function buildTopicPayload_(topicId) {
  const { sheet } = getStudySheet_();
  const table = readTable_(sheet);
  const rowInfo = findTopicRow_(table, clean_(topicId));
  if (!rowInfo) return { ok: false, message: `통합ID를 찾을 수 없습니다: ${clean_(topicId)}` };
  return {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    headers: table.headers,
    row: rowInfo.row,
  };
}

function updateTopic_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const { sheet } = getStudySheet_();
    const table = readTable_(sheet);
    const topicId = clean_(payload.topicId);
    if (!topicId) throw new Error('수정할 통합ID가 없습니다.');

    const rowInfo = findTopicRow_(table, topicId);
    if (!rowInfo) throw new Error(`수정할 통합ID를 찾을 수 없습니다: ${topicId}`);

    const fields = payload.fields || {};
    const row = rowInfo.row.slice();
    applyEditableFields_(row, table.headerIndex, fields);
    validateManagedRow_(row, table.headerIndex);
    const pdfSpecs = prepareTopicReferencePdfSpecs_(
      topicId,
      getByHeader_(row, table.headerIndex, '통합토픽'),
      getByHeader_(row, table.headerIndex, '서브노트페이지'),
      getByHeader_(row, table.headerIndex, '교재페이지')
    );

    // 수정 대상 컬럼만 기록하여 다른 확정 컬럼의 값/형식을 건드리지 않는다.
    Object.entries(EDITABLE_FIELD_MAP).forEach(([fieldName, header]) => {
      if (!Object.prototype.hasOwnProperty.call(fields, fieldName)) return;
      const columnIndex = table.headerIndex[header];
      if (columnIndex === undefined) return;
      const value = header === '학습대상' ? clean_(fields[fieldName]).toUpperCase() : clean_(fields[fieldName]);
      sheet.getRange(rowInfo.sheetRow, columnIndex + 1).setValue(value);
    });
    SpreadsheetApp.flush();
    const pdfSync = syncTopicReferencePdfLinks_(topicId, pdfSpecs);

    const displayRow = sheet.getRange(rowInfo.sheetRow, 1, 1, table.headers.length).getDisplayValues()[0];
    return { action: 'updateTopic', topicId, headers: table.headers, row: displayRow, referencePdfLinkCount: pdfSync.linkCount };
  } finally {
    lock.releaseLock();
  }
}


function buildNewCategoryPlan_(table, requestedDomain, requestedCategoryName) {
  const domain = clean_(requestedDomain).toUpperCase();
  const categoryName = clean_(requestedCategoryName);
  if (!domain) throw new Error('새 대분류의 도메인을 선택해 주세요.');
  if (!categoryName) throw new Error('새 대분류명을 입력해 주세요.');
  if (categoryName.length > 100) throw new Error('새 대분류명은 100자 이하로 입력해 주세요.');

  const domainIndex = table.headerIndex['도메인'];
  const categoryNameIndex = table.headerIndex['대분류'];
  const categoryIndex = table.headerIndex['대분류코드'];
  if (domainIndex === undefined || categoryNameIndex === undefined || categoryIndex === undefined) {
    throw new Error('필수 컬럼(도메인/대분류/대분류코드)을 찾을 수 없습니다.');
  }

  let domainReferenceRow = null;
  let lastDomainSheetRow = 0;
  let maxCategoryNumber = 0;
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const codePattern = new RegExp(`^${escapedDomain}-(\\d+)$`, 'i');

  table.rows.forEach((row, i) => {
    if (clean_(row[domainIndex]).toUpperCase() !== domain) return;
    domainReferenceRow = domainReferenceRow || row;
    lastDomainSheetRow = i + 2;
    if (clean_(row[categoryNameIndex]) === categoryName) {
      throw new Error(`${domain} 도메인에 동일한 대분류명이 이미 있습니다: ${categoryName}`);
    }
    const match = clean_(row[categoryIndex]).match(codePattern);
    if (match) maxCategoryNumber = Math.max(maxCategoryNumber, Number(match[1]) || 0);
  });

  if (!domainReferenceRow) throw new Error(`MASTER에서 도메인을 찾을 수 없습니다: ${domain}`);
  const categoryCode = `${domain}-${String(maxCategoryNumber + 1).padStart(2, '0')}`;
  return { domain, categoryName, categoryCode, referenceRow: domainReferenceRow, lastDomainSheetRow };
}

function testStage8CategoryAddSupport() {
  const { sheet } = getStudySheet_();
  const table = readTable_(sheet);
  const domainIndex = table.headerIndex['도메인'];
  if (domainIndex === undefined) throw new Error("'도메인' 컬럼을 찾을 수 없습니다.");
  const sampleDomain = table.rows.map(row => clean_(row[domainIndex]).toUpperCase()).find(Boolean);
  if (!sampleDomain) throw new Error('테스트할 도메인이 없습니다.');
  const plan = buildNewCategoryPlan_(table, sampleDomain, `__TEST_CATEGORY_${new Date().getTime()}__`);
  const result = {
    ok: Boolean(plan.categoryCode && plan.referenceRow && plan.lastDomainSheetRow > 0),
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    sampleDomain,
    nextCategoryCode: plan.categoryCode,
    mutationPerformed: false,
  };
  console.log(JSON.stringify(result));
  if (!result.ok) throw new Error(`새 대분류 자동발급 테스트 실패: ${JSON.stringify(result)}`);
  return result;
}

function addTopic_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const { sheet } = getStudySheet_();
    const table = readTable_(sheet);
    const requestedNewCategory = payload.newCategory && typeof payload.newCategory === 'object' ? payload.newCategory : null;
    const creatingNewCategory = Boolean(requestedNewCategory && clean_(requestedNewCategory.categoryName));
    let categoryCode = clean_(payload.categoryCode);
    if (!categoryCode && !creatingNewCategory) throw new Error('대분류를 선택해 주세요.');

    const categoryIndex = table.headerIndex['대분류코드'];
    const topicIdIndex = table.headerIndex['통합ID'];
    const topicOrderIndex = table.headerIndex['코드'];
    if (categoryIndex === undefined || topicIdIndex === undefined || topicOrderIndex === undefined) {
      throw new Error('필수 컬럼(통합ID/대분류코드/코드)을 찾을 수 없습니다.');
    }

    let referenceRow = null;
    let insertAfterRow = 0;
    let maxTopicOrder = 0;
    let maxTopicId = 0;
    let categoryCreated = false;
    let newCategoryPlan = null;

    table.rows.forEach(row => {
      const idMatch = clean_(row[topicIdIndex]).match(/^T(\d+)$/i);
      if (idMatch) maxTopicId = Math.max(maxTopicId, Number(idMatch[1]));
    });

    if (creatingNewCategory) {
      newCategoryPlan = buildNewCategoryPlan_(table, requestedNewCategory.domain, requestedNewCategory.categoryName);
      categoryCode = newCategoryPlan.categoryCode;
      referenceRow = newCategoryPlan.referenceRow;
      insertAfterRow = newCategoryPlan.lastDomainSheetRow || sheet.getLastRow();
      maxTopicOrder = 0;
      categoryCreated = true;
    } else {
      table.rows.forEach((row, i) => {
        if (clean_(row[categoryIndex]) === categoryCode) {
          referenceRow = referenceRow || row;
          insertAfterRow = i + 2;
          maxTopicOrder = Math.max(maxTopicOrder, Number(row[topicOrderIndex]) || 0);
        }
      });
      if (!referenceRow) throw new Error(`대분류코드를 찾을 수 없습니다: ${categoryCode}`);
    }

    const newTopicId = `T${String(maxTopicId + 1).padStart(4, '0')}`;
    const newTopicOrder = maxTopicOrder + 1;
    const row = new Array(table.headers.length).fill('');

    setByHeader_(row, table.headerIndex, '통합ID', newTopicId);
    if (categoryCreated) {
      ['구분', '도메인', '도메인명'].forEach(header => {
        setByHeader_(row, table.headerIndex, header, referenceRow[table.headerIndex[header]] || '');
      });
      setByHeader_(row, table.headerIndex, '대분류', newCategoryPlan.categoryName);
      setByHeader_(row, table.headerIndex, '대분류코드', newCategoryPlan.categoryCode);
    } else {
      ['구분', '도메인', '도메인명', '대분류', '대분류코드'].forEach(header => {
        setByHeader_(row, table.headerIndex, header, referenceRow[table.headerIndex[header]] || '');
      });
    }
    setByHeader_(row, table.headerIndex, '코드', newTopicOrder);
    setByHeader_(row, table.headerIndex, '중요도', '중');
    setByHeader_(row, table.headerIndex, '학습대상', 'Y');
    setByHeader_(row, table.headerIndex, '원본/연결행수', '0');

    applyEditableFields_(row, table.headerIndex, payload.fields || {});
    validateManagedRow_(row, table.headerIndex);
    const pdfSpecs = prepareTopicReferencePdfSpecs_(
      newTopicId,
      getByHeader_(row, table.headerIndex, '통합토픽'),
      getByHeader_(row, table.headerIndex, '서브노트페이지'),
      getByHeader_(row, table.headerIndex, '교재페이지')
    );

    insertAfterRow = insertAfterRow || sheet.getLastRow();
    sheet.insertRowAfter(insertAfterRow);
    const newSheetRow = insertAfterRow + 1;
    try {
      sheet.getRange(insertAfterRow, 1, 1, table.headers.length)
        .copyTo(sheet.getRange(newSheetRow, 1, 1, table.headers.length), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    } catch (formatError) {
      console.warn(`신규행 서식 복사 생략: ${formatError}`);
    }
    sheet.getRange(newSheetRow, 1, 1, table.headers.length).setValues([row]);
    SpreadsheetApp.flush();

    let pdfSync;
    try {
      pdfSync = syncTopicReferencePdfLinks_(newTopicId, pdfSpecs);
    } catch (pdfError) {
      try { sheet.deleteRow(newSheetRow); SpreadsheetApp.flush(); } catch (rollbackError) { console.error(`신규 토픽 롤백 실패: ${rollbackError}`); }
      throw pdfError;
    }

    const displayRow = sheet.getRange(newSheetRow, 1, 1, table.headers.length).getDisplayValues()[0];
    return {
      action: 'addTopic',
      topicId: newTopicId,
      headers: table.headers,
      row: displayRow,
      referencePdfLinkCount: pdfSync.linkCount,
      categoryCreated,
      categoryCode: getByHeader_(displayRow, table.headerIndex, '대분류코드'),
      categoryName: getByHeader_(displayRow, table.headerIndex, '대분류'),
    };
  } finally {
    lock.releaseLock();
  }
}

function deactivateTopic_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const { sheet } = getStudySheet_();
    const table = readTable_(sheet);
    const topicId = clean_(payload.topicId);
    if (!topicId) throw new Error('학습대상 N 처리할 통합ID가 없습니다.');

    const rowInfo = findTopicRow_(table, topicId);
    if (!rowInfo) throw new Error(`통합ID를 찾을 수 없습니다: ${topicId}`);
    const targetIndex = table.headerIndex['학습대상'];
    if (targetIndex === undefined) throw new Error("'학습대상' 컬럼을 찾을 수 없습니다.");
    sheet.getRange(rowInfo.sheetRow, targetIndex + 1).setValue('N');

    const reasonIndex = table.headerIndex['학습제외사유'];
    const requestedReason = clean_(payload.reason);
    if (reasonIndex !== undefined && !clean_(rowInfo.row[reasonIndex])) {
      sheet.getRange(rowInfo.sheetRow, reasonIndex + 1).setValue(requestedReason || '사용자 제외');
    }

    SpreadsheetApp.flush();
    const displayRow = sheet.getRange(rowInfo.sheetRow, 1, 1, table.headers.length).getDisplayValues()[0];
    return { action: 'deactivateTopic', topicId, headers: table.headers, row: displayRow };
  } finally {
    lock.releaseLock();
  }
}


function ensureAnnotationSyncSheet_() {
  return ensureSheetWithHeaders_(STUDY_NOTE_CONFIG.ANNOTATION_SYNC_SHEET_NAME, ANNOTATION_SYNC_HEADERS);
}

function validateAnnotationSyncKey_(value) {
  const key = clean_(value);
  // reference-pdf 키에는 '교재'/'서브노트' 등 한글 출처유형이 포함된다.
  if (!key || key.length > 300 || !/^[A-Za-z0-9가-힣:_\-.]+$/.test(key)) throw new Error('주석 문서키 형식이 올바르지 않습니다.');
  return key;
}

function annotationSyncDocumentForStorage_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('주석 문서 형식이 올바르지 않습니다.');
  const key = validateAnnotationSyncKey_(input.key);
  const schemaVersion = Math.max(1, Math.min(100, Number(input.schemaVersion) || 1));
  const coordinateSpace = clean_(input.coordinateSpace) || 'normalized-0-1';
  if (coordinateSpace !== 'normalized-0-1') throw new Error(`${key}: 지원하지 않는 주석 좌표계입니다.`);
  if (!Array.isArray(input.objects)) throw new Error(`${key}: 주석 objects 배열이 없습니다.`);
  const updatedAt = clean_(input.updatedAt) || new Date().toISOString();
  const parsedTime = Date.parse(updatedAt);
  if (!Number.isFinite(parsedTime)) throw new Error(`${key}: updatedAt 형식이 올바르지 않습니다.`);
  const documentData = {
    key,
    kind: clean_(input.kind) || key.split(':')[0] || 'media',
    schemaVersion,
    coordinateSpace,
    objects: input.objects,
    locked: Boolean(input.locked),
    bookmark: Boolean(input.bookmark),
    important: Boolean(input.important),
    updatedAt: new Date(parsedTime).toISOString(),
  };
  const json = JSON.stringify(documentData);
  if (json.length > STUDY_NOTE_CONFIG.ANNOTATION_SYNC_MAX_DOCUMENT_CHARS) {
    throw new Error(`${key}: 주석 데이터가 너무 큽니다. 페이지당 ${STUDY_NOTE_CONFIG.ANNOTATION_SYNC_MAX_DOCUMENT_CHARS.toLocaleString()}자 이하로 정리해 주세요.`);
  }
  return { documentData, json };
}

function getAnnotationSyncSheet_(createIfMissing) {
  const { ss } = getStudySheet_();
  let sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.ANNOTATION_SYNC_SHEET_NAME);
  if (!sheet && createIfMissing) sheet = ensureAnnotationSyncSheet_();
  return sheet || null;
}

function readAnnotationSyncRows_(createIfMissing) {
  const sheet = getAnnotationSyncSheet_(Boolean(createIfMissing));
  if (!sheet) return { sheet: null, rows: [] };
  const lastRow = sheet.getLastRow();
  const rows = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, ANNOTATION_SYNC_HEADERS.length).getDisplayValues()
    : [];
  return { sheet, rows };
}

function buildAnnotationSyncStoreFromRows_(rows) {
  const byKey = new Map();
  const warnings = [];
  (rows || []).forEach((row, offset) => {
    const key = clean_(row[0]);
    const revision = Number(row[1]) || 0;
    const updatedAt = clean_(row[2]);
    const deviceId = clean_(row[3]);
    const chunkNumber = Number(row[4]) || 0;
    const chunkCount = Number(row[5]) || 0;
    const chunk = String(row[6] == null ? '' : row[6]);
    const hash = clean_(row[7]).toLowerCase();
    if (!key || revision < 1 || chunkNumber < 1 || chunkCount < 1 || chunkNumber > chunkCount) {
      if (key) warnings.push(`${key}: ${offset + 2}행 메타데이터 불완전`);
      return;
    }
    let entry = byKey.get(key);
    if (!entry || revision > entry.revision) {
      entry = { key, revision, updatedAt, deviceId, chunkCount, hash, chunks: new Array(chunkCount) };
      byKey.set(key, entry);
    }
    if (revision !== entry.revision) return;
    if (chunkCount !== entry.chunkCount || hash !== entry.hash) {
      warnings.push(`${key}: 청크 메타데이터 불일치`);
      return;
    }
    entry.chunks[chunkNumber - 1] = chunk;
  });

  const documents = [];
  for (const entry of byKey.values()) {
    const presentChunkCount = Array.from({ length: entry.chunkCount }, (_, index) => entry.chunks[index]).filter(chunk => typeof chunk === 'string').length;
    if (presentChunkCount !== entry.chunkCount) {
      warnings.push(`${entry.key}: 청크 누락`);
      continue;
    }
    const json = entry.chunks.join('');
    if (sha256Hex_(json) !== entry.hash) {
      warnings.push(`${entry.key}: SHA256 불일치`);
      continue;
    }
    try {
      const documentData = JSON.parse(json);
      if (!documentData || typeof documentData !== 'object' || clean_(documentData.key) !== entry.key) throw new Error('document key mismatch');
      documents.push({
        ...documentData,
        cloudRevision: entry.revision,
        cloudUpdatedAt: entry.updatedAt,
        cloudDeviceId: entry.deviceId,
      });
    } catch (error) {
      warnings.push(`${entry.key}: JSON 파싱 실패`);
    }
  }
  return { documents, warnings };
}

function buildAnnotationSyncPayload_(data) {
  const request = data && typeof data === 'object' ? data : {};
  const cursor = Math.max(0, Number(request.cursor) || 0);
  const limit = Math.max(1, Math.min(STUDY_NOTE_CONFIG.ANNOTATION_SYNC_PAGE_SIZE, Number(request.limit) || STUDY_NOTE_CONFIG.ANNOTATION_SYNC_PAGE_SIZE));
  const updatedAfterMs = request.updatedAfter ? Date.parse(clean_(request.updatedAfter)) : NaN;
  const requestedKeys = Array.isArray(request.keys)
    ? [...new Set(request.keys.map(clean_).filter(Boolean))].slice(0, STUDY_NOTE_CONFIG.ANNOTATION_SYNC_MAX_BATCH)
    : [];
  const requestedKeySet = new Set(requestedKeys);
  const { rows } = readAnnotationSyncRows_(false);
  const store = buildAnnotationSyncStoreFromRows_(rows);
  let documents = requestedKeys.length
    ? store.documents.filter(documentData => requestedKeySet.has(documentData.key))
    : store.documents;
  if (!requestedKeys.length && Number.isFinite(updatedAfterMs)) {
    documents = documents.filter(documentData => {
      const value = Date.parse(clean_(documentData.cloudUpdatedAt || documentData.updatedAt));
      return Number.isFinite(value) && value > updatedAfterMs;
    });
  }
  documents.sort((a, b) => clean_(a.key).localeCompare(clean_(b.key), 'en', { numeric: true }));

  const page = [];
  let responseChars = 0;
  for (let i = cursor; i < documents.length && page.length < limit; i++) {
    const item = documents[i];
    const itemChars = JSON.stringify(item).length;
    if (page.length && responseChars + itemChars > STUDY_NOTE_CONFIG.ANNOTATION_SYNC_MAX_RESPONSE_CHARS) break;
    page.push(item);
    responseChars += itemChars;
  }
  const nextCursor = cursor + page.length < documents.length ? cursor + page.length : null;
  return {
    ok: true,
    schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION,
    annotationSyncReady: true,
    generatedAt: new Date().toISOString(),
    documentCount: documents.length,
    documents: page,
    nextCursor,
    warnings: store.warnings.slice(0, 20),
  };
}

function chunkAnnotationSyncJson_(json) {
  const size = STUDY_NOTE_CONFIG.ANNOTATION_SYNC_CHUNK_SIZE;
  const chunks = [];
  for (let index = 0; index < json.length; index += size) chunks.push(json.slice(index, index + size));
  return chunks.length ? chunks : [''];
}

function saveAnnotationDocuments_(payload, authContext) {
  const incoming = Array.isArray(payload.documents) ? payload.documents : [];
  if (!incoming.length) return { action: 'saveAnnotations', saved: [], conflicts: [] };
  if (incoming.length > STUDY_NOTE_CONFIG.ANNOTATION_SYNC_MAX_BATCH) {
    throw new Error(`한 번에 저장할 주석 문서는 ${STUDY_NOTE_CONFIG.ANNOTATION_SYNC_MAX_BATCH}건 이하로 보내 주세요.`);
  }
  const deviceId = validateDeviceId_(authContext && authContext.deviceId);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { sheet, rows } = readAnnotationSyncRows_(true);
    if (!sheet) throw new Error('주석동기화 시트를 준비할 수 없습니다.');
    const store = buildAnnotationSyncStoreFromRows_(rows);
    const currentByKey = new Map(store.documents.map(documentData => [documentData.key, documentData]));
    const saved = [];
    const conflicts = [];
    const replacements = new Map();
    const seenKeys = new Set();

    for (const input of incoming) {
      const { documentData, json } = annotationSyncDocumentForStorage_(input);
      const key = documentData.key;
      if (seenKeys.has(key)) throw new Error(`${key}: 같은 요청에 문서키가 중복되었습니다.`);
      seenKeys.add(key);
      const current = currentByKey.get(key);
      const currentRevision = Number(current && current.cloudRevision) || 0;
      const baseRevision = Math.max(0, Number(input.cloudRevision) || 0);
      const force = Boolean(input.force);
      if (currentRevision !== baseRevision && !force) {
        conflicts.push({
          key,
          baseRevision,
          serverRevision: currentRevision,
          serverUpdatedAt: clean_(current && current.cloudUpdatedAt),
          serverDeviceId: clean_(current && current.cloudDeviceId),
        });
        continue;
      }

      const nextRevision = currentRevision + 1;
      const serverUpdatedAt = new Date().toISOString();
      const hash = sha256Hex_(json);
      const chunks = chunkAnnotationSyncJson_(json);
      const newRows = chunks.map((chunk, index) => [
        key,
        String(nextRevision),
        serverUpdatedAt,
        deviceId,
        String(index + 1),
        String(chunks.length),
        chunk,
        hash,
      ]);
      replacements.set(key, newRows);
      saved.push({ key, cloudRevision: nextRevision, cloudUpdatedAt: serverUpdatedAt, cloudDeviceId: deviceId });
    }

    if (replacements.size) {
      const remaining = rows.filter(row => !replacements.has(clean_(row[0])));
      const replacementRows = [...replacements.values()].flat();
      const nextRows = remaining.concat(replacementRows).sort((a, b) => {
        const keyCompare = clean_(a[0]).localeCompare(clean_(b[0]), 'en', { numeric: true });
        if (keyCompare) return keyCompare;
        return (Number(a[4]) || 0) - (Number(b[4]) || 0);
      });
      const previousRowCount = Math.max(0, sheet.getLastRow() - 1);
      if (previousRowCount) sheet.getRange(2, 1, previousRowCount, ANNOTATION_SYNC_HEADERS.length).clearContent();
      if (nextRows.length) sheet.getRange(2, 1, nextRows.length, ANNOTATION_SYNC_HEADERS.length).setValues(nextRows);
    }

    return {
      action: 'saveAnnotations',
      saved,
      conflicts,
      warningCount: store.warnings.length,
      savedCount: saved.length,
      conflictCount: conflicts.length,
    };
  } finally {
    lock.releaseLock();
  }
}

function ensureLearningSheet_() {
  const { ss } = getStudySheet_();
  let sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.LEARNING_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STUDY_NOTE_CONFIG.LEARNING_SHEET_NAME);
    sheet.getRange(1, 1, 1, LEARNING_HEADERS.length).setValues([LEARNING_HEADERS]);
    sheet.getRange('E:E').setNumberFormat('@');
    sheet.getRange('H:H').setNumberFormat('@');
    sheet.getRange('J:J').setNumberFormat('@');
    sheet.setFrozenRows(1);
    return sheet;
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, LEARNING_HEADERS.length).setValues([LEARNING_HEADERS]);
    sheet.getRange('E:E').setNumberFormat('@');
    sheet.getRange('H:H').setNumberFormat('@');
    sheet.getRange('J:J').setNumberFormat('@');
    sheet.setFrozenRows(1);
    return sheet;
  }
  // v3 학습정보 시트(9컬럼)는 기존 데이터/행을 보존한 채 J열에 최종미암기일시만 추가한다.
  const oldHeaders = sheet.getRange(1, 1, 1, LEARNING_HEADERS_V3.length).getDisplayValues()[0].map(clean_);
  const currentTenthHeader = clean_(sheet.getRange(1, LEARNING_HEADERS.length).getDisplayValue());
  if (oldHeaders.join('|') === LEARNING_HEADERS_V3.join('|') && !currentTenthHeader) {
    sheet.getRange(1, LEARNING_HEADERS.length).setValue('최종미암기일시');
  }

  const headers = sheet.getRange(1, 1, 1, LEARNING_HEADERS.length).getDisplayValues()[0].map(clean_);
  if (headers.join('|') !== LEARNING_HEADERS.join('|')) {
    throw new Error(`'${STUDY_NOTE_CONFIG.LEARNING_SHEET_NAME}' 시트의 컬럼 구조가 예상과 다릅니다.`);
  }
  sheet.getRange('E:E').setNumberFormat('@');
  sheet.getRange('H:H').setNumberFormat('@');
  sheet.getRange('J:J').setNumberFormat('@');
  return sheet;
}


function ensureAttachmentSheet_() {
  const { ss } = getStudySheet_();
  let sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.ATTACHMENT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STUDY_NOTE_CONFIG.ATTACHMENT_SHEET_NAME);
    sheet.getRange(1, 1, 1, ATTACHMENT_HEADERS.length).setValues([ATTACHMENT_HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, ATTACHMENT_HEADERS.length).setValues([ATTACHMENT_HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const headers = sheet.getRange(1, 1, 1, ATTACHMENT_HEADERS.length).getDisplayValues()[0].map(clean_);
  if (headers.join('|') !== ATTACHMENT_HEADERS.join('|')) {
    throw new Error(`'${STUDY_NOTE_CONFIG.ATTACHMENT_SHEET_NAME}' 시트의 컬럼 구조가 예상과 다릅니다.`);
  }
  return sheet;
}

function readAttachmentTable_() {
  const sheet = ensureAttachmentSheet_();
  const lastRow = sheet.getLastRow();
  const headers = ATTACHMENT_HEADERS.slice();
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const rows = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues()
    : [];
  return { sheet, headers, headerIndex, rows };
}

function attachmentRowToObject_(row, headerIndex) {
  return {
    attachmentId: clean_(row[headerIndex['첨부ID']]),
    topicId: clean_(row[headerIndex['통합ID']]),
    type: clean_(row[headerIndex['유형']]),
    sequence: Number(row[headerIndex['순번']]) || 0,
    driveFileId: clean_(row[headerIndex['Drive파일ID']]),
    fileName: clean_(row[headerIndex['파일명']]),
    originalFileName: clean_(row[headerIndex['원본파일명']]),
    mime: clean_(row[headerIndex['MIME']]),
    size: Number(row[headerIndex['파일크기']]) || 0,
    createdAt: clean_(row[headerIndex['등록일시']]),
    active: clean_(row[headerIndex['사용여부']]).toUpperCase() === 'Y' ? 'Y' : 'N',
    deletedAt: clean_(row[headerIndex['삭제일시']]),
  };
}

function buildAttachmentsPayload_(topicId) {
  const table = readAttachmentTable_();
  const requestedTopicId = clean_(topicId);
  const attachments = table.rows
    .map(row => attachmentRowToObject_(row, table.headerIndex))
    .filter(item => item.attachmentId && item.active === 'Y' && (!requestedTopicId || item.topicId === requestedTopicId))
    .sort((a, b) => a.topicId.localeCompare(b.topicId, 'en', { numeric: true }) || a.type.localeCompare(b.type) || a.sequence - b.sequence);
  return { ok: true, schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION, attachments, generatedAt: new Date().toISOString() };
}

function buildMediaContentPayload_(attachmentId) {
  const id = clean_(attachmentId);
  if (!id) throw new Error('첨부ID가 없습니다.');
  const table = readAttachmentTable_();
  const idIndex = table.headerIndex['첨부ID'];
  const activeIndex = table.headerIndex['사용여부'];
  const row = table.rows.find(item => clean_(item[idIndex]) === id && clean_(item[activeIndex]).toUpperCase() === 'Y');
  if (!row) throw new Error(`사용 가능한 첨부자료를 찾을 수 없습니다: ${id}`);
  const item = attachmentRowToObject_(row, table.headerIndex);
  const file = DriveApp.getFileById(item.driveFileId);
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  if (bytes.length > STUDY_NOTE_CONFIG.MAX_MEDIA_BYTES) throw new Error('첨부파일이 허용 크기를 초과합니다.');
  return {
    ok: true,
    attachmentId: item.attachmentId,
    topicId: item.topicId,
    type: item.type,
    fileName: item.fileName,
    mime: item.mime || blob.getContentType(),
    base64: Utilities.base64Encode(bytes),
  };
}

function uploadAttachment_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const topicId = clean_(payload.topicId);
    const type = clean_(payload.type).toUpperCase();
    const originalFileName = clean_(payload.fileName);
    const dataUrl = String(payload.dataUrl || '');
    if (!topicId) throw new Error('첨부할 통합ID가 없습니다.');
    if (!['I', 'P'].includes(type)) throw new Error('첨부 유형은 I 또는 P만 사용할 수 있습니다.');
    const { sheet: topicSheet } = getStudySheet_();
    const topicTable = readTable_(topicSheet);
    if (!findTopicRow_(topicTable, topicId)) throw new Error(`첨부할 통합ID를 찾을 수 없습니다: ${topicId}`);

    const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) throw new Error('첨부파일 데이터 형식이 올바르지 않습니다.');
    const mime = clean_(match[1]).toLowerCase();
    validateMediaType_(type, mime, originalFileName);
    const bytes = Utilities.base64Decode(match[2]);
    if (!bytes.length) throw new Error('첨부파일이 비어 있습니다.');
    if (bytes.length > STUDY_NOTE_CONFIG.MAX_MEDIA_BYTES) throw new Error('첨부파일은 파일당 25MB 이하만 등록할 수 있습니다.');

    const table = readAttachmentTable_();
    const topicIndex = table.headerIndex['통합ID'];
    const typeIndex = table.headerIndex['유형'];
    const seqIndex = table.headerIndex['순번'];
    const idIndex = table.headerIndex['첨부ID'];
    let maxSeq = 0;
    let maxAttachmentId = 0;
    table.rows.forEach(row => {
      if (clean_(row[topicIndex]) === topicId && clean_(row[typeIndex]).toUpperCase() === type) {
        maxSeq = Math.max(maxSeq, Number(row[seqIndex]) || 0);
      }
      const idMatch = clean_(row[idIndex]).match(/^A(\d+)$/i);
      if (idMatch) maxAttachmentId = Math.max(maxAttachmentId, Number(idMatch[1]));
    });

    const sequence = maxSeq + 1;
    const attachmentId = `A${String(maxAttachmentId + 1).padStart(6, '0')}`;
    const extension = mediaExtension_(mime, originalFileName);
    const storedFileName = `${topicId}_${type}_${sequence}.${extension}`;
    const blob = Utilities.newBlob(bytes, mime, storedFileName);
    const file = ensureMediaFolder_().createFile(blob);
    const createdAt = new Date().toISOString();
    const row = [attachmentId, topicId, type, sequence, file.getId(), storedFileName, originalFileName, mime, bytes.length, createdAt, 'Y', ''];
    table.sheet.appendRow(row);
    SpreadsheetApp.flush();
    return { action: 'uploadAttachment', attachment: attachmentRowToObject_(row, table.headerIndex) };
  } finally {
    lock.releaseLock();
  }
}

function deleteAttachment_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const attachmentId = clean_(payload.attachmentId);
    if (!attachmentId) throw new Error('삭제할 첨부ID가 없습니다.');
    const table = readAttachmentTable_();
    const idIndex = table.headerIndex['첨부ID'];
    const activeIndex = table.headerIndex['사용여부'];
    const deletedAtIndex = table.headerIndex['삭제일시'];
    const fileIdIndex = table.headerIndex['Drive파일ID'];
    let rowIndex = -1;
    for (let i = 0; i < table.rows.length; i++) {
      if (clean_(table.rows[i][idIndex]) === attachmentId) { rowIndex = i; break; }
    }
    if (rowIndex < 0) throw new Error(`첨부ID를 찾을 수 없습니다: ${attachmentId}`);
    const row = table.rows[rowIndex].slice();
    if (clean_(row[activeIndex]).toUpperCase() !== 'Y') return { action: 'deleteAttachment', attachmentId, alreadyDeleted: true };
    const fileId = clean_(row[fileIdIndex]);
    if (fileId) {
      try { DriveApp.getFileById(fileId).setTrashed(true); } catch (error) { console.warn(`Drive 파일 휴지통 이동 실패: ${error}`); }
    }
    const deletedAt = new Date().toISOString();
    table.sheet.getRange(rowIndex + 2, activeIndex + 1).setValue('N');
    table.sheet.getRange(rowIndex + 2, deletedAtIndex + 1).setValue(deletedAt);
    SpreadsheetApp.flush();
    return { action: 'deleteAttachment', attachmentId, topicId: clean_(row[table.headerIndex['통합ID']]), deletedAt };
  } finally {
    lock.releaseLock();
  }
}

function validateMediaType_(type, mime, originalFileName) {
  if (type === 'P') {
    if (mime !== 'application/pdf') throw new Error('PDF 첨부에는 PDF 파일만 등록할 수 있습니다.');
    return;
  }
  const allowed = ['image/jpeg','image/png','image/webp','image/gif'];
  if (!allowed.includes(mime)) {
    throw new Error(`지원하지 않는 이미지 형식입니다: ${originalFileName || mime} (JPG/PNG/WEBP/GIF 지원)`);
  }
}

function mediaExtension_(mime, originalFileName) {
  const fromMime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
  if (fromMime[mime]) return fromMime[mime];
  const match = clean_(originalFileName).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : 'bin';
}

function ensureMediaFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = clean_(props.getProperty(STUDY_NOTE_CONFIG.MEDIA_FOLDER_ID_PROPERTY));
  if (savedId) {
    try {
      const folder = DriveApp.getFolderById(savedId);
      if (folder.getName() === STUDY_NOTE_CONFIG.MEDIA_FOLDER_NAME) return folder;
    } catch (error) {
      console.warn(`기존 첨부 폴더 ID 확인 실패: ${error}`);
    }
  }

  const { ss } = getStudySheet_();
  const spreadsheetFile = DriveApp.getFileById(ss.getId());
  const parents = spreadsheetFile.getParents();
  let expectedParent = null;
  let firstParent = null;
  while (parents.hasNext()) {
    const parent = parents.next();
    if (!firstParent) firstParent = parent;
    if (parent.getName() === STUDY_NOTE_CONFIG.EXPECTED_PARENT_FOLDER_NAME) expectedParent = parent;
  }
  const parentFolder = expectedParent || firstParent;
  if (parentFolder) {
    const children = parentFolder.getFoldersByName(STUDY_NOTE_CONFIG.MEDIA_FOLDER_NAME);
    if (children.hasNext()) {
      const folder = children.next();
      props.setProperty(STUDY_NOTE_CONFIG.MEDIA_FOLDER_ID_PROPERTY, folder.getId());
      return folder;
    }
  }

  const rootMatches = DriveApp.getRootFolder().getFoldersByName(STUDY_NOTE_CONFIG.MEDIA_FOLDER_NAME);
  if (rootMatches.hasNext()) {
    const folder = rootMatches.next();
    props.setProperty(STUDY_NOTE_CONFIG.MEDIA_FOLDER_ID_PROPERTY, folder.getId());
    return folder;
  }

  if (!parentFolder) throw new Error('topic_files 폴더를 만들 상위 폴더를 찾을 수 없습니다.');
  const folder = parentFolder.createFolder(STUDY_NOTE_CONFIG.MEDIA_FOLDER_NAME);
  props.setProperty(STUDY_NOTE_CONFIG.MEDIA_FOLDER_ID_PROPERTY, folder.getId());
  return folder;
}

function buildLearningStatesPayload_() {
  const sheet = ensureLearningSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { ok: true, schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION, headers: LEARNING_HEADERS, rows: [], generatedAt: new Date().toISOString() };
  }
  const rows = sheet.getRange(2, 1, lastRow - 1, LEARNING_HEADERS.length).getValues()
    .filter(row => clean_(row[0]))
    .map(row => row.map((value, index) => (index === 4 || index === 7 || index === 9) ? learningTimestampText_(value) : value));
  return { ok: true, schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION, headers: LEARNING_HEADERS, rows, generatedAt: new Date().toISOString() };
}

function saveLearningStates_(payload) {
  const incoming = Array.isArray(payload.states) ? payload.states : [];
  if (!incoming.length) return { action: 'saveLearningStates', savedCount: 0 };
  if (incoming.length > 200) throw new Error('한 번에 저장할 학습정보는 200건 이하로 보내 주세요.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = ensureLearningSheet_();
    const { sheet: topicSheet } = getStudySheet_();
    const topicTable = readTable_(topicSheet);
    const topicIdIndex = topicTable.headerIndex['통합ID'];
    const validTopicIds = new Set(topicTable.rows.map(row => clean_(row[topicIdIndex])).filter(Boolean));

    const lastRow = sheet.getLastRow();
    const existingRows = lastRow >= 2
      ? sheet.getRange(2, 1, lastRow - 1, LEARNING_HEADERS.length).getValues()
      : [];
    const rowIndexByTopicId = new Map();
    existingRows.forEach((row, index) => {
      const topicId = clean_(row[0]);
      if (topicId) rowIndexByTopicId.set(topicId, index);
    });

    let savedCount = 0;
    incoming.forEach(raw => {
      const state = normalizeLearningStateServer_(raw);
      if (!validTopicIds.has(state.topicId)) throw new Error(`존재하지 않는 통합ID: ${state.topicId}`);
      const row = learningStateToRow_(state);
      const existingIndex = rowIndexByTopicId.get(state.topicId);
      if (existingIndex === undefined) {
        rowIndexByTopicId.set(state.topicId, existingRows.length);
        existingRows.push(row);
        savedCount++;
        return;
      }
      const existingUpdatedAt = learningTimestampText_(existingRows[existingIndex][7]);
      if (existingUpdatedAt && state.updatedAt && Date.parse(existingUpdatedAt) > Date.parse(state.updatedAt)) return;
      existingRows[existingIndex] = row;
      savedCount++;
    });

    if (existingRows.length) {
      sheet.getRange(2, 1, existingRows.length, LEARNING_HEADERS.length).setValues(existingRows);
    }
    SpreadsheetApp.flush();
    return { action: 'saveLearningStates', savedCount };
  } finally {
    lock.releaseLock();
  }
}

function normalizeLearningStateServer_(raw) {
  const topicId = clean_(raw.topicId);
  if (!topicId) throw new Error('학습정보 통합ID가 없습니다.');
  const favorite = clean_(raw.favorite).toUpperCase() === 'Y' ? 'Y' : 'N';
  const status = clean_(raw.studyStatus) || '미학습';
  if (!['미학습','암기','미암기'].includes(status)) throw new Error(`올바르지 않은 학습상태: ${status}`);
  return {
    topicId,
    favorite,
    studyStatus: status,
    personalMemo: raw.personalMemo == null ? '' : String(raw.personalMemo),
    lastStudiedAt: clean_(raw.lastStudiedAt),
    reviewCount: Math.max(0, Number(raw.reviewCount) || 0),
    missCount: Math.max(0, Number(raw.missCount) || 0),
    updatedAt: clean_(raw.updatedAt) || new Date().toISOString(),
    revision: Math.max(0, Number(raw.revision) || 0),
    lastMissedAt: clean_(raw.lastMissedAt),
  };
}

function learningTimestampText_(value) {
  if (value instanceof Date) return value.toISOString();
  return clean_(value);
}

function learningStateToRow_(state) {
  return [state.topicId, state.favorite, state.studyStatus, state.personalMemo, state.lastStudiedAt, state.reviewCount, state.missCount, state.updatedAt, state.revision, state.lastMissedAt];
}

function applyEditableFields_(row, headerIndex, fields) {
  Object.entries(EDITABLE_FIELD_MAP).forEach(([fieldName, header]) => {
    if (!Object.prototype.hasOwnProperty.call(fields, fieldName)) return;
    setByHeader_(row, headerIndex, header, clean_(fields[fieldName]));
  });
}

function validateManagedRow_(row, headerIndex) {
  const topicName = getByHeader_(row, headerIndex, '통합토픽');
  const importance = getByHeader_(row, headerIndex, '중요도');
  const studyTarget = getByHeader_(row, headerIndex, '학습대상').toUpperCase();
  if (!topicName) throw new Error('토픽명은 비워둘 수 없습니다.');
  if (!['상', '중', '하'].includes(importance)) throw new Error('중요도는 상/중/하 중 하나여야 합니다.');
  if (!['Y', 'N'].includes(studyTarget)) throw new Error('학습대상은 Y 또는 N이어야 합니다.');
  setByHeader_(row, headerIndex, '학습대상', studyTarget);
}


function ensureSecurityDeviceSheet_() {
  const { ss } = getStudySheet_();
  let sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.SECURITY_DEVICE_SHEET_NAME);
  const created = !sheet;
  if (!sheet) sheet = ss.insertSheet(STUDY_NOTE_CONFIG.SECURITY_DEVICE_SHEET_NAME);
  ensureSecurityHeaders_(sheet, SECURITY_DEVICE_HEADERS);
  if (created) {
    sheet.setFrozenRows(1);
    sheet.getRange('G:H').setNumberFormat('@');
    sheet.getRange('K:L').setNumberFormat('@');
    sheet.getRange('N:N').setNumberFormat('@');
    const hashColumn = SECURITY_DEVICE_HEADERS.indexOf('세션키해시') + 1;
    if (hashColumn > 0) sheet.hideColumns(hashColumn);
  }
  return sheet;
}

function ensureSecurityAuditSheet_() {
  const { ss } = getStudySheet_();
  let sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.SECURITY_AUDIT_SHEET_NAME);
  const created = !sheet;
  if (!sheet) sheet = ss.insertSheet(STUDY_NOTE_CONFIG.SECURITY_AUDIT_SHEET_NAME);
  ensureSecurityHeaders_(sheet, SECURITY_AUDIT_HEADERS);
  if (created) {
    sheet.setFrozenRows(1);
    sheet.getRange('B:B').setNumberFormat('@');
  }
  return sheet;
}

function ensureSecurityHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  const existing = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getDisplayValues()[0].map(clean_);
  const missing = headers.filter(header => !existing.includes(header));
  if (missing.length) throw new Error(`${sheet.getName()} 시트 필수 컬럼 누락: ${missing.join(', ')}`);
}

function readSecurityDeviceTable_() {
  const sheet = ensureSecurityDeviceSheet_();
  return { sheet, ...readTable_(sheet) };
}

function findSecurityDeviceRow_(table, deviceId) {
  const index = table.headerIndex['기기ID'];
  if (index === undefined) throw new Error("'기기ID' 컬럼을 찾을 수 없습니다.");
  for (let i = 0; i < table.rows.length; i++) {
    if (clean_(table.rows[i][index]) === deviceId) return { row: table.rows[i], sheetRow: i + 2, rowIndex: i };
  }
  return null;
}

function securityDeviceRowObject_(row, headerIndex) {
  const get = header => clean_(row[headerIndex[header]]);
  return {
    deviceId: get('기기ID'),
    deviceName: get('기기명'),
    googleSub: get('Google사용자ID'),
    email: get('사용자이메일'),
    browserInfo: get('브라우저정보'),
    platform: get('플랫폼'),
    registeredAt: get('최초등록일시'),
    lastAccessAt: get('마지막접속일시'),
    status: get('상태').toUpperCase(),
    sessionKeyHash: get('세션키해시'),
    sessionIssuedAt: get('세션발급일시'),
    sessionExpiresAt: get('세션만료일시'),
    registrationMode: get('등록방식'),
    revokedAt: get('차단일시'),
    approvedByDeviceId: get('승인기기ID'),
  };
}

function registerDeviceFromGoogle_(data) {
  const deviceId = validateDeviceId_(data.deviceId);
  const deviceName = normalizeDeviceName_(data.deviceName);
  applyRegistrationRateLimit_(deviceId);
  const identity = authenticateGoogleCode_(data);
  const props = PropertiesService.getScriptProperties();
  const allowedEmail = clean_(props.getProperty(STUDY_NOTE_CONFIG.SECURITY_ALLOWED_EMAIL_PROPERTY)).toLowerCase();
  if (!allowedEmail) throw new Error(`Apps Script Script Properties에 ${STUDY_NOTE_CONFIG.SECURITY_ALLOWED_EMAIL_PROPERTY}을 먼저 설정해 주세요.`);
  if (identity.email !== allowedEmail) {
    appendSecurityAuditRaw_(identity, deviceId, deviceName, 'registerDevice', deviceId, 'DENIED', '허용된 관리자 이메일이 아님');
    throw new Error('이 Google 계정에는 학습노트 관리 권한이 없습니다.');
  }
  const ownerSub = clean_(props.getProperty(STUDY_NOTE_CONFIG.SECURITY_OWNER_SUB_PROPERTY));
  const now = new Date();

  if (!ownerSub) {
    validateRecoveryPinWithRateLimit_(data.adminPin, deviceId);
    // ACTIVE 기기 발급이 성공한 뒤 소유자 정보를 확정한다. 세션 발급 실패로
    // owner만 설정되고 실제 신뢰기기가 없는 반쪽 초기화 상태를 피한다.
    const result = issueDeviceSession_(identity, data, 'ACTIVE', 'BOOTSTRAP', '', now);
    props.setProperties({
      [STUDY_NOTE_CONFIG.SECURITY_OWNER_SUB_PROPERTY]: identity.sub,
      [STUDY_NOTE_CONFIG.SECURITY_OWNER_EMAIL_PROPERTY]: identity.email,
    });
    appendSecurityAuditRaw_(identity, deviceId, deviceName, 'bootstrapDevice', deviceId, 'SUCCESS', '최초 관리자 및 신뢰기기 등록');
    return result;
  }

  if (identity.sub !== ownerSub) {
    appendSecurityAuditRaw_(identity, deviceId, deviceName, 'registerDevice', deviceId, 'DENIED', '허용된 관리자 Google 계정이 아님');
    throw new Error('이 Google 계정에는 학습노트 관리 권한이 없습니다.');
  }

  const table = readSecurityDeviceTable_();
  const rowInfo = findSecurityDeviceRow_(table, deviceId);
  const existing = rowInfo ? securityDeviceRowObject_(rowInfo.row, table.headerIndex) : null;
  const recoveryRequested = Boolean(data.recoveryRequested) && clean_(data.adminPin);

  if (recoveryRequested) {
    validateRecoveryPinWithRateLimit_(data.adminPin, deviceId);
    const result = issueDeviceSession_(identity, data, 'ACTIVE', 'RECOVERY', '', now);
    appendSecurityAuditRaw_(identity, deviceId, deviceName, 'recoverDevice', deviceId, 'SUCCESS', '관리 PIN을 사용한 긴급 복구 등록');
    return result;
  }

  // deviceId는 브라우저 식별자일 뿐 비밀값이 아니므로, 기존 ACTIVE 기기ID를
  // Google 로그인만으로 재사용해 새 세션을 발급하지 않는다. 세션을 잃은 ACTIVE
  // 기기는 기존 세션을 그대로 사용하거나 Google + 복구 PIN으로 명시적 복구해야 한다.
  if (existing && existing.status === 'ACTIVE') {
    appendSecurityAuditRaw_(identity, deviceId, deviceName, 'registerDevice', deviceId, 'DENIED', '기존 ACTIVE 기기ID에 대한 무서명 세션 재발급 차단');
    throw new Error('이미 ACTIVE로 등록된 기기입니다. 기존 세션을 사용하거나 관리 PIN으로 긴급 복구를 진행해 주세요.');
  }

  const result = issueDeviceSession_(identity, data, 'PENDING', 'REQUEST', '', now);
  appendSecurityAuditRaw_(identity, deviceId, deviceName, 'requestDevice', deviceId, 'PENDING', existing && existing.status === 'REVOKED' ? '차단 이력이 있는 기기의 재승인 요청' : '새 기기 승인 요청');
  return result;
}

function authenticateGoogleCode_(data) {
  const code = clean_(data.code);
  const redirectUri = clean_(data.redirectUri);
  if (!code) throw new Error('Google 인증 코드가 없습니다.');
  if (!STUDY_NOTE_CONFIG.ALLOWED_AUTH_ORIGINS.includes(redirectUri)) throw new Error('허용되지 않은 웹앱 Origin입니다.');
  const secret = clean_(PropertiesService.getScriptProperties().getProperty(STUDY_NOTE_CONFIG.OAUTH_CLIENT_SECRET_PROPERTY));
  if (!secret) throw new Error(`Apps Script Script Properties에 ${STUDY_NOTE_CONFIG.OAUTH_CLIENT_SECRET_PROPERTY}를 먼저 설정해 주세요.`);

  const tokenResponse = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      code,
      client_id: STUDY_NOTE_CONFIG.OAUTH_CLIENT_ID,
      client_secret: secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    },
    muteHttpExceptions: true,
  });
  if (tokenResponse.getResponseCode() !== 200) {
    let reason = '';
    try { reason = clean_(JSON.parse(tokenResponse.getContentText()).error_description); } catch (ignore) {}
    throw new Error(`Google 인증 코드 검증 실패${reason ? `: ${reason}` : ''}`);
  }
  const tokens = JSON.parse(tokenResponse.getContentText());
  const idToken = clean_(tokens.id_token);
  const accessToken = clean_(tokens.access_token);
  if (!idToken || !accessToken) throw new Error('Google 인증 응답에 필요한 토큰이 없습니다.');
  const claims = decodeJwtPayload_(idToken);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (clean_(claims.aud) !== STUDY_NOTE_CONFIG.OAUTH_CLIENT_ID) throw new Error('Google ID Token audience가 일치하지 않습니다.');
  if (!['accounts.google.com','https://accounts.google.com'].includes(clean_(claims.iss))) throw new Error('Google ID Token issuer가 올바르지 않습니다.');
  if (Number(claims.exp || 0) <= nowSeconds) throw new Error('Google ID Token이 만료되었습니다.');
  if (!(claims.email_verified === true || clean_(claims.email_verified).toLowerCase() === 'true')) throw new Error('Google 이메일 인증을 확인할 수 없습니다.');

  const userResponse = UrlFetchApp.fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    muteHttpExceptions: true,
  });
  if (userResponse.getResponseCode() !== 200) throw new Error('Google 사용자 정보를 확인할 수 없습니다.');
  const user = JSON.parse(userResponse.getContentText());
  if (!clean_(user.sub) || clean_(user.sub) !== clean_(claims.sub)) throw new Error('Google 사용자 식별자 검증에 실패했습니다.');
  if (clean_(user.email).toLowerCase() !== clean_(claims.email).toLowerCase()) throw new Error('Google 사용자 이메일 검증에 실패했습니다.');
  return { sub: clean_(user.sub), email: clean_(user.email).toLowerCase(), name: clean_(user.name) };
}

function decodeJwtPayload_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Google ID Token 형식이 올바르지 않습니다.');
  try {
    return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString('UTF-8'));
  } catch (error) {
    throw new Error('Google ID Token 내용을 읽을 수 없습니다.');
  }
}

function issueDeviceSession_(identity, data, status, mode, approvedByDeviceId, now) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const table = readSecurityDeviceTable_();
    const deviceId = validateDeviceId_(data.deviceId);
    const rowInfo = findSecurityDeviceRow_(table, deviceId);
    const existing = rowInfo ? securityDeviceRowObject_(rowInfo.row, table.headerIndex) : null;
    const sessionToken = generateSecretToken_();
    const sessionKey = sha256Hex_(sessionToken);
    const sessionHash = sha256Hex_(sessionKey);
    const props = PropertiesService.getScriptProperties();
    const sessionKeyProperty = securityDeviceKeyPropertyName_(deviceId);
    const previousSessionKey = props.getProperty(sessionKeyProperty);
    props.setProperty(sessionKeyProperty, sessionKey);
    const issuedAt = now.toISOString();
    const days = status === 'ACTIVE' ? STUDY_NOTE_CONFIG.SECURITY_SESSION_DAYS : STUDY_NOTE_CONFIG.SECURITY_PENDING_DAYS;
    const expiresAt = new Date(now.getTime() + days * 86400000).toISOString();
    const row = new Array(SECURITY_DEVICE_HEADERS.length).fill('');
    const idx = Object.fromEntries(SECURITY_DEVICE_HEADERS.map((h, i) => [h, i]));
    row[idx['기기ID']] = deviceId;
    row[idx['기기명']] = sheetSafeText_(normalizeDeviceName_(data.deviceName));
    row[idx['Google사용자ID']] = identity.sub;
    row[idx['사용자이메일']] = identity.email;
    row[idx['브라우저정보']] = sheetSafeText_(clean_(data.browserInfo).slice(0, 500));
    row[idx['플랫폼']] = sheetSafeText_(clean_(data.platform).slice(0, 200));
    row[idx['최초등록일시']] = existing?.registeredAt || issuedAt;
    row[idx['마지막접속일시']] = issuedAt;
    row[idx['상태']] = status;
    row[idx['세션키해시']] = sessionHash;
    row[idx['세션발급일시']] = issuedAt;
    row[idx['세션만료일시']] = expiresAt;
    row[idx['등록방식']] = mode;
    row[idx['차단일시']] = '';
    row[idx['승인기기ID']] = approvedByDeviceId || existing?.approvedByDeviceId || '';

    try {
      if (rowInfo) table.sheet.getRange(rowInfo.sheetRow, 1, 1, row.length).setValues([row]);
      else table.sheet.appendRow(row);
      SpreadsheetApp.flush();
    } catch (error) {
      if (previousSessionKey) props.setProperty(sessionKeyProperty, previousSessionKey);
      else props.deleteProperty(sessionKeyProperty);
      throw error;
    }
    return {
      action: 'registerDevice',
      status,
      deviceId,
      deviceName: normalizeDeviceName_(data.deviceName),
      sessionToken,
      sessionExpiresAt: expiresAt,
      approvalRequired: status !== 'ACTIVE',
      ownerConfigured: true,
    };
  } finally {
    lock.releaseLock();
  }
}

function approveSecurityDevice_(payload, auth) {
  const targetDeviceId = validateDeviceId_(payload.targetDeviceId);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const table = readSecurityDeviceTable_();
    const rowInfo = findSecurityDeviceRow_(table, targetDeviceId);
    if (!rowInfo) throw new Error('승인할 기기를 찾을 수 없습니다.');
    const device = securityDeviceRowObject_(rowInfo.row, table.headerIndex);
    if (device.googleSub !== auth.googleSub) throw new Error('다른 사용자 기기는 승인할 수 없습니다.');
    if (device.status !== 'PENDING') throw new Error(`승인 대기 기기가 아닙니다. 현재 상태: ${device.status || '-'}`);
    if (!device.sessionKeyHash) throw new Error('승인 대기 세션이 없습니다. 해당 기기에서 다시 등록 요청해 주세요.');
    const pendingExpires = Date.parse(device.sessionExpiresAt || '');
    if (!Number.isFinite(pendingExpires) || pendingExpires <= Date.now()) {
      PropertiesService.getScriptProperties().deleteProperty(securityDeviceKeyPropertyName_(targetDeviceId));
      setSecurityDeviceFields_(table.sheet, rowInfo.sheetRow, table.headerIndex, { '상태': 'REVOKED', '세션키해시': '', '차단일시': new Date().toISOString() });
      SpreadsheetApp.flush();
      throw new Error('이 기기의 승인 요청이 만료되었습니다. 해당 기기에서 Google 인증을 다시 진행해 주세요.');
    }
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + STUDY_NOTE_CONFIG.SECURITY_SESSION_DAYS * 86400000).toISOString();
    setSecurityDeviceFields_(table.sheet, rowInfo.sheetRow, table.headerIndex, {
      '상태': 'ACTIVE',
      '세션발급일시': now,
      '세션만료일시': expiresAt,
      '마지막접속일시': now,
      '등록방식': 'APPROVED',
      '차단일시': '',
      '승인기기ID': auth.deviceId,
    });
    SpreadsheetApp.flush();
    return { action: 'approveDevice', targetDeviceId, status: 'ACTIVE', sessionExpiresAt: expiresAt };
  } finally { lock.releaseLock(); }
}

function revokeSecurityDevice_(payload, auth) {
  const targetDeviceId = validateDeviceId_(payload.targetDeviceId);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const table = readSecurityDeviceTable_();
    const rowInfo = findSecurityDeviceRow_(table, targetDeviceId);
    if (!rowInfo) throw new Error('차단할 기기를 찾을 수 없습니다.');
    const device = securityDeviceRowObject_(rowInfo.row, table.headerIndex);
    if (device.googleSub !== auth.googleSub) throw new Error('다른 사용자 기기는 차단할 수 없습니다.');
    const now = new Date().toISOString();
    PropertiesService.getScriptProperties().deleteProperty(securityDeviceKeyPropertyName_(targetDeviceId));
    setSecurityDeviceFields_(table.sheet, rowInfo.sheetRow, table.headerIndex, {
      '상태': 'REVOKED',
      '세션키해시': '',
      '세션만료일시': now,
      '차단일시': now,
    });
    SpreadsheetApp.flush();
    return { action: 'revokeDevice', targetDeviceId, status: 'REVOKED', selfRevoked: targetDeviceId === auth.deviceId };
  } finally { lock.releaseLock(); }
}

function renameSecurityDevice_(payload, auth) {
  const targetDeviceId = validateDeviceId_(payload.targetDeviceId || auth.deviceId);
  const deviceName = normalizeDeviceName_(payload.deviceName);
  const table = readSecurityDeviceTable_();
  const rowInfo = findSecurityDeviceRow_(table, targetDeviceId);
  if (!rowInfo) throw new Error('이름을 변경할 기기를 찾을 수 없습니다.');
  const device = securityDeviceRowObject_(rowInfo.row, table.headerIndex);
  if (device.googleSub !== auth.googleSub) throw new Error('다른 사용자 기기의 이름은 변경할 수 없습니다.');
  setSecurityDeviceFields_(table.sheet, rowInfo.sheetRow, table.headerIndex, { '기기명': sheetSafeText_(deviceName) });
  SpreadsheetApp.flush();
  return { action: 'renameDevice', targetDeviceId, deviceName };
}

function setSecurityDeviceFields_(sheet, sheetRow, headerIndex, values) {
  Object.entries(values).forEach(([header, value]) => {
    const index = headerIndex[header];
    if (index !== undefined) sheet.getRange(sheetRow, index + 1).setValue(value);
  });
}

function buildSecurityStatusPayload_(auth) {
  const props = PropertiesService.getScriptProperties();
  const table = readSecurityDeviceTable_();
  const rowInfo = findSecurityDeviceRow_(table, auth.deviceId);
  const device = rowInfo ? securityDeviceRowObject_(rowInfo.row, table.headerIndex) : null;
  return {
    ok: true,
    ownerConfigured: Boolean(props.getProperty(STUDY_NOTE_CONFIG.SECURITY_OWNER_SUB_PROPERTY)),
    oauthReady: Boolean(props.getProperty(STUDY_NOTE_CONFIG.OAUTH_CLIENT_SECRET_PROPERTY) && props.getProperty(STUDY_NOTE_CONFIG.SECURITY_ALLOWED_EMAIL_PROPERTY)),
    authenticated: Boolean(device && device.status === 'ACTIVE'),
    status: device?.status || 'UNKNOWN',
    device: device ? publicSecurityDevice_(device, auth.deviceId) : null,
    generatedAt: new Date().toISOString(),
  };
}

function buildSecurityDevicesPayload_(auth) {
  const table = readSecurityDeviceTable_();
  const devices = table.rows
    .map(row => securityDeviceRowObject_(row, table.headerIndex))
    .filter(item => item.googleSub === auth.googleSub && item.deviceId)
    .map(item => publicSecurityDevice_(item, auth.deviceId))
    .sort((a, b) => String(b.lastAccessAt).localeCompare(String(a.lastAccessAt)));
  return { ok: true, devices, generatedAt: new Date().toISOString() };
}

function publicSecurityDevice_(device, currentDeviceId) {
  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    browserInfo: device.browserInfo,
    platform: device.platform,
    registeredAt: device.registeredAt,
    lastAccessAt: device.lastAccessAt,
    status: device.status,
    sessionExpiresAt: device.sessionExpiresAt,
    registrationMode: device.registrationMode,
    revokedAt: device.revokedAt,
    approvedByDeviceId: device.approvedByDeviceId,
    current: device.deviceId === currentDeviceId,
  };
}

function validateSignedGet_(params, allowedStatuses) {
  const action = clean_(params.action).toLowerCase();
  const deviceId = validateDeviceId_(params.deviceId);
  const timestamp = clean_(params.timestamp);
  const nonce = clean_(params.nonce);
  const authPayload = clean_(params.authPayload);
  const signature = clean_(params.signature).toLowerCase();
  const canonical = `GET\n${action}\n${deviceId}\n${timestamp}\n${nonce}\n${authPayload}`;
  const auth = validateDeviceSignature_(deviceId, timestamp, nonce, signature, canonical, allowedStatuses);
  return { ...auth, data: decodeBase64UrlJson_(authPayload) };
}

function validateSignedMutation_(envelope, allowedStatuses) {
  const action = clean_(envelope.action).toLowerCase();
  const requestId = clean_(envelope.requestId);
  const pollKey = clean_(envelope.pollKey);
  const signedPayload = clean_(envelope.signedPayload);
  const authEnvelope = envelope.auth && typeof envelope.auth === 'object' ? envelope.auth : {};
  const deviceId = validateDeviceId_(authEnvelope.deviceId);
  const timestamp = clean_(authEnvelope.timestamp);
  const nonce = clean_(authEnvelope.nonce);
  const signature = clean_(authEnvelope.signature).toLowerCase();
  const canonical = `POST\n${action}\n${deviceId}\n${requestId}\n${pollKey}\n${timestamp}\n${nonce}\n${signedPayload}`;
  const auth = validateDeviceSignature_(deviceId, timestamp, nonce, signature, canonical, allowedStatuses);
  return { auth, data: decodeSignedPayloadJson_(signedPayload) };
}

function validateDeviceSignature_(deviceId, timestamp, nonce, signature, canonical, allowedStatuses) {
  const ts = Number(timestamp);
  const now = Date.now();
  if (!Number.isFinite(ts) || Math.abs(now - ts) > STUDY_NOTE_CONFIG.SECURITY_AUTH_SKEW_SECONDS * 1000) throw new Error('보안 요청 시간이 유효 범위를 벗어났습니다. 기기 시간을 확인해 주세요.');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) throw new Error('보안 nonce 형식이 올바르지 않습니다.');
  if (!/^[a-f0-9]{64}$/.test(signature)) throw new Error('보안 서명 형식이 올바르지 않습니다.');

  const table = readSecurityDeviceTable_();
  const rowInfo = findSecurityDeviceRow_(table, deviceId);
  if (!rowInfo) throw new Error('등록되지 않은 기기입니다.');
  const device = securityDeviceRowObject_(rowInfo.row, table.headerIndex);
  if (!allowedStatuses.includes(device.status)) throw new Error(device.status === 'PENDING' ? '이 기기는 아직 승인 대기 중입니다.' : '이 기기의 관리 권한이 차단되었습니다.');
  const expires = Date.parse(device.sessionExpiresAt || '');
  if (!Number.isFinite(expires) || expires <= now) throw new Error('이 기기의 보안 세션이 만료되었습니다. Google 인증을 다시 진행해 주세요.');
  if (!device.sessionKeyHash) throw new Error('기기 세션 키가 없습니다. 다시 등록해 주세요.');
  const sessionKey = clean_(PropertiesService.getScriptProperties().getProperty(securityDeviceKeyPropertyName_(deviceId)));
  if (!sessionKey || !constantTimeEquals_(sha256Hex_(sessionKey), device.sessionKeyHash)) throw new Error('기기 세션 키 저장소 검증에 실패했습니다. Google 인증을 다시 진행해 주세요.');

  const expected = hmacSha256Hex_(canonical, sessionKey);
  if (!constantTimeEquals_(expected, signature)) throw new Error('보안 요청 서명 검증에 실패했습니다.');
  const replayKey = `security-nonce:${sha256Hex_(`${deviceId}|${nonce}`)}`;
  const cache = CacheService.getScriptCache();
  if (cache.get(replayKey)) throw new Error('이미 사용된 보안 요청입니다. 다시 시도해 주세요.');
  cache.put(replayKey, '1', STUDY_NOTE_CONFIG.SECURITY_NONCE_TTL_SECONDS);
  touchSecurityDevice_(table.sheet, rowInfo.sheetRow, table.headerIndex, deviceId);
  return { deviceId, deviceName: device.deviceName, googleSub: device.googleSub, email: device.email, status: device.status };
}

function touchSecurityDevice_(sheet, sheetRow, headerIndex, deviceId) {
  const cache = CacheService.getScriptCache();
  const key = `security-touch:${deviceId}`;
  if (cache.get(key)) return;
  const index = headerIndex['마지막접속일시'];
  if (index !== undefined) sheet.getRange(sheetRow, index + 1).setValue(new Date().toISOString());
  cache.put(key, '1', 900);
}

function validateRecoveryPinWithRateLimit_(pin, deviceId) {
  const cache = CacheService.getScriptCache();
  const globalBlockKey = 'security-pin-block:global';
  const blockKey = `security-pin-block:${deviceId}`;
  if (cache.get(globalBlockKey) || cache.get(blockKey)) throw new Error('관리 PIN 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  const expected = clean_(PropertiesService.getScriptProperties().getProperty('STUDY_NOTE_ADMIN_PIN'));
  if (!expected) throw new Error('복구용 관리 PIN이 설정되지 않았습니다. setupStage5Security()를 확인해 주세요.');
  if (clean_(pin) === expected) {
    cache.remove(`security-pin-fail:${deviceId}`);
    return true;
  }
  const failKey = `security-pin-fail:${deviceId}`;
  const globalFailKey = 'security-pin-fail:global';
  const count = Number(cache.get(failKey) || 0) + 1;
  const globalCount = Number(cache.get(globalFailKey) || 0) + 1;
  cache.put(failKey, String(count), STUDY_NOTE_CONFIG.SECURITY_PIN_BLOCK_SECONDS);
  cache.put(globalFailKey, String(globalCount), STUDY_NOTE_CONFIG.SECURITY_PIN_BLOCK_SECONDS);
  if (count >= STUDY_NOTE_CONFIG.SECURITY_PIN_MAX_ATTEMPTS) cache.put(blockKey, '1', STUDY_NOTE_CONFIG.SECURITY_PIN_BLOCK_SECONDS);
  if (globalCount >= 20) cache.put(globalBlockKey, '1', STUDY_NOTE_CONFIG.SECURITY_PIN_BLOCK_SECONDS);
  appendSecurityAuditRaw_({}, deviceId, '', 'recoveryPin', deviceId, 'DENIED', `관리 PIN 실패 기기 ${count}회 / 전체 ${globalCount}회`);
  throw new Error('관리 PIN이 올바르지 않습니다.');
}

function applyRegistrationRateLimit_(deviceId) {
  const cache = CacheService.getScriptCache();
  const key = `security-register:${deviceId}`;
  const count = Number(cache.get(key) || 0) + 1;
  if (count > 10) throw new Error('기기 등록 요청이 너무 많습니다. 10분 후 다시 시도해 주세요.');
  cache.put(key, String(count), 600);
}

function validateDeviceId_(value) {
  const id = clean_(value);
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(id)) throw new Error('기기ID 형식이 올바르지 않습니다.');
  return id;
}

function normalizeDeviceName_(value) {
  const name = clean_(value).slice(0, 80);
  return name || '내 기기';
}

function securityDeviceKeyPropertyName_(deviceId) {
  return `${STUDY_NOTE_CONFIG.SECURITY_DEVICE_KEY_PREFIX}${sha256Hex_(deviceId)}`;
}

function generateSecretToken_() {
  return `${Utilities.getUuid().replace(/-/g, '')}${Utilities.getUuid().replace(/-/g, '')}`;
}

function sha256Hex_(value) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8));
}

function hmacSha256Hex_(value, key) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(String(value), String(key), Utilities.Charset.UTF_8));
}

function bytesToHex_(bytes) {
  return bytes.map(byte => ((byte & 255).toString(16).padStart(2, '0'))).join('');
}

function constantTimeEquals_(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function decodeSignedPayloadJson_(text) {
  try {
    const value = JSON.parse(String(text || '{}'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch (error) {
    throw new Error('보안 쓰기 요청 데이터 형식이 올바르지 않습니다.');
  }
}

function decodeBase64UrlJson_(encoded) {
  try {
    const text = Utilities.newBlob(Utilities.base64DecodeWebSafe(String(encoded || ''))).getDataAsString('UTF-8');
    const value = JSON.parse(text || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch (error) {
    throw new Error('보안 요청 데이터 형식이 올바르지 않습니다.');
  }
}

function sheetSafeText_(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function appendSecurityAudit_(auth, action, target, result, detail) {
  appendSecurityAuditRaw_({ sub: auth.googleSub, email: auth.email }, auth.deviceId, auth.deviceName, action, target, result, detail);
}

function appendSecurityAuditRaw_(identity, deviceId, deviceName, action, target, result, detail) {
  try {
    const sheet = ensureSecurityAuditSheet_();
    const logId = `L${new Date().getTime()}-${Utilities.getUuid().slice(0, 8)}`;
    const row = [
      logId,
      new Date().toISOString(),
      clean_(identity && identity.sub),
      clean_(identity && identity.email),
      clean_(deviceId),
      sheetSafeText_(clean_(deviceName)),
      clean_(action),
      sheetSafeText_(clean_(target)),
      clean_(result),
      sheetSafeText_(String(detail == null ? '' : detail).slice(0, 2000)),
    ];
    sheet.appendRow(row);
  } catch (error) {
    console.error(`보안감사로그 기록 실패: ${error}`);
  }
}

function auditTargetForAction_(action, payload, result) {
  if (['updatetopic','deactivatetopic'].includes(action)) return clean_(payload.topicId);
  if (action === 'addtopic') return clean_(result && result.topicId);
  if (action === 'uploadattachment') return clean_(payload.topicId);
  if (action === 'uploadreferencepdfpage') return `${clean_(payload.sourceType)} ${clean_(payload.pageKey).toUpperCase()}:${Number(payload.pageNumber) || ''}`.trim();
  if (action === 'replacereferencepdfpage') return `${clean_(payload.sourceType)} ${clean_(payload.pageKey).toUpperCase()}:${Number(payload.pageNumber) || ''}`.trim();
  if (action === 'deleteattachment') return clean_(payload.attachmentId);
  if (['approvedevice','revokedevice','renamedevice'].includes(action)) return clean_(payload.targetDeviceId);
  return '';
}

function auditDetailForAction_(action, result) {
  if (!result) return '';
  if (action === 'uploadattachment') return clean_(result.attachment && result.attachment.fileName);
  if (action === 'uploadreferencepdfpage') return `${clean_(result.originalFileName)} -> ${clean_(result.storedFileName)}`.slice(0, 500);
  if (action === 'addtopic' || action === 'updatetopic') return `원본PDF ${Number(result.referencePdfLinkCount || 0)}페이지`;
  if (action === 'replacereferencepdfpage') return `${result.pageToken || ''} · 연결 ${Number(result.updatedLinkCount || 0)}건 · 기존파일정리 ${result.oldFileCleanup === false ? '확인필요' : '완료'}`;
  return clean_(result.status || result.action || '');
}

function validateAdminPin_(pin) {
  // v4.4.0부터 일반 쓰기 인증에는 사용하지 않고 최초 기기 등록/긴급 복구에만 유지한다.
  const expected = PropertiesService.getScriptProperties().getProperty('STUDY_NOTE_ADMIN_PIN');
  if (!expected) throw new Error('관리 PIN이 설정되지 않았습니다. setupStage5Security()를 실행해 주세요.');
  if (clean_(pin) !== expected) throw new Error('관리 PIN이 올바르지 않습니다.');
}

function parsePostPayload_(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!raw) throw new Error('요청 본문이 없습니다.');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('요청 JSON 형식이 올바르지 않습니다.');
  }
}

function readTable_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) throw new Error('암기장 시트가 비어 있습니다.');
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const headers = values[0].map(value => clean_(value));
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  return { headers, headerIndex, rows: values.slice(1) };
}

function findTopicRow_(table, topicId) {
  const index = table.headerIndex['통합ID'];
  if (index === undefined) throw new Error("'통합ID' 컬럼을 찾을 수 없습니다.");
  for (let i = 0; i < table.rows.length; i++) {
    if (clean_(table.rows[i][index]) === topicId) {
      return { row: table.rows[i], sheetRow: i + 2 };
    }
  }
  return null;
}

function getStudySheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('STUDY_NOTE_SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('setupStage3()를 먼저 1회 실행해 주세요.');

  const ss = SpreadsheetApp.openById(spreadsheetId);
  if (ss.getName() !== STUDY_NOTE_CONFIG.EXPECTED_SPREADSHEET_NAME) {
    throw new Error(`등록된 Spreadsheet가 '${STUDY_NOTE_CONFIG.EXPECTED_SPREADSHEET_NAME}'이 아닙니다.`);
  }
  const sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.TOPIC_SHEET_NAME);
  if (!sheet) throw new Error(`'${STUDY_NOTE_CONFIG.TOPIC_SHEET_NAME}' 시트를 찾을 수 없습니다.`);
  return { ss, sheet };
}

function mutationStatusCacheKey_(requestId, pollKey) {
  return `mutation:${sha256Hex_(`${clean_(requestId)}|${clean_(pollKey)}`)}`;
}

function getMutationStatusRaw_(requestId, pollKey) {
  const raw = CacheService.getScriptCache().get(mutationStatusCacheKey_(requestId, pollKey));
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (error) { return null; }
}

function claimMutationRequest_(requestId, pollKey) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const existing = getMutationStatusRaw_(requestId, pollKey);
    if (existing) return existing;
    setMutationStatus_(requestId, pollKey, { ok: true, done: false, state: 'processing' });
    return null;
  } finally {
    lock.releaseLock();
  }
}

function setMutationStatus_(requestId, pollKey, value) {
  CacheService.getScriptCache().put(mutationStatusCacheKey_(requestId, pollKey), JSON.stringify(value), STUDY_NOTE_CONFIG.MUTATION_STATUS_TTL_SECONDS);
}

function getMutationStatus_(requestId, pollKey) {
  const id = clean_(requestId);
  const key = clean_(pollKey);
  if (!id) return { ok: false, done: true, message: 'requestId가 없습니다.' };
  if (!key || key.length < 32) return { ok: false, done: true, message: 'pollKey가 올바르지 않습니다.' };
  const status = getMutationStatusRaw_(id, key);
  if (!status) return { ok: true, done: false, state: 'pending' };
  return status;
}

function testStage5MutationIdempotency() {
  const requestId = `TEST-${Utilities.getUuid()}`;
  const pollKey = sha256Hex_(`${Utilities.getUuid()}|${new Date().getTime()}`);
  const cache = CacheService.getScriptCache();
  const cacheKey = mutationStatusCacheKey_(requestId, pollKey);
  cache.remove(cacheKey);
  const first = claimMutationRequest_(requestId, pollKey);
  const second = claimMutationRequest_(requestId, pollKey);
  cache.remove(cacheKey);
  const ok = first === null && second && second.state === 'processing' && second.done === false;
  const result = { ok: Boolean(ok), schemaVersion: STUDY_NOTE_CONFIG.SCHEMA_VERSION, firstClaim: first === null ? 'NEW' : 'DUPLICATE', secondClaim: second ? second.state : 'NONE' };
  console.log(JSON.stringify(result));
  if (!ok) throw new Error(`중복 요청 멱등성 테스트 실패: ${JSON.stringify(result)}`);
  return result;
}

function sheetDataRowCount_(sheet) {
  return sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
}

function setByHeader_(row, headerIndex, header, value) {
  const index = headerIndex[header];
  if (index !== undefined) row[index] = value;
}

function getByHeader_(row, headerIndex, header) {
  const index = headerIndex[header];
  return index === undefined ? '' : clean_(row[index]);
}

function clean_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
