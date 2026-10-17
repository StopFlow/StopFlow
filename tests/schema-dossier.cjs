'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {analyze}=require('../scripts/analyze-schema-dossier.cjs');
const {splitOutside}=require('../scripts/audit-migrations.cjs');
const {emptyPostgres}=require('./helpers/reconstruction-db.cjs');
const root=path.resolve(__dirname,'..'),dossier=path.join(root,'docs/schema/references/dossier-2026-10-17');
(async()=>{
 const report=analyze();
 assert.deepEqual(report,JSON.parse(fs.readFileSync(path.join(root,'docs/schema/baseline/STATUS.json'),'utf8')));
 assert.equal(report.status,'BLOCKED_INCOMPLETE_FINAL_STATE_DO_NOT_INSTALL');
 assert.equal(report.counts.exactNameCandidates,18);assert.equal(report.counts.unmatchedRemote,27);
 assert.equal(report.functionReferences.length,9);assert.equal(report.tableReferences.length,19);
 assert(report.functionReferences.some(f=>f.name==='private.current_role'));
 const readiness=spawnSync(process.execPath,['scripts/analyze-schema-dossier.cjs','--check-ready'],{cwd:root,encoding:'utf8'});
 assert.equal(readiness.status,2);assert.match(readiness.stderr,/DO_NOT_INSTALL/);
 const queries=splitOutside(fs.readFileSync(path.join(dossier,'EXTRACTION_CATALOGUES_READONLY.sql'),'utf8')).map(s=>s.text.replace(/^(?:\s|--[^\n]*(?:\n|$))*/,''));
 for(const q of queries)assert.match(q,/^SELECT\b/i,'Evidence extraction must contain SELECT only');
 const server=await emptyPostgres();
 try{
  // Synthetic catalogue fixture only, NOT StopFlow schema or Supabase Auth.
  server.sql(`create role authenticated nologin;create schema private;create schema auth;
   create table auth.users(id uuid primary key);create schema supabase_migrations;
   create table supabase_migrations.schema_migrations(version text,name text);
   create type public.fixture_state as enum('test_only');
   create table public.fixture(id bigint generated always as identity primary key,state public.fixture_state not null);
   alter table public.fixture enable row level security;
   create policy fixture_read on public.fixture for select to authenticated using(true);
   create function public.fixture_trigger() returns trigger language plpgsql as $$begin return new;end$$;
   create trigger fixture_changed before insert on public.fixture for each row execute function public.fixture_trigger();`);
  for(const q of queries)server.sql('begin read only;set local search_path=pg_catalog;'+q+'\nrollback;');
  const output=server.sql(fs.readFileSync(path.join(root,'docs/schema/EXTRACT-FINAL-STATE.sql'),'utf8'));
  assert(output.includes('fixture_read'));assert(output.includes('fixture_trigger'));assert(output.includes('test_only'));
  assert.equal(server.sql('select count(*) from public.fixture'),'0');
 }finally{server.close()}
 console.log(`PASS schema dossier: provenance/hashes, 19 column references, 9 function references, 45/20 migration comparison, readiness blocked, ${queries.length} supplied SELECTs and final-state extraction on isolated PostgreSQL; no reference DDL executed, no GoTrue/PostgREST validation`);
})().catch(error=>{console.error(error);process.exitCode=1});
