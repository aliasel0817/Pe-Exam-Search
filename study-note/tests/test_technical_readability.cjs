"use strict";
/* Data-free, offline format checks: no Google Sheets, TTS, or GCS calls. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "study-note.html"), "utf8");
const start = html.indexOf("function splitStudyItemsForDisplay(value)");
const end = html.indexOf("function showTopicById(", start);
assert(start !== -1 && end > start, "Production formatter must exist");
const block = html.slice(start, end);
const formatter = vm.runInNewContext(block + "\n({splitStudyItemsForDisplay,addStudyTechnicalKoreanLabel,topicKeywordTechnicalGlossary,describeStudyTechnicalItem,STUDY_TECHNICAL_GLOSSARY})");
const {splitStudyItemsForDisplay: split,topicKeywordTechnicalGlossary: fromKeywords,
  describeStudyTechnicalItem: describe,addStudyTechnicalKoreanLabel: gloss} = formatter;
const item=(original,keyword="")=>describe(original,fromKeywords(keyword));

test("A spacing and PDF control remain untouched",()=>{
  assert.match(html,/\.study-readable-list \{[^}]*gap: \.52rem;/);
  assert.match(html,/referencePdfCompactNextBtn/);
  assert.match(html,/function moveReferencePdfSequential/);
});
test("Only split outer spaced bullets, not nested mid-dots",()=>{
  const list=split("A(공격경로 · 자산을 분석) · B(보안·설계 규칙 적용)");
  assert.equal(list.length,2);
  assert.match(list[0],/공격경로 · 자산/);
  assert.match(list[1],/보안·설계/);
});
test("Preserve existing abbreviation and short gloss",()=>{
  assert.equal(item("SQL(Structured Query Language, 구조화질의언어)"),null);
  assert.equal(item("Value(가치)"),null);
});
test("Same-topic meaning overrides marketing-wide Communication",()=>{
  const v=item("Communication(단말 간 신호를 전송하고 통신 상태를 유지)","통신(Communication), 네트워크(Network)");
  assert.equal(v.label,"Communication(통신)");
  assert.equal(v.description,"단말 간 신호를 전송하고 통신 상태를 유지");
});
test("Same-topic controller may refer to physical 제어기",()=>{
  const v=item("Controller(센서 데이터를 수집하고 장치를 제어하는 중앙 제어 장치)","제어기(Controller), 디바이스(Device)");
  assert.equal(v.label,"Controller(제어기)");
});
test("Common terms without contextual keyword use curated fallback",()=>{
  assert.equal(item("Monitoring(사용량과 처리량을 지속적으로 추적하고 보고)").label,"Monitoring(모니터링)");
});
test("Conflicting keyword translations suppress generic guess",()=>{
  const keywords="제어기(Controller), 컨트롤러(Controller)";
  assert.equal(fromKeywords(keywords).get("Controller"),null);
  assert.equal(item("Controller(입력값에 따라 동작을 수행하고 제어)",keywords).label,"Controller");
});
test("Acronym definition in topic keywords supplies exact Korean meaning",()=>{
  const keywords="SQL(Structured Query Language, 구조화질의언어), 인덱스(Index)";
  assert.equal(item("SQL(데이터를 조회하고 변경하는 질의 기능 제공)",keywords).label,"SQL(구조화질의언어)");
});
test("Nested original English and Korean text are retained",()=>{
  const original="Training/Requirements(예를 들어 SDL(Security Development Lifecycle, 보안개발수명주기)의 보안 요구를 수집·검증)";
  const parsed=item(original);
  assert.equal(parsed.label,"Training/Requirements(교육·요구사항 정의)");
  assert.equal(parsed.description,"예를 들어 SDL(Security Development Lifecycle, 보안개발수명주기)의 보안 요구를 수집·검증");
});
test("Compound abbreviations remain complete before final translated term",()=>{
  const original="SAST(Static Application Security Testing, 정적보안시험)/SCA(Software Composition Analysis, 구성분석)/Fuzzing(입력 경계를 검증하고 취약점을 탐색)";
  const parsed=item(original);
  assert.match(parsed.label,/SAST\(Static Application Security Testing, 정적보안시험\)/);
  assert.match(parsed.label,/SCA\(Software Composition Analysis, 구성분석\)/);
  assert.match(parsed.label,/Fuzzing\(퍼징\)$/);
  assert.equal(parsed.description,"입력 경계를 검증하고 취약점을 탐색");
});
test("An existing Korean label never gets a duplicate translation",()=>{
  const v=item("Asset Identification(자산식별)(데이터의 중요도를 평가하고 보호할 자산을 정의)");
  assert.equal(v.label,"Asset Identification(자산식별)");
});
test("Unknown technical terms retain full original words",()=>{
  const body="입력 정보와 동작 조건을 검증하고 결과를 기록";
  const v=item("Unknown Technology ABC("+body+")");
  assert.equal(v.label,"Unknown Technology ABC");
  assert.equal(v.description,body);
});
test("Malformed punctuation is left unchanged",()=>{
  assert.equal(item("Component(괄호(문제가 있는 설명)"),null);
  assert.equal(split("A(잘못된 · B(설명)"),null);
});
test("Text is inserted safely without HTML parsing",()=>{
  assert.match(html,/heading\.textContent = parsed\.label/);
  assert.match(html,/document\.createTextNode\(': ' \+ parsed\.description\)/);
});
test("Glossary has no duplicate object keys and includes expanded terms",()=>{
  const keys=Object.keys(formatter.STUDY_TECHNICAL_GLOSSARY);
  assert(keys.length>=180);
  assert.equal(keys.length,new Set(keys).size);
  assert.equal(gloss("Security",fromKeywords("보안(Security)")),"Security(보안)");
});
test("Only technical fields gain context; other source data remains raw",()=>{
  assert.match(html,/setText\('detailConcept', topic\.concept \|\| '-'\)/);
  assert.match(html,/setText\('detailKeywords', topic\.keywords \|\| '-'\)/);
  assert.match(html,/setText\('detailMnemonic', topic\.mnemonic \|\| '-'\)/);
  assert.match(html,/setReadableStudyField\('detailTechnicalComponents', topic\.technicalComponents \|\| '-', 'technicalComponents', readable, topic\.keywords \|\| ''\)/);
});
