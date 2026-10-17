/* Complete received schema, but ONLY a PG16 diagnostic with MOCK Auth.
 * This test must never be presented as a PG17/Supabase/GoTrue reset. */
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {assemble,versionGuard}=require('../scripts/prepare-snapshot23-local.cjs');
const {emptyPostgres}=require('./helpers/reconstruction-db.cjs');
(async()=>{
 const input=process.env.STOPFLOW_SNAPSHOT23_SOURCE;if(!input)throw Error('Set STOPFLOW_SNAPSHOT23_SOURCE to the EXTERNAL received SQL');
 const prepared=assemble(fs.readFileSync(input,'utf8'));const db=await emptyPostgres();
 try{
  const sql=s=>db.sql(s);
  sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role supabase_admin nologin;
   create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb,invited_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,service_role;`);
  assert.throws(()=>sql(prepared.baseline),e=>/POSTGRES_17_REQUIRED/.test(e.message));
  // In-memory diagnostics ONLY: do not write/export this compatibility variant.
  const diagnostic=prepared.baseline.replace(versionGuard,'-- PG16 diagnostic only: PG17 guard skipped').replace(/^SET transaction_timeout = 0;$/m,'-- PG17-only GUC omitted').replace(/,MAINTAIN\b/g,'');
  sql(diagnostic);sql(prepared.auth);
  assert.equal(sql("select count(*) from pg_tables where schemaname='public'"),'24');
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')"),'56');
  assert.equal(sql("select count(*) from pg_policies where schemaname='public'"),'63');
  assert.equal(sql("select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal"),'16');
  assert.equal(sql("select count(*) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'"),String(prepared.inventory.constraints));
  assert.equal(sql("select count(*) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and k.contype='f'"),'40');
  const backed=Number(sql("select count(*) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and k.contype in ('p','u','x')"));
  assert.equal(Number(sql("select count(*) from pg_indexes where schemaname='public'")),prepared.inventory.indexes+backed);
  assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S'"),'5');
  assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and has_table_privilege('authenticated',c.oid,'TRUNCATE')"),'23');
  const rpcNames="'admin_set_profile_permissions','admin_set_user_access','admin_set_user_profile_permissions_070','load_temperature_dashboard_070','log_stopflow_event','mark_order_delivered','mark_order_sent','resolve_checklist_anomaly','save_order_draft_atomic','save_order_draft_atomic_v054','save_temperature_round_070'";
  assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${rpcNames}) and p.prosecdef and pg_get_userbyid(p.proowner)='postgres' and 'search_path=""'=any(p.proconfig) and has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')`),'11');
  const admin='23000000-0000-4000-8000-000000000001',manager='23000000-0000-4000-8000-000000000002',employee='23000000-0000-4000-8000-000000000003',other='23000000-0000-4000-8000-000000000004';
  for(const [id,email] of [[admin,'stopflow-identite-001@example.invalid'],[manager,'stopflow-identite-002@example.invalid'],[employee,'employee23@example.invalid'],[other,'other23@example.invalid']])sql(`insert into auth.users(id,email) values('${id}','${email}')`);
  sql(`update public.profiles set role='admin',departement='bureau' where id='${admin}';update public.profiles set role='responsable',departement='bureau' where id='${manager}';`);
  const user=(id,body)=>sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${id}';${body};commit;`);
  for(const id of [employee,other])user(admin,`select public.admin_set_user_access('${id}','Test','Fictif','employe',true,'salle',array['salle'])`);
  assert.equal(user(employee,'select count(*) from public.profiles'),'1');
  for(const [id,role] of [[admin,'admin'],[manager,'responsable']])assert.throws(()=>sql(`update public.profiles set actif=false where id='${id}'`),e=>e.code==='P0001');
  sql(`begin;set local request.jwt.claim.sub='${admin}';insert into public.suppliers(code,name,department) values('fixture23','Fournisseur fictif 23','salle');commit;`);
  const order='23000000-0000-4000-8000-000000000005';
  sql(`insert into public.orders(id,supplier,author_id,author_name,department) values('${order}','Fournisseur fictif 23',null,'Auteur fictif supprimé','salle')`);
  const save=(note,revision)=>`select (public.save_order_draft_atomic('${order}','Fournisseur fictif 23','Test','${note}','{}','{}',now(),now(),${revision},'[]')).revision`;
  assert.equal(user(employee,save('before',1)),'2','Full received function reproduces unauthorized NULL-author editing');
  sql(prepared.nullAuthor);
  assert.throws(()=>user(employee,save('blocked',2)),e=>e.code==='42501');
  assert.throws(()=>user(employee,`select public.save_order_draft_atomic_v054('${order}','Fournisseur fictif 23','salle','Test','blocked wrapper','{}','{}',now(),now(),2,'[]')`),e=>e.code==='42501');
  assert.equal(sql(`select revision from public.orders where id='${order}'`),'2');
  // Grant legitimate manager permissions through the actual admin RPC.
  user(admin,`select public.admin_set_user_access('${manager}','Test','Responsable','responsable',true,'bureau',array[]::text[])`);
  assert.equal(user(manager,save('manager allowed',2)),'3');
  sql(`update public.orders set author_id='${employee}' where id='${order}'`);
  assert.equal(user(employee,save('own allowed',3)),'4');
  assert.throws(()=>user(other,save('other denied',4)),e=>e.code==='42501');
  const security=fs.readFileSync(require('node:path').resolve(__dirname,'../supabase/proposals/20261017_least_privilege_REVIEW_ONLY.sql'),'utf8');
  sql(security);
  assert.equal(sql("select count(*) from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace cross join lateral aclexplode(d.defaclacl) a where n.nspname='public' and d.defaclobjtype='r' and a.grantee in (0,(select oid from pg_roles where rolname='authenticated'),(select oid from pg_roles where rolname='anon'))"),'0');
  assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and has_table_privilege('authenticated',c.oid,'TRUNCATE')"),'0');
  assert.throws(()=>user(admin,`select private.sync_legacy_profile_permissions('${employee}')`),e=>e.code==='42501');
  user(admin,`select public.admin_set_user_access('${employee}','Test','Fictif','employe',true,'salle',array['salle'])`);
  for(const id of [employee,manager])assert.throws(()=>user(id,`select public.admin_set_user_access('${other}','Test','Fictif','employe',true,'salle',array['salle'])`),e=>e.code==='42501');
  sql(fs.readFileSync(require('node:path').resolve(__dirname,'../supabase/migrations/20261017120000_stopflow_reservations_foundation.sql'),'utf8'));
  assert.equal(sql("select count(*) from pg_tables where schemaname='public' and tablename like 'reservation_%'"),'7');
  assert.equal(user(admin,"select public.reservations_context()->'establishments'"),'[]');
  const a='23000000-0000-4000-8000-000000000010',b='23000000-0000-4000-8000-000000000011';
  sql(`insert into public.reservation_establishments(id,name) values('${a}','Établissement fictif A'),('${b}','Établissement fictif B');insert into public.reservation_memberships(establishment_id,profile_id,can_view,can_manage_rooms,can_manage_tables) values('${a}','${admin}',true,true,true),('${a}','${employee}',true,false,false),('${b}','${manager}',true,true,true);`);
  const room=JSON.parse(user(admin,`select public.reservations_save_room('${a}',null,null,'Salle A','Description',0,true)`));
  const roomB=JSON.parse(user(manager,`select public.reservations_save_room('${b}',null,null,'Salle B','',0,true)`));
  assert.throws(()=>user(employee,`select public.reservations_save_room('${a}',null,null,'Interdit','',0,true)`),e=>e.code==='42501');
  assert.equal(user(employee,`select count(*) from public.reservation_rooms where establishment_id='${b}'`),'0');
  assert.throws(()=>user(admin,`select public.reservations_read('${b}')`),e=>e.code==='42501');
  assert.throws(()=>user(admin,`select public.reservations_save_table('${a}','${roomB.id}',null,null,'Interdit',4,'round',true)`),e=>e.code==='42501');
  const table=JSON.parse(user(admin,`select public.reservations_save_table('${a}','${room.id}',null,null,'A-1',4,'round',true)`));
  const changed=JSON.parse(user(admin,`select public.reservations_save_table('${a}','${room.id}','${table.id}',1,'A-1',6,'round',true)`));
  assert.equal(changed.version,2);
  assert.throws(()=>user(admin,`select public.reservations_save_table('${a}','${room.id}','${table.id}',1,'A-1',8,'round',true)`),e=>e.code==='40001');
  assert.equal(user(employee,`select public.reservations_read('${a}')->'tables'->0->>'capacity'`),'6');
  assert(Number(sql('select count(*) from public.reservation_audit'))>0);
  // A second independent blank DB proves PG16 diagnostic replay, NOT Supabase reset.
  sql('create database replay23');
  db.sql(`create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb,invited_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;`,'replay23');
  db.sql(diagnostic,'replay23');db.sql(prepared.auth,'replay23');
  assert.equal(db.sql("select count(*) from pg_tables where schemaname='public'",'replay23'),'24');
  console.log('PASS PG16-only full-snapshot diagnostic:',JSON.stringify({...prepared.counts,...prepared.inventory}),'; strict 56-function revalidation, 23->0 TRUNCATE, real NULL-author RPC reproduced/patched, admin indirect helper and manager/employee controls, 7 Reservations tables. MOCK Auth; MAINTAIN/GUC omitted in memory. NOT PG17/GoTrue/PostgREST or cloud GO.');
 }finally{db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
