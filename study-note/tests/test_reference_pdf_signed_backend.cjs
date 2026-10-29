'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const backendText = fs.readFileSync(path.resolve(__dirname, '../backend/referencePdfContent.addon.gs'), 'utf8');
new vm.Script(backendText, { filename: 'referencePdfContent.addon.gs' });
const html = fs.readFileSync(path.resolve(__dirname, '../study-note.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(v => v[1]).filter(Boolean);
const code = scripts.join('\n');
for (const s of scripts) new vm.Script(s);
function extractFunction(name) {
  const match = new RegExp('^(?:async )?function ' + name + '\\(', 'm').exec(code);
  assert(match, 'Missing frontend function: ' + name);
  const end = code.indexOf('\n}\n', match.index);
  assert(end > match.index, 'Missing frontend function end: ' + name);
  return code.slice(match.index, end + 2);
}
function frontend(names, context) {
  const sandbox = vm.createContext(context);
  vm.runInContext(names.map(extractFunction).join('\n\n'), sandbox);
  return sandbox;
}

async function testBackendWhitelisting() {
  const pdf = [37, 80, 68, 70, 45, 49, 46, 55];
  const headers = ['출처유형','페이지토큰','페이지Drive파일ID','활성여부'];
  const valid = ['교재', 'MG:187', 'registeredFile123', 'Y'];
  let rows = [headers, valid];
  let selectedId = '';
  let mime = 'application/pdf';
  let size = pdf.length;
  let content = pdf;
  const env = {
    DriveApp: { getFileById(fileId) {
      selectedId = fileId;
      return { getMimeType: () => mime, getSize: () => size,
        getBlob: () => ({ getBytes: () => content }) };
    } },
    Utilities: { base64Encode: bytes => Buffer.from(bytes).toString('base64') },
  };
  vm.createContext(env);
  vm.runInContext(backendText, env);
  const sheet = { getDataRange: () => ({ getValues: () => rows }) };
  const auth = { authenticated: true, status: 'ACTIVE' };
  const data = { sourceType: '교재', pageToken: 'MG:187', driveFileId: 'browserInjectedID' };
  const result = env.readReferencePdfPageForSignedGet_(auth, sheet, data);
  assert.equal(result.ok, true);
  assert.equal(result.sourceType, data.sourceType);
  assert.equal(result.pageToken, data.pageToken);
  assert.equal(result.mime, 'application/pdf');
  assert.equal(result.size, pdf.length);
  assert.equal(selectedId, 'registeredFile123', 'Must only fetch the registered Drive id');
  assert(!('driveFileId' in result), 'No file id is needed in server response');
  assert.equal(result.base64, Buffer.from(pdf).toString('base64'));
  assert.throws(() => env.readReferencePdfPageForSignedGet_(null, sheet, data), /ACTIVE/);
  assert.throws(() => env.readReferencePdfPageForSignedGet_({authenticated:false,status:'ACTIVE'}, sheet, data), /ACTIVE/);
  assert.throws(() => env.readReferencePdfPageForSignedGet_(auth, sheet, { ...data, pageToken:'MG:999' }), /존재하지 않습니다/);
  assert.throws(() => env.readReferencePdfPageForSignedGet_(auth, sheet, { ...data, sourceType:'서브노트' }), /존재하지 않습니다/);
  assert.throws(() => env.readReferencePdfPageForSignedGet_(auth, sheet, { ...data, pageToken:'../../secret' }), /형식/);
  rows = [headers, valid, valid];
  assert.throws(() => env.readReferencePdfPageForSignedGet_(auth, sheet, data), /중복/);
  rows = [headers, ['교재','MG:187','registeredFile123','N']];
  assert.throws(() => env.readReferencePdfPageForSignedGet_(auth, sheet, data), /존재하지 않습니다/);
  rows = [headers, valid];
  mime = 'image/png';
  assert.throws(() => env.readReferencePdfPageForSignedGet_(auth, sheet, data), /PDF 형식/);
  mime = 'application/pdf';
  size = 9 * 1024 * 1024;
  assert.throws(() => env.readReferencePdfPageForSignedGet_(auth, sheet, data), /크기/);
  size = pdf.length;
  content = [0, 1, 2, 3, 4, 5, 6, 7];
  assert.throws(() => env.readReferencePdfPageForSignedGet_(auth, sheet, data), /PDF 헤더/);

  // Production MASTER 'PDF페이지파일_20260928' has the exact header order below,
  // with NO '활성여부' column. Never add that column as a prerequisite.
  // The row IDs are deliberately synthetic, to keep private Drive IDs out of Git.
  content = pdf;
  const liveHeaders = [
    '출처유형', '페이지키', '페이지번호', '페이지토큰',
    '통합원본Drive파일ID', '페이지Drive파일ID', '페이지파일명',
    'Drive파일URL', 'Drive폴더ID', '로컬분할검증', 'Drive업로드검증', '등록일'
  ];
  const liveMG = ['교재', 'MG', '187', 'MG:187', 'rootPDFSynthetic',
    'registeredFile123', 'MG_0187.pdf', 'https://example.invalid/1',
    'folderSynthetic', 'OK', 'OK', '2026-09-28'];
  const liveSW = ['서브노트', 'SW', '10', 'SW:10', 'rootSWPDFSynthetic',
    'registeredSWFile234', 'SW_0010.pdf', 'https://example.invalid/2',
    'folderSynthetic2', 'OK', 'OK', '2026-09-28'];
  rows = [liveHeaders, liveMG, liveSW];
  const liveMGPdf = env.readReferencePdfPageForSignedGet_(auth, sheet, data);
  assert.equal(liveMGPdf.pageToken, 'MG:187');
  assert.equal(selectedId, 'registeredFile123');
  const liveSWPdf = env.readReferencePdfPageForSignedGet_(auth, sheet,
    { sourceType: '서브노트', pageToken: 'SW:10', driveFileId: 'untrustedBrowserID' });
  assert.equal(liveSWPdf.pageToken, 'SW:10');
  assert.equal(selectedId, 'registeredSWFile234',
    'Exact current MASTER headers must resolve the page PDF ID, never the original full-document ID');
  rows = [liveHeaders.filter(h => h !== '페이지Drive파일ID'),
    liveMG.filter((_, i) => i !== 5)];
  assert.throws(() => env.readReferencePdfPageForSignedGet_(auth, sheet, data), /필수 컬럼/);
}

async function testFrontendCapabilityAndRead() {
  const api = 'https://script.google.com/macros/s/SYNTHETIC/exec';
  const context = {
    referencePdfBackendSourceReady: false,
    referencePdfBackendSourceCheckedAt: 0,
    referencePdfBackendSourceUrl: '',
    referencePdfBackendSourceCheckPromise: null,
    navigator: { onLine: true },
    hasActiveSecuritySession: () => true,
    getApiUrl: () => api,
    fetchHealth: async () => ({ok:true, referencePdfContentReady:false}),
    Date, console,
  };
  const sandbox = frontend(['refreshReferencePdfBackendSourceCapability'], context);
  assert.equal(await sandbox.refreshReferencePdfBackendSourceCapability(), false);
  assert.equal(context.referencePdfBackendSourceReady, false);
  context.fetchHealth = async () => ({ok:true, referencePdfContentReady:true});
  assert.equal(await sandbox.refreshReferencePdfBackendSourceCapability({force:true}), true);
  assert.equal(context.referencePdfBackendSourceReady, true);
  context.hasActiveSecuritySession = () => false;
  assert.equal(await sandbox.refreshReferencePdfBackendSourceCapability({force:true}), false);

  const binary = Uint8Array.from([37,80,68,70,45,49,46,52]);
  const data = {sourceType:'교재',pageToken:'MG:187',driveFileId:'ignoredClientId'};
  let signed = null, url = null;
  const client = {
    referencePdfBackendSourceReady: true,
    MAX_REFERENCE_PAGE_BYTES: 8*1024*1024,
    hasActiveSecuritySession: () => true,
    activeReferencePdfSourceType: '교재',
    clean: v => String(v??'').trim(),
    getApiUrl: () => api,
    buildSignedGetUrl: async (apiUrl, action, payload) => {
      signed = {apiUrl, action, payload};
      return api + '?signed=true';
    },
    base64ToUint8Array: value => Uint8Array.from(Buffer.from(value, 'base64')),
    fetch: async target => {
      url = target;
      return { ok:true, json: async () => ({
        ok:true, mime:'application/pdf', sourceType:'교재',
        pageToken:'MG:187', size:binary.length,
        base64:Buffer.from(binary).toString('base64'),
      })};
    },
  };
  const hc = frontend(['fetchReferencePdfBytesFromServer'], client);
  const received = await hc.fetchReferencePdfBytesFromServer(data);
  assert.equal(signed.action,'referencePdfContent');
  assert.equal(signed.apiUrl,api);
  assert.deepEqual(Object.keys(signed.payload).sort(),['pageToken','sourceType']);
  assert.equal(signed.payload.sourceType,'교재');
  assert.equal(signed.payload.pageToken,'MG:187');
  assert.equal(url,api+'?signed=true');
  assert.equal(Buffer.from(received).equals(Buffer.from(binary)),true);
  client.hasActiveSecuritySession = () => false;
  await assert.rejects(()=>hc.fetchReferencePdfBytesFromServer(data),/신뢰기기/);
  client.hasActiveSecuritySession = () => true;
  client.fetch = async () => ({ ok:true, json:async () => ({
    ok:true, mime:'application/pdf', sourceType:'교재',pageToken:'MG:188',
    base64:Buffer.from(binary).toString('base64'),
  }) });
  await assert.rejects(()=>hc.fetchReferencePdfBytesFromServer(data),/일치하지 않습니다/);
  client.fetch = async () => ({ ok:true,json:async () => ({
    ok:true,mime:'application/pdf',sourceType:'교재',pageToken:'MG:187',base64:'A'.repeat(13*1024*1024),
  }) });
  await assert.rejects(()=>hc.fetchReferencePdfBytesFromServer(data),/허용 크기/);
}

async function testPDFJsUsesServerWithoutDriveOAuth() {
  const pdf = Uint8Array.from([37,80,68,70,45,49,46,52]);
  let repainted = 0, driveUsed = 0, errors = [];
  const doc = {getPage:async n => ({number:n})};
  const ctx = {
    referencePdfBackendSourceReady:true,
    referencePdfQualityPending:false,
    referencePdfLoadSerial:4,
    activeReferencePdfVectorReady:false,
    activeReferencePdfDocument:null,
    activeReferencePdfPage:null,
    referencePdfDriveAutoBlocked:false,
    Uint8Array, String, console,
    hasReferencePdfDriveToken:()=>false,
    updateReferencePdfZoomUi:()=>{},
    fetchReferencePdfBytesFromServer:async()=>pdf,
    fetchReferencePdfBytesFromDrive:async()=>{driveUsed++;throw Error('Unexpected Drive API call');},
    ensurePdfJsLoaded:async()=>({
      getDocument:({data})=>{
        assert.equal(data.length,pdf.length);
        return {promise:Promise.resolve(doc)};
      },
    }),
    repaintReferencePdfAtZoom:async()=>{repainted++;ctx.activeReferencePdfVectorReady=true;},
    resetReferencePdfHighQualityRenderer:()=>{},
    showToast:message=>errors.push(message),
    els:{referencePdfViewerModal:{classList:{contains:()=>false}}},
    Date,
  };
  const h=frontend(['loadReferencePdfHighQuality'],ctx);
  await h.loadReferencePdfHighQuality({sourceType:'교재',pageToken:'MG:187'},4);
  assert.equal(driveUsed,0);
  assert.equal(repainted,1);
  assert.equal(ctx.activeReferencePdfDocument,doc);
  assert.equal(ctx.referencePdfQualityPending,false);
  assert.deepEqual(errors,[]);
}

(async () => {
  await testBackendWhitelisting();
  await testFrontendCapabilityAndRead();
  await testPDFJsUsesServerWithoutDriveOAuth();
  console.log('SIGNED_REFERENCE_PDF_BACKEND_PASS: active device + registered ID only, bounded PDF, health opt-in, signed fetch, native PDF.js');
})().catch(error=>{console.error(error);process.exitCode=1;});
