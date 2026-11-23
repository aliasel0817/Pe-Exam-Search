/**
 * Real Google Drive staging roundtrip. NEVER deploy in operating Apps Script.
 *
 * Run manually from the script editor for the dedicated standalone test project.
 * PN1_ISOLATED_SCRIPT_ID_ must be declared in a LOCAL-ONLY companion .gs file,
 * never in the GitHub repository or operating Apps Script project.
 *
 * Writes ONLY to a newly created, uniquely named Drive folder. The folder and
 * 3 PERSONAL_NOTE_SYNC_* script properties are removed in finally. No MASTER,
 * existing annotations, production Drive folders or operational API are used.
 *
 * ACTIVE device objects used below are SIMULATED; this is a storage/API test,
 * NOT a test of real operating HMAC/nonce/ACTIVE authentication.
 */
function PN1_stageRealDriveSelfTest() {
  if (typeof PN1_ISOLATED_SCRIPT_ID_ !== 'string'
      || !/^[A-Za-z0-9_-]{20,}$/.test(PN1_ISOLATED_SCRIPT_ID_)
      || ScriptApp.getScriptId() !== PN1_ISOLATED_SCRIPT_ID_) {
    throw new Error('ABORT: not the explicitly approved isolated script project.');
  }
  var lock=LockService.getUserLock();
  lock.waitLock(10000);
  var props=PropertiesService.getScriptProperties();
  var protectedKeys=['PERSONAL_NOTE_SYNC_MODE','PERSONAL_NOTE_SYNC_FOLDER_ID','PERSONAL_NOTE_SYNC_READY'];
  var folder=null, createdId='', result={testOnly:true,liveMasterWrites:0,operatingAuthTested:false,
    createdFolder:false,markerVerified:false,roundtrip:false,casConflict:false,
    invalidStatusDenied:false,cleanup:false};
  try {
    for(var i=0;i<protectedKeys.length;i++) {
      if(props.getProperty(protectedKeys[i]))throw new Error('ABORT: script properties already configured.');
    }
    var name='PERSONAL_NOTE_ISOLATED_TEST_ONLY_'+Utilities.getUuid();
    folder=DriveApp.createFolder(name);
    createdId=folder.getId();
    if(!createdId || folder.getName()!==name)throw new Error('Failed to create isolated test folder');
    folder.createFile(PN1_MARKER_,'ISOLATED TEST ONLY',MimeType.PLAIN_TEXT);
    result.createdFolder=true;
    if(!folder.getFilesByName(PN1_MARKER_).hasNext())throw new Error('Marker missing');
    result.markerVerified=true;
    props.setProperties({
      PERSONAL_NOTE_SYNC_MODE:'ISOLATED_TEST',
      PERSONAL_NOTE_SYNC_FOLDER_ID:createdId,
      PERSONAL_NOTE_SYNC_READY:'READY:'+createdId
    },false);
    var devA={status:'ACTIVE',deviceId:'PN1_STAGE_DEVICE_A_20261123'};
    var devB={status:'ACTIVE',deviceId:'PN1_STAGE_DEVICE_B_20261123'};
    var topic='PN1_STAGE_T20261123',hash=PN1_sha_(topic);
    var idx='index:'+hash,pa='page:'+hash+':page-a',pb='page:'+hash+':page-b';
    var png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8HgAAAABJRU5ErkJggg==';
    var pages=[
      {key:pa,schemaVersion:1,topicId:topic,page:{id:'page-a',objects:[
        {id:'stroke-a',type:'stroke',points:[{x:0.1,y:0.2},{x:0.7,y:0.8}]},
        {id:'image-a',type:'image',src:png,x:0.1,y:0.1,w:0.4,h:0.3}
      ]}},
      {key:pb,schemaVersion:1,topicId:topic,page:{id:'page-b',objects:[
        {id:'text-b',type:'text',text:'실제 Drive 격리 테스트',x:0.2,y:0.4,size:18}
      ]}}
    ];
    var global={key:'global',schemaVersion:1,background:'./assets/personal-note-answer-sheet-a4.svg',enabled:true};
    var index={key:idx,schemaVersion:1,topicId:topic,pageIds:['page-a','page-b']};
    function save(doc,auth,baseRevision) {
      var encoded=Utilities.base64EncodeWebSafe(JSON.stringify(doc),Utilities.Charset.UTF_8).replace(/=+$/,'');
      var partSize=PN1_CHUNK_SIZE_,count=Math.ceil(encoded.length/partSize);
      var manifest={key:doc.key,baseRevision:baseRevision,hash:PN1_sha_(encoded),
        length:encoded.length,totalChunks:count};
      var started=PN1_post_('personalnotebegin',manifest,auth);
      if(started.conflict)return started;
      if(!started.uploadId)throw new Error('begin response invalid');
      for(var p=0;p<count;p++) {
        PN1_post_('personalnotepart',{uploadId:started.uploadId,index:p,
          chunk:encoded.slice(p*partSize,(p+1)*partSize)},auth);
      }
      var commit=PN1_post_('personalnotecommit',{uploadId:started.uploadId},auth);
      if(!commit.committed||commit.hash!==manifest.hash||commit.revision!==baseRevision+1)
        throw new Error('Commit response invalid');
      return commit;
    }
    save(global,devA,0);
    for(var j=0;j<pages.length;j++)save(pages[j],devA,0);
    save(index,devA,0);
    function read(key,auth) {
      var meta=PN1_get_('personalnotedoc',{key:key,mode:'meta'},auth);
      if(!meta.exists||!meta.totalChunks)throw new Error('Document absent');
      var encoded='';
      for(var p=0;p<meta.totalChunks;p++) {
        var item=PN1_get_('personalnotedoc',
          {key:key,mode:'chunk',revision:meta.revision,index:p},auth);
        encoded+=item.chunk;
      }
      if(encoded.length!==meta.length||PN1_sha_(encoded)!==meta.hash)throw new Error('Readback digest mismatch');
      return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(encoded)).getDataAsString('UTF-8'));
    }
    var fetchedGlobal=read('global',devB);
    var fetchedIndex=read(idx,devB);
    var fetchedPageA=read(pa,devB);
    var fetchedPageB=read(pb,devB);
    if(!fetchedGlobal.enabled||fetchedGlobal.background!==global.background
        ||fetchedIndex.pageIds.join(',')!=='page-a,page-b'
        ||fetchedPageA.page.objects[1].src!==png
        ||fetchedPageB.page.objects[0].text!=='실제 Drive 격리 테스트')
      throw new Error('Roundtrip mismatch');
    result.roundtrip=true;
    var stale=save(index,devB,0);
    if(stale.conflict!==true)throw new Error('Stale CAS write was not refused');
    result.casConflict=true;
    try {
      PN1_get_('personalnotestatus',{}, {status:'PENDING',deviceId:'PN1_STAGE_DEVICE_C_20261123'});
    }catch(e) {
      result.invalidStatusDenied=e.code==='AUTH_REQUIRED';
    }
    if(!result.invalidStatusDenied)throw new Error('Non-ACTIVE status was not rejected');
    result.success=true;
    return result;
  } finally {
    // Clean *only* our own newly created isolated artifacts; never touch other folders.
    for(var k=0;k<protectedKeys.length;k++) {
      if(createdId && props.getProperty('PERSONAL_NOTE_SYNC_FOLDER_ID')===createdId) {
        props.deleteProperty(protectedKeys[k]);
      }
    }
    if(folder && createdId && folder.getId()===createdId
        && folder.getName().indexOf('PERSONAL_NOTE_ISOLATED_TEST_ONLY_')===0) {
      folder.setTrashed(true);
      result.cleanup=true;
    }
    lock.releaseLock();
  }
}
