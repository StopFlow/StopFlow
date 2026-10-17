/* Dependency probes ONLY. These tiny schemas are not Production definitions,
 * not a baseline, and must never be installed outside this disposable test. */
'use strict';
const assert=require('node:assert/strict');
const {emptyPostgres}=require('./helpers/reconstruction-db.cjs');
(async()=>{
 const db=await emptyPostgres();
 try{
  // Model precisely the reported FK dependency, not the unavailable remote migration.
  const ordersProbe='create table public.orders(id uuid primary key,author_id uuid references public.profiles(id));';
  assert.throws(()=>db.sql(ordersProbe),e=>e.code==='42P01'&&/profiles/.test(e.message));
  assert.equal(db.sql("select to_regclass('public.orders') is null"),'t');
  // Presence alone is insufficient: the referenced column must be unique.
  db.sql('create table public.profiles(id uuid,actif boolean,role text);');
  assert.throws(()=>db.sql(ordersProbe),e=>e.code==='42830');
  db.sql('alter table public.profiles add primary key(id);');
  db.sql(ordersProbe);
  assert.equal(db.sql("select count(*) from pg_constraint where conrelid='public.orders'::regclass and contype='f'"),'1');
  // Auth dependency also has to precede an actual profiles->auth.users FK.
  assert.throws(()=>db.sql('alter table public.profiles add foreign key(id) references auth.users(id);'),e=>e.code==='3F000');
  db.sql('create schema auth;create table auth.users(id uuid primary key);alter table public.profiles add foreign key(id) references auth.users(id);');
  const uid='20000000-0000-4000-8000-000000000001';
  assert.throws(()=>db.sql(`insert into public.profiles values('${uid}',true,'employe');`),e=>e.code==='23503');
  db.sql(`insert into auth.users values('${uid}');insert into public.profiles values('${uid}',true,'employe');insert into public.orders values('${uid}','${uid}');`);
  assert.equal(db.sql('select count(*) from public.orders'),'1');
  assert.throws(()=>db.sql('create function public.bootstrap_probe() returns boolean language sql as $$select private.is_active_user()$$;'),e=>e.code==='3F000');
  db.sql('create schema private;');
  assert.throws(()=>db.sql('create function public.bootstrap_probe() returns boolean language sql as $$select private.is_active_user()$$;'),e=>e.code==='42883');
  console.log('PASS bootstrap dependency probes: missing profiles 42P01, missing unique 42830, Auth ordering/FK 3F000/23503, persistence, private/helper 3F000/42883. Synthetic probes only; NOT the exact remote migration or a complete baseline/Auth validation.');
 }finally{db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
