'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../..');
const html=fs.readFileSync(path.join(root,'study-note/study-note.html'),'utf8');
const modal=html.match(/<div id="manageModal"[\s\S]*?<div id="questionSearchModal"/)?.[0]||'';

test('R15 arrows and their toggle are grouped in a compact main-nav style capsule',()=>{
  assert(modal,'topic management modal must remain present');
  const css=html.match(/\.manage-quick-scroll\s*\{[^}]*\}/)?.[0]||'';
  for(const fragment of ['align-self: flex-end','width: max-content','border: 1px solid var(--line)',
    'border-radius: 15px','box-shadow: 0 5px 20px']){
    assert(css.includes(fragment),'missing floating capsule CSS: '+fragment);
  }
  assert(!css.includes('border-top: 1px solid var(--line)'),'full width footer divider reintroduced');
  assert.match(html,/\.manage-quick-scroll\.is-collapsed\s*\{[^}]*border-color: transparent;[^}]*box-shadow: none;/);
});
test('R15 places two icon arrows and a collapse toggle in main navigation order',()=>{
  const dock=modal.match(/<div class="manage-quick-scroll"[\s\S]*?<!-- R13_MANAGE_SCROLL_HTML_END -->/)?.[0]||'';
  assert(dock);
  const positions=['id="manageJumpTopBtn"','id="manageJumpBottomBtn"','id="manageQuickToggleBtn"']
    .map(s=>dock.indexOf(s));
  assert(positions.every((x,i)=>x>=0&&(i===0||x>positions[i-1])),'arrows should precede the small end toggle');
  assert.match(dock,/id="manageJumpTopBtn"[^>]*>▲<\/button>/);
  assert.match(dock,/id="manageJumpBottomBtn"[^>]*>▼<\/button>/);
  assert.match(dock,/aria-controls="manageQuickArrows" aria-expanded="true"/);
  assert.equal((dock.match(/type="button"/g)||[]).length,3);
});
test('R15 collapsed panel keeps only its small reopen control; form remains separate',()=>{
  assert(html.includes("els.manageQuickToggleBtn.closest('.manage-quick-scroll')?.classList.toggle('is-collapsed', !visible)"));
  assert(html.includes('toggle.textContent = visible ? \'▶\' : \'◀\''));
  const bodyStart=modal.indexOf('id="manageScrollBody"');
  const save=modal.indexOf('id="saveTopicBtn"');
  const cancel=modal.indexOf('id="cancelManageBtn"');
  const dock=modal.indexOf('class="manage-quick-scroll"');
  assert(dock>0&&bodyStart>dock&&save>bodyStart&&cancel>bodyStart,'Save and Cancel must stay inside their original edit form');
  assert.match(html,/\.manage-scroll-body\s*\{[^}]*order: 1;[^}]*overflow-y: auto;/);
  assert.match(html,/\.manage-quick-scroll\s*\{[^}]*order: 2;/);
});
test('R15 changes neither topic form data, PDF/ink rendering nor backend security source',()=>{
  for(const id of ['manageForm','saveTopicBtn','cancelManageBtn','deactivateTopicBtn','manageTopicName',
    'manageConcept','manageBackground','managePdfFiles','manageImageFiles','manageStudyTarget']){
    assert(modal.includes('id="'+id+'"'),'missing original management field: '+id);
  }
  assert.match(html,/async function saveManagedTopic\(event\)/);
  assert.match(html,/const ANNOTATION_SCHEMA_VERSION = 3;/);
  assert.match(html,/coordinateSpace: 'normalized-0-1'/);
  assert(!html.includes('R15_CHANGES_APPS_SCRIPT'),'R15 must not touch the backend');
});
