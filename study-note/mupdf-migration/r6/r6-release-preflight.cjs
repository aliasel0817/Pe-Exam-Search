'use strict';
// Read-only preflight. Does not release MuPDF assets, mutate production, or log secrets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p));
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const head = git('rev-parse', 'HEAD');
const status = git('status', '--porcelain');
const baseUrl = 'https://github.com/aliasel0817/Pe-Exam-Search/blob/';
const tracked = [
  'study-note.html',
  'mupdf-migration/r5/source/Code.js',
  'mupdf-migration/r5/source/referencePdfContent.js',
  'mupdf-migration/r5/source/appsscript.json',
  'mupdf-migration/r5/source/mupdf-wasm-package-lock.json',
  'mupdf-migration/r4/licenses/AGPL-3.0.txt',
  'mupdf-migration/r5/r5-build-from-source.sh'
];
const files = tracked.map(relative => ({
  path: 'study-note/' + relative,
  sha256: sha256(read(relative)),
  sourceUrl: baseUrl + head + '/study-note/' + relative
}));
const html = read('study-note.html').toString('utf8');
const gate = JSON.parse(read('mupdf-migration/m2/m2-publication-gate.json'));
const approval = JSON.parse(read('mupdf-migration/r4/r4-approval-state.json'));
const source = read('mupdf-migration/r5/source/R5-CORRESPONDING-SOURCE-ACCESS.md').toString('utf8');
const required = {
  noUncommittedChanges: status === '',
  privateViewerGatePresent: html.includes("get('m4-local') === '1'") &&
    html.includes("get('m5-local') === '1'") &&
    html.includes("get('m6-local') === '1'"),
  noPublicSourceOfferAdvertised: source.includes('No actual source offer is activated'),
  m2PublicationGateClosed: !JSON.stringify(gate).includes('"OPEN"') ||
    JSON.stringify(gate).includes('BLOCKED'),
  r4OperatingApprovalNotGranted: !/"(main_merge|deploy|public_distribution|approved)"\s*:\s*true/i.test(JSON.stringify(approval))
};
const manual = [
  'final Artifex/third-party licensing and notices review',
  'current deployed Apps Script source and authorized signed GET plus ink read/write verification',
  'immutable release-specific source offer and matching public JS/WASM release',
  'physical Galaxy Tab S11 and iPhone Safari acceptance, or explicit documented risk disposition',
  'production backup, rollout and rollback verification'
];
const result = { revision: head, status: 'NO_GO', checks: required,
  sourceCandidate: { referenceOnly: true, files },
  blockers: manual, productionChanges: false };
if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
else {
  console.log('R6 non-production preflight:', result.status, 'commit', head);
  Object.entries(required).forEach(([k,v]) => console.log((v ? 'PASS' : 'FAIL') + ' ' + k));
  console.log('Source candidate files:', files.length, 'manual release blockers:', manual.length);
}
if (Object.values(required).some(x=>!x)) process.exitCode=1;