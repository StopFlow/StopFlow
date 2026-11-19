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
  run('npm',['install','--prefix',temp,'--save-exact','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org','playwright-core@1.64.1','@sparticuz/chromium@153.0.0'],clean,150000);
  const launch='(async()=>{const {pathToFileURL}=require("node:url");const {default:chromium}=await import(pathToFileURL('+JSON.stringify(path.join(temp,'node_modules/@sparticuz/chromium/build/index.js'))+').href);chromium.setGraphicsMode=false;process.env.STOPFLOW_CHROMIUM_EXECUTABLE=await chromium.executablePath();process.env.STOPFLOW_CHROMIUM_ARGS=JSON.stringify(chromium.args);require('+JSON.stringify(path.resolve(__dirname,'../tests/pilot-touch-browser.cjs'))+');})().catch(e=>{console.error(e);process.exitCode=1;});';
  run(process.execPath,['-e',launch],{...clean,NODE_PATH:path.join(temp,'node_modules'),STOPFLOW_PLAYWRIGHT_MODULE:'playwright-core',STOPFLOW_UI_OUTPUT:out,VERCEL:process.env.VERCEL==='1'?'1':'',DEBUG:'pw:browser'},150000);
  const report=JSON.parse(fs.readFileSync(path.join(out,'resultat.json'),'utf8'));if(report.resultat!=='PASS')throw new Error('PILOT_TOUCH_NOT_PASS');
  const images=fs.readdirSync(out).filter(n=>n.endsWith('.png')).map(name=>{const buffer=fs.readFileSync(path.join(out,name));return {name,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),base64:buffer.toString('base64')};});
  fs.writeFileSync(path.join(out,'captures.json'),JSON.stringify({donnees:'FICTIVES',images}));
  fs.copyFileSync(path.join(temp,'package-lock.json'),path.join(out,'dependencies-lock.json'));
  return {out,report,cleanup:()=>fs.rmSync(temp,{recursive:true,force:true})};
 }catch(error){const reportPath=path.join(out,'resultat.json');if(fs.existsSync(reportPath))console.error('PILOT_UI_RESULT='+fs.readFileSync(reportPath,'utf8'));
  const image=path.join(out,'echec.png');if(fs.existsSync(image)){const b64=fs.readFileSync(image).toString('base64');for(let i=0;i<b64.length;i+=3000)console.log('PILOT_UI_IMAGE_'+String(i/3000).padStart(4,'0')+'='+b64.slice(i,i+3000));}
  fs.rmSync(temp,{recursive:true,force:true});throw error;
 }
}
module.exports={verify};
