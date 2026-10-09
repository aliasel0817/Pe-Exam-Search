'use strict';
/*
 * Study Note GCS private MP3 gateway.
 * No speech synthesis and no project credentials in the browser.
 * GET /v1/manifest requires a verified Google Sign-In ID token.
 * GET /v1/audio-url signs an individual manifest-listed object for 5 minutes.
 * Runtime service account only requires objectViewer for the bucket and
 * permission to sign blobs as itself; no downloadable service account key.
 */
const http = require('node:http');

const AUDIO_PATTERN =
  /^ko-KR-Chirp3-HD-(?:Aoede|Kore|Charon)\/T[0-9]{4,6}\/(?:topic|concept|background|necessity|features|components|keywords)-[a-f0-9]{12}(?:-p[0-9]{2})?\.mp3$/;
const INDEX_PREFIX = 'study-note/tts/audio/';
const MAX_INDEX_BYTES = 20 * 1024 * 1024;
const MAX_URLS_PER_MINUTE = 90;

function cleanOrigin(input) {
  if (!input || typeof input !== 'string') return null;
  try {
    const url = new URL(input);
    if (url.pathname !== '/' || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)) return null;
    return url.origin;
  } catch (_) { return null; }
}

function validateSettings(env) {
  const bucket = String(env.TTS_BUCKET || '').trim();
  const clientId = String(env.GOOGLE_WEB_CLIENT_ID || '').trim();
  const emails = String(env.ALLOWED_GOOGLE_EMAILS || '').split(',')
    .map(s => s.trim().toLowerCase()).filter(Boolean);
  const allowedOrigin = cleanOrigin(String(env.TTS_ALLOWED_ORIGIN || 'https://aliasel0817.github.io'));
  if (!/^[a-z0-9][a-z0-9._-]{1,60}[a-z0-9]$/.test(bucket)) throw Error('TTS_BUCKET missing or invalid');
  if (!/^[0-9a-zA-Z._-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw Error('GOOGLE_WEB_CLIENT_ID missing');
  if (!emails.length || emails.some(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) throw Error('ALLOWED_GOOGLE_EMAILS missing');
  if (!allowedOrigin || allowedOrigin !== 'https://aliasel0817.github.io') {
    throw Error('TTS_ALLOWED_ORIGIN must be https://aliasel0817.github.io in production');
  }
  return { bucket, clientId, emails: new Set(emails), allowedOrigin };
}

function createGateway(deps) {
  const { verifyToken, getManifest, signReadUrl, now = () => Date.now(), allowedOrigin } = deps;
  if (typeof verifyToken !== 'function' || typeof getManifest !== 'function' ||
      typeof signReadUrl !== 'function' || !allowedOrigin) throw Error('Gateway dependencies missing');
  const windows = new Map();
  function reply(res, code, data, cache = 'no-store') {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', cache);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify(data));
  }
  return async function handle(req, res) {
    const requestOrigin = req.headers.origin;
    if (requestOrigin && requestOrigin !== allowedOrigin) return reply(res,403,{error:'Origin denied'});
    if (requestOrigin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return reply(res,204,{});
    if (req.method !== 'GET') return reply(res,405,{error:'Method not allowed'});
    let target;
    try { target = new URL(req.url, 'https://gateway.local'); }
    catch (_) { return reply(res,400,{error:'Invalid URL'}); }
    if (target.pathname === '/healthz') return reply(res,200,{status:'ok'});
    if (!['/v1/manifest','/v1/audio-url'].includes(target.pathname)) return reply(res,404,{error:'Not found'});
    const header = String(req.headers.authorization || '');
    const match = /^Bearer ([A-Za-z0-9._-]{80,6000})$/.exec(header);
    if (!match) return reply(res,401,{error:'Google login required'});
    let email;
    try { email = await verifyToken(match[1]); }
    catch (_) { return reply(res,403,{error:'Google authentication failed'}); }
    if (!email) return reply(res,403,{error:'Unauthorized Google account'});
    const userKey = email.toLowerCase();
    const timestamp = now();
    const old = windows.get(userKey);
    const windowState = !old || timestamp >= old.resetAt
      ? {resetAt:timestamp + 60_000, count:0} : old;
    windowState.count += 1;
    windows.set(userKey, windowState);
    if (windowState.count > MAX_URLS_PER_MINUTE) return reply(res,429,{error:'Too many requests'});
    let manifest;
    try { manifest = await getManifest(); }
    catch (err) {
      console.error('GCS manifest read error', err?.name || 'unknown');
      return reply(res,503,{error:'Audio manifest unavailable'});
    }
    if (!manifest || manifest.schemaVersion !== 1 ||
        !manifest.entries || typeof manifest.entries !== 'object' ||
        Array.isArray(manifest.entries)) return reply(res,503,{error:'Invalid audio manifest'});
    if (target.pathname === '/v1/manifest') return reply(res,200,manifest,'private, no-store');
    const relpath = target.searchParams.get('file') || '';
    if (!AUDIO_PATTERN.test(relpath)) return reply(res,400,{error:'Invalid audio path'});
    const allowedFiles = new Set();
    for (const entry of Object.values(manifest.entries)) {
      if (!entry || typeof entry !== 'object') continue;
      const list = Array.isArray(entry.files) ? entry.files : [entry.file];
      for (const name of list) if (typeof name === 'string') allowedFiles.add(name);
    }
    if (!allowedFiles.has(relpath)) return reply(res,404,{error:'Audio not in manifest'});
    try {
      const url = await signReadUrl(relpath);
      const signed = new URL(url);
      if (signed.protocol !== 'https:' ||
          (signed.hostname !== 'storage.googleapis.com' &&
           !signed.hostname.endsWith('.storage.googleapis.com')) ||
          !signed.searchParams.has('X-Goog-Signature')) {
        throw Error('Signed GCS URL invalid');
      }
      return reply(res,200,{url,expiresInSeconds:300},'private, no-store');
    } catch (err) {
      console.error('GCS signing error', err?.name || 'unknown');
      return reply(res,503,{error:'Audio unavailable'});
    }
  };
}

async function startServer(env=process.env) {
  const {Storage} = require('@google-cloud/storage');
  const {OAuth2Client} = require('google-auth-library');
  const conf = validateSettings(env);
  const storage = new Storage();
  const client = new OAuth2Client(conf.clientId);
  const bucket = storage.bucket(conf.bucket);
  let cached = null;
  let loadedAt = 0;
  const manifestPath = INDEX_PREFIX + 'index.json';
  async function getManifest() {
    if (cached && Date.now() - loadedAt < 30_000) return cached;
    const file = bucket.file(manifestPath);
    const [meta] = await file.getMetadata();
    if (Number(meta.size || 0) < 1 || Number(meta.size) > MAX_INDEX_BYTES) {
      throw Error('Manifest size outside safe limit');
    }
    const [bytes] = await file.download();
    if (bytes.length > MAX_INDEX_BYTES) throw Error('Manifest too large');
    const index = JSON.parse(bytes.toString('utf8'));
    cached = index;
    loadedAt = Date.now();
    return index;
  }
  async function verifyToken(token) {
    const ticket = await client.verifyIdToken({idToken:token,audience:conf.clientId});
    const payload = ticket.getPayload();
    if (!payload || payload.email_verified !== true ||
        !conf.emails.has(String(payload.email || '').toLowerCase())) {
      return null;
    }
    return String(payload.email).toLowerCase();
  }
  async function signReadUrl(relpath) {
    const [url] = await bucket.file(INDEX_PREFIX + relpath).getSignedUrl({
      version:'v4', action:'read', expires:Date.now() + 5*60*1000
    });
    return url;
  }
  const handler = createGateway({verifyToken,getManifest,signReadUrl,allowedOrigin:conf.allowedOrigin});
  const port = Number(env.PORT || 8080);
  const server = http.createServer((req,res) => {handler(req,res).catch(() => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    if (!res.writableEnded) res.end('{"error":"Internal error"}');
  });});
  server.listen(port,'0.0.0.0',()=>console.log('TTS GCS gateway listening on port '+port));
  return server;
}

if (require.main === module) {
  startServer().catch(err => {console.error(err?.message || 'Startup failed');process.exitCode=1;});
}
module.exports = {createGateway,validateSettings,AUDIO_PATTERN};
