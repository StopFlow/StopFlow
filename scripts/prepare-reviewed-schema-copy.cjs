/* OFFLINE review aid. No connection/execution, no guarantee of anonymization.
 * Input, mapping and output stay OUTSIDE Git; human DDL review is mandatory. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {splitOutside}=require('./audit-migrations.cjs');
const root=fs.realpathSync(path.resolve(__dirname,'..'));
const inside=p=>p===root||p.startsWith(root+path.sep);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function prepare({raw,mapping,output}){
 for(const p of [raw,mapping])if(!p||inside(fs.realpathSync(p)))throw Error('Raw export and mapping must stay outside the repository');
 if(!output)throw Error('Output required');
 const target=path.join(fs.realpathSync(path.dirname(path.resolve(output))),path.basename(output));
 if(inside(target)||fs.existsSync(target)||fs.existsSync(target+'.manifest.json'))throw Error('Fresh external output required');
 const original=fs.readFileSync(raw,'utf8'),map=JSON.parse(fs.readFileSync(mapping,'utf8'));
 if(!map||Array.isArray(map)||typeof map!=='object')throw Error('Expected explicit email mapping object');
 const entries=Object.entries(map),targets=new Set();
 for(const [from,to] of entries){
  if(!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(from)||typeof to!=='string'||!(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.invalid$/).test(to)||targets.has(to.toLowerCase()))throw Error('Distinct approved fictitious emails required');
  targets.add(to.toLowerCase());if(!original.includes(from))throw Error('Mapping source not found; review locally');
  if(to!==from&&original.includes(to))throw Error('Target identity already present in original; review collision');
 }
 // Detect accidental data dumps without rejecting INSERTs inside function bodies.
 const sql=original.replace(/^\\[^\n]*$/gm,'');
 for(const p of splitOutside(sql)){
  const s=p.text.replace(/^(?:\s|--[^\n]*(?:\n|$))*/,'');
  if(/^(?:INSERT|UPDATE|DELETE|COPY)\b|^SELECT\s+(?:pg_catalog\.)?setval\s*\(/i.test(s))throw Error('Top-level data statement detected; schema-only export required');
 }
 let reviewed=original;
 // Replace simultaneously, preventing one replacement from feeding another.
 const email=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
 reviewed=reviewed.replace(email,value=>{
  if(Object.hasOwn(map,value))return map[value];
  if(value.toLowerCase().endsWith('.invalid'))return value;
  throw Error('Unmapped email detected; review privately');
 });
 if(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|(?:sb_secret_|sbp_|ghp_|github_pat_)[A-Za-z0-9_-]{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\w+:\/\/[^\s/]+:[^\s/]+@/i.test(reviewed))throw Error('Potential credential detected; manual review required');
 const manifest={rawSha256:hash(original),reviewedSha256:hash(reviewed),transformations:entries.map(([from,to])=>({sourceEmailSha256:hash(from),testEmail:to})),humanReviewRequired:true,baselineCompleteVerified:false,execution:'NONE'};
 fs.writeFileSync(target,reviewed,{flag:'wx',mode:0o600});fs.writeFileSync(target+'.manifest.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 return manifest;
}
module.exports={prepare};
if(require.main===module){try{const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){const key={'--raw':'raw','--mapping':'mapping','--out':'output'}[args[i]];if(!key||!args[i+1]||options[key])throw Error('Usage: --raw FILE --mapping JSON --out NEW_EXTERNAL_FILE');options[key]=args[i+1]}const result=prepare(options);console.log(JSON.stringify({reviewedSha256:result.reviewedSha256,humanReviewRequired:true,execution:'NONE'}))}catch(e){console.error(e.message);process.exitCode=1}}
