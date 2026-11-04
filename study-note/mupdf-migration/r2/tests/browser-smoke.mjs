// R2 real Windows Chrome private acceptance: synthetic API only, no real tokens/PDF/data.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../m3/node_modules/playwright/index.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const html=path.resolve(here,'../../../study-note.html');
const bytes=Buffer.from('%PDF-1.4\nR2 synthetic signed GET fixture');
const payload={ok:true,sourceType:'서브노트',pageToken:'MG:187',
  mime:'application/pdf',size:bytes.length,base64:bytes.toString('base64')};
let signedGets=0,externalBlocked=0,mutations=0,referrerLeaked=0;
const server=http.createServer((req,res)=>{
 const u=req.url?.split('?')[0];
 if(req.method!=='GET'){mutations++;res.writeHead(405);return res.end();}
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(u==='/study-note/study-note.html'){
   res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});
   return fs.createReadStream(html).pipe(res);
 }
 if(u==='/r2-signed-qa'||u==='/r2-bad-qa'){
   signedGets++;if(req.headers.referer)referrerLeaked++;
   const data=u==='/r2-bad-qa'?{...payload,base64:Buffer.from('NOT A PDF').toString('base64'),size:9}:payload;
   res.writeHead(200,{...headers,'Content-Type':'application/json; charset=utf-8'});
   return res.end(JSON.stringify(data));
 }
 res.writeHead(404,headers);res.end('404');
});
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const chrome=process.env.R2_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 if(!fs.existsSync(chrome))throw Error('Authorized Windows Chrome not present');
 browser=await chromium.launch({executablePath:chrome,headless:true,
   args:['--no-first-run','--no-default-browser-check']});
 const context=await browser.newContext({serviceWorkers:'block',
   viewport:{width:1365,height:950},deviceScaleFactor:1});
 await context.route('**/*',route=>{
   if(route.request().url().startsWith(origin+'/'))return route.continue();
   externalBlocked++;return route.abort('blockedbyclient');
 });
 const page=await context.newPage();
 await page.goto(origin+'/study-note/study-note.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof fetchReferencePdfBytesFromServer==='function',{},{timeout:15000});
 const result=await page.evaluate(async()=>{
   referencePdfBackendSourceReady=true;
   hasActiveSecuritySession=()=>true; // Synthetic browser-only authentication.
   buildSignedGetUrl=async()=>location.origin+'/r2-signed-qa';
   const input={sourceType:'서브노트',pageToken:'MG:187'};
   const controller=new AbortController();
   const data=await fetchReferencePdfBytesFromServer(input,{signal:controller.signal});
   if(String.fromCharCode(...data.subarray(0,5))!=='%PDF-')throw Error('Synthetic signed GET bytes invalid');
   buildSignedGetUrl=async()=>location.origin+'/r2-bad-qa';
   let badRejected=false;
   try{await fetchReferencePdfBytesFromServer(input)}catch(e){badRejected=/헤더/.test(e?.message);}
   if(!badRejected)throw Error('Invalid PDF header was accepted');
   let finishSign;
   buildSignedGetUrl=()=>new Promise(resolve=>{finishSign=resolve;});
   const cancelled=new AbortController();
   const pending=fetchReferencePdfBytesFromServer(input,{signal:cancelled.signal});
   cancelled.abort();
   finishSign(location.origin+'/r2-signed-qa');
   let cancellationRejected=false;
   try{await pending}catch(e){cancellationRejected=e?.name==='AbortError';}
   if(!cancellationRejected)throw Error('Superseded signing was not aborted');
   return {successHeader:true,badHeaderRejected:badRejected,
     abortedBeforeHttp:cancellationRejected,oldInkSchema:ANNOTATION_SCHEMA_VERSION};
 });
 await context.close();
 if(signedGets!==2||referrerLeaked!==0||mutations!==0
   ||!result.successHeader||!result.badHeaderRejected||!result.abortedBeforeHttp
   ||result.oldInkSchema!==3)throw Error('R2 browser acceptance invariant failed');
 console.log(JSON.stringify({status:'PASS',chrome:browser.version(),
   actualWindowsChrome:true,syntheticSignedGets:signedGets,externalBlocked,
   referrerLeaked,operatingBackendContacted:false,operatingDataMutations:0,
   syntheticOnly:true,annotationSchema:result.oldInkSchema},null,2));
}finally{
 await browser?.close().catch(()=>{});
 await new Promise(resolve=>server.close(resolve));
}
