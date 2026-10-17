/* Received sanitized functions on a PARTIAL disposable PostgreSQL contract.
 * MOCK Auth; no final schema, remote connection or permanent identity mapping. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {splitOutside}=require('../scripts/audit-migrations.cjs');
const {emptyPostgres}=require('./helpers/reconstruction-db.cjs');
const root=path.resolve(__dirname,'..'),dir='docs/schema/references/mission-1.9/';
const mission21=process.argv.includes('--mission21');
const mission20=(process.argv.includes('--mission20')||mission21)?require('./helpers/mission20-profile-contract.cjs'):null;
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const statements=p=>splitOutside(read(p)).map(s=>s.text.replace(/^(?:\s|--[^\n]*(?:\n|$))*/,'')).filter(s=>s.trim());
const find=(p,pattern)=>{const matches=statements(p).filter(s=>pattern.test(s));assert.equal(matches.length,1,'Ambiguous/missing source: '+pattern);return matches[0]};
(async()=>{
 for(const p of JSON.parse(read(dir+'PROVENANCE.json')).files)assert.equal(crypto.createHash('sha256').update(read(dir+p.file)).digest('hex'),p.sha256);
 const functions=[...statements(dir+'TRIGGERS_PROFILES_REFERENCE.sql'),...statements(dir+'FONCTIONS_ADMINISTRATIVES_REFERENCE.sql')];
 assert.equal(functions.length,6);
 const identities=new Set(functions.flatMap(s=>[...s.matchAll(/[a-z-]+@example\.invalid/g)].map(m=>m[0])));
 assert.deepEqual([...identities].sort(),['admin-test@example.invalid','responsable-test@example.invalid']);
 const db=await emptyPostgres();const sql=s=>db.sql('set statement_timeout=3000;'+s);
 try{
  sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
   create schema private;create schema auth;create table auth.users(id uuid primary key,email text,invited_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,private to authenticated;`);
  const profileSource='docs/schema/references/mission-1.8/PROFILES_ACTUAL_REFERENCE.sql';
  sql(find(profileSource,/^CREATE TABLE public.profiles\b/i));
  const columnSource='docs/schema/references/dossier-2026-10-17/19_TABLES_COLONNES_REFERENCE.sql';
  for(const table of ['profile_departments','deleted_user_identities','user_admin_events'])sql(find(columnSource,new RegExp('^CREATE TABLE public\\.'+table+'\\b','i')));
  const permissionSource='supabase/migrations/20260809074438_stopflow_070_profile_permissions_foundation.sql';
  sql(find(permissionSource,/^create table if not exists public.profile_permissions\b/i));
  let helperHashes;
  if(mission20){mission20.verify();mission20.structure(sql);helperHashes=mission20.helpers(sql)}
  else {
  sql(find('supabase/migrations/20260805143900_stopflow_060_department_security.sql',/^create or replace function private.is_operational_department\(/i));
  sql(find('docs/schema/references/stopflow_fonctions_manquantes_reference.sql',/^CREATE OR REPLACE FUNCTION private.is_admin\(/i));
  // Real local helper, not yet verified against final Production definition.
  sql(find('supabase/migrations/20260809074647_stopflow_070_permission_rls.sql',/^create or replace function private.sync_legacy_profile_permissions\(/i));
  }
  for(const f of functions)sql(f);
  for(const s of statements(profileSource).filter(s=>/^ALTER TABLE|^CREATE POLICY|^CREATE TRIGGER/i.test(s)))sql(s);
  sql(read('docs/schema/references/mission-1.8/HANDLE_NEW_USER_AND_AUTH_TRIGGER_REFERENCE.sql'));
  // Explicit documented ACLs / platform-16-compatible subset for profiles.
  sql('revoke all on function private.protect_core_accounts() from public,anon,authenticated,service_role;');
  sql('revoke all on function public.handle_new_user() from public,anon,authenticated;grant execute on function public.handle_new_user() to service_role;');
  for(const signature of ['admin_set_user_access(uuid,text,text,text,boolean,text,text[])','admin_set_user_profile_permissions_070(uuid,text,text,text,boolean,jsonb,text)'])sql(`revoke all on function public.${signature} from public,anon;grant execute on function public.${signature} to authenticated,service_role;`);
  sql('grant select,insert,update,delete on public.profiles to authenticated;');
  // Restrictive fixture only: do not invent final departmental/audit RLS policies.
  for(const table of ['profile_departments','profile_permissions','user_admin_events','deleted_user_identities'])sql('alter table public.'+table+' enable row level security;');
  if(mission20)mission20.security(sql);
  const ids=Array.from({length:7},(_,i)=>'19000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
  const [admin,manager,operator,employee,inactive,auditTarget,noAudit]=ids;
  for(let i=0;i<ids.length;i++)sql(`insert into auth.users(id,email) values('${ids[i]}','${i===0?'admin-test@example.invalid':i===1?'responsable-test@example.invalid':'ordinary'+i+'@example.invalid'}');`);
  sql(`update public.profiles set role='admin',departement='bureau' where id in ('${admin}','${operator}','${inactive}');update public.profiles set role='responsable',departement='bureau' where id='${manager}';update public.profiles set actif=false where id='${inactive}';`);
  // ON CONFLICT requires a real unique contract, not merely columns.
  if(!mission20){
  assert.throws(()=>sql(`update public.profiles set departement='salle' where id='${employee}'`),e=>e.code==='42P10');
  assert.equal(sql(`select departement is null from public.profiles where id='${employee}'`),'t');
  // Test-only prerequisite derived from the function's explicit conflict target.
  // Production constraint name/type/DDL remains to be exported and compared.
  sql('alter table public.profile_departments add constraint fixture_only_department_unique unique(profile_id,department);');
  }
  sql(`update public.profiles set departement='salle' where id='${employee}';update public.profiles set departement='salle' where id='${employee}';`);
  assert.equal(sql(`select count(*) from public.profile_departments where profile_id='${employee}'`),'1');
  if(mission20)assert.throws(()=>sql(`insert into public.profile_departments(profile_id,department,is_primary) values('${employee}','cuisine',true)`),e=>e.code==='23505');
  sql(`update public.profiles set departement='cuisine' where id='${employee}'`);
  assert.equal(sql(`select department from public.profile_departments where profile_id='${employee}' and is_primary`),'cuisine');
  sql(`update public.profiles set actif=false where id='${employee}'`);
  assert.equal(sql(`select count(*) from public.profile_departments where profile_id='${employee}' and is_primary`),'1','Inactive employee assignments are NOT cleared by the supplied trigger');
  sql(`update public.profiles set role='responsable',actif=true,departement='bureau' where id='${employee}'`);
  assert.equal(sql(`select count(*) from public.profile_departments where profile_id='${employee}' and is_primary`),'0');
  sql(`update public.profiles set role='admin' where id='${employee}'`);
  assert.equal(sql(`select count(*) from public.profile_departments where profile_id='${employee}' and is_primary`),'0');
  sql(`update public.profiles set role='employe',departement='salle' where id='${employee}'`);
  const asUser=(id,body,role='authenticated')=>sql(`begin;set local role ${role};set local request.jwt.claim.sub='${id}';${body};commit;`);
  for(const [id,role] of [[admin,'admin'],[manager,'responsable']]){
   for(const change of ["actif=false",`role='employe'`,"email='renamed@example.invalid'"])assert.throws(()=>asUser(operator,`update public.profiles set ${change} where id='${id}'`),e=>e.code==='P0001');
   asUser(operator,`update public.profiles set prenom='Prénom permis',nom='Nom permis' where id='${id}'`);
   assert.equal(sql(`select role||'|'||actif from public.profiles where id='${id}'`),role+'|true');
   const legacy=`select public.admin_set_user_access('${id}','Test','Nom','employe',false,'salle',array['salle'])`;
   const modern=`select public.admin_set_user_profile_permissions_070('${id}','Test','Nom','employe',false,'[]'::jsonb,'update')`;
   asUser(operator,legacy);asUser(operator,modern);
   assert.equal(sql(`select role||'|'||actif from public.profiles where id='${id}'`),role+'|true','RPCs coerce protected role/active instead of rejecting the call');
  }
  assert.equal(sql(`select count(*) from public.profile_permissions where profile_id='${manager}'`),'0','Protected role/active do not freeze granular permissions');
  for(const signature of ['private.protect_main_admin()','private.stopflow_060_audit_profile_delete()','private.stopflow_060_sync_primary_assignment()'])assert.equal(sql(`select has_function_privilege('authenticated','${signature}','execute')`),'t','NULL function ACL uses default EXECUTE; not no privileges');
  assert.equal(sql("select has_function_privilege('authenticated','private.protect_core_accounts()','execute')"),'f');
  assert.equal(sql("select count(*) from pg_trigger where not tgisinternal and tgfoid='private.protect_main_admin()'::regprocedure"),'0','Historical function must not silently become an extra active trigger');
  // Exercise the historical trigger function on a separate synthetic probe table,
  // never attach it to profiles alongside the current protection.
  sql(`create table public.fixture_legacy_probe(email text,role text,actif boolean);
   insert into public.fixture_legacy_probe values('admin-test@example.invalid','admin',true),('responsable-test@example.invalid','responsable',true);
   create trigger fixture_legacy_only before update on public.fixture_legacy_probe for each row execute function private.protect_main_admin();`);
  assert.throws(()=>sql("update public.fixture_legacy_probe set actif=false where role='admin'"),e=>e.code==='P0001');
  sql("update public.fixture_legacy_probe set actif=false where role='responsable'");
  assert.equal(sql("select actif from public.fixture_legacy_probe where role='responsable'"),'f','Historical guard protects only admin, unlike current core guard');
  const legacyOrdinary=`select public.admin_set_user_access('${employee}','Normal','Test','employe',true,'cuisine',array['cuisine','salle'])`;
  const ordinaryPermissions=mission20?'[{"permission_key":"lunchs.manage","scope":"cuisine"},{"permission_key":"temperatures.readings.use","scope":"cuisine"},{"permission_key":"temperatures.equipment.manage","scope":"cuisine"}]':'[{"permission_key":"lunchs.manage","scope":"cuisine"}]';
  const modernOrdinary=`select public.admin_set_user_profile_permissions_070('${employee}','Normal','Test','employe',true,'${ordinaryPermissions}'::jsonb,'update')`;
  for(const body of [legacyOrdinary,modernOrdinary]){
   for(const id of [manager,employee,inactive])assert.throws(()=>asUser(id,body),e=>e.code==='42501');
   assert.throws(()=>asUser(employee,body,'anon'),e=>e.code==='42501');
   asUser(operator,body);
  }
  assert.equal(sql(`select count(*) from public.profile_permissions where profile_id='${employee}' and permission_key in ('lunchs.manage','lunchs.view')`),'2');
  const before=sql(`select jsonb_agg(to_jsonb(p) order by permission_key,scope) from public.profile_permissions p where profile_id='${employee}'`);
  assert.throws(()=>asUser(operator,`select public.admin_set_user_profile_permissions_070('${employee}','Normal','Test','employe',true,'[{"permission_key":"invalid","scope":"global"}]'::jsonb,'update')`),e=>e.code==='23514');
  assert.equal(sql(`select jsonb_agg(to_jsonb(p) order by permission_key,scope) from public.profile_permissions p where profile_id='${employee}'`),before,'Invalid permission must roll back deletes');
  assert.throws(()=>asUser(operator,`select public.admin_set_user_profile_permissions_070('${employee}','','','employe',true,'{}'::jsonb)`),e=>e.code==='22023');
  asUser(operator,`update public.profiles set email='ordinary-renamed@example.invalid',actif=false where id='${employee}'`);
  assert.equal(sql(`select actif from public.profiles where id='${employee}'`),'f');
  if(mission20){
   assert.equal(sql(`select count(*) from public.profile_permissions where profile_id='${employee}' and permission_key like 'temperatures.%'`),'2');
   assert.throws(()=>sql(`insert into public.deleted_user_identities(former_user_id,email,deleted_by) values('${auditTarget}','old@example.invalid','${manager}'),('${auditTarget}','latest@example.invalid','${operator}')`),e=>e.code==='23505');
   sql(`insert into public.deleted_user_identities(former_user_id,email,deleted_by) values('${auditTarget}','latest@example.invalid','${operator}');delete from public.profiles where id='${auditTarget}';`);
  }else sql(`insert into public.deleted_user_identities(former_user_id,email,deleted_by,deleted_at) values('${auditTarget}','old@example.invalid','${manager}','2026-01-01'),('${auditTarget}','latest@example.invalid','${operator}','2026-02-01');delete from public.profiles where id='${auditTarget}';`);
  assert.equal(sql(`select actor_user_id||'|'||(target_user_id is null)||'|'||action from public.user_admin_events where action='delete'`),operator+'|true|delete');
  const count=sql("select count(*) from public.user_admin_events where action='delete'");
  sql(`delete from public.profiles where id='${noAudit}'`);
  assert.equal(sql("select count(*) from public.user_admin_events where action='delete'"),count,'No deleted identity means no delete event in supplied function');
  // Demonstrate scope of protection without permanently removing fixture identity.
  assert.equal(sql(`begin;delete from public.profiles where id='${admin}';select count(*) from public.profiles where id='${admin}';rollback;`),'0','UPDATE trigger does not prevent privileged DELETE');
  assert.equal(sql(`select count(*) from public.profiles where id='${admin}'`),'1');
  if(mission20){
   assert.equal(sql("select count(*) from information_schema.columns where table_schema='public' and table_name in ('profile_departments','profile_permissions','deleted_user_identities','user_admin_events')"),'25');
   assert.equal(sql("select count(*) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profile_departments','profile_permissions','deleted_user_identities','user_admin_events')"),'15');
   assert.equal(sql("select count(*) from pg_policies where schemaname='public' and tablename in ('profile_departments','profile_permissions','deleted_user_identities','user_admin_events')"),'7');
   assert.equal(sql("select count(*) from pg_indexes where schemaname='public' and tablename in ('profile_departments','profile_permissions','deleted_user_identities','user_admin_events')"),'14');
   sql(`insert into public.profile_departments(profile_id,department,is_primary) values('${manager}','cuisine',false)`);
   assert.equal(sql(`select count(*) from public.profile_departments where profile_id='${manager}'`),'1');
   assert.equal(asUser(employee,`select count(*) from public.profile_departments where profile_id='${manager}'`),'0');
   assert.equal(asUser(employee,'select count(*) from public.user_admin_events'),'0');
   assert(Number(asUser(operator,'select count(*) from public.user_admin_events'))>0);
   assert.equal(asUser(employee,'select count(*) from public.deleted_user_identities'),'0');
   assert.equal(asUser(operator,'select count(*) from public.deleted_user_identities'),'1');
   assert.throws(()=>asUser(operator,`insert into public.deleted_user_identities(email) values('blocked@example.invalid')`),e=>e.code==='42501');
   assert.throws(()=>asUser(operator,"insert into public.user_admin_events(action) values('update')"),e=>e.code==='42501');
   assert.throws(()=>asUser(operator,`insert into public.profile_permissions(profile_id,permission_key,scope) values('${manager}','ideas.share','global')`),e=>e.code==='42501','Table ACL denies direct DML even to admin JWT');
   assert.equal(asUser(employee,`select private.user_has_department('${employee}','cuisine')`),'t','This helper does not check inactive status');
   // SQL-role observation only: private schema is not presumed exposed by REST.
   asUser(employee,`select private.sync_legacy_profile_permissions('${manager}')`);
   assert(Number(sql(`select count(*) from public.profile_permissions where profile_id='${manager}'`))>0,'Default EXECUTE permits resync of another profile even by inactive caller');
   const before=sql('select count(*) from public.profile_departments');assert(Number(before)>0);
   assert.equal(sql('begin;set local role authenticated;truncate public.profile_departments;reset role;select count(*) from public.profile_departments;rollback;'),'0','RLS does not filter TRUNCATE');
   assert.equal(sql('select count(*) from public.profile_departments'),before);
   if(mission21){
    const proposal=read('supabase/proposals/20261017_least_privilege_REVIEW_ONLY.sql');
    sql('alter default privileges for role postgres in schema public grant all on tables to authenticated,anon;');
    // Global defaults cannot be undone by a schema-scoped REVOKE. Refuse silently
    // broadening the change to all schemas and confirm atomic failure.
    sql('alter default privileges for role postgres grant select on tables to authenticated;');
    assert.throws(()=>sql(proposal),e=>/GLOBAL_TABLE_DEFAULTS_REQUIRE_EXPLICIT_REVIEW/.test(e.message));
    assert.equal(sql("select has_table_privilege('authenticated','public.profile_departments','truncate')"),'t');
    sql('alter default privileges for role postgres revoke select on tables from authenticated;');
    sql('create role fixture_truncate_holder nologin;grant fixture_truncate_holder to authenticated;alter default privileges for role postgres in schema public grant select on tables to fixture_truncate_holder;');
    assert.throws(()=>sql(proposal),e=>/INHERITED_PUBLIC_DEFAULTS_REQUIRE_EXPLICIT_REVIEW/.test(e.message));
    sql('alter default privileges for role postgres in schema public revoke select on tables from fixture_truncate_holder;grant truncate on public.profile_departments to fixture_truncate_holder;');
    assert.throws(()=>sql(proposal),e=>/TRUNCATE_EFFECTIVE_GRANT_REMAINS/.test(e.message));
    assert.equal(sql("select has_function_privilege('authenticated','private.sync_legacy_profile_permissions(uuid)','execute')"),'t','Failed inherited-grant check must roll back helper revoke');
    sql('revoke fixture_truncate_holder from authenticated;');
    sql(proposal);sql(proposal); // safe to repeat on the same reviewed contract
    for(const role of ['authenticated','anon']){
     assert.equal(sql(`select has_table_privilege('${role}','public.profile_departments','truncate')`),'f');
     assert.equal(sql(`select has_function_privilege('${role}','private.sync_legacy_profile_permissions(uuid)','execute')`),'f');
    }
    assert.throws(()=>asUser(operator,'truncate public.profile_departments'),e=>e.code==='42501');
    for(const id of [operator,manager,employee])assert.throws(()=>asUser(id,`select private.sync_legacy_profile_permissions('${manager}')`),e=>e.code==='42501');
    // Trusted admin RPC still calls its helper with its owner's permissions.
    asUser(operator,legacyOrdinary);asUser(operator,modernOrdinary);
    for(const id of [manager,employee,inactive])assert.throws(()=>asUser(id,legacyOrdinary),e=>e.code==='42501');
    assert.equal(asUser(operator,'select private.is_admin()'),'t');
    assert.equal(asUser(employee,`select private.user_has_department('${employee}','cuisine')`),'t');
    sql('create table public.fixture_after_hardening(id int);');
    assert.equal(sql("select has_table_privilege('authenticated','public.fixture_after_hardening','select,insert,update,delete,truncate')"),'f');
    assert.equal(sql("select has_table_privilege('anon','public.fixture_after_hardening','select,insert,update,delete,truncate')"),'f');
    sql('grant select on public.fixture_after_hardening to authenticated;');
    assert.equal(asUser(employee,'select count(*) from public.fixture_after_hardening'),'0');
    assert.equal(sql("select has_function_privilege('service_role','private.sync_legacy_profile_permissions(uuid)','execute')"),'t');
    assert.equal(sql("select has_table_privilege('service_role','public.profile_departments','truncate')"),'t');
    sql(read('supabase/migrations/20261017120000_stopflow_reservations_foundation.sql'));
    assert.equal(sql("select has_table_privilege('authenticated','public.reservation_rooms','select')"),'t');
    assert.equal(sql("select has_table_privilege('authenticated','public.reservation_rooms','truncate')"),'f');
    assert.equal(asUser(operator,"select public.reservations_context()->'establishments'"),'[]');
    console.log('PASS mission 2.1 proposal: TRUNCATE/direct helper denied; admin definer RPC preserves indirect calls; manager/employee denied admin actions; defaults deny new client table grants; explicit SELECT works; global-default precondition rollback; repeatable. No cloud or full application validation.');
   }
   console.log('Mission 2.0 canonical helper MD5 comparison:',JSON.stringify(helperHashes));
   console.log('PASS mission 2.0: real 15 constraints/14 indexes/7 policies, actual department PK and partial primary index, five received helpers/ACLs. SQL-role risks: PUBLIC sync helper can resync other profile; granted TRUNCATE bypasses RLS. No API exploit or Production execution claimed. MAINTAIN unavailable on PostgreSQL 16.');
  }
  assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('protect_core_accounts','protect_main_admin','stopflow_060_audit_profile_delete','stopflow_060_sync_primary_assignment','admin_set_user_access','admin_set_user_profile_permissions_070') and p.prosecdef and 'search_path=""'=any(p.proconfig) and pg_get_userbyid(p.proowner)='postgres'`),'6');
  console.log('PASS mission 1.9: six sanitized functions, distinct temporary identities, UPDATE protection, RPC coercion/admin checks, permission rollback, ON CONFLICT prerequisite/idempotent sync, conditional delete audit and ACL semantics. Confirmed limitations: privileged DELETE not blocked; display names editable; inactive primary retained; no identity means no delete audit. Partial PostgreSQL fixture/MOCK Auth, NOT full baseline or GoTrue/PostgREST.');
 }finally{db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
