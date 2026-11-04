'use strict';
// Read-only Git diff scan for credential-shaped changes in any reachable commit.
// Reports counts/hashes/path names only, never diff contents or matched values.
const cp=require('node:child_process'),path=require('node:path');
const PATTERNS=[
 ['github-token','gh[pousr]_[A-Za-z0-9_]{25,}|github_pat_[A-Za-z0-9_]{25,}'],
 ['google-api-key','AIza[0-9A-Za-z_-]{35}'],
 ['aws-key','(AKIA|ASIA)[0-9A-Z]{16}'],
 ['private-key','BEGIN [A-Z ]*PRIVATE KEY'],
 ['oauth-secret-value','(client_secret|refresh_token|access_token)[[:space:]]*[:=][[:space:]]*["\\047][A-Za-z0-9_+/=-]{20,}']
];
function scanHistory(root){
 const checks=[];
 for(const [name,re] of PATTERNS){
  try {
   // -G includes both added and removed lines. No patch output is requested.
   const stdout=cp.execFileSync('git',['-C',root,'log','--all','--format=COMMIT:%H','--name-only','-G'+re],
     {encoding:'utf8',maxBuffer:40*1024*1024,timeout:90000});
   const hashes=[...new Set([...stdout.matchAll(/^COMMIT:([0-9a-f]{40})$/gm)].map(m=>m[1]))];
   checks.push({kind:name,matchCommitCount:hashes.length,commitIds:hashes.slice(0,5)});
  }catch(e){checks.push({kind:name,error:'git history scan unavailable (code '+(e.status??'?')+')'});}
 }
 return {schema:'mupdf-m1-history-diff-audit-v1',checks,
   scope:'All git-reachable commits, select credential-pattern changed lines only. Does not cover unknown patterns, inaccessible reflogs or deleted nonreachable commits.',
   valuesPrinted:false};
}
if(require.main===module){
 const i=process.argv.indexOf('--root');
 const root=i<0?path.resolve(__dirname,'../../..'):path.resolve(process.argv[i+1]);
 console.log(JSON.stringify(scanHistory(root),null,2));
}
module.exports={scanHistory};
