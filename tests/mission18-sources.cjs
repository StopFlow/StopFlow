/* Real received SQL fragments on disposable PostgreSQL, with MOCK Auth only.
 * This is not an installer, a final baseline, or an actual GoTrue test. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {splitOutside}=require('../scripts/audit-migrations.cjs');
const {emptyPostgres}=require('./helpers/reconstruction-db.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'docs/schema/references/mission-1.8');
const read=name=>fs.readFileSync(path.join(dir,name),'utf8');
const clean=s=>s.replace(/^(?:\s|--[^\n]*(?:\n|$))*/,'');
const platform=`create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon,service_role;`;
(async()=>{
 const provenance=JSON.parse(read('PROVENANCE.json'));
 for(const f of provenance.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,f.file))).digest('hex'),f.sha256);
 const migration=read('20260801214108_create_shared_orders_workflow_REFERENCE.sql');
 assert.equal(crypto.createHash('md5').update(Buffer.from(migration)).digest('hex'),'39e0dab3f768e2fb6a9f3a68261710e5');
 assert.equal([...migration].length,11033);
 const profiles=splitOutside(read('PROFILES_ACTUAL_REFERENCE.sql')).map(s=>clean(s.text)).filter(s=>s.trim()&&!s.startsWith('--'));
 const table=profiles.find(s=>/^CREATE TABLE public.profiles\b/i.test(s));assert(table);
 const policies=profiles.filter(s=>/^CREATE POLICY /i.test(s));assert.equal(policies.length,2);
 const triggers=profiles.filter(s=>/^CREATE TRIGGER /i.test(s));assert.equal(triggers.length,3);
 const admin=splitOutside(fs.readFileSync(path.join(root,'docs/schema/references/stopflow_fonctions_manquantes_reference.sql'),'utf8')).map(s=>clean(s.text)).find(s=>/^CREATE OR REPLACE FUNCTION private.is_admin\(/i.test(s));assert(admin);
 const db=await emptyPostgres();
 try{
  db.sql('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;');
  db.sql('create database missing_profiles');db.sql(platform,'missing_profiles');
  assert.throws(()=>db.sql('begin;'+migration+'\ncommit;','missing_profiles'),e=>e.code==='42P01'&&/profiles/.test(e.message));
  assert.equal(db.sql("select to_regclass('public.orders') is null",'missing_profiles'),'t');
  db.sql('create database partial_bootstrap');const sql=s=>db.sql(s,'partial_bootstrap');
  sql(platform+'create schema private;');sql(table);
  assert.throws(()=>sql(policies[0]),e=>e.code==='42883'&&/is_admin/.test(e.message));
  sql('begin;'+migration+'\ncommit;');sql(admin);
  sql(profiles.find(s=>/^ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY/i.test(s)));
  for(const p of policies)sql(p);
  for(const t of triggers)assert.throws(()=>sql(t),e=>e.code==='42883','Missing final trigger functions must NOT be replaced by stubs');
  sql(read('HANDLE_NEW_USER_AND_AUTH_TRIGGER_REFERENCE.sql'));
  // Explicitly reproduce the documented handle_new_user ACL, not default PUBLIC execute.
  sql('revoke all on function public.handle_new_user() from public,anon,authenticated;grant execute on function public.handle_new_user() to service_role;');
  // PostgreSQL-16 subset for functional RLS probes only: not a reproduction of
  // the reported newer ACL containing MAINTAIN, nor of all schema default ACLs.
  sql('grant select,insert,update,delete on public.profiles to authenticated;');
  const employee='18000000-0000-4000-8000-000000000001',manager='18000000-0000-4000-8000-000000000002',order='18000000-0000-4000-8000-000000000003';
  sql(`insert into auth.users values('${employee}','employee.m18@stopflow.invalid','{"prenom":"Élodie","nom":"Test","role":"admin","actif":false}'),('${manager}','manager.m18@stopflow.invalid','{}');`);
  assert.equal(sql(`select role||'|'||actif||'|'||prenom from public.profiles where id='${employee}'`),'employe|true|Élodie');
  sql(`update public.profiles set role='responsable' where id='${manager}'`);
  assert.throws(()=>sql(`update public.profiles set role='root' where id='${employee}'`),e=>e.code==='23514');
  assert.throws(()=>sql(`update public.profiles set departement='unknown' where id='${employee}'`),e=>e.code==='23514');
  assert.throws(()=>sql(`update public.profiles set email='employee.m18@stopflow.invalid' where id='${manager}'`),e=>e.code==='23505');
  assert.throws(()=>sql(`insert into public.profiles(id,email) values('${order}','orphan.m18@stopflow.invalid')`),e=>e.code==='23503');
  const asUser=(id,body)=>sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${id}';${body};commit;`);
  assert.equal(asUser(employee,'select count(*) from public.profiles'),'1');
  assert.equal(asUser(employee,'select private.current_role()'),'employe');
  assert.equal(asUser(manager,'select count(*) from public.profiles'),'1','Responsable is not admin for profile SELECT');
  asUser(employee,`insert into public.orders(id,supplier,author_id,author_name) values('${order}','Fournisseur fictif','${employee}','Élodie Test')`);
  assert.equal(asUser(employee,`select (public.submit_order('${order}')).status`),'À valider');
  assert.throws(()=>asUser(employee,`select public.validate_order('${order}')`),e=>e.code==='P0001');
  assert.equal(asUser(manager,`select (public.validate_order('${order}')).status`),'Validé');
  assert.equal(sql(`select number from public.orders where id='${order}'`),'BC-000001');
  sql(`update public.profiles set actif=false where id='${employee}'`);
  assert.equal(asUser(employee,'select count(*) from public.orders'),'0');
  assert.equal(asUser(employee,'select private.current_role() is null'),'t');
  assert.equal(sql("select has_function_privilege('authenticated','public.handle_new_user()','execute')"),'f');
  sql(fs.readFileSync(path.join(root,'supabase/migrations/20261017120000_stopflow_reservations_foundation.sql'),'utf8'));
  assert.equal(sql("select count(*) from pg_tables where schemaname='public' and tablename like 'reservation_%'"),'7');
  sql(`delete from auth.users where id='${employee}'`);
  assert.equal(sql(`select count(*) from public.profiles where id='${employee}'`),'0');
  assert.equal(sql(`select author_id is null from public.orders where id='${order}'`),'t');
  console.log('PASS mission 1.8: exact MD5/SHA256; exact first migration fails without profiles and succeeds after received table DDL; policy/helper order; 3 missing trigger functions remain blocked; documented Auth trigger with MOCK auth.users; profile constraints/RLS, historical submit/validate, persistence, 7 Reservations tables. NOT final-state baseline, GoTrue/PostgREST or a complete Supabase reset.');
 }finally{db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
