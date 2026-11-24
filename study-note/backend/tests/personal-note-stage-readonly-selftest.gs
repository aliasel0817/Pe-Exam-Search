/**
 * Isolated-only Personal Note staging self-test for a fresh standalone Apps Script.
 * Will not modify Google Drive, Script Properties, MASTER, or operating deployments.
 * Do NOT include this in the operating Apps Script release.
 */
function PN1_stageSelfTest() {
  var result={testOnly:true,pendingDenied:false,activeWithoutFolderDenied:false,invalidKeyDenied:false,noWrites:true};
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty('PERSONAL_NOTE_SYNC_FOLDER_ID') ||
      props.getProperty('PERSONAL_NOTE_SYNC_MODE')) {
    throw new Error('Refuse to self-test a configured or operating backend.');
  }
  var testDevice='PN_STAGE_DEVICE_20261123';
  try{PN1_get_('personalnotestatus',{}, {status:'PENDING',deviceId:testDevice});}
  catch(e){result.pendingDenied=e.code==='AUTH_REQUIRED';}
  try{PN1_get_('personalnotestatus',{}, {status:'ACTIVE',deviceId:testDevice});}
  catch(e){result.activeWithoutFolderDenied=e.code==='DISABLED';}
  try{PN1_key_('index:../MASTER');}
  catch(e){result.invalidKeyDenied=e.code==='INVALID_KEY';}
  result.ok=result.pendingDenied&&result.activeWithoutFolderDenied&&result.invalidKeyDenied;
  if(!result.ok)throw new Error('Fail-closed Personal Note self-test failed.');
  return result;
}
