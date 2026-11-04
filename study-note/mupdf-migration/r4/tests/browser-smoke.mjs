// R4 on-device Windows Chrome: notice preview only, synthetic/no authenticated PDF.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../m3/node_modules/playwright/index.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const study=path.resolve(here,'../../..');
const required=new Set(['/study-note.html',
 '/mupdf-migration/r4/r4-license-notice.js',
 '/mupdf-migration/r4/licenses/AGPL-3.0.txt']);
const names={
 '/study-note.html':path.join(study,'study-note.html'),
 '/mupdf-migration/r4/r4-license-notice.js':path.resolve(here,'../r4-license-notice.js'),
 '/mupdf-migration/r4/licenses/AGPL-3.0.txt':path.resolve(here,'../licenses/AGPL-3.0.txt'),
};
let externalRequestsBlocked=0,operatingServerRequests=0,mutations=0;
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'){mutations++;res.writeHead(405);return res.end();}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(required.has(pathname)){
  const filename=names[pathname];
  res.writeHead(200,{'Content-Type':pathname.endsWith('.html')?'text/html; charset=utf-8':
   pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/plain; charset=utf-8'});
  return fs.createReadStream(filename).pipe(res);
 }
 res.writeHead(404);res.end('404');
});
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const chrome=process.env.R4_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 if(!fs.existsSync(chrome))throw new Error('Authorized Windows Chrome not installed');
 browser=await chromium.launch({executablePath:chrome,headless:true,
  args:['--no-first-run','--no-default-browser-check']});
 const context=await browser.newContext({serviceWorkers:'block',
  viewport:{width:1365,height:920},deviceScaleFactor:1});
 await context.route('**/*',route=>{
  if(route.request().url().startsWith(origin+'/'))return route.continue();
  externalRequestsBlocked++;
  return route.abort('blockedbyclient');
 });
 const page=await context.newPage();
 await page.goto(origin+'/study-note.html',{waitUntil:'domcontentloaded'});
 const nonPrivateCount=await page.locator('#r4-private-notice').count();
 if(nonPrivateCount!==0)throw new Error('Notice exposed without private loopback opt-in');
 await page.goto(origin+'/study-note.html?m4-local=1',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#r4-private-notice',{timeout:15000});
 const summary=page.locator('#r4-private-notice summary');
 await summary.click();
 const result=await page.evaluate(()=>{
  const root=document.getElementById('r4-private-notice');
  return {rootPresent:!!root,summary:root?.querySelector('summary')?.textContent,
   fullLicenseHref:root?.querySelector('a')?.getAttribute('href'),
   status:document.getElementById('r4-source-offer-status')?.textContent,
   sourceOfferCount:root?.querySelectorAll('#r4-source-offer-link')?.length,
   popupOpen:root?.open,
   oldAnnotationVersion:typeof ANNOTATION_SCHEMA_VERSION==='undefined'?null:ANNOTATION_SCHEMA_VERSION,
  };
 });
 if(!result.rootPresent||!result.popupOpen||result.sourceOfferCount!==0
   ||!result.status?.includes('보류')
   ||!result.fullLicenseHref?.endsWith('AGPL-3.0.txt')
   ||result.oldAnnotationVersion!==3)
   throw new Error('Private notice did not preserve gated license and schema invariants: '+JSON.stringify(result));
 const licenseResponse=await page.request.get(origin+'/mupdf-migration/r4/licenses/AGPL-3.0.txt');
 if(licenseResponse.status()!==200)throw new Error('License text is unavailable');
 const licenseText=await licenseResponse.text();
 if(!licenseText.includes('GNU AFFERO GENERAL PUBLIC LICENSE'))
   throw new Error('Official license text missing');
 await context.close();
 if(operatingServerRequests!==0||mutations!==0)throw new Error('Unexpected production/mutation call');
 console.log(JSON.stringify({status:'PASS',physicalWindowsChrome:true,
  chromeVersion:browser.version(),syntheticOnly:true,operatingServerRequests,
  operatingDataWrites:mutations,externalRequestsBlocked,normalPageNoticeHidden:nonPrivateCount===0,
  loopbackNoticeShown:result.rootPresent,
  licenseTextServed:true,falseSourceOfferCount:result.sourceOfferCount,
  annotationSchema:result.oldAnnotationVersion,
  realGalaxyTab:'NOT_VERIFIED',realIphoneSafari:'NOT_VERIFIED'},null,2));
}finally{
 await browser?.close().catch(()=>{});
 await new Promise(resolve=>server.close(resolve));
}
