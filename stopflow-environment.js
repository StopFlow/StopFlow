/* Shared browser/build policy. Configuration data never selects itself by
 * query string, browser storage, branch name or an unknown hostname. */
(function(global){
  'use strict';
  const productionRef='gjwvquhoecfikjorapud';
  const productionOrigin='https://stopflow-app.vercel.app';
  const fields=new Set(['schemaVersion','environment','appOrigins','supabaseUrl','supabasePublicKey','offlineLocal']);
  const fail=code=>{throw Object.assign(new Error('Configuration StopFlow refusée ('+code+').'),{code})};
  function appOrigin(value){
    if(typeof value!=='string')return fail('ORIGIN');
    let url;try{url=new URL(value)}catch{return fail('ORIGIN')}
    const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.origin!==value||url.username||url.password||!(url.protocol==='https:'||(url.protocol==='http:'&&loopback)))return fail('ORIGIN');
    return url.origin;
  }
  function publicKey(key,ref){
    if(typeof key!=='string')return fail('PUBLIC_KEY');
    if(/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(key))return key;
    if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key))return fail('PUBLIC_KEY');
    try{
      const segment=key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const claims=JSON.parse(typeof Buffer!=='undefined'?Buffer.from(segment,'base64').toString('utf8'):atob(segment));
      if(claims.role!=='anon'||claims.ref!==ref)return fail('PUBLIC_KEY_ROLE_OR_PROJECT');
    }catch(error){if(error.code)throw error;return fail('PUBLIC_KEY')}
    return key;
  }
  function validate(config){
    if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(key=>!fields.has(key)))return fail('FIELDS');
    if(config.schemaVersion!==1||!['production','development'].includes(config.environment))return fail('ENVIRONMENT');
    if(!Array.isArray(config.appOrigins)||!config.appOrigins.length||config.appOrigins.length>20)return fail('ORIGINS');
    const origins=config.appOrigins.map(appOrigin);
    let url;try{url=new URL(config.supabaseUrl)}catch{return fail('SUPABASE_URL')}
    const match=url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    if(!match||url.protocol!=='https:'||url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash||config.supabaseUrl!==url.origin)return fail('SUPABASE_URL');
    const ref=match[1];
    if(config.environment==='development'&&(ref===productionRef||origins.includes(productionOrigin)||config.offlineLocal===true))return fail('DEVELOPMENT_PRODUCTION');
    if(config.environment==='production'&&(ref!==productionRef||origins.some(origin=>origin!==productionOrigin)))return fail('PRODUCTION_IDENTITY');
    if(config.offlineLocal!==undefined&&typeof config.offlineLocal!=='boolean')return fail('OFFLINE');
    return Object.freeze({environment:config.environment,appOrigins:Object.freeze(origins),supabaseUrl:url.origin,supabasePublicKey:publicKey(config.supabasePublicKey,ref),projectRef:ref,offlineLocal:config.offlineLocal===true});
  }
  function resolve(config,location){
    try{
      const value=validate(config);
      const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname)||location.protocol==='file:';
      if(value.environment==='production'&&value.offlineLocal&&local)return Object.freeze({ok:true,environment:'offline',cloud:false,allowLocalFallback:true,error:'Mode local sans connexion Supabase.'});
      if(!value.appOrigins.includes(location.origin))return fail('DEPLOYMENT_ORIGIN');
      return Object.freeze({...value,ok:true,cloud:true,allowLocalFallback:false,error:''});
    }catch(error){return Object.freeze({ok:false,environment:'blocked',cloud:false,allowLocalFallback:false,error:error.message,code:error.code||'CONFIGURATION'})}
  }
  function guardedFetch(config,nativeFetch){
    if(!config?.ok||!config.cloud||config.environment!=='development')return fail('FETCH_CONFIGURATION');
    const approved=validate({schemaVersion:1,environment:'development',appOrigins:config.appOrigins,supabaseUrl:config.supabaseUrl,supabasePublicKey:config.supabasePublicKey});
    return async function(input,options){
      let url;try{url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url)}catch{return fail('FETCH_URL')}
      if(url.origin!==approved.supabaseUrl||url.username||url.password)return fail('FETCH_DESTINATION');
      // A development endpoint may not redirect an Auth/REST request elsewhere.
      return nativeFetch(input,{...options,redirect:'error'});
    };
  }
  const policy=Object.freeze({validate,resolve,guardedFetch,productionRef,productionOrigin});
  if(typeof module!=='undefined'&&module.exports)module.exports=policy;
  else{
    Object.defineProperty(global,'stopflowEnvironment',{value:resolve(global.STOPFLOW_RUNTIME_CONFIG,global.location),writable:false,configurable:false});
    Object.defineProperty(global,'stopflowEnvironmentPolicy',{value:policy,writable:false,configurable:false});
  }
})(globalThis);
