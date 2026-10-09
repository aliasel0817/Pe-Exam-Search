'use strict';
/* No real browser, cloud network, or credentials are used. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');

const here=__dirname;
const launcher=fs.readFileSync(path.join(here,'stage4_browser_audio_console_loader.js'),'utf8');
const audio=fs.readFileSync(path.join(here,'stage4_browser_audio_pilot.js'));
function mockEnv(origin,pathName){
  const appended=[];
  const warnings=[];
  const status={textContent:''};
  const exit={handlers:[],addEventListener(kind,handler){this.handlers.push({kind,handler})}};
  let section=null;
  const main={appendChild(child){section=child; appended.push({where:'main',child})}};
  const document={
    currentScript:{src:'https://cdn.jsdelivr.net/gh/aliasel0817/Pe-Exam-Search@fixed-sha/study-note/tts/stage4_browser_audio_console_loader.js'},
    createElement(tag){
      const o={tag,style:{},children:[],dataset:{},scrollIntoView(){},
        querySelector(sel){if(sel==='#pilotExit')return exit;if(sel==='#pilotStatus')return status; return null}};
      return o;
    },
    getElementById(){return null},
    querySelector(sel){return sel==='main' ? main : null},
    head:{appendChild(child){appended.push({where:'head',child})}}
  };
  const location={origin,pathname:pathName,reload(){throw new Error('no reload in offline test')}};
  vm.runInNewContext(launcher,{document,location,URL,console:{warn:s=>warnings.push(s)}});
  return {appended,warnings,status,exit,get section(){return section}};
}

test('launcher is strictly scoped to existing GitHub Pages auth smoke path',()=>{
  for(const [origin,pathName] of [
    ['https://example.com','/Pe-Exam-Search/tts-auth-check.html'],
    ['https://aliasel0817.github.io','/Pe-Exam-Search/study-note/study-note.html'],
    ['http://aliasel0817.github.io','/Pe-Exam-Search/tts-auth-check.html']
  ]){
    const r=mockEnv(origin,pathName);
    assert.equal(r.appended.length,0);
    assert.ok(r.warnings.length);
  }
});
test('launcher only adds temporary browser DOM and an SRI-pinned test script',()=>{
  const r=mockEnv('https://aliasel0817.github.io','/Pe-Exam-Search/tts-auth-check.html');
  assert.ok(r.section);
  assert.ok(r.section.innerHTML.includes('T0001:concept'));
  assert.ok(r.section.innerHTML.includes('T2176:components'));
  assert.ok(r.section.innerHTML.includes('T2354:components'));
  assert.equal((r.section.innerHTML.match(/data-pilot=/g)||[]).length,3);
  assert.equal(r.exit.handlers.length,1);
  const scripts=r.appended.filter(a=>a.child.tag==='script');
  assert.equal(scripts.length,1);
  assert.equal(scripts[0].child.crossOrigin,'anonymous');
  assert.equal(scripts[0].child.referrerPolicy,'no-referrer');
  assert.match(scripts[0].child.src,/stage4_browser_audio_pilot\.js$/);
});
test('subresource integrity is pinned to actual pilot JS source bytes',()=>{
  const hash=crypto.createHash('sha384').update(audio).digest('base64');
  assert.ok(launcher.includes('sha384-'+hash),'SRI must exactly match pinned test source');
});
test('launcher contains no cloud writes or synthesis and no local storage writes',()=>{
  assert.doesNotMatch(launcher, /texttospeech\.googleapis|gcloud run deploy|gcloud storage cp|localStorage\.setItem/);
});
