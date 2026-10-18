'use strict';
const crypto=require('node:crypto');
const project='StopFlow-test-local',dbName='supabase_db_'+project;
// Recognized local CLI components, including optional services. A new/unknown
// component requires review; the project label alone is not sufficient.
const projectNames=new Set(['db','kong','auth','rest','storage','edge_runtime','realtime','imgproxy','pg_meta','studio','inbucket','mailpit','analytics','vector','pooler','supavisor'].map(s=>'supabase_'+s+'_'+project));
class Failure extends Error{constructor(code){super(code);this.code=code}}
const need=(value,code)=>{if(!value)throw new Failure(code)};
function localUrl(value,port){
 need(typeof value==='string'&&/^http:\/\/(localhost|127\.0\.0\.1):[0-9]{1,5}\/?$/.test(value),'NON_LOCAL_API_REFUSED');
 const actual=Number(value.match(/:([0-9]+)\/?$/)[1]);need(actual>0&&actual<=65535&&(!port||actual===Number(port)),'API_PORT_MISMATCH');return new URL(value);
}
function authHooks(env){need(!Object.entries(env).some(([k,v])=>/^GOTRUE_HOOK_.*_ENABLED$/.test(k)&&/^(true|1)$/i.test(v)),'AUTH_HOOK_REFUSED')}
// Parse only literal URLs from the CLI-generated declarative YAML; no YAML
// evaluation, DNS lookup, redirects or network requests occur in these checks.
function gatewayUrls(config){
 const urls=[];
 for(const line of config.split(/\r?\n/)){
  if(!/^\s*url\s*:/.test(line))continue;
  const match=line.match(/^\s*url:\s*(?:"([^"\\]+)"|'([^']+)'|([^\s"']+))\s*(?:#.*)?$/);
  need(match,'GATEWAY_ROUTE_REFUSED');const raw=match[1]||match[2]||match[3];
  need(/^(?:https?|wss?):\/\/[a-z0-9_-]+:[0-9]{1,5}(?:\/[^\s]*)?$/i.test(raw),'NON_LOCAL_GATEWAY_ROUTE_REFUSED');
  const port=Number(raw.match(/^[^:]+:\/\/[^:]+:([0-9]+)/)[1]);need(port>0&&port<=65535,'GATEWAY_ROUTE_REFUSED');
  let u;try{u=new URL(raw)}catch{throw new Failure('GATEWAY_ROUTE_REFUSED')}
  need(!u.username&&!u.password&&!u.search&&!u.hash,'GATEWAY_ROUTE_REFUSED');
  urls.push(u);
 }
 need(urls.length>0,'GATEWAY_ROUTES_UNREADABLE');return urls;
}
function gatewayPort(kong){
 // Check EVERY published Kong listener, including admin/TLS ports, not only 8000.
 const maps=[kong.NetworkSettings?.Ports,kong.HostConfig?.PortBindings];
 for(const map of maps){need(map&&typeof map==='object','GATEWAY_BINDINGS_UNREADABLE');
  for(const bindings of Object.values(map))for(const b of bindings||[]){
   need(['127.0.0.1','::1'].includes(b.HostIp),'GATEWAY_NETWORK_EXPOSURE_REFUSED');
   need(/^[0-9]{1,5}$/.test(b.HostPort)&&Number(b.HostPort)>0&&Number(b.HostPort)<=65535,'GATEWAY_PORT_REFUSED');
  }
 }
 const active=kong.NetworkSettings.Ports['8000/tcp']||[];
 const declared=kong.HostConfig.PortBindings['8000/tcp']||[];
 need(active.some(b=>b.HostIp==='127.0.0.1'),'GATEWAY_IPV4_LOOPBACK_REQUIRED');
 const ports=[...new Set(active.map(b=>b.HostPort))];
 need(ports.length===1&&declared.some(b=>b.HostIp==='127.0.0.1'&&b.HostPort===ports[0]),'GATEWAY_PORT_REFUSED');
 return ports[0];
}
function gateway(config,{kong,network,containers,authId,restId,dbId}={}){
 need(kong&&network&&Array.isArray(containers),'GATEWAY_DOCKER_EVIDENCE_REQUIRED');
 container(kong,'supabase_kong_'+project);
 need(network.Name==='supabase_network_'+project&&network.Driver==='bridge'&&network.Scope==='local'&&!network.Ingress&&
  (!network.Labels?.['com.supabase.cli.project']||network.Labels['com.supabase.cli.project']===project), 'GATEWAY_NETWORK_REFUSED');
 need(/^[0-9a-f]{64}$/.test(network.Id),'GATEWAY_NETWORK_REFUSED');
 const kNets=kong.NetworkSettings?.Networks||{};
 need(Object.keys(kNets).length===1&&kNets[network.Name]?.NetworkID===network.Id,'GATEWAY_NETWORK_REFUSED');
 const members=network.Containers||{},byId=new Map(containers.map(c=>[c.Id,c]));
 need(byId.size===containers.length&&Object.keys(members).length===containers.length&&
  Object.keys(members).every(id=>byId.has(id))&&byId.has(kong.Id),'GATEWAY_NETWORK_INCOMPLETE');
 const aliases=new Map();
 for(const c of containers){
  // Every network member must be identified, even if no Kong route uses it.
  need(typeof c?.Name==='string'&&/^[0-9a-f]{64}$/.test(c.Id),'GATEWAY_MEMBER_UNIDENTIFIED');
  container(c,c.Name.slice(1));
  need(projectNames.has(c.Name.slice(1)),'GATEWAY_CONTAINER_NAME_REFUSED');
  need(Object.keys(c.NetworkSettings?.Networks||{}).length===1,'GATEWAY_DESTINATION_FOREIGN_NETWORK');
  const endpoint=c.NetworkSettings?.Networks?.[network.Name];
  need(endpoint?.NetworkID===network.Id&&members[c.Id]?.Name===c.Name.slice(1),'GATEWAY_ENDPOINT_MISMATCH');
  need(endpoint.EndpointID&&endpoint.EndpointID===members[c.Id].EndpointID,'GATEWAY_ENDPOINT_MISMATCH');
  need((endpoint.Aliases==null||Array.isArray(endpoint.Aliases))&&(endpoint.DNSNames==null||Array.isArray(endpoint.DNSNames)),'GATEWAY_MEMBER_UNIDENTIFIED');
  // Bind names and direct addresses to inspected endpoint IDs, never DNS lookups.
  const names=[c.Name.slice(1),...(endpoint.Aliases||[]),...(endpoint.DNSNames||[]),...(endpoint.IPAddress?[endpoint.IPAddress]:[])];
  need(names.every(n=>typeof n==='string'&&n.length>0),'GATEWAY_MEMBER_UNIDENTIFIED');
  for(const name of new Set(names.map(n=>n.toLowerCase()))){
   if(!aliases.has(name))aliases.set(name,new Set());aliases.get(name).add(c.Id);
  }
 }
 const urls=gatewayUrls(config),resolved=[];
 for(const url of urls){
  const ids=aliases.get(url.hostname);need(ids?.size===1,'GATEWAY_DESTINATION_UNKNOWN_OR_AMBIGUOUS');
  const c=byId.get([...ids][0]);
  if(['realtime','realtime-dev'].includes(url.hostname))need(c.Name==='/supabase_realtime_'+project,'GATEWAY_REALTIME_IDENTITY_REFUSED');
  resolved.push({url,id:c.Id});
 }
 for(const [id,port]of [[authId,'9999'],[restId,'3000']])need(id&&resolved.some(r=>r.id===id&&r.url.port===port),'GATEWAY_SERVICE_MISSING');
 // Auth and REST use PostgreSQL directly, outside the Kong route list. Resolve
 // their actual configured hosts through the SAME exhaustive endpoint map.
 const db=byId.get(dbId);need(db,'GATEWAY_DATABASE_IDENTITY_REQUIRED');container(db,dbName);
 const dbHosts=[...aliases].filter(([,ids])=>ids.has(dbId)).map(([name])=>name);
 for(const [id,name,key]of [[authId,'auth','GOTRUE_DB_DATABASE_URL'],[restId,'rest','PGRST_DB_URI']]){
  const service=byId.get(id);container(service,'supabase_'+name+'_'+project);
  const url=databaseRoute(environment(service)[key],dbHosts);
  const ids=aliases.get(url.hostname.toLowerCase());
  need(ids?.size===1&&ids.has(dbId),'DATABASE_DESTINATION_UNKNOWN_OR_AMBIGUOUS');
 }
 return {routes:resolved.length,destinations:new Set(resolved.map(r=>r.id)).size};
}
function daemon(env,context){need(!env.DOCKER_HOST&&!env.DOCKER_TLS_VERIFY&&!env.DOCKER_CERT_PATH,'DOCKER_OVERRIDE_REFUSED');need(/^unix:\/\/\//.test(context),'NON_LOCAL_DOCKER_REFUSED')}
function container(c,name){
 need(c.Name==='/'+name&&c.State?.Running&&c.Config?.Labels?.['com.supabase.cli.project']===project,'CONTAINER_IDENTITY_REFUSED');
 need(!c.State.Health||c.State.Health.Status==='healthy','CONTAINER_NOT_HEALTHY');
 need(c.HostConfig?.NetworkMode!=='host','HOST_NETWORK_REFUSED');
}
function environment(c){return Object.fromEntries((c.Config.Env||[]).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)]}))}
function databaseRoute(value,aliases){
 let u;try{u=new URL(value)}catch{throw new Failure('DB_ROUTE_UNREADABLE')}
 need(['postgres:','postgresql:'].includes(u.protocol)&&aliases.map(s=>s.toLowerCase()).includes(u.hostname.toLowerCase())&&(!u.port||u.port==='5432')&&u.pathname==='/postgres','NON_LOCAL_DB_ROUTE_REFUSED');
 // Reject connection-target overrides hidden in libpq query parameters.
 need(!u.search&&!u.hash,'NON_LOCAL_DB_ROUTE_REFUSED');return u;
}
function jwt(value,role){try{const p=JSON.parse(Buffer.from(value.split('.')[1],'base64url'));return value.split('.').length===3&&p.role===role&&!['gjwvquhoecfikjorapud','mywiuegzzldjlsgfiwks','ojqbzyrwuyjggbyphdqi'].includes(p.ref)}catch{return false}}
function keys(config,env){
 const values=[];
 // Narrow extraction from trusted, local CLI-generated declarative config.
 // No YAML evaluation, templates, commands or remote resolution.
 for(const m of config.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g))values.push(m[0]);
 for(const name of ['SUPABASE_ANON_KEY','ANON_KEY','SUPABASE_SERVICE_KEY','SUPABASE_SERVICE_ROLE_KEY','SERVICE_ROLE_KEY'])if(env[name])values.push(env[name]);
 const select=role=>{const found=[...new Set(values.filter(v=>jwt(v,role)))];need(found.length===1,'LOCAL_KEY_DISCOVERY_REFUSED');return found[0]};
 return {anon:select('anon'),service:select('service_role')};
}
function safeSqlState(stderr){const m=String(stderr).match(/ERROR:\s+([A-Z0-9]{5}):/);return m?'SQL_'+m[1]:'LOCAL_COMMAND_FAILED'}
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports={project,dbName,Failure,need,localUrl,daemon,container,environment,databaseRoute,jwt,keys,safeSqlState,hash,gateway,gatewayUrls,gatewayPort,authHooks};
