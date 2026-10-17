'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const policy=require('../stopflow-environment.js');
function compatibility(){
  const context={};vm.runInNewContext(fs.readFileSync(path.join(root,'stopflow-environment-config.js'),'utf8'),context,{timeout:1000});
  return JSON.parse(JSON.stringify(context.STOPFLOW_RUNTIME_CONFIG));
}
function prepare(env){
  const environment=env.STOPFLOW_ENVIRONMENT;
  if(!['development','production'].includes(environment))throw Error('STOPFLOW_ENVIRONMENT explicite requis.');
  const production=compatibility();
  if(environment==='production'){
    if(env.VERCEL_ENV&&env.VERCEL_ENV!=='production')throw Error('Profil Production interdit pour une Preview Vercel.');
    if(env.STOPFLOW_SUPABASE_URL&&env.STOPFLOW_SUPABASE_URL!==production.supabaseUrl)throw Error('Configuration Production différente de la référence.');
    if(env.STOPFLOW_SUPABASE_PUBLIC_KEY&&env.STOPFLOW_SUPABASE_PUBLIC_KEY!==production.supabasePublicKey)throw Error('Configuration Production différente de la référence.');
    if(env.STOPFLOW_APP_ORIGINS&&env.STOPFLOW_APP_ORIGINS!==JSON.stringify(production.appOrigins))throw Error('Origines Production différentes de la référence.');
    policy.validate(production);return production;
  }
  if(env.STOPFLOW_SUPABASE_PUBLIC_KEY===production.supabasePublicKey)throw Error('Clé publique Production interdite en développement.');
  let origins;try{origins=JSON.parse(env.STOPFLOW_APP_ORIGINS||'[]')}catch{throw Error('STOPFLOW_APP_ORIGINS doit être un tableau JSON explicite.');}
  if(!Array.isArray(origins))throw Error('STOPFLOW_APP_ORIGINS doit être un tableau JSON.');
  if(env.VERCEL||env.VERCEL_ENV){
    if(!env.VERCEL_PROJECT_ID||env.STOPFLOW_VERCEL_PROJECT_ID!==env.VERCEL_PROJECT_ID)throw Error('Identité du projet Vercel de test non vérifiée.');
    if(!env.VERCEL_URL)throw Error('Domaine réel Vercel manquant.');
    for(const host of [env.VERCEL_URL,env.VERCEL_BRANCH_URL].filter(Boolean)){
      if(!/^[a-z0-9-]+\.vercel\.app$/.test(host))throw Error('Domaine système Vercel invalide.');
      origins.push('https://'+host);
    }
    origins=[...new Set(origins)];
  }
  const config={schemaVersion:1,environment,appOrigins:origins,supabaseUrl:env.STOPFLOW_SUPABASE_URL,supabasePublicKey:env.STOPFLOW_SUPABASE_PUBLIC_KEY};
  policy.validate(config);
  return config;
}
function build(env,output){
  const config=prepare(env); // Validate before creating or copying any output.
  const directory=path.resolve(output);
  if(directory===root||fs.existsSync(directory))throw Error('Le répertoire de sortie doit être neuf. Aucun fichier existant ne sera écrasé.');
  const javascript='/* Generated public configuration; no server credentials. */\nglobalThis.STOPFLOW_RUNTIME_CONFIG = Object.freeze('+JSON.stringify(config).replace(/</g,'\\u003c')+');\n';
  fs.mkdirSync(directory,{recursive:true});
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    const publicAsset=/^(?:(?:stopflow-[a-z0-9-]+|supabase-[a-z0-9-]+|service-worker)\.(?:js|css)|index\.html|manifest\.webmanifest|favicon[a-z0-9-]*\.(?:svg|png))$/.test(entry.name);
    if(entry.isFile()&&publicAsset&&entry.name!=='stopflow-environment-config.js')fs.copyFileSync(path.join(root,entry.name),path.join(directory,entry.name));
  }
  fs.writeFileSync(path.join(directory,'stopflow-environment-config.js'),javascript,{flag:'wx'});
  const index=path.join(directory,'index.html');
  fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('stopflow-environment-config.js?v=091-env1','stopflow-environment-config.js?v='+crypto.createHash('sha256').update(javascript).digest('hex').slice(0,16)));
  return {environment:config.environment,origins:config.appOrigins,directory};
}
module.exports={prepare,build,compatibility};
if(require.main===module){
  try{
    const args=process.argv.slice(2);
    if(args.length&&!(args.length===2&&args[0]==='--out'))throw Error('Usage: node scripts/build-environment.cjs [--out répertoire-neuf]');
    console.log(JSON.stringify(build(process.env,args[1]||path.join(root,'.stopflow-dist'))));
  }catch(error){console.error('Build StopFlow refusé : '+error.message);process.exitCode=1}
}
