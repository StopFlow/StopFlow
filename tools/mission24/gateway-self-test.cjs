'use strict';
// Synthetic Docker inspections, including the two aliases observed on the Mac.
// This is NOT the owner's complete 17-route configuration or a Docker test.
const assert=require('node:assert/strict'),S=require('./safety.cjs');
function fixture(){
 const network={Name:'supabase_network_'+S.project,Id:'a'.repeat(64),Driver:'bridge',Scope:'local',Labels:{'com.supabase.cli.project':S.project},Containers:{}};
 const containers=['kong','auth','rest','storage','edge_runtime','realtime'].map((service,i)=>{
  const Id=String(i+1).repeat(64),Name='supabase_'+service+'_'+S.project,EndpointID=String(i+1).repeat(32);
  network.Containers[Id]={Name,EndpointID};
  return {Id,Name:'/'+Name,State:{Running:true,Health:{Status:'healthy'}},Config:{Labels:{'com.supabase.cli.project':S.project}},HostConfig:{NetworkMode:network.Name,PortBindings:{}},NetworkSettings:{Networks:{[network.Name]:{NetworkID:network.Id,EndpointID,Aliases:[Name,...(service==='realtime'?['realtime','realtime-dev']:[])],DNSNames:[Name]}},Ports:{}}};
 });
 const kong=containers[0];for(const map of [kong.HostConfig.PortBindings,kong.NetworkSettings.Ports])map['8000/tcp']=[{HostIp:'127.0.0.1',HostPort:'54321'}];
 const urls=Array.from({length:15},(_,i)=>{
  const [service,port]=[['auth',9999],['rest',3000],['storage',5000],['edge_runtime',9000]][i%4];
  return 'http://supabase_'+service+'_'+S.project+':'+port+'/route'+i;
 }).concat(['http://realtime-dev:4000/','http://realtime:4000/']);
 return {config:'services:\n'+urls.map((url,i)=>'  - name: route'+i+'\n    url: '+url).join('\n'),kong,network,containers,authId:containers[1].Id,restId:containers[2].Id};
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
 reject(f=>{const c=structuredClone(f.containers[5]);c.Id='7'.repeat(64);c.Name='/foreign';c.Config.Labels['com.supabase.cli.project']='foreign';const ep=c.NetworkSettings.Networks[f.network.Name];ep.Aliases=['realtime-dev'];ep.DNSNames=[];ep.EndpointID='7'.repeat(32);f.network.Containers[c.Id]={Name:'foreign',EndpointID:ep.EndpointID};f.containers.push(c)},'GATEWAY_DESTINATION_UNKNOWN_OR_AMBIGUOUS');
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
