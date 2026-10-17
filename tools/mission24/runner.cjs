'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const S=require('./safety.cjs');
const root=__dirname,workdir=path.join(os.homedir(),'Library/Application Support/StopFlow-test-local');
let writes=false,apiBase,credentials,dbId;
const report={mission:'2.4.1',decision:'NO-GO',scope:'Local PG17 tests only; pilot review required before any cloud action',timeZone:'Europe/Brussels',checks:[],databaseModified:false,realAuthTested:false};
function command(args){try{return cp.execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000,maxBuffer:8*1024*1024})}catch{throw new S.Failure('DOCKER_COMMAND_FAILED')}}
function inspect(name){let data;try{data=JSON.parse(command(['inspect',name]))}catch{throw new S.Failure('CONTAINER_INSPECTION_FAILED')}S.need(data.length===1,'CONTAINER_INSPECTION_FAILED');return data[0]}
function sql(text,mutate=false){
 S.need(dbId,'DB_NOT_VERIFIED');S.need(!mutate||writes,'WRITE_GUARD_CLOSED');
 try{return cp.execFileSync('docker',['exec','-i','--user','postgres',dbId,'psql','-X','-qAt','-h','/var/run/postgresql','-p','5432','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{input:mutate?text:'begin read only;\n'+text+'\nrollback;',encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:120000,maxBuffer:4*1024*1024}).trim()}catch(e){throw new S.Failure(S.safeSqlState(e.stderr))}
}
const lit=v=>"'"+String(v).replaceAll("'","''")+"'";
const id=v=>{S.need(typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),'INVALID_FIXTURE_ID');return v};
const transport=require('./local-http.cjs');
const request=(route,options)=>transport.request(apiBase,credentials,route,options);
const success=r=>{S.need(r.status>=200&&r.status<300,'UNEXPECTED_HTTP_'+r.status);return r.body};
const denied=r=>S.need(r.status>=400&&r.body?.code==='42501','EXPECTED_AUTHORIZATION_REFUSAL');
const rpc=(name,body,user)=>request('/rest/v1/rpc/'+name,{method:'POST',body,token:user?.token});
async function check(name,fn){process.stdout.write(name+'…\n');await fn();report.checks.push({name,result:'PASS'});}
function integrity(){
 const m=JSON.parse(fs.readFileSync(path.join(root,'transfer-manifest.json'),'utf8'));
 S.need(m.mission==='2.4.1'&&m.project===S.project,'PACKAGE_IDENTITY_REFUSED');
 for(const item of m.files){S.need(/^[A-Za-z0-9._/-]+$/.test(item.name)&&!item.name.split('/').includes('..'),'PACKAGE_PATH_REFUSED');const file=path.join(root,item.name);S.need(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink()&&S.hash(fs.readFileSync(file))===item.sha256,'PACKAGE_HASH_MISMATCH')}
}
async function preflight(){
 S.need(process.platform==='darwin','MACOS_REQUIRED');S.need(Number(process.versions.node.split('.')[0])>=22,'NODE_22_REQUIRED');
 S.need(!process.env.DOCKER_HOST&&!process.env.DOCKER_TLS_VERIFY&&!process.env.DOCKER_CERT_PATH,'DOCKER_OVERRIDE_REFUSED');
 const ctx=JSON.parse(command(['context','inspect']));S.need(ctx.length===1,'DOCKER_CONTEXT_REFUSED');S.daemon(process.env,ctx[0].Endpoints?.docker?.Host);
 S.need(fs.realpathSync(workdir)===workdir,'WORKDIR_SYMLINK_REFUSED');
 const config=fs.readFileSync(path.join(workdir,'supabase/config.toml'),'utf8');S.need(/^project_id\s*=\s*["']StopFlow-test-local["']\s*$/m.test(config),'PROJECT_CONFIG_REFUSED');
 S.need(!fs.existsSync(path.join(workdir,'supabase/.temp/project-ref')),'CLOUD_LINK_REFUSED');
 const db=inspect(S.dbName),auth=inspect('supabase_auth_'+S.project),rest=inspect('supabase_rest_'+S.project),kong=inspect('supabase_kong_'+S.project);
 for(const [c,n]of [[db,S.dbName],[auth,'supabase_auth_'+S.project],[rest,'supabase_rest_'+S.project],[kong,'supabase_kong_'+S.project]])S.container(c,n);
 S.need(/^(?:public\.ecr\.aws\/)?supabase\/postgres:17\./.test(db.Config.Image),'PG17_IMAGE_REFUSED');
 const networks=Object.keys(db.NetworkSettings.Networks);S.need(networks.some(n=>[auth,rest,kong].every(c=>c.NetworkSettings.Networks[n])),'STACK_NETWORK_REFUSED');
 const volume=db.Mounts.find(m=>m.Type==='volume'&&m.Name===S.dbName);S.need(volume,'DB_VOLUME_REFUSED');
 const volumeInfo=JSON.parse(command(['volume','inspect',volume.Name]))[0];S.need(volumeInfo.Driver==='local'&&Object.keys(volumeInfo.Options||{}).length===0,'NON_LOCAL_VOLUME_REFUSED');
 const aliases=[S.dbName,...Object.values(db.NetworkSettings.Networks).flatMap(n=>[...(n.Aliases||[]),n.IPAddress]).filter(Boolean)];
 S.databaseRoute(S.environment(auth).GOTRUE_DB_DATABASE_URL,aliases);S.databaseRoute(S.environment(rest).PGRST_DB_URI,aliases);
 const port=S.gatewayPort(kong);apiBase='http://127.0.0.1:'+port;S.localUrl(apiBase,port);
 const env=S.environment(kong),configPath=env.KONG_DECLARATIVE_CONFIG;
 S.need(['/home/kong/kong.yml','/etc/kong/kong.yml'].includes(configPath),'GATEWAY_CONFIG_PATH_REFUSED');
 const gatewayConfig=command(['exec',kong.Id,'cat',configPath]);
 // Inspect every endpoint, without a project filter: otherwise an alias
 // collision from a foreign container could be silently omitted.
 const kongNetworks=Object.values(kong.NetworkSettings.Networks);
 S.need(kongNetworks.length===1,'GATEWAY_NETWORK_REFUSED');
 const networkId=kongNetworks[0].NetworkID;
 S.need(/^[0-9a-f]{64}$/.test(networkId),'GATEWAY_NETWORK_REFUSED');
 const inspectedNetworks=JSON.parse(command(['network','inspect',networkId]));
 S.need(inspectedNetworks.length===1,'GATEWAY_NETWORK_REFUSED');
 const network=inspectedNetworks[0],members=Object.keys(network.Containers||{});
 S.need(members.length>0&&members.every(id=>/^[0-9a-f]{64}$/.test(id)),'GATEWAY_NETWORK_INCOMPLETE');
 const endpoints=JSON.parse(command(['inspect',...members]));
 report.gateway=S.gateway(gatewayConfig,{kong,network,containers:endpoints,authId:auth.Id,restId:rest.Id});
 S.authHooks(S.environment(auth));
 credentials=S.keys(gatewayConfig,env);
 dbId=db.Id;
 const info=JSON.parse(sql(`select json_build_object('version',current_setting('server_version_num')::int,'database',current_database(),'socket',inet_server_addr() is null,'users',(select count(*) from auth.users),'tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m')),'private',to_regnamespace('private') is not null)`));
 S.need(info.version>=170000&&info.version<180000&&info.database==='postgres'&&info.socket,'DATABASE_IDENTITY_REFUSED');
 S.need(info.users===0&&info.tables===0&&!info.private,'FRESH_EMPTY_LOCAL_DATABASE_REQUIRED');report.pgVersion=info.version;
 const extensions=JSON.parse(sql("select coalesce(json_agg(json_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname)),'[]') from pg_extension e join pg_namespace n on n.oid=e.extnamespace"));
 for(const [name,version,schema]of [['pg_stat_statements','1.11','extensions'],['pgcrypto','1.3','extensions'],['plpgsql','1.0','pg_catalog'],['supabase_vault','0.3.1','vault'],['uuid-ossp','1.1','extensions']])S.need(extensions.some(e=>e.name===name&&e.version===version&&e.schema===schema),'EXTENSION_MISMATCH_'+name.replaceAll('-','_'));
 success(await request('/auth/v1/health'));success(await request('/rest/v1/'));
}
async function schemaReady(name){
 sql("notify pgrst,'reload schema';",true);
 for(let i=0;i<30;i++){const r=await request('/rest/v1/',{key:credentials.service,token:credentials.service,timeout:3000});if(r.status===200&&r.body?.paths?.['/rpc/'+name])return;await new Promise(r=>setTimeout(r,300))}throw new S.Failure('POSTGREST_SCHEMA_CACHE_NOT_READY');
}
function apply(name){report.databaseModified=true;sql(fs.readFileSync(path.join(root,'sql',name),'utf8'),true)}
async function tests(){
 await check('01_baseline_et_trigger_Auth',async()=>{apply('01-final-pg17-local.sql');apply('02-auth-local.sql');S.need(sql("select count(*) from pg_tables where schemaname='public'")==='24','BASELINE_TABLES');S.need(sql("select count(*) from pg_policies where schemaname='public'")==='63','BASELINE_POLICIES');await schemaReady('admin_set_user_access')});
 await check('01b_integrite_catalogue_et_ACL_RPC',async()=>{
  for(const [query,expected]of [
   ["select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')",'56'],
   ["select count(*) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'",'135'],
   ["select count(*) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and k.contype='f'",'40'],
   ["select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S'",'5'],
   ["select count(*) from pg_tables where schemaname='public' and rowsecurity",'24']])S.need(sql(query)===expected,'BASELINE_CATALOGUE_MISMATCH');
  const names=['admin_set_profile_permissions','admin_set_user_access','admin_set_user_profile_permissions_070','load_temperature_dashboard_070','log_stopflow_event','mark_order_delivered','mark_order_sent','resolve_checklist_anomaly','save_order_draft_atomic','save_order_draft_atomic_v054','save_temperature_round_070'];
  S.need(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${names.map(lit).join(',')}) and p.prosecdef and pg_get_userbyid(p.proowner)='postgres' and 'search_path=""'=any(p.proconfig) and has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')`)==='11','RPC_ACL_MISMATCH');
 });
 const accounts={};
 await check('02_GoTrue_creation_connexion_refresh_JWT',async()=>{
  for(const [name,email]of [['admin','stopflow-identite-001@example.invalid'],['manager','stopflow-identite-002@example.invalid'],['employee','employee24@example.invalid'],['other','other24@example.invalid'],['reader','reader24@example.invalid'],['inactive','inactive24@example.invalid']]){
   const password=crypto.randomBytes(32).toString('base64url');
   const created=success(await request('/auth/v1/admin/users',{method:'POST',key:credentials.service,token:credentials.service,body:{email,password,email_confirm:true,user_metadata:{prenom:'Test',nom:'Fictif',role:'admin',actif:false}}}));
   const uuid=id(created.id||created.user?.id);accounts[name]={id:uuid,email,password};
   S.need(sql(`select role||'|'||actif from public.profiles where id=${lit(uuid)}`)==='employe|true','AUTH_METADATA_PRIVILEGE_ESCALATION');
  }
  sql(`begin;update public.profiles set role='admin',departement='bureau' where id=${lit(accounts.admin.id)};update public.profiles set role='responsable',departement='bureau' where id=${lit(accounts.manager.id)};update public.profiles set actif=false where id=${lit(accounts.inactive.id)};commit;`,true);
  for(const user of Object.values(accounts)){
   const signed=success(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:user.email,password:user.password}}));
   S.need(S.jwt(signed.access_token,'authenticated'),'AUTH_JWT_INVALID');user.token=signed.access_token;
   S.need(success(await request('/auth/v1/user',{token:user.token})).id===user.id,'AUTH_USER_MISMATCH');
   const renewed=success(await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:signed.refresh_token}}));user.token=renewed.access_token;S.need(S.jwt(user.token,'authenticated'),'REFRESH_JWT_INVALID');
   S.need(success(await request('/auth/v1/user',{token:user.token})).id===user.id,'REFRESH_USER_MISMATCH');delete user.password;
  }report.realAuthTested=true;
 });
 const {admin,manager,employee,other,reader,inactive}=accounts;
 const legacy=(who,role='employe')=>({p_profile_id:who.id,p_prenom:'Test',p_nom:'Fictif',p_role:role,p_actif:true,p_primary_department:role==='employe'?'salle':'bureau',p_departments:role==='employe'?['salle']:[]});
 await check('03_RLS_profils_et_administration',async()=>{
  for(const user of [employee,other])success(await rpc('admin_set_user_access',legacy(user),admin));success(await rpc('admin_set_user_access',legacy(manager,'responsable'),admin));
  for(const user of [manager,employee,inactive])denied(await rpc('admin_set_user_access',legacy(other),user));
  S.need(success(await request('/rest/v1/profiles?select=id',{token:employee.token})).length===1,'PROFILE_RLS_LEAK');
  for(const user of [admin,manager]){const r=await request('/rest/v1/profiles?id=eq.'+user.id,{method:'PATCH',token:admin.token,body:{actif:false}});S.need(r.status>=400&&r.body?.code==='P0001','PROTECTED_ACCOUNT_NOT_GUARDED')}
  const anon=await request('/rest/v1/profiles?select=id');S.need(anon.status===401||anon.status===403,'ANON_PROFILE_ACCESS');
  const permissions={p_profile_id:employee.id,p_permissions:[{permission_key:'inventory.use',scope:'salle'}]};
  for(const user of [manager,employee,inactive])denied(await rpc('admin_set_profile_permissions',permissions,user));
  success(await rpc('admin_set_profile_permissions',permissions,admin));
 });
 const order=crypto.randomUUID(),supplier='Fournisseur fictif mission 24';
 const save=(name,revision)=>({p_order_id:order,p_supplier:supplier,p_author_name:'Test',p_note:name,p_stocks:{},p_adjustments:{},p_inventory_at:null,p_created_at:null,p_expected_revision:revision,p_lines:[]});
 await check('04_reproduction_auteur_NULL',async()=>{
  sql(`begin;set local request.jwt.claim.sub=${lit(admin.id)};insert into public.suppliers(code,name,department) values('fixture24',${lit(supplier)},'salle');insert into public.orders(id,supplier,author_id,author_name,department) values(${lit(order)},${lit(supplier)},null,'Auteur fictif supprimé','salle');commit;`,true);
  S.need(success(await rpc('save_order_draft_atomic',save('Avant correctif',1),employee)).revision===2,'NULL_AUTHOR_REPRODUCTION_CHANGED');
 });
 await check('05_moindre_privilege_et_appels_indirects',async()=>{
  S.need(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and has_table_privilege('authenticated',c.oid,'TRUNCATE')")==='23','TRUNCATE_BASELINE_CHANGED');
  apply('03-least-privilege-review.sql');
  S.need(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and has_table_privilege('authenticated',c.oid,'TRUNCATE')")==='0','TRUNCATE_REMAINS');
  S.need(sql("select count(*) from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace cross join lateral aclexplode(d.defaclacl) a where n.nspname='public' and d.defaclobjtype='r' and a.grantee in (0,(select oid from pg_roles where rolname='authenticated'),(select oid from pg_roles where rolname='anon'))")==='0','CLIENT_DEFAULT_GRANTS_REMAIN');
  for(const user of [admin,manager,employee]){let blocked=false;try{sql(`begin;set local role authenticated;set local request.jwt.claim.sub=${lit(user.id)};select private.sync_legacy_profile_permissions(${lit(other.id)});commit;`,true)}catch(e){blocked=e.code==='SQL_42501'}S.need(blocked,'INTERNAL_HELPER_DIRECT_ACCESS')}
  success(await rpc('admin_set_user_access',legacy(employee),admin));denied(await rpc('admin_set_user_access',legacy(other),employee));
 });
 await check('06_correctif_auteur_NULL_et_commandes',async()=>{
  apply('04-null-author-review.sql');denied(await rpc('save_order_draft_atomic',save('Interdit',2),employee));
  denied(await rpc('save_order_draft_atomic_v054',{...save('Interdit wrapper',2),p_department:'salle'},employee));
  S.need(success(await rpc('save_order_draft_atomic',save('Responsable autorisé',2),manager)).revision===3,'MANAGER_DRAFT_REGRESSION');
  sql(`update public.orders set author_id=${lit(employee.id)} where id=${lit(order)};`,true);
  S.need(success(await rpc('save_order_draft_atomic',save('Été & remarque\nLigne deux',3),employee)).revision===4,'AUTHOR_DRAFT_REGRESSION');denied(await rpc('save_order_draft_atomic',save('Autre employé interdit',4),other));
  success(await rpc('submit_order',{p_order_id:order},employee));success(await rpc('validate_order',{p_order_id:order},manager));
  denied(await rpc('mark_order_sent',{p_order_id:order,p_supplier_email:'supplier@example.invalid',p_estimated_total:0},employee));
  success(await rpc('mark_order_sent',{p_order_id:order,p_supplier_email:'supplier@example.invalid',p_estimated_total:0},manager));
  denied(await rpc('mark_order_delivered',{p_order_id:order,p_note:'Réception test'},employee));success(await rpc('mark_order_delivered',{p_order_id:order,p_note:'Réception test'},manager));
  success(await rpc('log_stopflow_event',{p_event_type:'test_local',p_entity_type:'test',p_entity_id:'fixture24',p_label:'Événement fictif',p_details:{}},employee));
 });
 await check('07_temperature_checklist_RPC',async()=>{
  const equipment=crypto.randomUUID(),template=crypto.randomUUID(),run=crypto.randomUUID(),item=crypto.randomUUID();
  sql(`begin;set local request.jwt.claim.sub=${lit(admin.id)};insert into public.temperature_equipment(id,name) values(${lit(equipment)},'Frigo fictif');insert into public.checklist_templates(id,name,department,checklist_type) values(${lit(template)},'Checklist fictive','salle','controle');insert into public.checklist_runs(id,template_id,template_name,template_version,department,status,performed_by,performed_by_name) values(${lit(run)},${lit(template)},'Checklist fictive',1,'salle','suivi_necessaire',${lit(employee.id)},'Test');insert into public.checklist_run_items(id,run_id,label,anomaly) values(${lit(item)},${lit(run)},'Anomalie fictive',true);commit;`,true);
  const readings={p_readings:[{equipment_id:equipment,temperature:3,note:'Remarque réelle API locale — été & apostrophe'}]};
  denied(await rpc('save_temperature_round_070',readings,employee));denied(await rpc('load_temperature_dashboard_070',{},employee));denied(await rpc('resolve_checklist_anomaly',{p_item_id:item,p_resolution_note:'Refus employé'},employee));
  const modern={p_profile_id:manager.id,p_prenom:'Test',p_nom:'Responsable',p_role:'responsable',p_actif:true,p_permissions:[{permission_key:'temperatures.readings.use',scope:'cuisine'},{permission_key:'checklists.review',scope:'salle'}],p_audit_action:'update'};
  for(const user of [manager,employee,inactive])denied(await rpc('admin_set_user_profile_permissions_070',modern,user));
  success(await rpc('admin_set_user_profile_permissions_070',modern,admin));
  const round=success(await rpc('save_temperature_round_070',readings,manager));S.need(round.equipment_count===1,'ROUND_CONTENT');
  const dashboard=success(await rpc('load_temperature_dashboard_070',{},manager));S.need(dashboard.readings.some(r=>r.note===readings.p_readings[0].note),'ROUND_NOTE_PERSISTENCE');
  success(await rpc('resolve_checklist_anomaly',{p_item_id:item,p_resolution_note:'Résolution fictive'},manager));
  S.need(sql(`select anomaly_status from public.checklist_run_items where id=${lit(item)}`)==='resolue','CHECKLIST_PERSISTENCE');
 });
 await check('08_Reservations_RLS_CRUD_isolation_concurrence',async()=>{
  apply('05-reservations.sql');await schemaReady('reservations_context');
  S.need(success(await rpc('reservations_context',{},admin)).establishments.length===0,'IMPLICIT_ADMIN_TENANT');
  const a=crypto.randomUUID(),b=crypto.randomUUID();
  sql(`begin;insert into public.reservation_establishments(id,name) values(${lit(a)},'Établissement fictif A'),(${lit(b)},'Établissement fictif B');insert into public.reservation_memberships(establishment_id,profile_id,can_view,can_manage_rooms,can_manage_tables) values(${lit(a)},${lit(admin.id)},true,true,true),(${lit(a)},${lit(employee.id)},true,false,false),(${lit(b)},${lit(manager.id)},true,true,true),(${lit(a)},${lit(inactive.id)},true,true,true);commit;`,true);
  const roomArgs=(est,name)=>({p_establishment_id:est,p_id:null,p_expected_version:null,p_name:name,p_description:'Description test',p_sort_order:0,p_active:true});
  const room=success(await rpc('reservations_save_room',roomArgs(a,'Salle A'),admin));const roomB=success(await rpc('reservations_save_room',roomArgs(b,'Salle B'),manager));
  denied(await rpc('reservations_save_room',roomArgs(a,'Interdit lecteur'),employee));denied(await rpc('reservations_read',{p_establishment_id:b},admin));denied(await rpc('reservations_read',{p_establishment_id:a},inactive));
  const tableArgs={p_establishment_id:a,p_room_id:room.id,p_id:null,p_expected_version:null,p_label:'A-1',p_capacity:4,p_shape:'round',p_active:true};
  denied(await rpc('reservations_save_table',{...tableArgs,p_room_id:roomB.id},admin));
  const table=success(await rpc('reservations_save_table',tableArgs,admin));
  const attempts=await Promise.allSettled([rpc('reservations_save_table',{...tableArgs,p_id:table.id,p_expected_version:1,p_capacity:6},admin),rpc('reservations_save_table',{...tableArgs,p_id:table.id,p_expected_version:1,p_capacity:8},admin)]);
  S.need(attempts.every(r=>r.status==='fulfilled'),'CONCURRENT_REQUEST_FAILED');const results=attempts.map(r=>r.value);
  S.need(results.filter(r=>r.status===200).length===1&&results.filter(r=>r.body?.code==='40001').length===1,'CONFLICT_NOT_ENFORCED');
  const read=success(await rpc('reservations_read',{p_establishment_id:a},employee));S.need(read.tables.some(t=>t.id===table.id&&t.version===2),'RESERVATION_PERSISTENCE');
  const disabled=success(await rpc('reservations_save_table',{...tableArgs,p_id:table.id,p_expected_version:2,p_active:false},admin));S.need(disabled.version===3&&disabled.active===false,'RESERVATION_SOFT_DEACTIVATION');
  S.need(success(await rpc('reservations_read',{p_establishment_id:a},employee)).tables.some(t=>t.id===table.id&&t.active===false),'RESERVATION_DEACTIVATION_PERSISTENCE');
  S.need(success(await request('/rest/v1/reservation_rooms?establishment_id=eq.'+b,{token:employee.token})).length===0,'TENANT_RLS_LEAK');
  for(const t of ['reservation_establishments','reservation_memberships','reservation_rooms','reservation_tables','reservation_layouts','reservation_layout_elements','reservation_audit'])S.need(sql(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=${lit(t)} and c.relrowsecurity`)==='1','RESERVATION_RLS_MISSING');
  S.need(Number(sql('select count(*) from public.reservation_audit'))>0,'RESERVATION_AUDIT_MISSING');
 });
}
function saveReport(){
 const dir=path.join(root,'reports');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 fs.writeFileSync(path.join(dir,'result.md'),'# StopFlow 2.4.1 — '+report.decision+'\n\n'+report.checks.map(t=>'- '+t.name+' : '+t.result).join('\n')+'\n\nCode : '+(report.failure||'NONE')+'\n\nAucun secret inclus. Aucun déploiement ni autorisation cloud automatique. Tests UI/iPhone hors périmètre.\n',{mode:0o600});
}
async function main(){
 let lock;
 try{
  S.need(process.argv.slice(2).every(a=>a==='--preflight-only')&&process.argv.slice(2).length<=1,'UNKNOWN_ARGUMENT');
  lock=fs.openSync(path.join(root,'.run.lock'),'wx',0o600);integrity();
  await check('00_cible_locale_et_base_vide',preflight);
  if(process.argv.includes('--preflight-only')){report.failure='PREFLIGHT_ONLY_NO_TEST_EXECUTION';return}
  writes=true;await tests();report.decision='GO';
 }catch(e){report.failure=e instanceof S.Failure?e.code:'LOCAL_RUN_FAILED';process.exitCode=1}
 finally{report.finishedAt=new Date().toISOString();try{if(lock!==undefined)saveReport()}catch{process.exitCode=1;process.stderr.write('NO-GO : rapport non enregistré.\n')}if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(path.join(root,'.run.lock'))}credentials=null;process.stdout.write(report.decision+(lock!==undefined?' — consulter reports/result.md (sans secrets).':' — lancement refusé ; aucun rapport existant remplacé.')+'\n')}
}
if(require.main===module)main();
module.exports={integrity,request,preflight,main};
