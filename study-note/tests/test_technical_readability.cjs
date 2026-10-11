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
const item=(original,keyword="",feature="")=>describe(original,fromKeywords(keyword),feature);

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
  assert.match(html,/setReadableStudyField\('detailTechnicalComponents', topic\.technicalComponents \|\| '-', 'technicalComponents', readable, topic\.keywords \|\| '', topic\.features \|\| ''\)/);
});

test("Feature-only bilingual pair supplies exact term meaning without touching description",()=>{
  const raw="Span(여러 벡터의 선형결합으로 생성되는 공간을 정의)";
  const features="서로 선형독립이고 전체 벡터공간을 Span(생성) · 해당 공간의 Basis(기저)";
  const parsed=item(raw,"",features);
  assert.equal(parsed.label,"Span(생성)");
  assert.equal(parsed.description,"여러 벡터의 선형결합으로 생성되는 공간을 정의");
});
test("Exact keyword pair takes precedence over differing feature gloss",()=>{
  const features="Strategy(전략)·Structure(구조)·Systems(시스템) 함께 진단";
  const keywords="전략(Strategy), 조직구조(Structure), 시스템(Systems)";
  const parsed=item("Structure(권한·책임·보고관계의 조직구조)",keywords,features);
  assert.equal(parsed.label,"Structure(조직구조)");
});
test("Feature translations conflict: keep English instead of imposing fallback",()=>{
  const parsed=item("Communication(통신 신호와 상태를 지속 확인하고 기록)","",
   "Communication(통신) 및 Communication(의사소통) 표현 혼재");
  assert.equal(parsed.label,"Communication");
});
test("Explanatory feature parentheses are not misread as translations",()=>{
  const raw="Testing(단위 테스트를 자동화하여 결함을 조기에 검출하고 개선)";
  const parsed=item(raw,"","Testing(테스트를 자동화하는 활동)을 수행");
  assert.equal(parsed.label,"Testing(시험)");
  assert.equal(parsed.description,"단위 테스트를 자동화하여 결함을 조기에 검출하고 개선");
});
test("Nested technical detail retains complete source and Korean meaning",()=>{
  const original="Threat Modeling(자산(Asset)·데이터 흐름(Flow)·신뢰경계를 분석하고 위험을 평가)";
  const parsed=item(original,"","Threat Modeling(위협 모델링)을 활용");
  assert.equal(parsed.label,"Threat Modeling(위협 모델링)");
  assert.equal(parsed.description,"자산(Asset)·데이터 흐름(Flow)·신뢰경계를 분석하고 위험을 평가");
});
test("Different term's translated feature cannot hijack the intended element",()=>{
  const parsed=item("Monitoring(환경 변화에 따라 운영상태를 지속 점검)","",
    "Data Monitoring(데이터 감시) 모듈을 사용");
  assert.equal(parsed.label,"Monitoring(모니터링)");
});
test("Known Phase 4 technical terms gain Korean gloss without dropping details",()=>{
  const original="Error Correction(Reed-Solomon으로 데이터 오류를 검출하고 복원)";
  const result=item(original);
  assert.equal(result.label,"Error Correction(오류 정정)");
  assert.equal(result.description,"Reed-Solomon으로 데이터 오류를 검출하고 복원");
});
test("Display entrypoint passes same-topic features and does not mutate original",()=>{
  assert.match(html,/setReadableStudyField\('detailTechnicalComponents', topic\.technicalComponents \|\| '-', 'technicalComponents', readable, topic\.keywords \|\| '', topic\.features \|\| ''\)/);
  assert.match(html,/const featureMeaning = studyFeatureTechnicalGloss\(featureSource, key\)/);
});

test("LISS linear algebra example: all six elements keep descriptions",()=>{
  for(const [term,translated] of [
    ["Linear Independence","선형독립"],["Span","생성"],["Minimality","최소성"],
    ["Basis","기저"],["Dimension","차원"],["Rank Test","행렬 랭크 검사"]
  ]){
    const features="벡터공간을 Span(생성) · 해당 공간의 Basis(기저) 역할 · Dimension(차원)을 측정";
    const v=item(term+"(원문에 적힌 수학적 조건과 계산 절차를 설명)","",features);
    assert.equal(v.label,term+"("+translated+")");
    assert.equal(v.description,"원문에 적힌 수학적 조건과 계산 절차를 설명");
  }
});
test("Porter five forces keeps each original competition explanation",()=>{
  for(const [en,ko] of [
    ["Rivalry","기존 경쟁"],["Threat of New Entrants","신규진입자 위협"],
    ["Threat of Substitutes","대체재 위협"],
    ["Buyer Power","구매자 교섭력"],["Supplier Power","공급자 교섭력"]
  ]){
    const v=item(en+"(가격·품질·진입장벽에 영향을 주는 경쟁요인을 분석)");
    assert.equal(v.label,en+"("+ko+")");
    assert.equal(v.description,"가격·품질·진입장벽에 영향을 주는 경쟁요인을 분석");
  }
});
