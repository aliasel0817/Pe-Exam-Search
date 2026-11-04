'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../..');
const html=fs.readFileSync(path.join(root,'study-note/study-note.html'),'utf8');
const notice=require('../../r4/r4-license-notice.js');
function node(tag){
 return {tagName:tag,children:[],style:{cssText:''},
  setAttribute(key,value){(this.attrs||(this.attrs={}))[key]=value;},
  appendChild(child){this.children.push(child);child.parentElement=this;return child;},
  contains(target){return this===target||this.children.some(x=>x.contains?.(target))},
  focus(){}
 };
}
test('five original topic actions retain identity and remain visible with direct notice control',()=>{
 const ids=['jumpTopBtn','prevBtn','listBtn','nextBtn','jumpBottomBtn'];
 const positions=ids.map(id=>html.indexOf('id="'+id+'"'));
 assert(positions.every(x=>x>0));
 assert(positions.every((x,i)=>i===0||x>positions[i-1]));
 assert(html.includes('<button id="listBtn" class="nav-btn"'));
 assert(!html.includes('id="listBtn" class="nav-btn mobile-only"'));
 assert.match(html,/docked:true,host:document.getElementById\('bottomNavActions'\)/);
 assert(!html.includes('id="noticeMoreMenu"'));
});
test('docked AGPL details summary acts as direct sixth nav item and source offer is preserved',()=>{
 const host=node('div'),doc={body:node('body'),createElement:node,
  getElementById(){return null;},addEventListener(){}};
 const url='https://github.com/aliasel0817/Pe-Exam-Search/tree/pe-study-note-mupdf-1.28.1-r8-20261104/study-note';
 const result=notice.mount(doc,{approved:true,gate:'OPEN',sourceUrl:url,production:true,docked:true,host});
 assert.equal(result.tagName,'details');
 assert.equal(result.parentElement,host);
 assert.equal(doc.body.children.length,0,'must not append a separate fixed source notice');
 assert.equal(result.children[0].textContent,'ⓘ 고지');
 assert.equal(result.children[0].attrs['aria-label'],'오픈소스 고지 및 전체 대응 소스 보기');
 assert.equal(result.children[0].className,'nav-btn r4-notice-summary');
 assert.equal(result.children[1].className,'r4-notice-popover');
 const links=result.children[1].children.filter(x=>x.tagName==='a');
 assert.equal(links.length,3);
 assert(links.some(x=>x.href===url&&x.id==='r4-source-offer-link'));
 assert(links.some(x=>x.href?.includes('THIRD_PARTY_NOTICES.md')));
 assert(links.some(x=>x.href?.includes('AGPL-3.0.txt')));
});
test('original R4 standalone notice behavior stays usable for earlier local tests',()=>{
 const doc={body:node('body'),createElement:node,getElementById(){return null;}};
 const root=notice.mount(doc,{approved:false,gate:'BLOCKED'});
 assert.equal(root.parentElement,doc.body);
 assert.equal(root.children[0].textContent,'오픈소스 고지 (비운영 미리보기)');
 assert.equal(root.style.cssText.includes('position:fixed'),true);
 assert.equal(root.children.some(x=>x.id==='r4-source-offer-link'),false);
});
test('collapsing hides all six floating controls but source offer remains in Settings',()=>{
 assert(html.includes('.bottom-nav.nav-collapsed .bottom-nav-actions{display:none;}'));
 assert(html.includes('.bottom-nav.nav-collapsed .r4-notice-docked{display:none;}'));
 assert(html.includes('id="settingsOpenSourceNotice"'));
 assert(html.includes('id="settingsCorrespondingSourceLink"'));
 assert(html.includes('id="settingsAgplLicenseLink"'));
 assert(html.includes('id="settingsThirdPartyNoticesLink"'));
 assert(html.includes('https://github.com/aliasel0817/Pe-Exam-Search/tree/main/study-note'));
 assert(html.includes('@media(max-width:350px)'));
 assert(html.includes('flex-wrap:wrap;align-items:stretch;gap:3px;'));
 assert(html.includes('env(safe-area-inset-bottom)'));
 assert(html.includes('.r4-notice-popover{right:-32px;}'));
});
