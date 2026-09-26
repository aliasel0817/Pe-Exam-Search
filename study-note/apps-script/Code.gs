/**
 * 정보관리기술사 학습노트 - 1단계 읽기 전용 API
 * 대상 Google Spreadsheet: 내 드라이브/topic/topic_study_data
 * 대상 시트: 암기장
 *
 * 설치 방법:
 * 1) Google Drive에서 topic/topic_study_data 스프레드시트를 연다.
 * 2) 확장 프로그램 > Apps Script를 연다.
 * 3) 이 파일의 내용을 Code.gs에 붙여넣는다.
 * 4) setupStage1()을 1회 실행하고 권한을 승인한다.
 * 5) 웹 앱으로 배포 후 /exec URL을 학습노트 설정에 입력한다.
 */

const STUDY_NOTE_CONFIG = Object.freeze({
  EXPECTED_PARENT_FOLDER_NAME: 'topic',
  EXPECTED_SPREADSHEET_NAME: 'topic_study_data',
  TOPIC_SHEET_NAME: '암기장',
  MEDIA_FOLDER_NAME: 'topic_files', // 4단계 이미지/PDF 저장용. 1단계에서는 파일을 읽지 않는다.
  SCHEMA_VERSION: 1,
});

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

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'health').toLowerCase();
    if (action === 'health') return jsonOutput_(buildHealth_());
    if (action === 'topics') return jsonOutput_(buildTopicsPayload_());
    return jsonOutput_({ ok: false, message: `지원하지 않는 action: ${action}` });
  } catch (error) {
    console.error(error);
    return jsonOutput_({
      ok: false,
      message: error && error.message ? error.message : String(error),
    });
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
    generatedAt: new Date().toISOString(),
  };
}

function buildTopicsPayload_() {
  const { ss, sheet } = getStudySheet_();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) throw new Error('암기장 시트에 데이터가 없습니다.');

  // 텍스트 캐시가 목적이므로 표시값을 사용해 Excel/Sheet 표현을 그대로 전달한다.
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const headers = values[0].map(value => String(value).trim());
  const topicIdIndex = headers.indexOf('통합ID');
  if (topicIdIndex < 0) throw new Error("'통합ID' 컬럼을 찾을 수 없습니다.");

  // 모바일 데이터 절약: 각 행마다 23개 컬럼명을 반복하지 않고 헤더 1회 + 행 배열로 전송한다.
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!String(row[topicIdIndex] || '').trim()) continue;
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

function getStudySheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('STUDY_NOTE_SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('setupStage1()을 먼저 1회 실행해 주세요.');

  const ss = SpreadsheetApp.openById(spreadsheetId);
  if (ss.getName() !== STUDY_NOTE_CONFIG.EXPECTED_SPREADSHEET_NAME) {
    throw new Error(`등록된 Spreadsheet가 '${STUDY_NOTE_CONFIG.EXPECTED_SPREADSHEET_NAME}'이 아닙니다.`);
  }
  const sheet = ss.getSheetByName(STUDY_NOTE_CONFIG.TOPIC_SHEET_NAME);
  if (!sheet) throw new Error(`'${STUDY_NOTE_CONFIG.TOPIC_SHEET_NAME}' 시트를 찾을 수 없습니다.`);
  return { ss, sheet };
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
