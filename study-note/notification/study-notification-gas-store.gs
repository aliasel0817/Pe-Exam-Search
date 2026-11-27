/* Stage 2 candidate: private, single-writer Apps Script journal.
 * Explicit constructor only: no sheet creation, timers, routes or writes on load.
 * Deployment requires one independently authorized script project and a private
 * dedicated spreadsheet initialized by its owner, never the LIVE MASTER.
 */
var StudyNotificationGasStore=(function(){
  'use strict';
  var NAME='PeExamStudyNotificationPrivate',TAB='NotificationJournal';
  var HEADER=['transactionId','index','count','key','payloadJson','sha256'];
  var MAX_ROWS=150000,MAX_BATCH=5000,MAX_CELL=45000;
  function must(ok,msg){if(!ok)throw Error(msg);}
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function sha(s){
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8)
      .map(function(n){return ('0'+(n&255).toString(16)).slice(-2);}).join('');
  }
  function digest(row){return sha(JSON.stringify(row.slice(0,5)));}
  function replay(rows){
    var state=new Map(),seen=new Set(),i=0;
    while(i<rows.length){
      var first=rows[i],id=first[0],count=Number(first[2]);
      must(typeof id==='string'&&/^txn-[a-f0-9-]+$/i.test(id)&&!seen.has(id)&&Number.isInteger(count)&&count>=1&&count<=MAX_BATCH&&i+count<=rows.length,'invalid/incomplete journal batch');
      var keys=new Set();
      for(var j=0;j<count;j++){
        var r=rows[i+j],k=r[3],p=r[4];
        must(r[0]===id&&Number(r[1])===j&&Number(r[2])===count&&typeof k==='string'&&k.length>0&&!keys.has(k)&&typeof p==='string'&&p.length<=MAX_CELL&&digest([id,j,count,k,p])===r[5],'journal row integrity failure');
        var value=JSON.parse(p);
        must(value&&typeof value==='object'&&!Array.isArray(value),'invalid journal value');
        keys.add(k);state.set(k,value);
      }
      seen.add(id);i+=count;
    }
    return state;
  }
  function open(privateId){
    must(typeof privateId==='string'&&/^[A-Za-z0-9_-]{20,}$/.test(privateId),'explicit private spreadsheet ID required');
    var ss=SpreadsheetApp.openById(privateId);
    must(ss.getName()===NAME,'not notification-only spreadsheet');
    // Exact schema and dedicated workbook are mandatory. No automatic initialization.
    must(ss.getSheets().length===1,'unexpected notification workbook tabs');
    var sheet=ss.getSheetByName(TAB);
    must(sheet&&sheet.getLastColumn()===HEADER.length,'notification journal schema missing');
    must(JSON.stringify(sheet.getRange(1,1,1,HEADER.length).getValues()[0])===JSON.stringify(HEADER),'notification header mismatch');
    return sheet;
  }
  function create(privateId){
    return {exclusive:function(work){
      var lock=LockService.getScriptLock();
      must(lock.tryLock(1000),'notification lock busy');
      try{
        var sheet=open(typeof privateId==='function'?privateId():privateId),last=sheet.getLastRow();
        must(last>=1&&last<=MAX_ROWS+1,'journal capacity exceeded');
        var rows=last===1?[]:sheet.getRange(2,1,last-1,HEADER.length).getValues();
        var state=replay(rows);
        var tx={
          get:function(key){return state.has(key)?copy(state.get(key)):null;},
          list:function(prefix){
            var out=[];
            state.forEach(function(value,key){if(key.indexOf(prefix)===0)out.push({key:key,value:copy(value)});});
            return out;
          },
          commit:function(changes){
            must(Array.isArray(changes)&&changes.length>0&&changes.length<=MAX_BATCH,'invalid journal batch size');
            must(last+changes.length<=MAX_ROWS+1,'journal capacity exceeded; no send');
            var keys=new Set(),id='txn-'+Utilities.getUuid();
            var batch=changes.map(function(c,i){
              must(c&&typeof c.key==='string'&&/^[a-zA-Z][a-zA-Z0-9%_.!~*'()|:-]*$/.test(c.key)&&c.key.length<=1000&&!keys.has(c.key),'invalid/duplicate journal key');
              must(c.value&&typeof c.value==='object'&&!Array.isArray(c.value),'invalid journal payload');
              keys.add(c.key);
              var p=JSON.stringify(c.value);
              must(p.length<=MAX_CELL,'journal cell capacity exceeded; no truncation');
              var r=[id,i,changes.length,c.key,p];
              return r.concat([digest(r)]);
            });
            must(sheet.getLastRow()===last,'unexpected external writer');
            var end=last+batch.length;
            if(end>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),end-sheet.getMaxRows());
            var target=sheet.getRange(last+1,1,batch.length,HEADER.length);
            // One contiguous batch, verify actual durable readback before permitting a send.
            target.setValues(batch);SpreadsheetApp.flush();
            must(JSON.stringify(target.getValues())===JSON.stringify(batch),'journal write readback mismatch');
            changes.forEach(function(c){state.set(c.key,copy(c.value));});last=end;
          }
        };
        return work(tx);
      }finally{lock.releaseLock();}
    }};
  }
  // Offline candidate only: produce a verified compacted journal, never write
  // or delete the source. A future generation-switch procedure must lock,
  // verify sourceHash, read back a separate candidate and retain rollback.
  function buildCompaction(rows){
    must(Array.isArray(rows)&&rows.length<=MAX_ROWS,'source capacity exceeded');
    var state=replay(rows),sourceHash=sha(JSON.stringify(rows)),entries=Array.from(state.entries()).sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:0;});
    var compacted=[];
    for(var offset=0;offset<entries.length;offset+=MAX_BATCH){
      var group=entries.slice(offset,offset+MAX_BATCH),id='txn-'+sha(sourceHash+':compact:'+offset);
      group.forEach(function(pair,index){
        var r=[id,index,group.length,pair[0],JSON.stringify(pair[1])];
        compacted.push(r.concat([digest(r)]));
      });
    }
    var verified=replay(compacted);
    must(verified.size===state.size,'compacted key count mismatch');
    state.forEach(function(v,k){must(verified.has(k)&&JSON.stringify(verified.get(k))===JSON.stringify(v),'compaction lost state');});
    return {sourceHash:sourceHash,beforeRows:rows.length,afterRows:compacted.length,rows:compacted};
  }
  // Manual, separate generation maintenance. Archive the entire previous
  // journal by retaining its original workbook; never truncate or delete it.
  // Pointer and archive references are ONE property, switched under the same lock.
  function manifest(props,masterId){
    var raw=props.getProperty('PE_NOTIFICATION_STORE_MANIFEST');
    var m=raw?JSON.parse(raw):{version:1,activeId:props.getProperty('PE_NOTIFICATION_PRIVATE_STORE_ID'),archives:[]};
    var valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{20,}$/.test(id)&&id!==masterId;
    must(typeof masterId==='string'&&masterId.length>=20&&m.version===1&&valid(m.activeId)&&Array.isArray(m.archives)&&m.archives.length<=20&&m.archives.every(a=>valid(a.id)&&/^[a-f0-9]{64}$/.test(a.sourceHash)),'invalid private store manifest');
    var ids=[m.activeId].concat(m.archives.map(a=>a.id));
    must(new Set(ids).size===ids.length,'duplicate store generation');
    return {raw:raw,m:m};
  }
  function activeId(props,masterId){return manifest(props,masterId).m.activeId;}
  function compactDisabledProject(props,masterId){
    function disabled(){
      return props.getProperty('PE_NOTIFICATION_PROJECT_MODE')==='DEDICATED_NOTIFICATION'&&
       ['HTTP_APPROVED','RELEASE_APPROVED','SCHEDULER_APPROVED'].every(k=>props.getProperty('PE_NOTIFICATION_'+k)!=='YES');
    }
    must(disabled(),'compaction requires disabled dedicated project');
    var lock=LockService.getScriptLock();must(lock.tryLock(1000),'notification lock busy');
    try{
      var previous=manifest(props,masterId),m=previous.m;
      must(disabled()&&m.archives.length<20,'archive limit/activation blocked');
      var source=open(m.activeId),last=source.getLastRow();
      must(last>1&&last<=MAX_ROWS+1,'source generation empty or oversized');
      var rows=source.getRange(2,1,last-1,HEADER.length).getValues(),comp=buildCompaction(rows);
      if(comp.afterRows>=comp.beforeRows)return {ok:true,switched:false,beforeRows:comp.beforeRows,afterRows:comp.afterRows};
      var ss=SpreadsheetApp.create(NAME),candidate=ss.getSheets()[0];
      must(ss.getId()!==masterId&&ss.getId()!==m.activeId,'candidate identity invalid');
      candidate.setName(TAB);candidate.getRange(1,1,1,HEADER.length).setValues([HEADER]);
      var end=comp.rows.length+1;
      if(end>candidate.getMaxRows())candidate.insertRowsAfter(candidate.getMaxRows(),end-candidate.getMaxRows());
      for(var i=0;i<comp.rows.length;i+=500){
        var batch=comp.rows.slice(i,i+500);
        candidate.getRange(i+2,1,batch.length,HEADER.length).setValues(batch);
      }
      SpreadsheetApp.flush();
      var readback=open(ss.getId());
      must(readback.getLastRow()===end,'candidate row count mismatch');
      var rr=readback.getRange(2,1,end-1,HEADER.length).getValues();
      must(sha(JSON.stringify(rr))===sha(JSON.stringify(comp.rows)),'candidate readback mismatch');
      replay(rr);
      // Reconfirm source and pointer immediately before the generation switch.
      must(disabled()&&manifest(props,masterId).raw===previous.raw&&activeId(props,masterId)===m.activeId&&source.getLastRow()===last&&sha(JSON.stringify(source.getRange(2,1,last-1,HEADER.length).getValues()))===comp.sourceHash,'source/pointer changed');
      var next={version:1,activeId:ss.getId(),archives:m.archives.concat([{id:m.activeId,sourceHash:comp.sourceHash,archivedAt:new Date().toISOString(),rows:comp.beforeRows}])};
      var json=JSON.stringify(next);
      must(Utilities.newBlob(json).getBytes().length<=8500,'manifest capacity exceeded');
      props.setProperty('PE_NOTIFICATION_STORE_MANIFEST',json);
      must(props.getProperty('PE_NOTIFICATION_STORE_MANIFEST')===json,'manifest readback mismatch');
      return {ok:true,switched:true,beforeRows:comp.beforeRows,afterRows:comp.afterRows,archives:next.archives.length};
    }finally{lock.releaseLock();}
  }
  return Object.freeze({create:create,replay:replay,buildCompaction:buildCompaction,activeId:activeId,compactDisabledProject:compactDisabledProject});
})();
