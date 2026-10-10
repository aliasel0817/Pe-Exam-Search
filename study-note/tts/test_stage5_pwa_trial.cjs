'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=__dirname;
const page=fs.readFileSync(path.join(root,'stage5_pwa_trial.html'),'utf8');
const player=fs.readFileSync(path.join(root,'natural-tts.js'));
const config=JSON.parse(fs.readFileSync(path.join(root,'cloud-config.json'),'utf8'));
const locks=JSON.parse(fs.readFileSync(path.join(root,'cloud-project.json'),'utf8'));
const count=value=>(page.split(value).length-1);
test('separate preview path and pinned original controller',()=>{
  assert.ok(page.includes('stage5_pwa_trial.html')===false);
  assert.ok(page.includes('Pe-Exam-Search@8926fe736a776cf30a9a982d1f886dd09a6f4ae6/study-note/tts/natural-tts.js'));
  const hash='sha384-'+crypto.createHash('sha384').update(player).digest('base64');
  assert.ok(page.includes('integrity="'+hash+'"'));
  assert.equal(config.mode,'gcs-private');
  assert.equal(config.projectId,'study-note-tts');
});
test('one listen, one repeat and one options panel',()=>{
  for(const id of ['ttsToggleBtn','ttsRepeatBtn','ttsSettingsPanel','ttsSettingsCloseBtn',
    'ttsStatus','ttsCloudLogin','ttsOption-voice','ttsOption-mode','ttsOption-rate',
    'ttsOption-gap','ttsAvailabilityBtn','detailTitle']){
    assert.equal(count('id="'+id+'"'),1,id);
  }
  assert.equal(count('id="ttsSettingsBtn"'),0);
  assert.equal(count('id="ttsOption-repeat"'),0);
  assert.ok(page.includes('touch-action:manipulation'));
});
test('trial has five title-only demo topic records and fixed field toggles',()=>{
  for(const id of ['T0001','T1961','T2238','T2176','T2354'])
    assert.equal(count('<option value="'+id+'">'),1);
  for(const id of ['concept','background','necessity','features','components','keywords'])
    assert.equal(count('id="ttsField-'+id+'"'),1);
  assert.ok(page.includes("concept:'',background:''"));
});
test('trial is explicitly read-only and does not include the full study app',()=>{
  assert.ok(page.includes('window.PE_TTS_STAGE5_TRIAL = true'));
  assert.ok(page.includes('window.peStudyNoteTtsBridge = Object.freeze'));
  assert.ok(page.includes("if(!raw||!byId.has(raw.topicId)||raw.studyTarget==='N')continue"));
  assert.ok(page.includes('file.size>512000'));
  assert.ok(page.includes('document.getElementById(nodeId).textContent='));
  assert.ok(!page.includes('service-worker.js'));
  assert.ok(!page.includes('study-note.html'));
  assert.ok(!page.includes('indexDB'));
  assert.ok(!page.includes('google.script.run'));
});
test('trial settings cannot overwrite original PWA settings',()=>{
  const code=player.toString('utf8');
  assert.ok(code.includes('window.PE_TTS_STAGE5_TRIAL === true'));
  assert.ok(code.includes("location.pathname === '/Pe-Exam-Search/study-note/tts/stage5_pwa_trial.html'"));
  assert.ok(code.includes('peStudyNote.aiTts.stage5Trial.options.v1'));
  assert.ok(code.includes("!STAGE5_TRIAL && 'caches' in window"));
  for(const lock of ['ttsGenerationApproved','gcsUploadApproved','cloudRunRevisionUpdateUserApproved'])
    assert.equal(locks[lock],false);
});
