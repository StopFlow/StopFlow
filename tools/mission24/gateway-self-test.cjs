'use strict';
// Synthetic Docker inspections, including the two aliases observed on the Mac.
// This is NOT the owner's complete 17-route configuration or a Docker test.
const assert=require('node:assert/strict'),S=require('./safety.cjs');
function fixture(){
 const network={Name:'supabase_network_'+S.project,Id:'a'.repeat(64),Driver:'bridge',Scope:'local',Labels:{'com.supabase.cli.project':S.project},Containers:{}};
 const containers=['kong','auth','rest','storage','edge_runtime','realtime','db','studio'].map((service,i)=>{
  const Id=String(i+1).repeat(64),Name='supabase_'+service+'_'+S.project,EndpointID=String(i+1).repeat(32);
  network.Containers[Id]={Name,EndpointID};
  const Env=service==='auth'?['GOTRUE_DB_DATABASE_URL=postgres://fixture:fixture@db:5432/postgres']:service==='rest'?['PGRST_DB_URI=postgres://fixture:fixture@db:5432/postgres']:[];
  return {Id,Name:'/'+Name,State:{Running:true,Health:{Status:'healthy'}},Config:{Labels:{'com.supabase.cli.project':S.project},Env},HostConfig:{NetworkMode:network.Name,PortBindings:{}},NetworkSettings:{Networks:{[network.Name]:{NetworkID:network.Id,EndpointID,IPAddress:'172.30.0.'+(i+2),Aliases:[Name,...(service==='realtime'?['realtime','realtime-dev']:service==='db'?['db']:[])],DNSNames:[Name]}},Ports:{}}};
 });
 const kong=containers[0];for(const map of [kong.HostConfig.PortBindings,kong.NetworkSettings.Ports])map['8000/tcp']=[{HostIp:'127.0.0.1',HostPort:'54321'}];
 const urls=Array.from({length:15},(_,i)=>{
  const [service,port]=[['auth',9999],['rest',3000],['storage',5000],['edge_runtime',9000]][i%4];
  return 'http://supabase_'+service+'_'+S.project+':'+port+'/route'+i;
 }).concat(['http://realtime-dev:4000/','http://realtime:4000/']);
 return {config:'services:\n'+urls.map((url,i)=>'  - name: route'+i+'\n    url: '+url).join('\n'),kong,network,containers,authId:containers[1].Id,restId:containers[2].Id,dbId:containers[6].Id};
}
function run(){
 let checks=0;
 const ok=fn=>{fn();checks++};
 const reject=(change,code)=>ok(()=>{const f=fixture();change(f);assert.throws(()=>S.gateway(f.config,f),e=>e instanceof S.Failure&&(!code||e.code===code))});
 ok(()=>{const f=fixture();assert.deepEqual(S.gateway(f.config,f),{routes:17,destinations:5});assert.equal(S.gatewayPort(f.kong),'54321')});
 for(const alias of ['realtime','realtime-dev'])reject(f=>{const ep=f.containers[5].NetworkSettings.Networks[f.network.Name];ep.Aliases=ep.Aliases.filter(a=>a!==alias)},'GATEWAY_DESTINATION_UNKNOWN_OR_AMBIGUOUS');
 reject(f=>{f.containers[5].Config.Labels['com.supabase.cli.project']='Production'},'CONTAINER_IDENTITY_REFUSED');
 reject(f=>{delete f.containers[5].Config.Labels['com.supabase.cli.project']},'CONTAINER_IDENTITY_REFUSED');
 reject(f=>{f.containers[4].NetworkSettings.Networks[f.network.Name].Aliases.push('realtime')},'GATEWAY_DESTINATION_UNKNOWN_OR_AMBIGUOUS');
 reject(f=>{f.containers[5].NetworkSettings.Networks[f.network.Name].Aliases=f.containers[5].NetworkSettings.Networks[f.network.Name].Aliases.filter(a=>a!=='realtime');f.containers[4].NetworkSettings.Networks[f.network.Name].Aliases.push('realtime')},'GATEWAY_REALTIME_IDENTITY_REFUSED');
 reject(f=>{const c=structuredClone(f.containers[5]);c.Id='e'.repeat(64);c.Name='/foreign';c.Config.Labels['com.supabase.cli.project']='foreign';const ep=c.NetworkSettings.Networks[f.network.Name];ep.Aliases=['realtime-dev'];ep.DNSNames=[];ep.EndpointID='e'.repeat(32);f.network.Containers[c.Id]={Name:'foreign',EndpointID:ep.EndpointID};f.containers.push(c)},'CONTAINER_IDENTITY_REFUSED');
 reject(f=>{f.containers[5].NetworkSettings.Networks.other={NetworkID:'b'.repeat(64)}},'GATEWAY_DESTINATION_FOREIGN_NETWORK');
 reject(f=>{f.containers[5].NetworkSettings.Networks[f.network.Name].NetworkID='b'.repeat(64)},'GATEWAY_ENDPOINT_MISMATCH');
 reject(f=>{f.containers[5].NetworkSettings.Networks[f.network.Name].EndpointID='wrong'},'GATEWAY_ENDPOINT_MISMATCH');
 reject(f=>{f.network.Name='foreign'},'GATEWAY_NETWORK_REFUSED');
 reject(f=>{f.network.Driver='overlay'},'GATEWAY_NETWORK_REFUSED');
 reject(f=>{f.network.Scope='swarm'},'GATEWAY_NETWORK_REFUSED');
 reject(f=>{f.network.Labels['com.supabase.cli.project']='foreign'},'GATEWAY_NETWORK_REFUSED');
 reject(f=>{f.kong.NetworkSettings.Networks.other={NetworkID:'b'.repeat(64)}},'GATEWAY_NETWORK_REFUSED');
 reject(f=>{f.containers.pop()},'GATEWAY_NETWORK_INCOMPLETE');
 reject(f=>{f.containers.push(f.containers[5])},'GATEWAY_NETWORK_INCOMPLETE');
 for(const label of ['foreign',undefined])reject(f=>{
  const c=structuredClone(f.containers[7]);c.Id='f'.repeat(64);c.Name='/unrelated-container';
  c.Config.Labels=label?{'com.supabase.cli.project':label}:{};
  const ep=c.NetworkSettings.Networks[f.network.Name];ep.EndpointID='f'.repeat(32);ep.IPAddress='172.30.0.99';ep.Aliases=['unused-foreign'];ep.DNSNames=['unrelated-container'];
  f.network.Containers[c.Id]={Name:c.Name.slice(1),EndpointID:ep.EndpointID};f.containers.push(c);
 },'CONTAINER_IDENTITY_REFUSED');
 // Neither Studio nor PostgreSQL is a Kong destination: both must still be
 // recognized, healthy, project-owned and attached only to the verified network.
 reject(f=>{f.containers[7].Config.Labels['com.supabase.cli.project']='foreign'},'CONTAINER_IDENTITY_REFUSED');
 reject(f=>{delete f.containers[7].Config.Labels['com.supabase.cli.project']},'CONTAINER_IDENTITY_REFUSED');
 reject(f=>{const c=f.containers[7];c.Name='/unrelated';f.network.Containers[c.Id].Name='unrelated'},'GATEWAY_CONTAINER_NAME_REFUSED');
 reject(f=>{const c=f.containers[7];c.Name='/supabase_intruder_'+S.project;f.network.Containers[c.Id].Name=c.Name.slice(1)},'GATEWAY_CONTAINER_NAME_REFUSED');
 reject(f=>{f.containers[7].State.Running=false},'CONTAINER_IDENTITY_REFUSED');
 reject(f=>{f.containers[7].State.Health.Status='unhealthy'},'CONTAINER_NOT_HEALTHY');
 reject(f=>{f.containers[7].HostConfig.NetworkMode='host'},'HOST_NETWORK_REFUSED');
 reject(f=>{f.containers[7].NetworkSettings.Networks.foreign={NetworkID:'b'.repeat(64)}},'GATEWAY_DESTINATION_FOREIGN_NETWORK');
 reject(f=>{f.containers[7].NetworkSettings.Networks[f.network.Name].EndpointID='wrong'},'GATEWAY_ENDPOINT_MISMATCH');
 reject(f=>{f.containers[7].NetworkSettings.Networks[f.network.Name].Aliases.push(null)},'GATEWAY_MEMBER_UNIDENTIFIED');
 reject(f=>{f.containers[7].NetworkSettings.Networks[f.network.Name].Aliases='db'},'GATEWAY_MEMBER_UNIDENTIFIED');
 for(const host of ['db',S.dbName,'172.30.0.8'])ok(()=>{
  const f=fixture();f.containers[1].Config.Env=['GOTRUE_DB_DATABASE_URL=postgres://fixture:fixture@'+host+':5432/postgres'];
  f.containers[2].Config.Env=['PGRST_DB_URI=postgres://fixture:fixture@'+host+':5432/postgres'];
  assert.equal(S.gateway(f.config,f).routes,17);
 });
 for(const target of [1,2])for(const source of ['Aliases','DNSNames'])reject(f=>{
  f.containers[7].NetworkSettings.Networks[f.network.Name][source].push('DB');
  // Only one consumer needs to use the ambiguous hostname to refuse the stack.
  const other=target===1?2:1,key=other===1?'GOTRUE_DB_DATABASE_URL':'PGRST_DB_URI';
  f.containers[other].Config.Env=[key+'=postgres://fixture:fixture@'+S.dbName+':5432/postgres'];
 },'DATABASE_DESTINATION_UNKNOWN_OR_AMBIGUOUS');
 reject(f=>{for(const c of f.containers.slice(1,3))c.Config.Env=c.Config.Env.map(v=>v.replace('@db:', '@'+S.dbName+':'));f.containers[7].NetworkSettings.Networks[f.network.Name].Aliases.push(S.dbName)},'DATABASE_DESTINATION_UNKNOWN_OR_AMBIGUOUS');
 reject(f=>{f.containers[7].NetworkSettings.Networks[f.network.Name].IPAddress='172.30.0.8';for(const c of f.containers.slice(1,3))c.Config.Env=c.Config.Env.map(v=>v.replace('@db:','@172.30.0.8:'))},'DATABASE_DESTINATION_UNKNOWN_OR_AMBIGUOUS');
 reject(f=>{delete f.dbId},'GATEWAY_DATABASE_IDENTITY_REQUIRED');
 reject(f=>{f.dbId=f.containers[5].Id},'CONTAINER_IDENTITY_REFUSED');
 for(const target of [1,2]){
  reject(f=>{f.containers[target].Config.Env=[]},'DB_ROUTE_UNREADABLE');
  for(const replacement of ['@unknown:','@realtime:','@remote.invalid:'])reject(f=>{f.containers[target].Config.Env=f.containers[target].Config.Env.map(v=>v.replace('@db:',replacement))},'NON_LOCAL_DB_ROUTE_REFUSED');
  for(const suffix of ['?host=remote.invalid','?hostaddr=192.168.1.3','#foreign'])reject(f=>{f.containers[target].Config.Env=f.containers[target].Config.Env.map(v=>v+suffix)},'NON_LOCAL_DB_ROUTE_REFUSED');
 }
 reject(f=>{f.containers[5].State.Health.Status='unhealthy'},'CONTAINER_NOT_HEALTHY');
 reject(f=>{f.containers[5].State.Running=false},'CONTAINER_IDENTITY_REFUSED');
 reject(f=>{f.restId=f.containers[5].Id},'GATEWAY_SERVICE_MISSING');
 for(const url of ['https://example.invalid:443/','http://127.0.0.1:4000/','http://192.168.1.3:4000/','http://[::1]:4000/','http://realtime.example.invalid:4000/','http://realtime:4000@evil.invalid/','http://user@realtime:4000/','http://realtime:4000/#remote','http://realtime:4000/?target=remote','http://unknown:4000/','http://realtime%2edev:4000/','http://realtime:4000/" extra','http://realtime:0/','http://realtime:65536/'])reject(f=>{f.config+='\n    url: '+url});
 for(const ip of ['0.0.0.0','::','192.168.1.3','',undefined])ok(()=>{const f=fixture();f.kong.NetworkSettings.Ports['8000/tcp'][0].HostIp=ip;assert.throws(()=>S.gatewayPort(f.kong),e=>e.code==='GATEWAY_NETWORK_EXPOSURE_REFUSED')});
 ok(()=>{const f=fixture();f.kong.HostConfig.PortBindings['8444/tcp']=[{HostIp:'0.0.0.0',HostPort:'54322'}];assert.throws(()=>S.gatewayPort(f.kong),e=>e.code==='GATEWAY_NETWORK_EXPOSURE_REFUSED')});
 ok(()=>{const f=fixture();f.kong.NetworkSettings.Ports['8001/tcp']=[{HostIp:'::',HostPort:'54322'}];assert.throws(()=>S.gatewayPort(f.kong),e=>e.code==='GATEWAY_NETWORK_EXPOSURE_REFUSED')});
 ok(()=>{const f=fixture();f.kong.NetworkSettings.Ports['8000/tcp'].push({HostIp:'::1',HostPort:'54321'});assert.equal(S.gatewayPort(f.kong),'54321')});
 ok(()=>{const f=fixture();f.kong.NetworkSettings.Ports['8000/tcp'][0].HostIp='::1';assert.throws(()=>S.gatewayPort(f.kong),e=>e.code==='GATEWAY_IPV4_LOOPBACK_REQUIRED')});
 return checks;
}
module.exports={run};
if(require.main===module)console.log('PASS — '+run()+' autotests Kong/Docker simulés ; aucune base contactée.');
