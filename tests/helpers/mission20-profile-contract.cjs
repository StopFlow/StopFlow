/* Local test-only assembly of the supplied four-table catalogue.
 * No connection logic; never a baseline installer. PostgreSQL 16 lacks MAINTAIN. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {splitOutside}=require('../../scripts/audit-migrations.cjs');
const dir=path.resolve(__dirname,'../../docs/schema/references/mission-2.0');
const read=p=>fs.readFileSync(path.join(dir,p),'utf8');
const catalogue=read('DEPENDANCES_PROFILS_4_TABLES_REFERENCE.md');
const tables=['profile_departments','profile_permissions','deleted_user_identities','user_admin_events'];
function verify(){
 for(const f of JSON.parse(read('PROVENANCE.json')).files)assert.equal(crypto.createHash('sha256').update(read(f.file)).digest('hex'),f.sha256);
 const previous={current_role:'docs/schema/references/mission-1.8/20260801214108_create_shared_orders_workflow_REFERENCE.sql',is_admin:'docs/schema/references/stopflow_fonctions_manquantes_reference.sql',is_operational_department:'supabase/migrations/20260805143900_stopflow_060_department_security.sql',sync_legacy_profile_permissions:'supabase/migrations/20260809074647_stopflow_070_permission_rls.sql',user_has_department:'docs/schema/references/stopflow_fonctions_manquantes_reference.sql'};
 const body=s=>s.match(/\bas\s+(\$(?:\w+)?\$)([\s\S]*?)\1/i)?.[2].replace(/\s+/g,' ').trim();
 for(const p of splitOutside(read('HELPERS_TRANSITIFS_REFERENCE.sql'))){
  const name=p.text.match(/FUNCTION private\."?(\w+)"?\(/i)[1];
  const candidates=splitOutside(fs.readFileSync(path.resolve(dir,'../../../..',previous[name]),'utf8')).map(s=>s.text.replace(/^(?:\s|--[^\n]*(?:\n|$))*/,'')).filter(s=>new RegExp('^create or replace function private\\.\\"?'+name+'\\"?\\(','i').test(s));
  assert.equal(candidates.length,1);assert.equal(body(candidates[0]),body(p.text),'Changed normalized helper body: '+name);
 }
}
function structure(sql){
 let constraints=0,indexes=0;
 for(const table of tables){
  const section=catalogue.split('### `public.'+table+'`')[1].split(/\n### |\n## /)[0];
  for(const block of section.matchAll(/```sql\n([\s\S]*?)```/g))for(const part of splitOutside(block[1])){
   const statement=part.text.trim();if(!statement)continue;
   if(statement.startsWith('CONSTRAINT ')){
    const name=statement.match(/^CONSTRAINT (\w+)/)[1];
    if(table==='profile_permissions')sql('alter table public.'+table+' drop constraint '+name+';');
    sql('alter table public.'+table+' add '+statement);constraints++;
   }else{assert.match(statement,/^CREATE (?:UNIQUE )?INDEX /);sql(statement);indexes++}
  }
 }
 assert.equal(constraints,15);assert.equal(indexes,10); // plus 4 constraint-backed indexes
}
function helpers(sql){
 const observations=[];
 for(const p of splitOutside(read('HELPERS_TRANSITIFS_REFERENCE.sql'))){
  const expected=p.text.match(/-- MD5: ([a-f0-9]{32})/)[1];
  const statement=p.text.slice(p.text.indexOf('CREATE OR REPLACE'));
  sql(statement);
  const name=statement.match(/FUNCTION (private\.(?:"[^"]+"|\w+))\(([^)]*)\)/i);
  // Signatures are enumerated explicitly; never infer SQL argument types from text.
  const signatures={'private."current_role"':'private.current_role()','private.is_admin':'private.is_admin()','private.is_operational_department':'private.is_operational_department(text)','private.sync_legacy_profile_permissions':'private.sync_legacy_profile_permissions(uuid)','private.user_has_department':'private.user_has_department(uuid,text)'};
  assert(signatures[name[1]],name[1]);
  const actual=sql("select md5(pg_get_functiondef('"+signatures[name[1]]+"'::regprocedure))");
  assert.equal(actual,expected,'Canonical MD5 mismatch: '+signatures[name[1]]);
  observations.push({signature:signatures[name[1]],reportedMd5:expected,localCanonicalMd5:actual,match:expected===actual});
 }
 return observations;
}
function security(sql){
 for(const table of tables){
  const permissions=table==='profile_permissions'?'select,truncate,references,trigger':'select,insert,update,delete,truncate,references,trigger';
  sql('grant '+permissions+' on public.'+table+' to authenticated;');
  sql('grant select,insert,update,delete,truncate,references,trigger on public.'+table+' to service_role;');
 }
 let count=0;
 for(const line of catalogue.split('\n')){
  const cells=line.split('|').slice(1,-1).map(s=>s.trim().replaceAll('`',''));
  if(cells.length!==6||!tables.includes(cells[0])||!['ALL','SELECT','INSERT'].includes(cells[2]))continue;
  const [table,name,command,role,using,check]=cells;
  assert.match(name,/^\w+$/);assert.equal(role,'authenticated');
  sql(`create policy ${name} on public.${table} as permissive for ${command} to ${role}`+(using==='—'?'':` using (${using})`)+(check==='—'?'':` with check (${check})`)+';');count++;
 }
 assert.equal(count,7);
 for(const signature of ['private.is_admin()','private.is_operational_department(text)','private.user_has_department(uuid,text)'])sql('revoke all on function '+signature+' from public;grant execute on function '+signature+' to authenticated;');
 // current_role explicitly includes PUBLIC; sync_legacy has NULL/default ACL.
 sql('grant execute on function private.current_role() to public,authenticated;');
}
module.exports={verify,structure,helpers,security};
