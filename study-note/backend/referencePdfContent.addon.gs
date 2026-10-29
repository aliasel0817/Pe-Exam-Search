/**
 * Additive Google Apps Script helper for the Study Note original PDF page.
 *
 * NOT A STANDALONE WEB APP. The deployed Code.gs must integrate this function
 * into its existing signed-GET dispatcher, AFTER checking HMAC, nonce, expiry,
 * and ACTIVE device status with its existing security validator.
 *
 * Do not expose an unsigned action, accept a browser-supplied Drive file ID,
 * or use this code to change Drive/Sheet ACLs.
 *
 * Example integration (adapt validator and sheet names to deployed Code.gs):
 *   case 'referencepdfcontent':
 *     const validated = existingSignedGetValidation_(e, ['ACTIVE']);
 *     const input = validated.authPayload; // server-verified payload, not e.parameter
 *     const session = { authenticated: true, status: validated.device.status };
 *     const sheet = spreadsheet.getSheetByName('PDF페이지파일_20260928');
 *     return existingJsonResponse_(readReferencePdfPageForSignedGet_(session, sheet, input));
 *
 * On a successfully deployed handler only, add the literal
 *   referencePdfContentReady: true
 * to the existing health response. Frontend never probes unsupported routes.
 */
function readReferencePdfPageForSignedGet_(validatedSession, pageFilesSheet, input) {
  if (!validatedSession || validatedSession.authenticated !== true ||
      validatedSession.status !== 'ACTIVE') {
    throw new Error('원본 PDF 조회는 ACTIVE 기기의 검증된 서명 요청만 허용됩니다.');
  }
  if (!pageFilesSheet || typeof pageFilesSheet.getDataRange !== 'function') {
    throw new Error('등록된 PDF 페이지 목록 시트를 찾지 못했습니다.');
  }
  const sourceType = String(input && input.sourceType || '').trim();
  const pageToken = String(input && input.pageToken || '').trim();
  if (sourceType !== '서브노트' && sourceType !== '교재') {
    throw new Error('원본 PDF 출처 유형이 올바르지 않습니다.');
  }
  if (!/^[A-Za-z0-9_.:+-]{1,60}$/.test(pageToken)) {
    throw new Error('PDF 페이지 토큰 형식이 올바르지 않습니다.');
  }
  // The source page is resolved exclusively from the trusted registered
  // sheet. An arbitrary fileId sent by the browser is NEVER used.
  const rows = pageFilesSheet.getDataRange().getValues();
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error('등록된 PDF 페이지 목록이 비어 있습니다.');
  }
  const headers = rows[0].map(value => String(value || '').trim());
  const col = name => headers.indexOf(name);
  const kindCol = col('출처유형');
  const tokenCol = col('페이지토큰');
  const fileCol = col('페이지Drive파일ID');
  const activeCol = col('활성여부');
  if (kindCol < 0 || tokenCol < 0 || fileCol < 0) {
    throw new Error('PDF 페이지 목록 필수 컬럼이 누락되었습니다.');
  }
  const matches = rows.slice(1).filter(row => {
    return String(row[kindCol] || '').trim() === sourceType &&
      String(row[tokenCol] || '').trim() === pageToken &&
      (activeCol < 0 || String(row[activeCol] || 'Y').trim().toUpperCase() !== 'N');
  });
  if (matches.length !== 1) {
    throw new Error(matches.length ? '등록된 PDF 페이지 키가 중복되었습니다.' : '등록된 PDF 페이지가 존재하지 않습니다.');
  }
  const fileId = String(matches[0][fileCol] || '').trim();
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(fileId)) {
    throw new Error('등록된 PDF의 Drive 파일 정보가 올바르지 않습니다.');
  }

  const MAX_BYTES = 8 * 1024 * 1024; // Same cap as the existing page upload.
  const file = DriveApp.getFileById(fileId);
  if (!file || file.getMimeType() !== 'application/pdf') {
    throw new Error('등록된 원본 파일이 PDF 형식이 아닙니다.');
  }
  const size = Number(file.getSize());
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    throw new Error('원본 PDF 파일 크기가 허용 범위를 벗어났습니다.');
  }
  const bytes = file.getBlob().getBytes();
  if (!bytes || bytes.length !== size || bytes.length < 5 ||
      bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 ||
      bytes[3] !== 70 || bytes[4] !== 45) {
    throw new Error('등록된 원본 파일의 PDF 헤더 또는 파일 크기가 올바르지 않습니다.');
  }
  return {
    ok: true,
    sourceType: sourceType,
    pageToken: pageToken,
    mime: 'application/pdf',
    size: bytes.length,
    base64: Utilities.base64Encode(bytes),
  };
}
