'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const repo=path.resolve(__dirname,'../../../..');
const html=fs.readFileSync(path.join(repo,'study-note/study-note.html'),'utf8');
const modal=html.match(/<div id="manageModal"[\s\S]*?<div id="questionSearchModal"/)?.[0]||'';

test('R17 overlay leaves Save/Cancel inside the original scroll card',()=>{
 assert(modal);
 const head=modal.indexOf('class="modal-head"');
 const toolbar=modal.indexOf('class="manage-quick-scroll"');
 const body=modal.indexOf('id="manageScrollBody"');
 const save=modal.indexOf('id="saveTopicBtn"');
 const cancel=modal.indexOf('id="cancelManageBtn"');
 assert(head>=0&&body>head&&save>body&&cancel>body&&toolbar>cancel,
   'form must precede overlay nav inside the same modal shell');
 assert.match(html,/\.manage-shell > \.manage-card\s*\{[^}]*display: block;[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/);
 assert.match(html,/\.manage-shell \.manage-scroll-body\s*\{[^}]*display: contents;/);
 assert.match(html,/\.manage-shell > \.manage-quick-scroll\s*\{[^}]*position: absolute;[^}]*bottom: var\(--manage-quick-overlay-bottom, 12px\);/);
});
test('only two icon arrows and accessible hide/show toggle live in the footer',()=>{
 assert.equal((modal.match(/id="manageJumpTopBtn"/g)||[]).length,1);
 assert.equal((modal.match(/id="manageJumpBottomBtn"/g)||[]).length,1);
 assert.equal((modal.match(/id="manageQuickToggleBtn"/g)||[]).length,1);
 assert.match(modal,/id="manageQuickToggleBtn"[^>]*type="button"[\s\S]*?aria-controls="manageQuickArrows" aria-expanded="true"/);
 assert.match(modal,/id="manageJumpTopBtn"[^>]*type="button"[^>]*>▲<\/button>/);
 assert.match(modal,/id="manageJumpBottomBtn"[^>]*type="button"[^>]*>▼<\/button>/);
 assert(!modal.includes('id="prevBtn"')&&!modal.includes('id="nextBtn"'));
 assert.match(html,/function setManageQuickArrowsVisible\(visible\)/);
 assert.match(html,/toggle\.setAttribute\('aria-expanded', String\(visible\)\)/);
 assert.match(html,/toggle\.textContent = visible \? '▶' : '◀'/);
});
test('only modal root scrolls and opening the modal restores arrows',()=>{
 const source=html.match(/\/\* R13_MANAGE_SCROLL_FUNCTION_START \*\/[\s\S]*?\/\* R13_MANAGE_SCROLL_FUNCTION_END \*\//)?.[0]||'';
 assert(source.includes("els.manageModal.querySelector('.manage-card')"));
 assert(source.includes('card.scrollTop ='));
 assert(!source.includes('window.scrollTo')&&!source.includes('manageForm.submit'));
 assert(html.includes("/* R13_MANAGE_SCROLL_INIT */ setManageQuickArrowsVisible(true); jumpManageToEdge('top');"));
 assert(html.includes("els.manageQuickToggleBtn.addEventListener('click'"));
});
test('original management save/deactivate/cancel and data protection pathways remain',()=>{
 assert.match(modal,/id="manageForm"/);
 for(const id of ['saveTopicBtn','cancelManageBtn','deactivateTopicBtn','manageTopicName','manageConcept',
  'manageSubnotePages','manageTextbookPages','manageImageFiles','managePdfFiles']){
   assert(modal.includes('id="'+id+'"'),id+' missing');
 }
 assert.match(html,/async function saveManagedTopic\(event\)/);
 assert.match(html,/async function openManage\(mode = 'edit'\)/);
 assert.match(html,/const ANNOTATION_SCHEMA_VERSION = 3;/);
 assert.match(html,/coordinateSpace: 'normalized-0-1'/);
});
