'use strict';
const crypto=require('node:crypto');
const project='StopFlow-test-local',dbName='supabase_db_'+project;
class Failure extends Error{constructor(code){super(code);this.code=code}}
const need=(value,code)=>{if(!value)throw new Failure(code)};
function localUrl(value,port){
 need(typeof value==='string'&&/^http:\/\/(localhost|127\.0\.0\.1):[0-9]{1,5}\/?$/.test(value),'NON_LOCAL_API_REFUSED');
 const actual=Number(value.match(/:([0-9]+)\/?$/)[1]);need(actual>0&&actual<=65535&&(!port||actual===Number(port)),'API_PORT_MISMATCH');return new URL(value);
}
function authHooks(env){need(!Object.entries(env).some(([k,v])=>/^GOTRUE_HOOK_.*_ENABLED$/.test(k)&&/^(true|1)$/i.test(v)),'AUTH_HOOK_REFUSED')}
function gateway(config){
 const urls=[...config.matchAll(/^\s*url:\s*["']?([^\s"']+)/gm)].map(m=>m[1]);
 need(urls.length>0,'GATEWAY_ROUTES_UNREADABLE');
 for(const value of urls){let u;try{u=new URL(value)}catch{throw new Failure('GATEWAY_ROUTE_REFUSED')}
  need(['http:','https:','ws:','wss:'].includes(u.protocol)&&!u.username&&!u.password&&new RegExp('^supabase_[a-z0-9_]+_'+project.toLowerCase()+'$').test(u.hostname),'NON_LOCAL_GATEWAY_ROUTE_REFUSED');
 }
 for(const [service,port]of [['auth','9999'],['rest','3000']])need(urls.some(v=>{const u=new URL(v);return u.hostname===('supabase_'+service+'_'+project).toLowerCase()&&u.port===port}),'GATEWAY_SERVICE_MISSING');
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
module.exports={project,dbName,Failure,need,localUrl,daemon,container,environment,databaseRoute,jwt,keys,safeSqlState,hash,gateway,authHooks};
