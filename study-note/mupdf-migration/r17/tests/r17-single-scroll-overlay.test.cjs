'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../..');
const html=fs.readFileSync(path.join(root,'study-note/study-note.html'),'utf8');
const modal=html.match(/<div id="manageModal"[\s\S]*?<div id="questionSearchModal"/)?.[0]||'';

test('R17 has one modal scrollport, original fields and no reserved footer strip',()=>{
  assert(modal);
  assert.match(html,/\.manage-shell > \.manage-card\s*\{[^}]*display: block;[^}]*overflow-y: auto;/);
  assert.match(html,/\.manage-shell \.manage-scroll-body\s*\{\s*display: contents;/);
  assert.match(html,/\.manage-shell > \.manage-quick-scroll\s*\{[^}]*position: absolute;/);
  assert(modal.includes('class="manage-shell"')&&modal.includes('class="modal-card manage-card"'));
  assert(modal.indexOf('id="manageScrollBody"')>modal.indexOf('class="modal-card manage-card"'));
  assert(modal.indexOf('id="manageQuickToggleBtn"')>modal.indexOf('id="saveTopicBtn"'));
  assert(!html.includes('R17_REMOVES_OLD_FORM'),'form must remain');
});
test('R17 arrows scroll the modal root; hide/show stays accessible and direction is corrected',()=>{
  const src=html.match(/\/\* R13_MANAGE_SCROLL_FUNCTION_START \*\/[\s\S]*?\/\* R13_MANAGE_SCROLL_FUNCTION_END \*\//)?.[0]||'';
  assert(src.includes("els.manageModal.querySelector('.manage-card')"));
  assert(src.includes("card.scrollTop = edge === 'bottom'"));
  assert(!src.includes('window.scrollTo'));
  assert(src.includes("toggle.textContent = visible ? '▶' : '◀'"));
  assert.match(modal,/id="manageJumpTopBtn"[^>]+type="button"[^>]*>▲<\/button>/);
  assert.match(modal,/id="manageJumpBottomBtn"[^>]+type="button"[^>]*>▼<\/button>/);
  assert.match(modal,/aria-controls="manageQuickArrows" aria-expanded="true"/);
});
test('R17 overlay avoids Save Cancel and study exclusion at form end',()=>{
  const fn=html.match(/\/\* R17_MANAGE_OVERLAY_POSITION_START \*\/[\s\S]*?\/\* R17_MANAGE_OVERLAY_POSITION_END \*\//)?.[0]||'';
  assert(fn.includes("els.manageForm?.querySelector('.manage-actions')"));
  assert(fn.includes('dock.style.removeProperty'));
  assert(fn.includes('r.bottom - a.top + 9'));
  assert(fn.includes('Math.min(maxBottom'));
  assert(html.includes("addEventListener('scroll',"));
  assert(html.includes("window.addEventListener('resize', updateManageQuickOverlayPosition)"));
  assert(html.includes("bottom: var(--manage-quick-overlay-bottom, 12px)"));
});
test('R17 preserves original management form, Pages source, reference PDF and ink schema',()=>{
  for(const id of ['manageForm','saveTopicBtn','cancelManageBtn','deactivateTopicBtn','manageTopicName',
   'manageConcept','manageBackground','manageNecessity','manageFeatures','manageTechnicalComponents',
   'manageSubnotePages','manageTextbookPages','manageImageFiles','managePdfFiles','manageStudyTarget']){
   assert(modal.includes('id="'+id+'"'),id+' missing');
  }
  assert.match(html,/async function saveManagedTopic\(event\)/);
  assert.match(html,/const ANNOTATION_SCHEMA_VERSION = 3;/);
  assert.match(html,/coordinateSpace: 'normalized-0-1'/);
  assert.match(html,/id="settingsCorrespondingSourceLink"/);
});
