'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const policy=require('../stopflow-environment.js');
const {prepare,build,compatibility}=require('../scripts/build-environment.cjs');
const devRef='abcdefghijklmnopqrst',origin='https://stopflow-test.example';
const dev={schemaVersion:1,environment:'development',appOrigins:[origin],supabaseUrl:'https://'+devRef+'.supabase.co',supabasePublicKey:'sb_publishable_development_fixture_1234567890'};
const env={STOPFLOW_ENVIRONMENT:'development',STOPFLOW_APP_ORIGINS:JSON.stringify(dev.appOrigins),STOPFLOW_SUPABASE_URL:dev.supabaseUrl,STOPFLOW_SUPABASE_PUBLIC_KEY:dev.supabasePublicKey};
let checks=0;
const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++};
const refused=(config,at=origin)=>{check(policy.resolve(config,new URL(at)).ok,false)};
async function main(){
  check(policy.resolve(dev,new URL(origin)).ok,true);
  const production=compatibility();
  check(policy.resolve(production,new URL(policy.productionOrigin)).cloud,true);
  // Recorded from the unchanged URL/public key/origin in 1bf16c4 before extraction.
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify([production.supabaseUrl,production.supabasePublicKey,production.appOrigins[0]])).digest('hex');
  check(fingerprint,'ae24711cc3131a20f293b4d42907ec7af3c2c1945124cca7087ae702d0230782');
  check(policy.resolve(production,new URL('http://localhost')).environment,'offline');
  check(policy.resolve(production,new URL('http://localhost')).supabaseUrl,undefined);
  refused(production);refused(undefined);refused({});refused({...dev,environment:'unknown'});
  for(const url of [production.supabaseUrl,production.supabaseUrl+'/',production.supabaseUrl.toUpperCase(),production.supabaseUrl+'.evil.test','https://'+policy.productionRef+'%2esupabase.co','http://'+devRef+'.supabase.co','https://user:password@'+devRef+'.supabase.co',dev.supabaseUrl+':443',dev.supabaseUrl+'/rest/v1',dev.supabaseUrl+'?project=dev',dev.supabaseUrl+'#dev','https://localhost','https://example.com'])refused({...dev,supabaseUrl:url});
  for(const patch of [{appOrigins:[]},{appOrigins:['*']},{appOrigins:[origin+'/']},{appOrigins:['http://example.com']},{appOrigins:[policy.productionOrigin]},{offlineLocal:true},{supabasePublicKey:''},{supabasePublicKey:'sb_secret_administrative_fixture'},{supabasePublicKey:'sbp_administrative_fixture'},{service_role:'server-secret'},{SUPABASE_SERVICE_ROLE_KEY:'server-secret'}])refused({...dev,...patch});
  refused(dev,'https://another-preview.example');
  refused(dev,policy.productionOrigin);refused({...dev,appOrigins:['http://localhost'],supabaseUrl:production.supabaseUrl},'http://localhost');
  refused({...production,appOrigins:[origin]});
  const jwt=(role,ref)=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({role,ref})).toString('base64url')+'.fixture';
  check(policy.validate({...dev,supabasePublicKey:jwt('anon',devRef)}).projectRef,devRef);
  for(const role of ['service_role','authenticated','admin'])refused({...dev,supabasePublicKey:jwt(role,devRef)});
  refused({...dev,supabasePublicKey:jwt('anon',policy.productionRef)});
  const config=policy.resolve(dev,new URL(origin)),calls=[];
  assert.throws(()=>policy.guardedFetch({...config,supabaseUrl:production.supabaseUrl},()=>{}),/DEVELOPMENT_PRODUCTION/);checks++;
  const fetch=policy.guardedFetch(config,async(input,options)=>{calls.push({input,options});return {ok:true}});
  await fetch(dev.supabaseUrl+'/rest/v1/rpc/reservations_save_room',{method:'POST',body:'{}'});
  check(calls.length,1);check(calls[0].options.redirect,'error');
  for(const destination of [production.supabaseUrl+'/rest/v1/orders',production.supabaseUrl+'/auth/v1/token',dev.supabaseUrl+'.evil.test/rest/v1/orders','https://another-project.supabase.co/rest/v1/orders']){
    await assert.rejects(fetch(destination,{method:'POST'}),/FETCH_DESTINATION/);checks++;
  }
  check(calls.length,1);
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'stopflow-environment-unit-'));
  try{
    for(const patch of [{STOPFLOW_ENVIRONMENT:undefined},{STOPFLOW_SUPABASE_URL:undefined},{STOPFLOW_SUPABASE_PUBLIC_KEY:undefined},{STOPFLOW_SUPABASE_URL:production.supabaseUrl},{STOPFLOW_SUPABASE_PUBLIC_KEY:production.supabasePublicKey},{STOPFLOW_SUPABASE_PUBLIC_KEY:jwt('service_role',devRef)},{STOPFLOW_APP_ORIGINS:'invalid'},{VERCEL_ENV:'preview',VERCEL_URL:'test.vercel.app'},{VERCEL_ENV:'preview',VERCEL_URL:'test.vercel.app',VERCEL_PROJECT_ID:'actual',STOPFLOW_VERCEL_PROJECT_ID:'wrong'}]){
      const out=path.join(parent,'invalid-'+checks);assert.throws(()=>build({...env,...patch},out));check(fs.existsSync(out),false);
    }
    assert.throws(()=>prepare({STOPFLOW_ENVIRONMENT:'production',VERCEL_ENV:'preview'}));checks++;
    const vercel=prepare({...env,STOPFLOW_APP_ORIGINS:undefined,VERCEL_ENV:'production',VERCEL_PROJECT_ID:'test-project',STOPFLOW_VERCEL_PROJECT_ID:'test-project',VERCEL_URL:'test-deployment.vercel.app',VERCEL_BRANCH_URL:'test-branch.vercel.app'});
    check(vercel.environment,'development');check(vercel.appOrigins,['https://test-deployment.vercel.app','https://test-branch.vercel.app']);
    const out=path.join(parent,'valid');build({...env,SUPABASE_SERVICE_ROLE_KEY:'SERVER_SECRET_CANARY',VERCEL_TOKEN:'ADMIN_TOKEN_CANARY'},out);
    const script=fs.readFileSync(path.join(out,'stopflow-environment-config.js'),'utf8');
    check(script.includes(production.supabasePublicKey),false);check(script.includes(production.supabaseUrl),false);
    const artifact=fs.readdirSync(out).map(name=>fs.readFileSync(path.join(out,name),'utf8')).join('\n');
    check(artifact.includes(production.supabaseUrl),false);check(artifact.includes(production.supabasePublicKey),false);
    for(const value of ['SERVER_SECRET_CANARY','ADMIN_TOKEN_CANARY'])check(fs.readdirSync(out).some(name=>fs.readFileSync(path.join(out,name),'utf8').includes(value)),false);
    for(const folder of ['supabase','docs','tests','scripts','api','.env','.git'])check(fs.existsSync(path.join(out,folder)),false);
    check(/stopflow-environment-config\.js\?v=[a-f0-9]{16}/.test(fs.readFileSync(path.join(out,'index.html'),'utf8')),true);
    assert.throws(()=>build(env,out),/neuf/);checks++;
    const prodOut=path.join(parent,'production');build({STOPFLOW_ENVIRONMENT:'production'},prodOut);
    check(fs.readFileSync(path.join(prodOut,'stopflow-environment-config.js'),'utf8').includes(production.supabasePublicKey),true);
  }finally{fs.rmSync(parent,{recursive:true,force:true})}
  console.log(`PASS environment isolation: ${checks} checks; origin/project/key validation, fail-closed build, no production fallback, guarded fetch, public-only artifacts and production compatibility`);
}
module.exports={dev,env};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
