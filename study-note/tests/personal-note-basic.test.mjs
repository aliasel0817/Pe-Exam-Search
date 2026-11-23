import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../study-note.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../personal-note.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../personal-note.css', import.meta.url), 'utf8');

test('personal-note entry is in memo actions and existing save button remains', () => {
  const row = html.match(/<div class="memo-actions">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(row, /id="personalNoteBtn"/);
  assert.match(row, /id="memoStatus"/);
  assert.match(row, /id="saveMemoBtn"/);
  assert.ok(row.indexOf('personalNoteBtn') < row.indexOf('saveMemoBtn'));
  assert.match(html, /id="personalMemoInput"/);
});
test('isolated assets and entry callback are wired', () => {
  assert.match(html, /href="\.\/personal-note\.css"/);
  assert.match(html, /src="\.\/personal-note\.js"/);
  assert.match(html, /src="\.\/personal-note-cloud\.js"/);
  assert.match(html, /window\.PEPersonalNote\?\.open\(topicId, topicName\)/);
  assert.match(js, /window\.PEPersonalNote = \{open, isOpen\}/);
});
test('separate local database and two stores protect existing MASTER/ink records', () => {
  assert.match(js, /pe-personal-note-db/);
  assert.match(js, /const PAPER_STORE = 'papers'/);
  assert.match(js, /const SETTINGS_STORE = 'settings'/);
  assert.doesNotMatch(js, /sendSecureMutation|updateLearningState|replaceAllTopics|pe-study-note-db/);
  assert.match(js, /persistAll\(topicId,rows,config,cloudMeta\)/);
});
test('global background and multiple per-topic pages retain editable objects', () => {
  assert.match(js, /key:'global'/);
  assert.match(js, /background:config\.background,enabled:config\.enabled/);
  assert.match(js, /pages\.splice\(activePage\+1,0,newPage\(\)\)/);
  for (const t of ['stroke','shape','text','image']) assert.match(js, new RegExp("obj\\.type==='" + t + "'"));
  assert.match(js, /q\('#pnBackgroundEnabled'\)\.addEventListener\('change'/);
});
test('modal closes only by explicit cancel and has unsaved change guard', () => {
  assert.match(js, /q\('#pnCancel'\)\.addEventListener\('click',cancel\)/);
  assert.match(js, /if\(dirty&&!confirm\(/);
  assert.match(js, /ev\.key==='Escape'/);
  assert.doesNotMatch(js, /layer\.addEventListener\('click'.*close\(/);
  assert.match(css, /#personalNoteModal\[hidden\]/);
});
test('PWA caches editor assets for offline use', () => {
  const sw=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
  for(const asset of ['personal-note.js','personal-note.css','personal-note-cloud.js'])
    assert.match(sw,new RegExp(asset.replaceAll('.','\\.')));
  assert.match(sw,/isPersonalNoteAsset/);
});
test('cloud feature uses server capability gating and local data boundary', () => {
  const cloud=readFileSync(new URL('../personal-note-cloud.js', import.meta.url), 'utf8');
  const addon=readFileSync(new URL('../backend/personal-note-sync-isolated.addon.gs', import.meta.url), 'utf8');
  assert.match(cloud, /personalNoteSyncReady===true/);
  assert.match(cloud, /hasActiveSecuritySession\(\)/);
  assert.match(js, /서버 동기화/);
  assert.match(addon, /PERSONAL_NOTE_SYNC_MODE/);
  assert.match(addon, /ISOLATED_TEST/);
  assert.doesNotMatch(addon, /SpreadsheetApp\./);
});
