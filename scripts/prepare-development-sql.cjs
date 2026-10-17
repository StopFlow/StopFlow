/* Offline packaging ONLY. Does not connect, invoke psql, or apply any SQL. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {productionRef}=require('../stopflow-environment.js');
const root=path.resolve(__dirname,'..');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function prepareSql({projectRef,baseline,sha256,output}){
  if(typeof projectRef!=='string'||!/^[a-z0-9]{20}$/.test(projectRef)||projectRef===productionRef)throw Error('Référence explicite d’un projet de test distinct requise.');
  if(!baseline||!/^[a-f0-9]{64}$/.test(sha256||''))throw Error('Baseline SQL revue et SHA256 indépendant requis. Le dépôt ne fournit pas de baseline complète.');
  const source=fs.readFileSync(baseline);
  if(!source.length||digest(source)!==sha256)throw Error('Baseline vide ou empreinte différente.');
  if(source.toString('utf8').includes(productionRef))throw Error('La baseline contient une référence au projet Production : revue nécessaire.');
  if(!output||fs.existsSync(output))throw Error('Répertoire de sortie neuf requis.');
  const files={
    '00-reviewed-baseline.sql':source,
    '10-check-base.sql':fs.readFileSync(path.join(root,'supabase/development/10-check-base.sql')),
    '20-reservations.sql':fs.readFileSync(path.join(root,'supabase/migrations/20261017120000_stopflow_reservations_foundation.sql')),
    '30-check-reservations.sql':fs.readFileSync(path.join(root,'supabase/development/30-check-reservations.sql'))
  };
  fs.mkdirSync(output,{recursive:true});
  for(const [name,bytes] of Object.entries(files))fs.writeFileSync(path.join(output,name),bytes,{flag:'wx'});
  const manifest={projectRef,execution:'NONE — offline preparation, manual project identity verification still required',baselineReview:'REQUIRED — a supplied hash does not prove semantic review',files:Object.entries(files).map(([name,bytes])=>({name,sha256:digest(bytes)}))};
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return manifest;
}
module.exports={prepareSql};
if(require.main===module){
  try{
    const args=process.argv.slice(2),options={};
    for(let i=0;i<args.length;i+=2){const key={'--project-ref':'projectRef','--baseline':'baseline','--sha256':'sha256','--out':'output'}[args[i]];if(!key||!args[i+1]||options[key])throw Error('Usage: --project-ref REF --baseline SQL --sha256 EMPREINTE --out REPERTOIRE-NEUF');options[key]=args[i+1]}
    const result=prepareSql(options);console.log(JSON.stringify({projectRef:result.projectRef,execution:'NONE',files:result.files.length}));
  }catch(error){console.error('Préparation SQL refusée : '+error.message);process.exitCode=1}
}
