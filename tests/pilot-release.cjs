'use strict';
// Packaging checks only. No Auth, SQL, provisioning or previous scenario replay.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {run, target} = require('../scripts/build-pilot.cjs');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'stopflow-pilot-release-'));
const env = {STOPFLOW_ENVIRONMENT: 'development', STOPFLOW_SUPABASE_URL: target,
  STOPFLOW_SUPABASE_PUBLIC_KEY: 'sb_publishable_pilot_release_fixture_1234567890',
  STOPFLOW_APP_ORIGINS: '[]', VERCEL_ENV: 'preview', VERCEL_URL: 'fixture-pilot.vercel.app',
  VERCEL_PROJECT_ID: 'verified-test-project', STOPFLOW_VERCEL_PROJECT_ID: 'verified-test-project',
  STOPFLOW_PILOT_COMMIT: 'a'.repeat(40)};
try {
  assert.throws(() => run({...env, STOPFLOW_PILOT_COMMIT: undefined}, path.join(folder, 'refused')), /PILOT_COMMIT_REQUIRED/);
  assert(!fs.existsSync(path.join(folder, 'refused')));
  const output = path.join(folder, 'public'); run(env, output);
  const release = JSON.parse(fs.readFileSync(path.join(output, 'pilot-release.json')));
  assert.equal(release.source_commit, 'e160453537460c5b05e501d68d2376724b030317');
  assert.equal(release.pilot_commit, env.STOPFLOW_PILOT_COMMIT);
  assert.equal(release.project_ref, 'mmrdpyhoawwoplbzqwag');
  const index=fs.readFileSync(path.join(output,'index.html'),'utf8');
  assert(index.includes('stopflow-pilot-team.js?v=20261122-controls1'));
  assert(index.includes('stopflow-pilot-team.css?v=20261118-team1'));
  for(const name of ['pilot-install.svg','pilot-inscription.svg']){
    const qr=fs.readFileSync(path.join(output,name),'utf8');assert(qr.startsWith('<svg'));assert(!/(?:href|src)=["']http/.test(qr));
  }
  assert.equal(release.r3_reference.commit,'e160453537460c5b05e501d68d2376724b030317');
  assert.equal(release.r3_reference.assets['stopflow-093-service.js'],'51ea7ea71ea191597438d9cd68f8d82e3057a8bfef7dc10bdbce5c1472a0637a');
  assert.equal(release.edition,'20261122-controls1');
  // The R3 reference stays immutable; service boundaries and optional departure evolve.
  assert.notEqual(release.assets['stopflow-093-service-model.js'],release.r3_reference.assets['stopflow-093-service-model.js']);
  assert.notEqual(release.assets['stopflow-093-service.css'],release.r3_reference.assets['stopflow-093-service.css']); // Action column evolves; immutable R3 reference stays intact.
  assert.notEqual(release.assets['stopflow-093-service.js'],release.r3_reference.assets['stopflow-093-service.js']);
  for (const [name, sha] of Object.entries(release.assets)) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(output, name))).digest('hex'), sha);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.webmanifest')));
  assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/');
  for (const icon of manifest.icons) {
    const bytes = fs.readFileSync(path.join(output, icon.src));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
  }
  const apple = fs.readFileSync(path.join(output, 'pilot-icons/apple-touch-icon.png'));
  assert.equal(apple.readUInt32BE(16), 180); assert.equal(apple.readUInt32BE(20), 180);
  const pwa = fs.readFileSync(path.join(output, 'stopflow-pwa.js'), 'utf8');
  assert(pwa.includes('/pilot-icons/apple-touch-icon.png'));
  assert(!pwa.includes('/api/pwa-icon?size=180'));
  const worker = fs.readFileSync(path.join(output, 'service-worker.js'), 'utf8');
  assert(!worker.includes('supabase.co'));
  console.log(JSON.stringify({resultat: 'PASS', groupes: 4, type: 'PAQUET_PREVIEW_R3_ET_IPAD', navigateur_reel: false}));
} finally { fs.rmSync(folder, {recursive: true}); }
