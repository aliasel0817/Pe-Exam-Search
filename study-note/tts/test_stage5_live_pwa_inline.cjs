'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(root,'study-note.html'),'utf8');
const player = fs.readFileSync(path.join(__dirname,'natural-tts.js'),'utf8');
const tags = Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi));
const external = tags.filter(m => /\bsrc\s*=/.test(m[1]));
const inline = tags.filter(m => !/\bsrc\s*=/.test(m[1]));

test('main PWA inline JavaScript and TTS bridge are syntactically valid',()=>{
  assert.equal(inline.length,2,'main app and small TTS bridge are the only inline scripts');
  for(let i=0;i<inline.length;i++)assert.doesNotThrow(()=>
    new vm.Script(inline[i][2],{filename:'pwa-inline-'+i+'.js'}));
});
test('Google authentication library and one cache-busted external TTS script',()=>{
  assert.equal(external.length,2);
  assert.ok(external.some(m=>m[1].includes('https://accounts.google.com/gsi/client')));
  assert.ok(external.some(m=>/\.\/tts\/natural-tts\.js(?:\?v=[a-f0-9]{8})?/.test(m[1])));
  assert.equal((html.match(/id="ttsToggleBtn"/g)||[]).length,1);
  assert.equal((html.match(/id="ttsRepeatBtn"/g)||[]).length,1);
  assert.equal((html.match(/id="ttsSettingsPanel"/g)||[]).length,1);
});
test('existing learning UI and PDF/annotation/search hooks remain intact',()=>{
  for(const id of ['app','detailTitle','detailConcept','detailTechnicalComponents',
    'questionSearchBtn','favoriteBtn','rememberBtn','missBtn','manageBtn',
    'detailReferencePdfStatus','topicList'])
    assert.ok(html.includes('id="'+id+'"'),id+' should remain in the PWA');
  assert.ok(html.includes('bindAnnotationLongPressButton'));
  assert.ok(html.includes('renderTopicList'));
  assert.ok(html.includes('showTopicById'));
});
test('TTS bridge has exactly one definition and playback can follow topic changes',()=>{
  assert.equal((html.match(/window\.peStudyNoteTtsBridge\s*=/g)||[]).length,1);
  assert.ok(html.includes('window.peStudyNoteTTS?.onTopicChanged(topicId)'));
  assert.ok(html.includes('window.peStudyNoteTTS?.onFilterChanged()'));
  assert.ok(player.includes('syncTopicControls'));
  assert.ok(player.includes('bindListenGesture'));
  assert.ok(player.includes('APPROVED_TITLE_VARIANTS'));
  assert.ok(player.includes("mode: 'one'"));
});
test('T0000 and study target N never become speech targets',()=>{
  assert.ok(player.includes("topic.topicId !== 'T0000'"));
  assert.ok(player.includes("topic.studyTarget === 'Y'"));
  assert.ok(player.includes("this.syncTopicControls(this.getBridge()?.getTopicById?.(id))"));
  assert.ok(!player.includes('window.speechSynthesis'));
});
