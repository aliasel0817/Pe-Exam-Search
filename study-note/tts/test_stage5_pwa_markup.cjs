'use strict';
/* Offline static guard for Stage-5 PWA TTS UI and existing study features. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'study-note.html'), 'utf8');
const player = fs.readFileSync(path.join(__dirname, 'natural-tts.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'cloud-config.json'), 'utf8'));
const locks = JSON.parse(fs.readFileSync(path.join(__dirname, 'cloud-project.json'), 'utf8'));

test('stage5 PWA retains single speaker/settings/status controls', () => {
  for (const id of ['ttsToggleBtn', 'ttsRepeatBtn', 'ttsSettingsPanel', 'ttsSettingsCloseBtn',
      'ttsStatus', 'ttsCloudCheckBtn', 'ttsCloudStatus',
      'ttsAvailabilityBtn', 'ttsAvailabilityStatus']) {
    const re = new RegExp('id="' + id + '"', 'g');
    assert.equal((html.match(re) || []).length, 1, 'expected exactly one ' + id);
  }
  const blobHash=crypto.createHash('sha1')
    .update('blob '+Buffer.byteLength(player,'utf8')+'\0')
    .update(player,'utf8').digest('hex').slice(0,8);
  assert.ok(html.includes('<script src="./tts/natural-tts.js?v='+blobHash+'"></script>'),
    'The linked JS cache-buster must match exactly the current player Git blob.');
  assert.match(html, /<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>/);
});

test('six selectable speech fields remain intact; topic name always first and fixed', () => {
  const fields = ['concept', 'background', 'necessity', 'features', 'components', 'keywords'];
  for (const field of fields) {
    assert.equal((html.match(new RegExp('id="ttsField-' + field + '"', 'g')) || []).length, 1);
  }
  assert.doesNotMatch(html, /id="ttsField-topic"/);
  const keys = ['topic', ...fields];
  const offsets = keys.map(key => player.indexOf("key: '" + key + "'"));
  assert.ok(offsets.every(x => x >= 0));
  assert.ok(offsets.every((pos, i) => i === 0 || pos > offsets[i-1]));
  assert.match(player, /key: 'topic', prop: 'topicName', label: '토픽명', fixed: true/);
});

test('readiness check is a distinct explicit user action; no auto cloud download', () => {
  assert.match(player, /ttsAvailabilityBtn'\)\?\.addEventListener\('click', \(\) => this\.checkCurrentTopicAvailability\(\)\)/);
  assert.match(html, /id="ttsAvailabilityStatus"[^>]*aria-live="polite"/);
  assert.match(player, /async checkCurrentTopicAvailability\(\)/);
  assert.doesNotMatch(player.slice(player.indexOf('async checkCurrentTopicAvailability()'),
    player.indexOf('hasReturningGoogleConsent()')), /fetchAudio\(|playSegment\(|getSignedUrl|synthesizeSpeech/);
});

test('PWA topic/filters still notify TTS without altering viewer, notes or search flows', () => {
  assert.match(html, /window\.peStudyNoteTTS\?\.onTopicChanged\(topicId\)/);
  assert.match(html, /window\.peStudyNoteTTS\?\.onFilterChanged\(\)/);
  assert.match(html, /window\.peStudyNoteTtsBridge\s*=\s*\{/);
  assert.match(html, /selectTopic:\s*id\s*=>\s*showTopicById\(id\)/);
  for (const id of ['imageViewerModal','mediaViewerModal','referencePdfViewerModal',
                    'manageModal','questionSearchBtn','detailReferencePdfStatus']) {
    assert.ok(html.includes(id), 'existing viewer/search marker must stay: ' + id);
  }
});

test('development PWA uses verified private GCS and all three cloud write locks stay false', () => {
  assert.equal(config.mode,'gcs-private');
  assert.equal(config.projectId,'study-note-tts');
  assert.equal(config.bucketName,'study-note-tts-audio-558407087449');
  assert.equal(config.gatewayUrl,'https://study-tts-audio-gateway-hgli3gua6q-uc.a.run.app');
  assert.equal(locks.ttsGenerationApproved,false);
  assert.equal(locks.gcsUploadApproved,false);
  assert.equal(locks.cloudRunRevisionUpdateUserApproved,false);
  assert.doesNotMatch(player, /window\.speechSynthesis|texttospeech\.googleapis\.com/);
});

test('stage5 readiness compares source hash but does not write study data', () => {
  const start=player.indexOf('async checkCurrentTopicAvailability()');
  const end=player.indexOf('hasReturningGoogleConsent()',start);
  const method=player.slice(start,end);
  assert.ok(start>=0 && end>start);
  assert.match(method, /const source = await verifyAudioSource\(topic, field, entry\)/);
  assert.match(player, /async function verifyAudioSource\(topic, field, entry\)/);
  assert.match(player, /entry\.sha256 === await sha256\(displayText\)/);
  assert.match(player, /field\.key !== 'topic'/);
  assert.match(method, /토픽명 MP3가 없어/);
  assert.doesNotMatch(method, /localStorage\.setItem|bridge\.selectTopic|\.post\(|method:\s*'POST'/);
});

test('development PWA shows stage5 incomplete-audio warning and title-only option', () => {
  assert.match(html,/본문 전체 해제 시 토픽명만 재생/);
  assert.match(html,/현재 토픽 MP3 준비 확인/);
  assert.match(html,/다른 항목은 아직 미생성/);
  assert.match(player,/async resolveTopicSegments\(topic, selected\)/);
  const start=player.indexOf('async resolveTopicSegments(topic, selected)');
  const next=player.indexOf('async start()',start);
  assert.ok(start>=0 && next>start);
  assert.doesNotMatch(player.slice(start,next),/fetchAudio\(|playSegment\(|synthesize/);
});
test('PWA signed GCS URLs are restricted to approved private bucket and exact MP3 objects',()=>{
  assert.match(player,/const PRIVATE_AUDIO_BUCKET = 'study-note-tts-audio-558407087449'/);
  assert.match(player,/const PRIVATE_AUDIO_PREFIX = 'study-note\/tts\/audio\/'/);
  assert.match(player,/function validateSignedPrivateAudioUrl\(raw, relativePath\)/);
  assert.match(player,/Number\(expiry\) > 300/);
});

test('Aoede is the only selectable voice in the approved twelve-MP3 PWA pilot',()=>{
  assert.match(html,/<option value="ko-KR-Chirp3-HD-Aoede">여성 · Aoede \(선정\)<\/option>/);
  assert.match(html,/<option value="ko-KR-Chirp3-HD-Kore" disabled>/);
  assert.match(html,/<option value="ko-KR-Chirp3-HD-Charon" disabled>/);
  const choices=player.slice(player.indexOf('const VOICES = ['),player.indexOf('const SETTINGS_KEY'));
  assert.match(choices,/ko-KR-Chirp3-HD-Aoede/);
  assert.doesNotMatch(choices,/ko-KR-Chirp3-HD-Kore|ko-KR-Chirp3-HD-Charon/);
});

test('compact listening UI has no gear button, and repeat one/two is next to listening',()=>{
  assert.doesNotMatch(html,/id="ttsSettingsBtn"/);
  assert.doesNotMatch(html,/id="ttsOption-repeat"/);
  assert.match(html,/<button id="ttsToggleBtn"[^>]*aria-haspopup="dialog"[^>]*aria-controls="ttsSettingsPanel"/);
  const titleStart=html.indexOf('class="tts-title-row"');
  const listenAt=html.indexOf('id="ttsToggleBtn"',titleStart);
  const repeatAt=html.indexOf('id="ttsRepeatBtn"',listenAt);
  const titleEnd=html.indexOf('</div>',titleStart);
  assert.ok(titleStart>=0 && titleStart<listenAt && listenAt<repeatAt && repeatAt<titleEnd);
  assert.match(html,/id="ttsRepeatBtn"[^>]*aria-pressed="false"/);
  assert.match(html,/id="ttsSettingsPanel"[^>]*role="dialog"/);
  assert.match(html,/id="ttsSettingsCloseBtn"/);
});
test('short click and 550ms hold share the original Listen button; long hold suppresses click',()=>{
  assert.match(player,/bindListenGesture\(\)/);
  assert.match(player,/timer = setTimeout\(\(\) => \{/);
  assert.match(player,/\}, 550\);/);
  assert.match(player,/suppressClick = true;/);
  assert.match(player,/event\.preventDefault\(\);\s*event\.stopImmediatePropagation\?\.\(\);/);
  assert.match(player,/if \(this\.playing\) this\.stop\('음성 재생을 중지했습니다\.'\);/);
  assert.match(player,/event\.altKey && event\.key === 'ArrowDown'/);
  assert.match(player,/event\.key === 'Escape'/);
  assert.match(html,/touch-action:manipulation/);
  assert.match(html,/\.tts-settings-panel\s*\{\s*position:fixed/);
});
test('repeat button is persisted without duplicating the option in the popup',()=>{
  assert.match(player,/this\.repeatBtn\.addEventListener\('click', \(\) => this\.toggleTopicRepeat\(\)\)/);
  assert.match(player,/this\.settings\.repeat === 1 \? 2 : 1/);
  assert.match(player,/this\.saveSettings\(\);/);
  assert.match(player,/for \(let pass = 0; pass < this\.settings\.repeat; pass\+\+\)/);
  assert.doesNotMatch(html,/label>토픽 반복<select/);
});

test('first-run actual PWA begins in single-topic title-only mode',()=>{
  assert.match(player,/mode: 'one',/);
  assert.match(player,/fields: \{ concept: false, background: false, necessity: false,/);
  assert.match(player,/features: false, components: false, keywords: false/);
  assert.match(player,/APPROVED_TITLE_VARIANTS = Object.freeze\(\{/);
  assert.match(player,/T1961: Object.freeze\(\{/);
  assert.match(player,/T2354: Object.freeze\(\{/);
  assert.match(player,/displayText !== alias\.current/);
  assert.match(player,/entry\.sha256 !== await sha256\(alias\.recorded\)/);
});

test('the PWA homepage T0000 and N rows never expose unsynthesized audio controls',()=>{
  assert.match(player,/topic\.topicId !== 'T0000'/);
  assert.match(player,/topic\.studyTarget === 'Y'/);
  assert.match(player,/syncTopicControls\(this\.getBridge\(\)\?\.currentTopic\?\.\(\)\)/);
  assert.match(player,/this\.syncTopicControls\(this\.getBridge\(\)\?\.getTopicById\?\.\(id\), wasPlaying\)/);
  assert.match(player,/control\.classList\[visible \? 'remove' : 'add'\]\('hidden'\)/);
  assert.match(player,/홈 화면 및 학습제외 토픽은 AI 음성 재생 대상이 아닙니다/);
});

test("optional audio diagnostics are collapsed and unnecessary for normal Listen",()=>{
  assert.match(html,/<details id="ttsDiagnostics" class="tts-diagnostics">/);
  assert.match(html,/<summary>연결·MP3 준비 진단 \(필요할 때만\)<\/summary>/);
  assert.match(html,/듣기를 누를 때 MP3 목록과 원문 일치를 자동 검사/);
  assert.match(html,/id="ttsCloudStatus"[^>]*role="status"/);
  assert.match(player,/const AUTO_SIGNIN_KEY = 'peStudyNote\.aiTts\.googleVoiceOneTapOptIn\.v1'/);
  assert.match(player,/async offerReturningGoogleSignIn\(\)/);
  assert.match(player,/auto_select: !STAGE5_TRIAL && this\.hasReturningGoogleConsent\(\)/);
  assert.match(player,/try \{ localStorage\.setItem\(AUTO_SIGNIN_KEY, '1'\); \}/);
  assert.match(player,/try \{ localStorage\.removeItem\(AUTO_SIGNIN_KEY\); \}/);
  assert.match(player,/this\.syncGoogleAuthUi\(\)/);
  assert.doesNotMatch(player,/sessionStorage\.setItem/);
});
