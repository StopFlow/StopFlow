'use strict';
// Build-only, ephemeral browser qualification. No service/secret environment is
// forwarded to npm or the browser process, no business HTTP endpoint is used.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),crypto=require('node:crypto');
async function verify(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'stopflow-touch-')),out=path.join(temp,'output');fs.mkdirSync(out);
 const clean={PATH:process.env.PATH,HOME:temp,TMPDIR:temp,LANG:'C.UTF-8',NPM_CONFIG_USERCONFIG:'/dev/null'};
 function run(program,args,env,timeout){const r=spawnSync(program,args,{env,cwd:temp,encoding:'utf8',timeout,maxBuffer:6*1024*1024});if(r.stdout)console.log(r.stdout);if(r.status!==0){console.error(JSON.stringify({etape:program==='npm'?'PREPARATION_NAVIGATEUR':'SCENARIO_TACTILE',code:r.status,erreur_type:r.error?.code||null}));for(const line of (r.stderr||'').split('\n').filter(Boolean))for(let i=0;i<line.length;i+=1600)console.error('PILOT_BROWSER_DIAG '+line.slice(i,i+1600));throw new Error('PILOT_TOUCH_CHECK_FAILED');}}
 try{
  console.log('QUALIFICATION_TACTILE_ISOLEE_DEMARREE');
  run('npm',['install','--prefix',temp,'--save-exact','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org','playwright-core@1.64.1'],clean,150000);
  // Official AL2023 packages, confined to this disposable build VM.
  // A real fontconfig/font installation is required by the full browser.
  run('dnf',['install','-y','nss','dejavu-sans-fonts'],clean,150000);
  const browserEnv={...clean,PLAYWRIGHT_BROWSERS_PATH:path.join(temp,'browsers')};
  run(process.execPath,[path.join(temp,'node_modules/playwright-core/cli.js'),'install','chromium','--no-shell'],browserEnv,150000);
  const executable=path.join(browserEnv.PLAYWRIGHT_BROWSERS_PATH,'chromium-1248/chrome-linux64/chrome');
  const deps=spawnSync('ldd',[executable],{env:browserEnv,encoding:'utf8'});
  console.log('BROWSER_NATIVE_LIBRARIES '+JSON.stringify({unresolved:(deps.stdout||'').split('\n').filter(l=>l.includes('not found')).map(l=>l.trim()),uid:process.getuid?.(),package_manager:['dnf','yum','apt-get','rpm2cpio'].filter(n=>spawnSync('which',[n],{env:clean}).status===0)}));
  run(process.execPath,[path.resolve(__dirname,'../tests/pilot-plan-browser.cjs')],{...browserEnv,NODE_PATH:path.join(temp,'node_modules'),STOPFLOW_PLAYWRIGHT_MODULE:'playwright-core',STOPFLOW_UI_OUTPUT:out,STOPFLOW_PLAN_ENGINES:'chromium',DEBUG:'pw:browser'},150000);
  const authOutput=path.join(out,'auth');
  run(process.execPath,[path.resolve(__dirname,'../tests/pilot-auth-startup-browser.cjs')],{...browserEnv,NODE_PATH:path.join(temp,'node_modules'),STOPFLOW_AUTH_DIRECTORY:path.resolve(__dirname,'../.stopflow-dist'),STOPFLOW_AUTH_OUTPUT:authOutput,STOPFLOW_AUTH_ENGINES:'chromium'},150000);
  const auth=JSON.parse(fs.readFileSync(path.join(authOutput,'resultat.json'),'utf8'));if(auth.resultat!=='PASS')throw new Error('PILOT_AUTH_STARTUP_NOT_PASS');
  const serviceOutput=path.join(out,'service');
  run(process.execPath,[path.resolve(__dirname,'../tests/pilot-service-shell-browser.cjs')],{...browserEnv,NODE_PATH:path.join(temp,'node_modules'),STOPFLOW_AUTH_DIRECTORY:path.resolve(__dirname,'../.stopflow-dist'),STOPFLOW_SERVICE_OUTPUT:serviceOutput,STOPFLOW_SERVICE_ENGINES:'chromium'},150000);
  run(process.execPath,[path.resolve(__dirname,'../tests/pilot-service-shell-browser.cjs')],{...browserEnv,NODE_PATH:path.join(temp,'node_modules'),STOPFLOW_AUTH_DIRECTORY:path.resolve(__dirname,'../.stopflow-dist'),STOPFLOW_SERVICE_OUTPUT:path.join(out,'placement'),STOPFLOW_SERVICE_ENGINES:'chromium',STOPFLOW_BOOKING_PLACEMENT_ONLY:'1'},150000);
  run(process.execPath,[path.resolve(__dirname,'../tests/pilot-service-shell-browser.cjs')],{...browserEnv,NODE_PATH:path.join(temp,'node_modules'),STOPFLOW_AUTH_DIRECTORY:path.resolve(__dirname,'../.stopflow-dist'),STOPFLOW_SERVICE_OUTPUT:path.join(out,'controls'),STOPFLOW_SERVICE_ENGINES:'chromium',STOPFLOW_SERVICE_CONTROLS_ONLY:'1'},150000);
  run(process.execPath,[path.resolve(__dirname,'../tests/harmony-browser.cjs')],{...browserEnv,NODE_PATH:path.join(temp,'node_modules'),STOPFLOW_AUTH_DIRECTORY:path.resolve(__dirname,'../.stopflow-dist'),STOPFLOW_HARMONY_OUTPUT:path.join(out,'harmony'),STOPFLOW_HARMONY_ENGINES:'chromium',STOPFLOW_HARMONY_PROFILES:'owner'},150000);
  run(process.execPath,[path.resolve(__dirname,'../tests/receipt-30-browser.cjs')],{...browserEnv,NODE_PATH:path.join(temp,'node_modules'),STOPFLOW_AUTH_DIRECTORY:path.resolve(__dirname,'../.stopflow-dist'),STOPFLOW_CONTROL_BROWSER_OUTPUT:path.join(out,'receipt-control'),STOPFLOW_CONTROL_ENGINES:'chromium',STOPFLOW_CONTROL_PROFILES:'cuisine'},150000);
  const service=JSON.parse(fs.readFileSync(path.join(serviceOutput,'resultat.json'),'utf8'));if(service.resultat!=='PASS')throw new Error('PILOT_SERVICE_SHELL_NOT_PASS');
  const serviceImages=fs.readdirSync(serviceOutput).filter(n=>n.endsWith('.png')).map(name=>{const buffer=fs.readFileSync(path.join(serviceOutput,name));return {name,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),base64:buffer.toString('base64')};});fs.writeFileSync(path.join(serviceOutput,'captures.json'),JSON.stringify({donnees:'FICTIVES',images:serviceImages}));
  const report=JSON.parse(fs.readFileSync(path.join(out,'resultat.json'),'utf8'));if(report.resultat!=='PASS')throw new Error('PILOT_TOUCH_NOT_PASS');
  const images=fs.readdirSync(out).filter(n=>n.endsWith('.png')).map(name=>{const buffer=fs.readFileSync(path.join(out,name));return {name,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),base64:buffer.toString('base64')};});
  fs.writeFileSync(path.join(out,'captures.json'),JSON.stringify({donnees:'FICTIVES',images}));
  fs.copyFileSync(path.join(temp,'package-lock.json'),path.join(out,'dependencies-lock.json'));
  return {out,report,cleanup:()=>fs.rmSync(temp,{recursive:true,force:true})};
 }catch(error){const reportPath=path.join(out,'resultat.json');if(fs.existsSync(reportPath))console.error('PILOT_UI_RESULT='+fs.readFileSync(reportPath,'utf8'));
  const image=path.join(out,'echec.png');if(fs.existsSync(image)){const b64=fs.readFileSync(image).toString('base64');for(let i=0;i<b64.length;i+=1000)console.log('PILOT_UI_IMAGE_'+String(i/1000).padStart(4,'0')+'='+b64.slice(i,i+1000));}
  fs.rmSync(temp,{recursive:true,force:true});throw error;
 }
}
module.exports={verify};
