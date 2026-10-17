'use strict';
const {execFileSync,execFile} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {promisify} = require('node:util');
const exec = promisify(execFile);
const root = path.resolve(__dirname,'../..');
const users = {admin:'10000000-0000-4000-8000-000000000001',reader:'10000000-0000-4000-8000-000000000002',other:'10000000-0000-4000-8000-000000000003',inactive:'10000000-0000-4000-8000-000000000004',tables:'10000000-0000-4000-8000-000000000005',rooms:'10000000-0000-4000-8000-000000000006'};
const tenants = {a:'20000000-0000-4000-8000-000000000001',b:'20000000-0000-4000-8000-000000000002'};
const definitions={reservations_context:[],reservations_read:[['p_establishment_id','uuid']],reservations_save_room:[['p_establishment_id','uuid'],['p_id','uuid'],['p_expected_version','bigint'],['p_name','text'],['p_description','text'],['p_sort_order','integer'],['p_active','boolean']],reservations_save_table:[['p_establishment_id','uuid'],['p_room_id','uuid'],['p_id','uuid'],['p_expected_version','bigint'],['p_label','text'],['p_capacity','integer'],['p_shape','text'],['p_active','boolean']]};
const literal = value => value===null||value===undefined?'null':"'"+String(value).replace(/'/g,"''")+"'";

async function createDb(){
  const container='stopflow-reservations-test-'+process.pid+'-'+Date.now();
  const image=process.env.STOPFLOW_POSTGRES_IMAGE||'postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
  execFileSync('docker',['run','--detach','--rm','--network','none','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust',image],{stdio:'pipe'});
  const command=['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres'];
  function sql(source){
    try{return execFileSync('docker',command,{input:source,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()}
    catch(error){const text=String(error.stderr||error.message),match=text.match(/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/);throw Object.assign(new Error(match?.[2]||text),{code:match?.[1]||'SQL_ERROR'})}
  }
  const close=()=>execFileSync('docker',['rm','--force',container],{stdio:'pipe'});
  try{
    let ready=false;
    for(let i=0;i<80;i++){
      // The image's temporary init server is socket-only and subsequently stops.
      try{execFileSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'pipe'});ready=true;break}catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!ready)throw Error('Isolated PostgreSQL did not start');
    // Minimal contracts of existing Supabase Auth/profiles, NOT a replacement
    // of the production migrations. The new module migration is applied verbatim.
    sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
      create schema auth;create schema private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon,service_role;
      create table public.profiles(id uuid primary key,role text not null,actif boolean not null);
      insert into public.profiles values ${Object.entries(users).map(([name,id])=>`(${literal(id)},${literal(name==='admin'?'admin':'employe')},${name==='inactive'?'false':'true'})`).join(',')};`);
    sql(fs.readFileSync(path.join(root,'supabase/migrations/20261017120000_stopflow_reservations_foundation.sql'),'utf8'));
    sql(`insert into public.reservation_establishments(id,name) values (${literal(tenants.a)},'Établissement témoin A'),(${literal(tenants.b)},'Établissement témoin B');
      insert into public.reservation_memberships(establishment_id,profile_id,can_view,can_manage_rooms,can_manage_tables,can_manage_layouts) values
      (${literal(tenants.a)},${literal(users.admin)},true,true,true,true),
      (${literal(tenants.a)},${literal(users.reader)},true,false,false,false),
      (${literal(tenants.a)},${literal(users.inactive)},true,true,true,true),
      (${literal(tenants.a)},${literal(users.tables)},true,false,true,false),
      (${literal(tenants.a)},${literal(users.rooms)},true,true,false,false),
      (${literal(tenants.b)},${literal(users.other)},true,true,true,true);`);
    const as=(user,query,role='authenticated')=>`begin;set local role ${role};set local request.jwt.claim.sub=${literal(user||'')};${query};commit;`;
    const callSql=(name,args={})=>{
      if(!Object.hasOwn(definitions,name))throw Error('Test bridge RPC not allowlisted');
      return `select public.${name}(${definitions[name].map(([key,type])=>literal(args[key])+'::'+type).join(',')})`;
    };
    const rpc=(user,name,args={})=>JSON.parse(sql(as(user,callSql(name,args))));
    const concurrentRpc=async(user,name,args={})=>{
      const input=as(user,callSql(name,args));
      // execFile has no stdin option; psql -c receives a single argument, never shell code.
      const result=await exec('docker',[...command,'-c',input]);return JSON.parse(result.stdout.trim());
    };
    return {sql,as,rpc,concurrentRpc,close,users,tenants,literal,container};
  }catch(error){close();throw error}
}
module.exports={createDb,users,tenants,literal};
