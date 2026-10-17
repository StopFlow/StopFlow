'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {emptyPostgres}=require('./helpers/reconstruction-db.cjs');
(async()=>{const db=await emptyPostgres();try{
 db.sql('create schema private;create schema auth;create table auth.users(id uuid primary key);create table public.fixture(id int);create function public.fixture_auth() returns trigger language plpgsql as $$begin return new;end$$;create trigger fixture_auth after insert on auth.users for each row execute function public.fixture_auth();');
 const metadata=db.sql('begin isolation level repeatable read read only;'+fs.readFileSync(path.resolve(__dirname,'../docs/schema/SNAPSHOT-COMPANION.sql'),'utf8')+'\nrollback;');
 assert(metadata.includes('fixture_auth'));assert(metadata.includes('plpgsql'));
 const dump=execFileSync('docker',['exec',db.container,'pg_dump','--schema-only','--schema=public','--schema=private','-U','postgres','postgres'],{encoding:'utf8',stdio:['pipe','pipe','pipe']});
 assert(dump.includes('CREATE TABLE public.fixture'));assert(dump.includes('CREATE FUNCTION public.fixture_auth'));assert(!dump.includes('CREATE TRIGGER fixture_auth'),'Auth trigger deliberately supplied by companion, not filtered dump');
 assert.equal(db.sql("select case when null::uuid <> '21000000-0000-4000-8000-000000000001'::uuid and true then 'deny' else 'allow' end"),'allow');
 console.log('PASS local pg_dump 16 schema-only/public-private and read-only companion; Auth trigger captured separately; NULL-owner SQL guard probe confirms three-valued logic. No Production export, shared-snapshot remote execution or full RPC test claimed');
}finally{db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
