// Local-only real Chrome/Chromium smoke: no deployment, no user PDFs, no remote API.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {buildSamplePdf} from './fixtures.mjs';
const tests=path.dirname(fileURLToPath(import.meta.url));
const m3=path.dirname(tests);
const repo=path.resolve(m3,'../../..');
const stage=path.join(repo,'.m2-private','staged','mupdf','1.28.1');
const pdfjs=path.join(m3,'node_modules','pdfjs-dist','legacy','build');
const allowed=new Map([
 ['/m3/harness.html',path.join(tests,'harness.html')],
 ...['m3-common.mjs','m3-mupdf.mjs','m3-worker-client.mjs','m3-worker.mjs','m3-pdfjs.mjs'].map(n=>['/m3/'+n,path.join(m3,n)]),
 ...['mupdf.js','mupdf-wasm.js','mupdf-wasm.wasm'].map(n=>['/vendor/mupdf/'+n,path.join(stage,n)]),
 ...['pdf.mjs','pdf.worker.mjs'].map(n=>['/vendor/pdfjs/'+n,path.join(pdfjs,n)])
]);
const types={'.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.html':'text/html; charset=utf-8','.pdf':'application/pdf'};
const pdf=await buildSamplePdf();
const server=http.createServer((req,res)=>{
 const url=req.url;
 if(req.method!=='GET'||url?.includes('?')||url?.includes('#')){res.writeHead(404);return res.end();}
 if(url==='/favicon.ico'){res.writeHead(204);return res.end();}
 if(url==='/sample.pdf'){
   res.writeHead(200,{'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Length':pdf.length});
   return res.end(pdf);
 }
 const file=allowed.get(url);
 if(!file||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 fs.createReadStream(file).pipe(res);
});
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 const chrome=process.env.M3_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 if(!fs.existsSync(chrome))throw Error('Independent Chrome executable missing');
 browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-first-run','--no-default-browser-check']});
 const page=await browser.newPage({viewport:{width:1200,height:1300},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e.message).slice(0,200)));
 page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text().slice(0,220));});
 await page.goto('http://127.0.0.1:'+port+'/m3/harness.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__M3_DONE__===true,null,{timeout:22000});
 const report=await page.evaluate(()=>window.__M3_RESULT__);
 if(report.status!=='PASS')throw Error('Browser-render smoke failure: '+JSON.stringify({report,errors}));
 const output=path.join(repo,'.m3-private','browser-m3-chrome.png');
 fs.mkdirSync(path.dirname(output),{recursive:true});
 await page.screenshot({path:output,fullPage:true});
 console.log(JSON.stringify({run:'local-only-real-chrome',report,errors,
   screenshotPrivate:true,publicPreview:false,operatingSiteModified:false,
   browserVersion:browser.version()},null,2));
} catch(e){console.error('M3_BROWSER_TEST_FAILED:',e.message);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
