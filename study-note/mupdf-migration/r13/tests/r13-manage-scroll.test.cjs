'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'../../../..'),html=fs.readFileSync(path.join(repo,'study-note/study-note.html'),'utf8');
test('topic manage modal has exactly two accessible native quick-scroll buttons',()=>{
 const fragment=html.match(/<div id="manageModal"[\s\S]*?<div id="questionSearchModal"/)?.[0];
 assert(fragment,'topic-management dialog exists');
 assert.equal((fragment.match(/id="manageJumpTopBtn"/g)||[]).length,1);
 assert.equal((fragment.match(/id="manageJumpBottomBtn"/g)||[]).length,1);
 assert.match(fragment,/<button id="manageJumpTopBtn"[^>]+type="button"/);
 assert.match(fragment,/<button id="manageJumpBottomBtn"[^>]+type="button"/);
 assert.match(fragment,/role="group" aria-label="토픽 관리 팝업 하단 빠른 스크롤"/);
 assert.match(fragment,/id="manageQuickToggleBtn"[^>]*type="button"/);
 assert.match(fragment,/aria-controls="manageQuickArrows" aria-expanded="true"/);
 assert.match(fragment,/id="manageScrollBody" class="manage-scroll-body"/);
 assert.match(fragment,/<button id="manageJumpTopBtn"[^>]*>▲<\/button>/);
 assert.match(fragment,/<button id="manageJumpBottomBtn"[^>]*>▼<\/button>/);
 assert.doesNotMatch(fragment,/>▲ 위<\/button>|>▼ 아래<\/button>/);
 assert(!fragment.includes('오픈소스 고지')&&!fragment.includes('id="prevBtn"')&&!fragment.includes('id="listBtn"'));
});
test('single-scroll management modal keeps compact overlay controls accessible',()=>{
 assert.match(html,/\.manage-card\s*\{[^}]*display: flex;[^}]*overflow: hidden;/);
 assert.match(html,/\.manage-scroll-body\s*\{[^}]*order: 1;[^}]*overflow-y: auto;/);
 assert.match(html,/\.manage-quick-scroll\s*\{[^}]*order: 2;[^}]*align-self: flex-end;[^}]*width: max-content;[^}]*border: 1px solid var\(--line\);[^}]*border-radius: 15px;[^}]*box-shadow:/);
 assert.match(html,/\.manage-quick-scroll \.btn\s*\{[^}]*min-height: 44px;/);
 assert.match(html,/\.manage-quick-scroll \.btn\s*\{[^}]*min-width: 44px;/);
 assert.match(html,/manageJumpTopBtn[^\n]*aria-label="토픽 관리 맨 위로 이동"/);
 assert.match(html,/manageJumpBottomBtn[^\n]*aria-label="토픽 관리 맨 아래로 이동"/);
});
test('two buttons scroll only the management card and do not submit forms',()=>{
 const source=html.match(/\/\* R13_MANAGE_SCROLL_FUNCTION_START \*\/[\s\S]*?\/\* R13_MANAGE_SCROLL_FUNCTION_END \*\//)?.[0];
 assert(source);
 assert(source.includes("els.manageModal.querySelector('.manage-card')"));
 assert(source.includes('card.scrollTop ='));
 assert.match(html,/\.manage-shell \.manage-scroll-body\s*\{\s*display: contents;/);
 assert(source.includes("setManageQuickArrowsVisible(visible)"));
 assert(!source.includes('window.scrollTo')&&!source.includes('manageForm.submit'));
 const events=html.match(/\/\* R13_MANAGE_SCROLL_EVENTS_START \*\/[\s\S]*?\/\* R13_MANAGE_SCROLL_EVENTS_END \*\//)?.[0];
 assert(events?.includes("jumpManageToEdge('top')")&&events.includes("jumpManageToEdge('bottom')"));
 assert(events?.includes('manageQuickToggleBtn'));
 assert(html.includes("/* R13_MANAGE_SCROLL_INIT */ setManageQuickArrowsVisible(true); jumpManageToEdge('top');"));
});
test('unrelated topic source, PDF and auth flows remain present',()=>{
 assert.match(html,/async function saveManagedTopic\(event\)/);
 assert.match(html,/async function openManage\(mode = 'edit'\)/);
 assert.match(html,/function closeManage\(\)/);
 assert.match(html,/const ANNOTATION_SCHEMA_VERSION = 3;/);
 assert.match(html,/coordinateSpace: 'normalized-0-1'/);
 assert.match(html,/buildSignedGetUrl\(getApiUrl\(\), 'referencePdfContent'/);
});
