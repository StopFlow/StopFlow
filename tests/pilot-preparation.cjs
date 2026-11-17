'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const {run, target} = require('../scripts/build-pilot.cjs');
let count = 0;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stopflow-pilot-build-'));
const env = {STOPFLOW_ENVIRONMENT: 'development', STOPFLOW_SUPABASE_URL: target,
  STOPFLOW_SUPABASE_PUBLIC_KEY: 'sb_publishable_pilot_fixture_20261117_1234567',
  STOPFLOW_APP_ORIGINS: '["https://pilot-fixture.example"]'};
try {
  for (const patch of [
    {STOPFLOW_ENVIRONMENT: 'production'},
    {STOPFLOW_SUPABASE_URL: 'https://gjwvquhoecfikjorapud.supabase.co'},
    {STOPFLOW_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co'},
    {VERCEL_ENV: 'production'},
  ]) {
    const output = path.join(temporary, 'refused-' + count);
    assert.throws(() => run({...env, ...patch}, output));
    assert(!fs.existsSync(output)); count++;
  }
  const output = path.join(temporary, 'approved');
  run({...env, SUPABASE_SERVICE_ROLE_KEY: 'SERVER_KEY_CANARY'}, output);
  const artifact = fs.readdirSync(output).map(n => fs.readFileSync(path.join(output, n), 'utf8')).join('\n');
  assert(!artifact.includes('SERVER_KEY_CANARY'));
  assert(!artifact.includes('https://gjwvquhoecfikjorapud.supabase.co'));
  assert(fs.readFileSync(path.join(output, 'index.html'), 'utf8').includes('stopflow-pilot.js?v=20261117-pilot1'));
  assert(fs.readFileSync(path.join(output, 'stopflow-environment-config.js'), 'utf8').includes(target)); count++;
  const headers = require('../vercel.json').headers.find(x => x.source === '/(.*)').headers;
  const csp = headers.find(x => x.key === 'Content-Security-Policy').value;
  const connect = csp.split(';').find(x => x.trim().startsWith('connect-src'));
  assert(connect.includes(target)); assert(!connect.includes('gjwvquhoecfikjorapud')); assert(!connect.includes('*')); count++;
} finally { fs.rmSync(temporary, {recursive: true}); }

function harness() {
  let handler, actor = 'employee-a', mode = 'success', writes = 0;
  const store = new Map(), submitted = [];
  const fields = {sugTitle: {value: 'Idée fictive'}, sugDesc: {value: 'Description fictive'},
    sugCategory: {value: 'Application'}, sugPriority: {value: 'Normale'}};
  const button = {disabled: false}; let box;
  const form = {id: 'suggestionForm', reportValidity: () => true,
    querySelector(selector) {
      if (selector === '[data-pilot-idea-status]') return box;
      if (selector.startsWith('#')) return fields[selector.slice(1)];
      return button;
    }, appendChild(value) {box = value;}, reset() {fields.sugTitle.value = ''; fields.sugDesc.value = '';}};
  const window = {stopflowEnvironment: {environment: 'development', supabaseUrl: target}};
  const context = {window, session: {id: actor, authMode: 'supabase'}, crypto: webcrypto,
    sessionStorage: {getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k)},
    document: {addEventListener: (name, fn, capture) => {assert.equal(name, 'submit'); assert.equal(capture, true); handler = fn;},
      createElement: () => ({dataset: {}, setAttribute() {}, textContent: ''})},
    supabaseClient: {
      async rpc(name, args) {
        assert.equal(name, 'pilot_share_idea'); submitted.push(args);
        if (mode === 'failure') return {error: {code: '42501'}};
        if (!writes) writes++;
        if (mode === 'lost') throw Error('synthetic loss');
        return {data: {id: args.p_id}};
      },
      from(name) {
        assert.equal(name, 'pilot_ideas'); let id;
        const chain = {select: () => chain, eq: (key, value) => {assert.equal(key, 'id'); id = value; return chain;},
          single: async () => ({data: {id}})}; return chain;
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../stopflow-pilot.js'), 'utf8'), context);
  return {context, store, submitted, fields, mode: value => {mode = value;},
    send: async () => {let intercepted = 0; await handler({target: form, preventDefault() {intercepted++;}, stopImmediatePropagation() {intercepted++;}}); assert.equal(intercepted, 2);},
    status: () => box?.textContent || '', writes: () => writes};
}
(async () => {
  const success = harness(); await success.send();
  assert(success.status().includes('envoyée et relue')); assert.equal(success.store.size, 0);
  assert.equal(success.fields.sugTitle.value, ''); count++;
  const lost = harness(); lost.mode('lost'); await lost.send();
  const original = [...lost.store.values()][0]; assert(original); assert.equal(lost.fields.sugTitle.value, 'Idée fictive');
  lost.mode('failure'); await lost.send(); assert.equal([...lost.store.values()][0], original);
  lost.mode('success'); await lost.send();
  assert.equal(lost.writes(), 1); assert.equal(lost.store.size, 0);
  assert.equal(new Set(lost.submitted.map(x => x.p_id)).size, 1); count++;
  const changed = harness(); changed.mode('lost'); await changed.send();
  changed.fields.sugTitle.value = 'Saisie plus récente'; await changed.send();
  assert.equal(changed.submitted.length, 1); assert.equal(changed.fields.sugTitle.value, 'Saisie plus récente'); count++;
  const blocked = harness(); blocked.context.window.stopflowEnvironment.supabaseUrl = 'https://gjwvquhoecfikjorapud.supabase.co';
  await blocked.send(); assert.equal(blocked.submitted.length, 0); count++;
  console.log(JSON.stringify({resultat: 'PASS', groupes: count, moteur: 'BUILD_ET_DOM_SIMULES', navigateur: false, auth_reelle: false}));
})().catch(error => {console.error(error); process.exitCode = 1;});
