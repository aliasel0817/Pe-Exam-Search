'use strict';
// Offline planner regression without touching MASTER, production or browser progress.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'..','study-planner.js'),'utf8');
const slice=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start+1);assert(start>=0&&end>start,a+' missing');return source.slice(start,end)};
const api=new Function('today', [
  slice('function normalise(','function initUi()'),
  slice('function validIsoDate(','function csvToPlan('),
  slice('function plannerAddDays(','function goToPlannerPage('),
  'return {normalise,plannerExtendPlan,plannerCreateAutoPlan,plannerDayText,plannerMissingTopics};'
].join('\n'))(()=> '2026-11-13');
const base=api.normalise({
  id:'pe141-100d-2026',name:'Test original',
  start:'2026-10-22',end:'2027-01-29',
  groups:{G01:'Development'},days:Array.from({length:100},(_,index)=>{
    const date=new Date(Date.UTC(2026,9,22)+index*86400000).toISOString().slice(0,10);
    return {date,round:index>=98?null:1+Math.floor(index*5/98),ids:['T0001'],groups:['G01']};
  })
});
const master=[
 {topicId:'T0001',studyTarget:'Y',categoryCode:'SW-01',domain:'SW'},
 {topicId:'T4069',studyTarget:'Y',categoryCode:'SW-01',domain:'SW'},
 {topicId:'T4070',studyTarget:'Y',categoryCode:'SW-01',domain:'SW'},
 {topicId:'T4099',studyTarget:'N',categoryCode:'SW-01',domain:'SW'}
];
assert.deepEqual(api.plannerMissingTopics(base,master).map(t=>t.topicId),['T4069','T4070']);
const updated=api.plannerExtendPlan(base,api.plannerMissingTopics(base,master),'2026-11-14',master);
assert.equal(updated.id,base.id);
assert.equal(updated.entries,110);
assert(base.days.every((d,i)=>updated.days[i].ids[0]==='T0001'&&updated.days[i].groups[0]==='G01'));
for(const id of ['T4069','T4070']){
 const days=updated.days.filter(d=>d.ids.includes(id));
 assert.equal(days.length,5);
 assert(days.every(d=>d.date>='2026-11-14'&&d.round!==null));
 assert.equal(new Set(days.map(d=>d.date)).size,5);
}
assert.equal(api.plannerMissingTopics(updated,master).length,0);
assert.equal(api.plannerDayText(base),'시작 2026-10-22 · 오늘 23/100일차');
const options={name:'New Plan',start:'2027-02-01',end:'2027-05-31',rounds:5,scope:'target'};
const created=api.plannerCreateAutoPlan(options,master);
assert.equal(created.entries,15);
assert.equal(created.days.length,120);
assert.equal(created.days.filter(d=>d.round===null).length,2);
for(const id of ['T0001','T4069','T4070']) assert.equal(created.days.filter(d=>d.ids.includes(id)).length,5);
assert.equal(api.plannerCreateAutoPlan({...options,scope:'selected',selected:'T4070;t0001'},master).entries,10);
assert.throws(()=>api.plannerCreateAutoPlan({...options,scope:'selected',selected:'T9999'},master),/MASTER에 없는/);
assert.throws(()=>api.plannerExtendPlan(base,[master[1]],'2027-01-26',master),/5일 미만/);
console.log('PASS planner MASTER-based extension, five-pass coverage, no overwrite, dates, auto-plan and validation');
