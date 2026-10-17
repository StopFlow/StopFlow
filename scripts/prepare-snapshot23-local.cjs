/* Offline PG17-only assembler. Source and outputs MUST stay outside Git.
 * No DB/client/network execution. Snapshot never enters active migrations. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {splitOutside}=require('./audit-migrations.cjs');
const expectedSha256='c9aa165a6fb575b5a6fecb8c215ae321417b6da87c07cf4c3aa9b9facbf89de9';
const root=fs.realpathSync(path.resolve(__dirname,'..')),inside=p=>p===root||p.startsWith(root+path.sep);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const versionGuard=`do $$begin if current_setting('server_version_num')::int/10000<>17 then raise exception 'POSTGRES_17_REQUIRED';end if;end$$;`;
function assemble(source){
 if(hash(source)!==expectedSha256)throw Error('Snapshot SHA256 mismatch');
 const plain=source.replace(/^\\[^\n]*$/gm,'');
 const statements=splitOutside(plain).map(p=>p.text.replace(/^(?:\s|--[^\n]*(?:\n|$))*/,''));
 const functions=statements.filter(s=>/^CREATE FUNCTION /i.test(s));
 const counts={tables:statements.filter(s=>/^CREATE TABLE /i.test(s)).length,functions:functions.length,policies:statements.filter(s=>/^CREATE POLICY /i.test(s)).length,publicTriggers:statements.filter(s=>/^CREATE TRIGGER /i.test(s)).length,identitySequences:statements.filter(s=>/ADD GENERATED .* AS IDENTITY/.test(s)).length,explicitSequences:statements.filter(s=>/^CREATE SEQUENCE /.test(s)).length,rlsTables:statements.filter(s=>/^ALTER TABLE .* ENABLE ROW LEVEL SECURITY/.test(s)).length};
 if(JSON.stringify(counts)!==JSON.stringify({tables:24,functions:56,policies:63,publicTriggers:16,identitySequences:4,explicitSequences:1,rlsTables:24}))throw Error('Unexpected snapshot object counts');
 if((source.match(/^CREATE SCHEMA public;$/gm)||[]).length!==1)throw Error('Unexpected public schema declaration');
 const emptyGuard=`do $$begin if to_regnamespace('private') is not null or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m')) then raise exception 'FRESH_LOCAL_SCHEMA_REQUIRED';end if;if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then raise exception 'SUPABASE_PLATFORM_REQUIRED';end if;end$$;`;
 // pg_dump's check_function_bodies=false is retained for forward references,
 // followed by a strict revalidation pass AFTER all tables/functions exist.
 const validate=functions.map(s=>s.replace(/^CREATE FUNCTION /i,'CREATE OR REPLACE FUNCTION ')).join('\n');
 const baseline='-- LOCAL ONLY. Reviewed source reference, not approved for cloud.\nbegin;\n'+versionGuard+'\n'+emptyGuard+'\n'+source.replace(/^CREATE SCHEMA public;$/m,'CREATE SCHEMA IF NOT EXISTS public;')+'\nSET check_function_bodies = true;\n'+validate+'\ncommit;\n';
 const target=functions.filter(s=>/^CREATE FUNCTION public.save_order_draft_atomic\(/.test(s));if(target.length!==1)throw Error('Unexpected draft function overload');
 if((target[0].match(/v_order\.author_id\s*<>\s*auth\.uid\(\)/g)||[]).length!==1)throw Error('NULL-author predicate changed');
 const nullAuthor='-- LOCAL REVIEW PROPOSAL ONLY, exact source body with one NULL-safe comparison.\nbegin;\n'+target[0].replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION ').replace(/v_order\.author_id\s*<>\s*auth\.uid\(\)/,'v_order.author_id IS DISTINCT FROM auth.uid()')+'\ncommit;\n';
 const auth='-- LOCAL Supabase only; platform auth.users must already exist.\nbegin;\nCREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();\ncommit;\n';
 const inventory={indexes:statements.filter(s=>/^CREATE (?:UNIQUE )?INDEX /.test(s)).length,foreignKeys:(plain.match(/FOREIGN KEY /g)||[]).length,constraints:statements.filter(s=>/^ALTER TABLE ONLY /s.test(s)&&/ADD CONSTRAINT /.test(s)).length+statements.filter(s=>/^CREATE TABLE /.test(s)).reduce((n,s)=>n+(s.match(/\bCONSTRAINT \w+ CHECK /g)||[]).length,0),aclStatements:statements.filter(s=>/^(?:GRANT|REVOKE|ALTER DEFAULT PRIVILEGES) /.test(s)).length};
 return {baseline,auth,nullAuthor,counts,inventory};
}
function prepare({source,output}){
 if(!source||inside(fs.realpathSync(source)))throw Error('External source required');
 if(!output)throw Error('External fresh output required');
 const target=path.join(fs.realpathSync(path.dirname(path.resolve(output))),path.basename(output));
 if(inside(target)||fs.existsSync(target))throw Error('External fresh output required');
 const result=assemble(fs.readFileSync(source,'utf8'));
 const files={'01-final-pg17-local.sql':result.baseline,'02-auth-local.sql':result.auth,'03-least-privilege-review.sql':fs.readFileSync(path.join(root,'supabase/proposals/20261017_least_privilege_REVIEW_ONLY.sql'),'utf8'),'04-null-author-review.sql':result.nullAuthor,'05-reservations.sql':fs.readFileSync(path.join(root,'supabase/migrations/20261017120000_stopflow_reservations_foundation.sql'),'utf8')};
 fs.mkdirSync(target,{mode:0o700});for(const [name,content]of Object.entries(files))fs.writeFileSync(path.join(target,name),content,{flag:'wx',mode:0o600});
 const manifest={sourceSha256:expectedSha256,target:'ISOLATED LOCAL SUPABASE PG17 ONLY',execution:'NONE',fullSupabaseValidationPassed:false,counts:result.counts,inventory:result.inventory,adaptations:['public schema IF NOT EXISTS, freshness guard','preserved roles/ACL/MAINTAIN','standard dump forward references followed by strict function revalidation','qualified custom Auth trigger, no DROP','separate security and NULL-author review proposals, no automatic application'],files:Object.entries(files).map(([name,content])=>({name,sha256:hash(content)}))};
 fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});return manifest;
}
module.exports={assemble,prepare,versionGuard,expectedSha256};
if(require.main===module){try{const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){const key={'--source':'source','--out':'output'}[args[i]];if(!key||!args[i+1]||options[key])throw Error('Usage: --source EXTERNAL_SQL --out NEW_EXTERNAL_DIRECTORY');options[key]=args[i+1]}console.log(JSON.stringify(prepare(options)))}catch(e){console.error(e.message);process.exitCode=1}}
