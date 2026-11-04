'use strict';
// R3 safety scan for a proposed source-offer tree. Scans, never uploads or publishes.
// Finding output contains ONLY path and rule; never prints potentially sensitive contents.
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const denyBasename=/^(?:\.clasp\.json|\.env(?:\..+)?|id_rsa|credentials\.json|token\.json|client_secret(?:_[^/]*)?\.json|service-account(?:-[^/]*)?\.json)$/i;
const denyExtension=/\.(?:wasm|pdf|p12|pfx|pem|key|sqlite|sqlite3|db|jks|keystore|p8|p7b|gif|png|jpe?g|webp|heic|mp4|mov)$/i;
const secretAssignment=/(?:client[_-]?secret|private[_-]?key|session[_-]?key|hmac[_-]?key|api[_-]?key|password|access[_-]?token|refresh[_-]?token)\s*(?:["']?\s*:|=)\s*["'](?:[A-Za-z0-9/_+=.-]{12,}|-----BEGIN)/i;
function normalize(p){return p.split(path.sep).join('/');}
function scanTree(dir,{maxBytes=3*1024*1024}={}){
 const findings=[];let filesChecked=0,symlinks=0;
 function walk(abs,rel){
  for(const entry of fs.readdirSync(abs,{withFileTypes:true})){
   const next=path.join(abs,entry.name),relative=rel?rel+'/'+entry.name:entry.name;
   if(entry.isSymbolicLink()){symlinks++;findings.push({path:relative,rule:'SYMLINK_NOT_ALLOWED'});continue;}
   if(entry.isDirectory()){
    if(entry.name==='.git'||entry.name==='node_modules'||entry.name==='.r3-private'
      ||entry.name==='.m2-private'||entry.name==='.r2-private'){
       findings.push({path:relative,rule:'FORBIDDEN_PRIVATE_DIRECTORY'});continue;
    }
    walk(next,relative);continue;
   }
   if(!entry.isFile()){findings.push({path:relative,rule:'UNSUPPORTED_FILE_TYPE'});continue;}
   filesChecked++;
   if(denyBasename.test(entry.name))findings.push({path:relative,rule:'SENSITIVE_FILENAME'});
   if(denyExtension.test(entry.name))findings.push({path:relative,rule:'NON_SOURCE_BINARY_OR_MEDIA'});
   const st=fs.statSync(next);
   if(st.size>maxBytes){
    findings.push({path:relative,rule:'UNSCANNED_OVERSIZE'});continue;
   }
   if(st.size===0)continue;
   const bytes=fs.readFileSync(next);
   if(bytes.includes(0)){findings.push({path:relative,rule:'BINARY_NON_TEXT'});continue;}
   const value=bytes.toString('utf8');
   if(secretAssignment.test(value))findings.push({path:relative,rule:'POTENTIAL_SECRET_ASSIGNMENT'});
  }
 }
 if(!dir||!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())throw Error('Existing isolated candidate directory required');
 walk(path.resolve(dir),'');
 return {schema:'r3-source-export-audit-v1',filesChecked,symlinks,
   findings,pass:findings.length===0,releasePermission:false,
   notice:'SCAN_IS_NOT_LEGAL_APPROVAL_OR_PROOF_NO_SECRETS'};
}
function scanGitIndex(root){
 const data=cp.execFileSync('git',['-C',root,'ls-files','-z'],{encoding:'utf8'});
 const paths=data.split('\0').filter(Boolean).map(p=>p.replaceAll('\\','/'));
 const blocked=paths.filter(p=>(p.endsWith('.wasm')&&p!=='study-note/vendor/mupdf/1.28.1/mupdf-wasm.wasm')||p.includes('/.r3-private/')
   ||p.includes('/.m2-private/')||p.includes('/.r2-private/')
   ||/(^|\/)\.clasp\.json$/i.test(p)||/\.p12$|\.pem$|\.env$/i.test(p));
 return {trackedFiles:paths.length,blockedPaths:blocked,pass:blocked.length===0};
}
if(require.main===module){
 try{
   const target=process.argv[2];
   if(!target)throw Error('Usage: node r3-source-export-audit.cjs <proposal-directory> [repo-root]');
   const report=scanTree(target);
   const gitReport=process.argv[3]?scanGitIndex(process.argv[3]):null;
   console.log(JSON.stringify({...report,gitIndex:gitReport},null,2));
   if(!report.pass||(gitReport&&!gitReport.pass))process.exitCode=2;
 }catch(error){console.error('R3 source export audit FAILED: '+error.message);process.exitCode=3;}
}
module.exports={scanTree,scanGitIndex};
