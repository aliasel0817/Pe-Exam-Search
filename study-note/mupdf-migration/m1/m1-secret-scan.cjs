'use strict';
// M1 read-only credential audit. Never prints the values found.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const TEXT_EXT = new Set(['.js','.cjs','.mjs','.ts','.html','.css','.json','.yaml','.yml','.md','.txt','.gs','.xml','.toml','.env','.pem','.key']);
const SKIP_DIR = new Set(['.git','node_modules','.qa-browser','coverage','.m1-private','.issue45-private-realpdf-qa']);
const PATTERNS = [
  ['private-key-pem', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  ['google-api-key', /AIza[0-9A-Za-z_-]{35}/],
  ['github-token', /(?:gh[pousr]_[A-Za-z0-9_]{25,}|github_pat_[A-Za-z0-9_]{25,})/],
  ['aws-access-key', /(?:AKIA|ASIA)[0-9A-Z]{16}/],
  ['slack-token', /xox[baprs]-[A-Za-z0-9-]{24,}/],
  ['generic-secret', /(?:client_secret|api_secret|hmac_secret|signing_secret|refresh_token|access_token|admin_password)\s*[:=]\s*["']([A-Za-z0-9_+/=-]{20,})["']/i],
  ['private-key-json', /["']private_key["']\s*:\s*["'][^"']*?-----BEGIN/]
];
function relativeSafe(root, file) {
  const rel = path.relative(root,file).replace(/\\/g,'/');
  return rel.startsWith('..') ? '[external-backend]/'+path.basename(file) : rel;
}
function fromWalk(root) {
  const out=[];
  function walk(dir) {
    for(const ent of fs.readdirSync(dir,{withFileTypes:true})) {
      if (ent.isDirectory()) { if(!SKIP_DIR.has(ent.name)) walk(path.join(dir,ent.name)); }
      else if(ent.isFile()) out.push(path.join(dir,ent.name));
    }
  }
  walk(root);return out;
}
function trackedAndUntracked(root) {
  try {
    const raw=cp.execFileSync('git',['-C',root,'ls-files','--cached','--others','--exclude-standard','-z'],{maxBuffer:32*1024*1024,stdio:['ignore','pipe','ignore']});
    return [...new Set(raw.toString('utf8').split('\0').filter(Boolean))].map(p=>path.join(root,p));
  } catch (_) { return fromWalk(root); }
}
function isRiskFile(file) {
  const base=path.basename(file).toLowerCase();
  return /(^|\/)\.clasp\.json$/.test(file.replace(/\\/g,'/').toLowerCase()) ||
    /^\.env(?:\.|$)/.test(base) && !/\.example$|\.sample$/.test(base) ||
    /(?:id_rsa|id_ed25519|service-account.*\.json|credentials.*\.json)$/.test(base) ||
    /\.(?:pem|p12|pfx|key)$/.test(base);
}
function scanText(value, label) {
  const findings=[];
  const lines=value.split(/\r?\n/);
  for(let n=0;n<lines.length;n++) {
    for(const [type,regex] of PATTERNS) if(regex.test(lines[n])) findings.push({file:label,line:n+1,type});
  }
  return findings;
}
function scanFiles(root, extra=[]) {
  const findings=[], ignored=[], files=trackedAndUntracked(root);
  for(const file of [...files,...extra]) {
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()) continue;
    const label=relativeSafe(root,file);
    if(isRiskFile(file)) findings.push({file:label,line:null,type:'sensitive-filename'});
    const ext=path.extname(file).toLowerCase();
    if(!TEXT_EXT.has(ext)&&!path.basename(file).startsWith('.env')) continue;
    const size=fs.statSync(file).size;
    if(size>2*1024*1024){ignored.push(label);continue;}
    const text=fs.readFileSync(file,'utf8');
    if(text.includes('\u0000'))continue;
    findings.push(...scanText(text,label));
  }
  return {scannedFiles:files.length+extra.length,findings,oversizeSkipped:ignored};
}
function inspectHistoryPaths(root) {
  try {
    // Name-only history review; this is NOT a complete historical content scan.
    const str=cp.execFileSync('git',['-C',root,'log','--all','--pretty=format:','--name-only'],{encoding:'utf8',maxBuffer:40*1024*1024});
    const names=[...new Set(str.split(/\r?\n/).filter(Boolean))];
    return {reviewedHistoricalPaths:names.length,suspectPaths:names.filter(isRiskFile),contentScanComplete:false};
  }catch(e){return {error:'historical-path-review-failed',contentScanComplete:false};}
}
function audit(root, options={}) {
  const base=path.resolve(root);
  const extra=(options.extra||[]).map(x=>path.resolve(x));
  const result=scanFiles(base,extra);
  const history=options.history?inspectHistoryPaths(base):null;
  return {schema:'mupdf-m1-credentials-v1',rootLabel:path.basename(base),
    scannedFiles:result.scannedFiles,findings:result.findings,
    totalFindings:result.findings.length,oversizeSkipped:result.oversizeSkipped,
    history};
}
function main(argv) {
  const arg=i=>{const n=argv.indexOf(i);return n<0?null:argv[n+1];};
  const root=arg('--root')||path.resolve(__dirname,'../../..');
  const extra=arg('--backend')?[arg('--backend')]:[];
  const res=audit(root,{extra,history:argv.includes('--history')});
  console.log(JSON.stringify(res,null,2));
  if(res.totalFindings>0)process.exitCode=2;
}
if(require.main===module)main(process.argv.slice(2));
module.exports={audit,scanText,isRiskFile,inspectHistoryPaths};
