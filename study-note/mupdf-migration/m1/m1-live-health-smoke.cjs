'use strict';
// Read-only production health smoke test. Never prints the API URL or deployment ID.
const fs=require('node:fs'),path=require('node:path');
async function check(root){
 const html=fs.readFileSync(path.join(root,'study-note','study-note.html'),'utf8');
 const m=html.match(/const\s+DEFAULT_API_URL\s*=\s*['"]([^'"]+)['"]/);
 if(!m)throw Error('DEFAULT_API_URL not available in source');
 const url=m[1]+'?action=health';
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(url,{method:'GET',redirect:'follow',signal:controller.signal,cache:'no-store'});
  const body=await response.json();
  return {httpStatus:response.status,ok:body.ok===true,
    schemaVersion:Number(body.schemaVersion||0),
    referencePdfContentReady:body.referencePdfContentReady===true,
    annotationSyncReady:body.annotationSyncReady===true,
    securityDeviceSheetReady:body.securityDeviceSheetReady===true,
    pageFileCount:Number(body.pdfPageFileCount||0),
    caveat:'Live health only; cannot prove the exact deployed Apps Script source revision or authenticated write permission.'};
 }finally{clearTimeout(timer);}
}
if(require.main===module){
 const i=process.argv.indexOf('--root');
 const root=i<0?path.resolve(__dirname,'../../..'):path.resolve(process.argv[i+1]);
 check(root).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error('M1_LIVE_HEALTH_FAILED:',e.message);process.exitCode=2;});
}
module.exports={check};
