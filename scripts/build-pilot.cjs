'use strict';
const {build} = require('./build-environment.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const target = 'https://mmrdpyhoawwoplbzqwag.supabase.co';
const sourceCommit = 'e160453537460c5b05e501d68d2376724b030317';
const publicOrigin = 'https://stopflow-app-git-pilot-stopflow-v1-20261117-stopflow.vercel.app';
const r3Assets = Object.freeze({
  'stopflow-093-service.js': '51ea7ea71ea191597438d9cd68f8d82e3057a8bfef7dc10bdbce5c1472a0637a',
  'stopflow-093-service.css': 'e1f9f31b1affb79ac45b66b65422d833e1bae0533841fb3bdab3082626c3fea3',
  'stopflow-093-service-model.js': 'd1ec2eaf9e1cebb224eaae0908bb5c221d17835182a64e5fa5b319b93a747e09',
});
const delivery=require('../tools/pilot/touch-release.json');
function run(env, output) {
  if (env.STOPFLOW_ENVIRONMENT !== 'development' || env.STOPFLOW_SUPABASE_URL !== target)
    throw new Error('PILOT_TARGET_REQUIRED');
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'preview')
    throw new Error('PILOT_PREVIEW_ONLY');
  if(env.VERCEL_GIT_COMMIT_REF && env.VERCEL_GIT_COMMIT_REF!=='pilot/stopflow-v1-20261117')
    throw new Error('PILOT_BRANCH_REQUIRED');
  const commit = env.VERCEL_GIT_COMMIT_SHA || env.STOPFLOW_PILOT_COMMIT || null;
  if (env.VERCEL_ENV && !/^[a-f0-9]{40}$/.test(commit || ''))
    throw new Error('PILOT_COMMIT_REQUIRED');
  if(delivery.r3_reference!==sourceCommit||delivery.edition!=='20261121-plan1')throw new Error('PILOT_EDITION_UNREVIEWED');
  for (const [file, sha] of Object.entries(delivery.assets)) {
    if (crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', file))).digest('hex') !== sha)
      throw new Error('PILOT_SOURCE_DIFFERENT');
  }
  const origins=JSON.parse(env.STOPFLOW_APP_ORIGINS||'[]');
  if(!Array.isArray(origins))throw new Error('PILOT_ORIGINS_REQUIRED');
  const result = build({...env,STOPFLOW_APP_ORIGINS:JSON.stringify([...new Set([...origins,publicOrigin])])}, output);
  const config = fs.readFileSync(path.join(result.directory, 'stopflow-environment-config.js'), 'utf8');
  if (!config.includes(target) || config.includes('service_role') || config.includes('sb_secret_'))
    throw new Error('PILOT_PUBLIC_CONFIGURATION_DIFFERENT');
  const icons = path.join(result.directory, 'pilot-icons');
  fs.mkdirSync(icons);
  const iconHandler = require('../api/pwa-icon.js');
  const definitions = [
    ['apple-touch-icon.png', 180, false], ['icon-192.png', 192, false],
    ['icon-512.png', 512, false], ['icon-512-maskable.png', 512, true],
  ];
  for (const [name, size, maskable] of definitions) {
    let body;
    const response = {setHeader() {}, end(value) {body = value;}};
    iconHandler({query: {size: String(size), maskable: maskable ? '1' : ''}}, response);
    if (!Buffer.isBuffer(body) || body.readUInt32BE(16) !== size || body.readUInt32BE(20) !== size)
      throw new Error('PILOT_ICON_INVALID');
    fs.writeFileSync(path.join(icons, name), body, {flag: 'wx'});
  }
  const manifestPath = path.join(result.directory, 'manifest.webmanifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  Object.assign(manifest, {name: 'StopFlow V1 Pilote — Données fictives', short_name: 'StopFlow Pilote'});
  manifest.icons = definitions.filter(([,size]) => size !== 180).map(([name, size, maskable]) => ({
    src: '/pilot-icons/' + name, sizes: `${size}x${size}`, type: 'image/png', purpose: maskable ? 'maskable' : 'any',
  }));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  const qrcode = require('../stopflow-qr.js');
  for (const [file, suffix] of [['pilot-install.svg','/'], ['pilot-inscription.svg','/?inscription=1']]) {
    const code=qrcode(0,'M'); code.addData(publicOrigin+suffix,'Byte'); code.make();
    fs.writeFileSync(path.join(result.directory,file),code.createSvgTag({cellSize:6,margin:24,scalable:true}),{flag:'wx'});
  }
  for (const file of ['index.html', 'stopflow-pwa.js']) {
    const filename = path.join(result.directory, file);
    const value = fs.readFileSync(filename, 'utf8').replace(/\/api\/pwa-icon\?size=180(?:&v=[\w-]+)?/g, '/pilot-icons/apple-touch-icon.png')
      .replace(/\/api\/pwa-icon\?size=192(?:&v=[\w-]+)?/g, '/pilot-icons/icon-192.png');
    fs.writeFileSync(filename, value);
  }
  fs.writeFileSync(path.join(result.directory, 'pilot-release.json'), JSON.stringify({
    source_commit: sourceCommit, pilot_commit: commit, project_ref: 'mmrdpyhoawwoplbzqwag',
    environment: 'development', edition:delivery.edition,
    r3_reference:{commit:sourceCommit,assets:r3Assets},source_assets:delivery.assets,
    assets:Object.fromEntries(Object.keys(delivery.assets).map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(result.directory,file))).digest('hex')])),
  }, null, 2) + '\n', {flag: 'wx'});
  return result;
}
module.exports = {run, target};
if (require.main === module) {
  void (async()=>{let fixture;
    try {const result=run(process.env,path.resolve(__dirname,'../.stopflow-dist'));
      const sdk=await require('./prepare-pilot-sdk.cjs').prepare(result.directory);
      const releaseFile=path.join(result.directory,'pilot-release.json'),sdkRelease=JSON.parse(fs.readFileSync(releaseFile,'utf8'));
      sdkRelease.sdk=sdk;sdkRelease.assets[sdk.asset]=sdk.sha256;fs.writeFileSync(releaseFile,JSON.stringify(sdkRelease,null,2)+'\n');
      if(process.env.STOPFLOW_TOUCH_UI_CHECK==='1'){
        fixture=await require('./verify-pilot-touch-build.cjs').verify();
        fs.cpSync(fixture.out,path.join(result.directory,'pilot-touch'),{recursive:true});
        const file=path.join(result.directory,'pilot-release.json'),release=JSON.parse(fs.readFileSync(file,'utf8'));
        release.ui_validation={resultat:fixture.report.resultat,navigateur:fixture.report.navigateur,interaction:fixture.report.interaction,backend:'RPC_SIMULES',rapport:'/pilot-touch/resultat.json'};
        fs.writeFileSync(file,JSON.stringify(release,null,2)+'\n');
      }
      console.log(JSON.stringify(result));
    } catch {console.error('PILOT_BUILD_REFUSED');process.exitCode=1;}
    finally {fixture?.cleanup();}
  })();
}
