'use strict';
/**
 * Local-only HTTP asset contract probe for M2.
 * Serves exactly 3 allowlisted JS/WASM assets from ignored staged content.
 * This is NOT a public preview or deployment server.
 */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {STAGE}=require('./m2-stage-assets.cjs');
const MAP=require('./m2-runtime-paths.json');
const PREFIX=MAP.plannedBaseUrl;
const ALLOWED=new Set(['mupdf.js','mupdf-wasm.js','mupdf-wasm.wasm']);
function requestHandler(req,res){
 const method=req.method??'GET';
 if(!['GET','HEAD'].includes(method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end();}
 // Reject all query parameters, including signed URLs, before resolving a path.
 if(req.url.includes('?')||req.url.includes('#')){res.writeHead(404);return res.end();}
 if(!req.url.startsWith(PREFIX)){res.writeHead(404);return res.end();}
 const name=req.url.slice(PREFIX.length);
 if(!ALLOWED.has(name)){res.writeHead(404);return res.end();}
 const file=path.join(STAGE,name);
 if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
 const stat=fs.statSync(file);
 res.writeHead(200,{
   'Content-Type':MAP.staticMimes[name],
   'Content-Length':stat.size,
   'Cache-Control':'public, max-age=31536000, immutable',
   'X-M2-NonProduction':'true',
   'X-Content-Type-Options':'nosniff'
 });
 if(method==='HEAD')return res.end();
 fs.createReadStream(file).pipe(res);
}
function createServer(){return http.createServer(requestHandler);}
if(require.main===module){
 const server=createServer();
 server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({
   localOnly:true,port:server.address().port,
   route:PREFIX,status:'NOT_PUBLIC'
 })));
 process.on('SIGINT',()=>server.close());
}
module.exports={createServer,requestHandler,PREFIX,ALLOWED};
