'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inventory,splitOutside}=require('../scripts/audit-migrations.cjs');
const {emptyPostgres}=require('./helpers/reconstruction-db.cjs');
const root=path.resolve(__dirname,'..');
const platform=`create schema auth;create table auth.users(id uuid primary key,email text,invited_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon,service_role;`;
(async()=>{
  const audit=inventory();
  assert.deepEqual(audit,JSON.parse(fs.readFileSync(path.join(root,'docs/schema/INVENTORY.json'),'utf8')),'Regenerate the versioned inventory when source migrations change');
  assert.equal(audit.active.length,20);assert.equal(audit.active.filter(f=>f.path.includes('reservations_foundation')).length,1);
  assert(audit.relationsWithoutCreate.includes('public.profiles'));assert(audit.relationsWithoutCreate.includes('public.articles'));
  assert(audit.functionsWithoutStaticCreate.includes('private.is_active_user'));
  assert.equal(splitOutside("select ';'; do $body$ begin perform ';'; end $body$; -- ignored ;\nselect 1;").length,3);
  const server=await emptyPostgres();
  try{
    server.sql('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;');
    const outcomes=[];
    for(const [database,setup] of [['blank',''],['auth_only',platform],['auth_private',platform+'create schema private;']]){
      server.sql('create database '+database);if(setup)server.sql(setup,database);
      let failure;
      for(const file of audit.migrationOrder){
        try{server.sql(fs.readFileSync(path.join(root,file),'utf8'),database)}catch(error){failure={database,file,sqlstate:error.code,message:error.message};break}
      }
      assert(failure,'The repository must not be announced reconstructible from an incomplete base');outcomes.push(failure);
    }
    assert.equal(outcomes[0].sqlstate,'3F000');assert.match(outcomes[0].message,/auth/);
    assert.match(outcomes[1].message,/private/);assert.match(outcomes[2].message,/is_active_user/);
    server.sql('create database module_without_profiles');server.sql(platform+'create schema private;','module_without_profiles');
    const module=fs.readFileSync(path.join(root,'supabase/migrations/20261017120000_stopflow_reservations_foundation.sql'),'utf8');
    assert.throws(()=>server.sql(module,'module_without_profiles'),error=>error.code==='42P01'&&/profiles/.test(error.message));
    assert.equal(server.sql("select count(*) from pg_tables where schemaname='public' and tablename like 'reservation_%'",'module_without_profiles'),'0','Migration failure must roll back all module tables');
    server.sql('create database module_contract');server.sql(platform+`create schema private;create table public.profiles(id uuid primary key references auth.users(id),role text not null,actif boolean not null);`,'module_contract');
    server.sql(module,'module_contract');
    const metadata=JSON.parse(server.sql(fs.readFileSync(path.join(root,'supabase/development/40-inspect-schema-metadata.sql'),'utf8'),'module_contract'));
    assert.equal(metadata.relations.filter(r=>r.name.startsWith('reservation_')).length,7);
    assert(metadata.functions.some(f=>f.name==='reservations_context'&&f.securityDefiner));
    assert(!JSON.stringify(metadata).includes('request.jwt.claim.sub'),'Function bodies must not be exported');
    // Phase 2 deliberately includes bodies: review privately before sharing.
    const finalState=server.sql(fs.readFileSync(path.join(root,'docs/schema/EXTRACT-FINAL-STATE.sql'),'utf8'),'module_contract');
    for(const section of ['relations|','columns|','constraints|','indexes|','functions|','triggers|','policies|','types|','dependencies|'])assert(finalState.includes(section),'Missing extraction section: '+section);
    assert.throws(()=>server.sql('begin read only;create table public.forbidden_write(id int);commit;','module_contract'),error=>error.code==='25006');
    const id='10000000-0000-4000-8000-000000000099';
    server.sql(`insert into auth.users values('${id}','qa.contract@stopflow.invalid',null);insert into public.profiles values('${id}','admin',true);`,'module_contract');
    assert.equal(server.sql(`select count(*) from public.reservation_establishments`,'module_contract'),'0','The module must not seed restaurant data');
    assert.equal(server.sql(`select count(*) from pg_tables where schemaname='public' and tablename like 'reservation_%'`,'module_contract'),'7');
    assert.throws(()=>server.sql(`select public.reservations_context()`,'module_contract'),error=>error.code==='42501','A database owner with no user context must not implicitly gain access');
    assert.equal(server.sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${id}';select public.reservations_context()->'establishments';commit;`,'module_contract'),'[]','Even a fictitious active admin needs explicit membership');
    console.log(JSON.stringify({reconstruction:'BLOCKED_AS_EXPECTED',outcomes,module:'Real migration succeeds only with an explicitly PARTIAL Auth/profiles contract; no GoTrue/PostgREST or complete baseline validated'},null,2));
  }finally{server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
