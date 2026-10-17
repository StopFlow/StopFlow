'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,devices}=require('playwright');
const {dev}=require('./environment-isolation.cjs');
const {compatibility,build}=require('../scripts/build-environment.cjs');
const root=path.resolve(__dirname,'..'),production=compatibility();
const sdk=process.env.STOPFLOW_SUPABASE_SDK_BUNDLE||'/tmp/stopflow-environment-test-sdk/node_modules/@supabase/supabase-js/dist/umd/supabase.js';
if(!fs.existsSync(sdk))throw Error('SDK Supabase de test absent : voir docs/environments/README.md (SDK épinglé, hors dépôt).');
async function scenario(browser,name,config,{origin=dev.appOrigins[0],mobile=false,mode='blocked',directory=root}={}){
  const context=await browser.newContext(mobile?{...devices['iPhone 13'],serviceWorkers:'block'}:{serviceWorkers:'block'});
  const requests=[],errors=[];
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.startsWith('/npm/@supabase/supabase-js@2'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(sdk)});
    if(url.hostname.endsWith('.supabase.co')){
      requests.push({origin:url.origin,path:url.pathname,method:route.request().method()});
      const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'*'};
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
      if(url.pathname.endsWith('/rpc/redirect_probe'))return route.fulfill({status:307,headers:{...headers,location:production.supabaseUrl+'/rest/v1/rpc/forbidden'}});
      if(url.pathname.includes('/auth/'))return route.fulfill({status:400,headers,json:{code:'invalid_credentials',msg:'Identifiants fictifs de test'}});
      return route.fulfill({headers,json:{id:'fixture-only',persisted:false}});
    }
    if(url.origin!==origin)return route.abort('blockedbyclient');
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(file==='stopflow-environment-config.js'&&config!==null){
      if(config===undefined)return route.fulfill({status:404,body:''});
      return route.fulfill({contentType:'application/javascript',body:'globalThis.STOPFLOW_RUNTIME_CONFIG='+JSON.stringify(config)+';'});
    }
    if(file.includes('/')||file.startsWith('.')||!fs.existsSync(path.join(directory,file)))return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(path.join(directory,file))});
  });
  await context.addInitScript(({ref,seedProductionSession})=>{
    localStorage.setItem('stopflowLogged',JSON.stringify({email:'contact@srlreunion.com'}));
    if(seedProductionSession)localStorage.setItem('sb-'+ref+'-auth-token',JSON.stringify({access_token:'old-production-session-fixture',refresh_token:'old-production-refresh-fixture',expires_at:9999999999}));
  },{ref:require('../stopflow-environment.js').productionRef,seedProductionSession:mode!=='production'});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(origin+'/?environment=production&supabaseUrl='+encodeURIComponent(production.supabaseUrl),{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.stopflowEnvironment&&typeof initSupabaseClient==='function');
    if(mode==='development'){
      assert.equal(await page.evaluate(()=>window.stopflowEnvironment.environment),'development');
      assert.equal(await page.evaluate(()=>Boolean(supabaseClient)),true);
      const result=await page.evaluate(async()=>({rpc:await supabaseClient.rpc('reservations_save_room',{p_name:'Fixture sans écriture réelle'}),auth:await supabaseClient.auth.signInWithPassword({email:'nobody@example.invalid',password:'fixture-password'})}));
      assert.equal(result.rpc.data.id,'fixture-only');assert(result.auth.error);
      const redirected=await page.evaluate(async()=>Boolean((await supabaseClient.rpc('redirect_probe',{})).error));assert.equal(redirected,true);
      const denied=await page.evaluate(async target=>{
        try{await window.stopflowEnvironmentPolicy.guardedFetch(window.stopflowEnvironment,fetch.bind(window))(target+'/rest/v1/orders',{method:'POST',body:'{}'});return false}catch{return true}
      },production.supabaseUrl);assert.equal(denied,true);
      assert(requests.some(r=>r.path==='/rest/v1/rpc/reservations_save_room'&&r.method==='POST'));
      assert(requests.some(r=>r.path==='/auth/v1/token'&&r.method==='POST'));
      assert(requests.every(r=>r.origin===dev.supabaseUrl));
      assert.equal(await page.locator('#localFallbackPanel').isVisible(),false);
    }else if(mode==='production'){
      assert.equal(await page.evaluate(()=>supabaseClient.supabaseUrl.replace(/\/$/,'')),production.supabaseUrl);
      assert.equal(await page.evaluate(()=>supabaseClient.supabaseKey),production.supabasePublicKey);
      assert.equal(requests.length,0,'No real or simulated production write is needed for compatibility');
    }else{
      assert.equal(await page.evaluate(()=>window.stopflowEnvironment.ok),false);
      assert.equal(await page.evaluate(()=>supabaseClient),null);
      assert.equal(await page.locator('#app').isVisible(),false);
      assert.equal(await page.locator('#localFallbackPanel').isVisible(),false);
      assert.equal(await page.locator('#loginButton').isDisabled(),true);
      assert((await page.locator('#loginMessage').textContent()).includes('Configuration'));
      await page.evaluate(()=>{document.querySelector('#loginForm').requestSubmit()});
      assert.equal(requests.length,0);
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS environment browser ${name}: ${requests.length} intercepted Supabase requests; no external traffic or database write`);
  }finally{await context.close()}
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.STOPFLOW_CHROMIUM_PATH||'/usr/bin/chromium'});
  try{
    await scenario(browser,'missing configuration',undefined);
    await scenario(browser,'production profile on Preview',production);
    await scenario(browser,'development pointing to production',{...dev,supabaseUrl:production.supabaseUrl});
    await scenario(browser,'server key refused',{...dev,supabasePublicKey:'sb_secret_administrative_fixture'});
    await scenario(browser,'valid development desktop',dev,{mode:'development'});
    await scenario(browser,'valid development touch',dev,{mode:'development',mobile:true});
    await scenario(browser,'production compatibility',null,{mode:'production',origin:production.appOrigins[0]});
    const os=require('node:os');const parent=fs.mkdtempSync(path.join(os.tmpdir(),'stopflow-environment-browser-'));
    try{
      const out=path.join(parent,'artifact');build({STOPFLOW_ENVIRONMENT:'development',STOPFLOW_APP_ORIGINS:JSON.stringify(dev.appOrigins),STOPFLOW_SUPABASE_URL:dev.supabaseUrl,STOPFLOW_SUPABASE_PUBLIC_KEY:dev.supabasePublicKey},out);
      await scenario(browser,'generated development artifact',null,{mode:'development',directory:out});
    }finally{fs.rmSync(parent,{recursive:true,force:true})}
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
