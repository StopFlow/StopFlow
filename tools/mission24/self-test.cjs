'use strict';
// No Docker, database, credentials, installation or external network required.
const assert=require('node:assert/strict'),http=require('node:http');
const S=require('./safety.cjs'),{request}=require('./local-http.cjs');
let count=0;
function ok(fn){fn();count++}
function refuses(fn,code){ok(()=>assert.throws(fn,e=>e instanceof S.Failure&&(!code||e.code===code)))}
async function main(){
 for(const url of ['http://localhost:54321','http://127.0.0.1:54321/','http://localhost:80'])ok(()=>S.localUrl(url));
 for(const url of ['https://gjwvquhoecfikjorapud.supabase.co','http://192.168.1.4:54321','http://127.1:54321','http://2130706433:54321','http://localhost.evil.invalid:54321','http://user@localhost:54321','http://localhost:54321/?x=1','http://[::1]:54321','http://localhost:0','http://localhost:54321/path'])refuses(()=>S.localUrl(url));
 refuses(()=>S.localUrl('http://localhost:54321',80),'API_PORT_MISMATCH');
 ok(()=>S.daemon({},'unix:///Users/owner/.docker/run/docker.sock'));
 for(const context of ['tcp://127.0.0.1:2375','ssh://test','https://remote.invalid'])refuses(()=>S.daemon({},context));
 refuses(()=>S.daemon({DOCKER_HOST:'unix:///tmp/override'},'unix:///tmp/docker'));
 const c={Name:'/'+S.dbName,State:{Running:true,Health:{Status:'healthy'}},Config:{Labels:{'com.supabase.cli.project':S.project}},HostConfig:{NetworkMode:'bridge'}};
 ok(()=>S.container(c,S.dbName));
 for(const altered of [{...c,Name:'/production'},{...c,Config:{Labels:{}}},{...c,State:{Running:true,Health:{Status:'unhealthy'}}},{...c,HostConfig:{NetworkMode:'host'}}])refuses(()=>S.container(altered,S.dbName));
 ok(()=>S.databaseRoute('postgres://ignored:ignored@supabase_db_StopFlow-test-local:5432/postgres',[S.dbName]));
 for(const route of ['postgres://db.remote.invalid/postgres','postgres://'+S.dbName+'/other','postgres://'+S.dbName+':6543/postgres','https://'+S.dbName+'/postgres'])refuses(()=>S.databaseRoute(route,[S.dbName]));
 const token=(role,ref)=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role,ref})).toString('base64url')+'.FAKE_SIGNATURE_NOT_A_SECRET';
 const anon=token('anon'),service=token('service_role');
 ok(()=>assert.deepEqual(S.keys(anon+' '+service,{}),{anon,service}));
 refuses(()=>S.keys(anon,{}));refuses(()=>S.keys(anon+' '+token('anon','other')+' '+service,{}));
 for(const ref of ['gjwvquhoecfikjorapud','ojqbzyrwuyjggbyphdqi'])ok(()=>assert.equal(S.jwt(token('authenticated',ref),'authenticated'),false));
 count+=require('./gateway-self-test.cjs').run();
 refuses(()=>S.gateway('services: []'));
 ok(()=>S.authHooks({GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED:'false'}));refuses(()=>S.authHooks({GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED:'true'}));
 ok(()=>assert.equal(S.safeSqlState('password=CANARY ERROR: 42501: token=CANARY'),'SQL_42501'));
 ok(()=>assert.equal(S.safeSqlState('password=CANARY'),'LOCAL_COMMAND_FAILED'));
 let requests=0;
 const server=http.createServer((req,res)=>{requests++;if(req.url.endsWith('redirect')){res.writeHead(302,{Location:'https://production.invalid'});res.end()}else{res.setHeader('Content-Type','application/json');res.end('{"local":true}')}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base='http://127.0.0.1:'+server.address().port,keys={anon:'fake-test-only'};
  assert.deepEqual((await request(base,keys,'/rest/v1/test')).body,{local:true});count++;
  await assert.rejects(request(base,keys,'/auth/v1/redirect'),e=>e.code==='HTTP_REDIRECT_REFUSED');count++;
  refuses(()=>request('https://remote.invalid',keys,'/rest/v1/test'));
  refuses(()=>request(base,keys,'//remote.invalid/'));
  assert.equal(requests,2);count++;
 }finally{await new Promise(r=>server.close(r))}
 console.log('PASS — '+count+' contrôles du paquet ; aucune base contactée.');
}
main().catch(()=>{console.error('FAIL — contrôles locaux du paquet.');process.exitCode=1});
