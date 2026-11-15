'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.resolve(__dirname,'../backend/planner-sync-stage8-autoresume.gs'),'utf8');
function harness(){
 const data=new Map([['PLANNER_SYNC_MODE','ISOLATED_TEST']]);
 const dummy={id:'other',getHandlerFunction:()=> 'SomeOtherTrigger'};
 const triggers=[dummy];
 let plan={planId:'stage8-synthetic-id',operationId:'stage8-synthetic-operation',
  status:'STAGING',nextOffset:24,chunkCount:101,progressChecked:false};
 let calls=0,progressCalls=0;
 const p=()=>({getProperty:k=>data.get(k)||'',setProperty:(k,v)=>data.set(k,v)});
 const sandbox={
  Logger:{log:()=>{}},JSON,Date,Number,Math,Object,String,Error,ScriptApp:{
   getProjectTriggers:()=>triggers,
   newTrigger:h=>({timeBased:()=>({everyMinutes:n=>({create:()=>{
      assert.equal(n,1);triggers.push({getHandlerFunction:()=>h});
    }})})}),
   deleteTrigger:t=>{const i=triggers.indexOf(t);assert(i>=0);triggers.splice(i,1)}
  },
  LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  PropertiesService:{getScriptProperties:p},
  PS8R_STATE_KEY_:'PS8R_TEST_STATE',
  PS8R_getState_:()=>plan,
  PS8R_preflight:()=>({ok:true}),
  PS8R_runEditorBatch:()=>{calls++;
    plan.nextOffset=Math.min(101,plan.nextOffset+12);
    if(plan.nextOffset===101)plan.status='VERIFIED';
    data.set('PS8R_TEST_STATE',JSON.stringify(plan));
    return {status:plan.status};
  },
  PS8R_progress:()=>{assert.equal(plan.status,'VERIFIED');progressCalls++;plan.progressChecked=true;
    data.set('PS8R_TEST_STATE',JSON.stringify(plan));
  }
 };
 data.set('PS8R_TEST_STATE',JSON.stringify(plan));
 vm.createContext(sandbox);
 vm.runInContext(source,sandbox);
 return {sandbox,data,triggers,get plan(){return plan},setPlan:p=>plan=p,getCalls:()=>calls,getProgressCalls:()=>progressCalls};
}
const a=harness(),x=a.sandbox;
assert.equal(x.PS8R_autoStatus().automation,'NOT_STARTED');
assert.equal(x.PS8R_autoStart().status,'RUNNING');
assert.equal(a.triggers.length,2);
assert.equal(x.PS8R_autoStart().status,'RUNNING');
assert.equal(a.triggers.length,2,'no duplicate trigger');
while(x.PS8R_autoStatus().automation==='RUNNING') x.PS8R_autoTick();
assert.equal(x.PS8R_autoStatus().automation,'COMPLETED');
assert.equal(x.PS8R_autoStatus().stage,'VERIFIED');
assert.equal(x.PS8R_autoStatus().receivedChunks,101);
assert.equal(a.getProgressCalls(),1);
assert.equal(a.triggers.length,1,'other handler trigger retained');
assert.equal(a.triggers[0].getHandlerFunction(),'SomeOtherTrigger');
x.PS8R_autoTick();
assert.equal(a.getProgressCalls(),1,'no duplicate progress write');

const b=harness();
b.data.set('PLANNER_SYNC_MODE','PRODUCTION');
assert.throws(()=>b.sandbox.PS8R_autoStart(),/AUTO_ISOLATION_REQUIRED/);
assert.equal(b.triggers.length,1);
b.data.set('PLANNER_SYNC_MODE','ISOLATED_TEST');
b.sandbox.PS8R_autoStart();
b.setPlan({...b.plan,planId:'other-plan'});
assert.throws(()=>b.sandbox.PS8R_autoTick(),/AUTO_RUN_ID_MISMATCH/);
assert.equal(b.sandbox.PS8R_autoStatus().automation,'FAILED');
assert.equal(b.triggers.length,1);

const c=harness();
c.sandbox.PS8R_autoStart();
assert.equal(c.sandbox.PS8R_autoStop().automation,'PAUSED');
assert.equal(c.triggers.length,1,'only own trigger cleared');
console.log('STAGE8_ISOLATED_AUTORESTART_SYNTHETIC_PASS',JSON.stringify({
 startOnce:true,triggersOwned:true,remainingChunksResumed:true,
 autoCommitVerifyProgress:true,errorsStop:true,realAppsScript:'NOT_EXECUTED',
 productionMutation:'NONE'
}));
