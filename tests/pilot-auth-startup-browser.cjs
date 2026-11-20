'use strict';
// The complete application page and the real, integrity-checked SDK are used.
// Only Auth HTTP responses are simulated. No client is injected, no account used.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const playwright=require(process.env.STOPFLOW_PLAYWRIGHT_MODULE||'playwright-core');
const ROOT=path.resolve(process.env.STOPFLOW_AUTH_DIRECTORY||path.join(__dirname,'../.stopflow-dist'));
const OUT=path.resolve(process.env.STOPFLOW_AUTH_OUTPUT||path.join(ROOT,'pilot-auth'));
const ORIGIN='https://stopflow-app-git-pilot-stopflow-v1-20261117-stopflow.vercel.app';
const TARGET='https://mmrdpyhoawwoplbzqwag.supabase.co';
const pin=require('../tools/pilot/supabase-sdk.json');
const email='startup-fixture@example.invalid',password='FICTITIOUS_INPUT_ONLY';
const cases=['normal','delayed-sdk','failed-sdk','invalid-sdk','timeout-sdk','initialisation-error'];
const engines=(process.env.STOPFLOW_AUTH_ENGINES||'chromium,webkit').split(',');
fs.mkdirSync(OUT,{recursive:true});
const report={resultat:'PASS',page:'INDEX_COMPLET',sdk_reel:pin.version,auth_http:'REPONSES_SIMULEES_AUCUN_COMPTE',cas:[],nettoyage:'NON_CONFIRME'};
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
function read(file){return fs.readFileSync(path.join(ROOT,file));}
async function scenario(browser,engine,mode){
 const context=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true,isMobile:true,serviceWorkers:'block',locale:'fr-BE'});
 const result={engine,mode,etape:'NAVIGATION',resultat:'NON_CONFIRME',http_auth:0,sdk_requetes:0};let releaseSDK=null;const errors=[];
 try{
  if(mode==='initialisation-error')await context.addInitScript(()=>{const original=window.fetch;window.fixtureRestoreFetch=()=>{window.fetch=original;};window.fetch=undefined;});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===TARGET){
    assert.equal(url.pathname,'/auth/v1/token');
    const headers={'access-control-allow-origin':ORIGIN,'access-control-allow-headers':'*','access-control-allow-methods':'POST, OPTIONS'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    assert.equal(request.method(),'POST');result.http_auth++;
    return route.fulfill({status:400,headers,contentType:'application/json',body:JSON.stringify({error_code:'invalid_credentials',msg:'Invalid login credentials'})});
   }
   assert.equal(url.origin,ORIGIN);assert.equal(request.method(),'GET');
   const file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
   const absolute=path.resolve(ROOT,file);assert(absolute.startsWith(ROOT+path.sep));
   if(file===pin.asset){
    result.sdk_requetes++;
    if(result.sdk_requetes===1){
     if(mode==='failed-sdk')return route.abort('failed');
     if(mode==='invalid-sdk')return route.fulfill({contentType:'application/javascript',body:'/* Synthetic invalid SDK: no exported client. */'});
     if(mode==='delayed-sdk'||mode==='timeout-sdk')await new Promise(resolve=>{releaseSDK=resolve;});
    }
   }
   if(!fs.existsSync(absolute)||!fs.statSync(absolute).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body:read(file)});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.name));
  await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded',timeout:30000});
  const button=page.locator('#loginButton'),retry=page.locator('#loginRetry');
  const ready=()=>page.waitForFunction(()=>window.stopflowAuthStatus?.().ready&&!document.getElementById('loginButton').disabled,{},{timeout:15000});
  if(mode==='delayed-sdk'){
   result.etape='ATTENTE_SDK';assert(await button.isDisabled());await page.locator('#email').fill(email);await page.locator('#password').fill(password);
   await page.locator('#loginForm').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(result.http_auth,0);
   for(let i=0;!releaseSDK&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,10));assert(releaseSDK);releaseSDK();await ready();
   assert.equal(await page.locator('#email').inputValue(),email);assert.equal(await page.locator('#password').inputValue(),password);
  }else if(mode!=='normal'){
   result.etape='REFUS_INITIAL';
   await page.waitForFunction(()=>Boolean(window.stopflowAuthStatus?.().code),{},{timeout:13000});
   const code=await page.evaluate(()=>window.stopflowAuthStatus().code);
   assert.equal(code,({'failed-sdk':'SDK_CHARGEMENT_REFUSE','invalid-sdk':'SDK_FORMAT_INVALIDE','timeout-sdk':'SDK_DELAI_DEPASSE','initialisation-error':'CLIENT_INITIALISATION_REFUSEE'})[mode]);
   assert(await button.isDisabled());assert(await retry.isVisible());assert.equal(result.http_auth,0);
   await page.locator('#email').fill(email);await page.locator('#password').fill(password);
   if(mode==='timeout-sdk'){
    assert(releaseSDK);releaseSDK();await page.waitForTimeout(120);
    assert(await button.isDisabled());assert.equal(await page.evaluate(()=>window.stopflowAuthStatus().code),'SDK_DELAI_DEPASSE');
   }
   if(mode==='initialisation-error')await page.evaluate(()=>window.fixtureRestoreFetch());
   result.etape='REESSAI_EXPLICITE';await retry.tap();await ready();
   assert.equal(await page.locator('#email').inputValue(),email);assert.equal(await page.locator('#password').inputValue(),password);
  }else await ready();
  result.etape='CLIENT_REEL_PRET';
  assert(await page.evaluate(()=>Boolean(supabaseClient)&&window.supabaseClient===supabaseClient&&typeof supabaseClient.auth.signInWithPassword==='function'));
  assert.equal(await page.evaluate(()=>window.stopflowEnvironment.supabaseUrl),TARGET);assert.equal(result.http_auth,0);
  assert(await retry.isHidden());
  if(mode==='normal'){
   await page.screenshot({path:path.join(OUT,'connexion-'+engine+'-1024x768.png')});
   await page.locator('#email').fill(email);await page.locator('#password').fill(password);
   const eye=page.locator('#sfPilotPasswordToggle');await eye.tap();assert.equal(await page.locator('#password').getAttribute('type'),'text');await eye.tap();assert.equal(await page.locator('#password').getAttribute('type'),'password');
   result.etape='SOUMISSION_SDK_REEL_HTTP_SIMULE';await button.tap();
   await page.waitForFunction(()=>document.getElementById('loginMessage').textContent.includes('E-mail ou mot de passe incorrect'),{},{timeout:10000});
   assert.equal(result.http_auth,1);assert.equal(await page.locator('#password').inputValue(),password);assert(!(await button.isDisabled()));
  }
  const diagnostic=await page.locator('#loginDiagnostic').textContent();assert(!diagnostic.includes(email)&&!diagnostic.includes(password));assert.deepEqual(errors,[]);
  result.resultat='PASS';result.etape='TERMINEE';
 }catch(error){result.resultat='ECHEC';result.type=error.name;report.resultat='ECHEC';process.exitCode=1;}
 finally{releaseSDK?.();await context.close();report.cas.push(result);}
}
(async()=>{
 assert.equal(crypto.createHash('sha256').update(read(pin.asset)).digest('hex'),pin.sha256);
 for(const engine of engines){assert(['chromium','webkit'].includes(engine));let browser;
  try{browser=await playwright[engine].launch({headless:true,...(engine==='chromium'?{channel:'chromium',args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
   report[engine]=browser.version();for(const mode of cases)await scenario(browser,engine,mode);
  }finally{await browser?.close();}
 }
 report.nettoyage='CONTEXTES_ET_NAVIGATEURS_FERMES';
})().catch(error=>{report.resultat='ECHEC';report.erreur_type=error.name;process.exitCode=1;}).finally(()=>{
 fs.writeFileSync(path.join(OUT,'resultat.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
});
