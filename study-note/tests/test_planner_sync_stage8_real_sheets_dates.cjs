'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../backend/planner-sync-stage3-isolated.addon.gs'),'utf8');
const sandbox={
 JSON,Date,Object,Array,Number,Math,String,Error,RegExp,
 Utilities:{formatDate:(value,tz,mask)=>{
  assert.equal(tz,'Asia/Seoul');assert.equal(mask,'yyyy-MM-dd');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(value);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return [p.year,p.month,p.day].join('-');
 }}
};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);
const ts=new Date('2026-11-15T15:00:00.000Z');
const mocks={
 plans:{dateCols:[2,3],tab:'학습계획'},
 schedule:{dateCols:[4],tab:'학습계획일정'},
 progress:{dateCols:[2],tab:'학습계획진도'},
 operations:{dateCols:[],tab:'학습계획작업'}
};
for(const [kind,m] of Object.entries(mocks)){
 const fields=Array.from(sandbox.PS3_HEADERS_[kind]);
 const row=fields.map(()=>''),originalDate=ts;
 for(const col of m.dateCols)row[col]=originalDate;
 const sheet={
  getLastRow:()=>2,
  getRange:(first)=>({getValues:()=>first===1?[fields]:[row.slice()]})
 };
 const ss={getSheetByName:name=>name===m.tab?sheet:null,
  getSpreadsheetTimeZone:()=> 'Asia/Seoul'};
 const got=sandbox.PS3_table_(ss,kind);
 assert.equal(got.rows.length,1);
 for(const col of m.dateCols){
  assert.equal(got.rows[0][col],'2026-11-16',
    kind+' calendar values must use the spreadsheet timezone');
  assert.equal(sandbox.PS3_date_(got.rows[0][col]),true);
 }
 assert.deepEqual(got.rows[0].filter((_,i)=>!m.dateCols.includes(i)),
  row.filter((_,i)=>!m.dateCols.includes(i)),'non-calendar fields unchanged');
}
const scheduleFields=Array.from(sandbox.PS3_HEADERS_.schedule);
const typed='2026-11-16';
const emptyRow=scheduleFields.map(()=>''),tab={
 getLastRow:()=>2,getRange:r=>({getValues:()=>r===1?[scheduleFields]:[emptyRow.map((x,i)=>i===4?typed:x)]})
};
const ss={getSheetByName:()=>tab,getSpreadsheetTimeZone:()=> 'Asia/Seoul'};
assert.equal(sandbox.PS3_table_(ss,'schedule').rows[0][4],typed);
console.log('STAGE8_REAL_SHEETS_DATE_NORMALIZATION_SYNTHETIC_PASS',JSON.stringify({
 kinds:['plans','schedule','progress','operations'],
 actualDateFromSheets:true,spreadsheetTimezone:true,canonicalDate:true,
 unchangedOtherData:true,realGoogleSheetsRetest:'PENDING'
}));
