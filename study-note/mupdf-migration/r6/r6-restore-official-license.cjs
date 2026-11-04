'use strict';
// Restore only checked-in official AGPL copies altered by Windows CRLF checkout.
// Refuse if content differs in any way other than line endings.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../../..');
const official='57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6';
for(const name of ['m2','r4']){
 const rel='study-note/mupdf-migration/'+name+'/licenses/AGPL-3.0.txt';
 const original=cp.execFileSync('git',['-C',repo,'show','HEAD:'+rel],{maxBuffer:1024*1024});
 const hash=crypto.createHash('sha256').update(original).digest('hex');
 if(hash!==official||original.length!==34520)throw Error('AGPL_BLOB_UNEXPECTED_'+name);
 const local=path.join(repo,...rel.split('/')),work=fs.readFileSync(local);
 if(work.equals(original)){console.log(name+' OFFICIAL_LICENSE_ALREADY_MATCHES');continue;}
 if(work.toString('utf8').replace(/\r\n/g,'\n')!==original.toString('utf8'))
   throw Error('AGPL_WORKTREE_HAS_NON_EOL_DIFFERENCES_'+name);
 fs.writeFileSync(local,original);
 console.log(name+' OFFICIAL_LICENSE_WORKTREE_EOL_REPAIRED');
}
