/* Offline evidence comparison, not an installer or SQL dependency resolver. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {splitOutside}=require('./audit-migrations.cjs');
const root=path.resolve(__dirname,'..');
const dossier='docs/schema/references/dossier-2026-10-17/';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
function analyze(){
 const provenance=JSON.parse(read(dossier+'PROVENANCE.json'));
 for(const f of provenance.files)if(hash(f.localPath)!==f.sha256)throw Error('Evidence hash mismatch: '+f.localPath);
 const catalogue=JSON.parse(read(dossier+'CATALOGUE_VERIFIE.json'));
 const inventory=JSON.parse(read('docs/schema/INVENTORY.json'));
 const remote=[...read(dossier+'RAPPORT_CATALOGUE_DISTANT.md').matchAll(/^\|\s*(\d{14})\s*\|\s*([a-z0-9_]+)\s*\|/gm)].map(m=>({version:m[1],name:m[2]}));
 if(remote.length!==catalogue.verified_counts.remote_migrations)throw Error('Remote migration list/count mismatch');
 const local=inventory.migrationOrder.map(file=>{const m=path.basename(file).match(/^(\d+)_(.*)\.sql$/);if(!m)throw Error('Unexpected migration name');return {file,version:m[1],name:m[2]}});
 const comparison=local.map(l=>{const candidates=remote.filter(r=>r.name===l.name);return {...l,sha256:hash(l.file),remoteCandidates:candidates,status:l.name==='stopflow_reservations_foundation'?'NEW_RESERVATIONS_NOT_IN_PRODUCTION':candidates.length===1?'SAME_NAME_CONTENT_UNVERIFIED':'NO_EXACT_NAME_MATCH'}});
 const unmatchedRemote=remote.filter(r=>!local.some(l=>l.name===r.name));
 const tables=splitOutside(read(dossier+'19_TABLES_COLONNES_REFERENCE.sql')).map(s=>s.text.replace(/^(?:\s|--[^\n]*(?:\n|$))*/,''));
 const tableReferences=tables.map(s=>{
  const m=s.match(/^CREATE TABLE (public\.\w+)\s*\(([\s\S]*)\);\s*$/i);if(!m)throw Error('Unexpected table reference syntax');
  return {name:m[1],columns:splitOutside(m[2],',',true).map(c=>c.text.trim().replace(/,$/,'').trim()),status:'COLUMNS_ONLY_NOT_INSTALLABLE'};
 });
 if(JSON.stringify(tableReferences.map(t=>t.name).sort())!==JSON.stringify([...catalogue.initial_create_missing_from_local_inventory].sort()))throw Error('19-table identity mismatch');
 const bodySources=['docs/schema/references/stopflow_fonctions_manquantes_reference.sql',dossier+'CURRENT_ROLE_REFERENCE.sql'];
 const functions=bodySources.flatMap(source=>splitOutside(read(source)).map(s=>{
  const m=s.text.match(/CREATE OR REPLACE FUNCTION ((?:private|public)\.(?:"[^"]+"|\w+))\s*\(([^)]*)\)/i);
  if(!m)throw Error('Unexpected reference function');return {name:m[1].replaceAll('"',''),arguments:m[2],source,status:'REFERENCE_BODY_ONLY_ACL_UNVERIFIED'};
 }));
 if(functions.length!==9)throw Error('Expected nine references');
 return {formatVersion:1,status:'BLOCKED_INCOMPLETE_FINAL_STATE_DO_NOT_INSTALL',remoteFactsSource:catalogue.source,remoteVerifiedByCodex:false,baselineStrategy:'Reviewed final-state baseline, then ONLY Reservations; do not replay historical migrations',
  counts:{remote:catalogue.verified_counts,localMigrations:local.length,exactNameCandidates:comparison.filter(c=>c.status==='SAME_NAME_CONTENT_UNVERIFIED').length,unmatchedRemote:unmatchedRemote.length,tableColumnReferences:tableReferences.length,functionBodyReferences:functions.length},
  localMigrations:comparison,unmatchedRemote,tableReferences,functionReferences:functions,
  protectedFunctions:catalogue.privacy.protected_functions_require_review,
  blockers:[
   'Final constraints/indexes/ACL/RLS/triggers for all 24 tables; final columns of the other five tables',
   'All 56 final function identities/bodies/owners/ACL, including four privately reviewed protected-account functions',
   'Five sequences parameters/ownership/ACL, enum/types, schemas/default/column privileges and extension dependencies',
   'handle_new_user() body and exact on_auth_user_created trigger; real Auth provisioning verification',
   'Approved test-only identity mapping preserving protection semantics and provenance of the changed manager default',
   'Blank Supabase with actual GoTrue/PostgREST reconstruction and user-JWT tests; no such stack available here'
  ]};
}
module.exports={analyze};
if(require.main===module){try{
 const result=analyze();
 if(process.argv.includes('--check-ready')){console.error(result.status+'\n'+result.blockers.join('\n'));process.exitCode=2}
 else process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(e){console.error(e.message);process.exitCode=1}}
