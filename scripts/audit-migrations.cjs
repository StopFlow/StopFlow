/* Repository-only inventory. This is a lexical index, NOT a SQL dependency
 * resolver or proof that a baseline is complete. No database/network access. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function splitOutside(source,separator=';',parentheses=false){
  const parts=[];let start=0,quote='',escapeQuote=false,dollar='',block=0,line=false,depth=0;
  for(let i=0;i<source.length;i++){
    const c=source[i],next=source[i+1];
    if(line){if(c==='\n')line=false;continue}
    if(block){if(c==='/'&&next==='*'){block++;i++}else if(c==='*'&&next==='/'){block--;i++}continue}
    if(dollar){if(source.startsWith(dollar,i)){i+=dollar.length-1;dollar=''}continue}
    if(quote){if(c===quote){if(next===quote)i++;else quote=''}else if(c==='\\'&&escapeQuote)i++;continue}
    if(c==='-'&&next==='-'){line=true;i++;continue}
    if(c==='/'&&next==='*'){block=1;i++;continue}
    if(c==="'"||c==='"'){quote=c;escapeQuote=c==="'"&&source[i-1]?.toLowerCase()==='e'&&!/\w/.test(source[i-2]||'');continue}
    if(c==='$'){const tag=source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);if(tag){dollar=tag[0];i+=dollar.length-1;continue}}
    if(parentheses){if(c==='(')depth++;if(c===')')depth--}
    if(c===separator&&depth===0){parts.push({text:source.slice(start,i+1),offset:start});start=i+1}
  }
  if(quote||dollar||block)throw Error('Unterminated SQL string/comment');
  if(source.slice(start).trim())parts.push({text:source.slice(start),offset:start});
  return parts;
}
const leading=/^(?:\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/;
const normalized=value=>value.replace(/\s+/g,' ').trim();
function inventoryFile(relative){
  const source=fs.readFileSync(path.join(root,relative),'utf8');
  const statements=splitOutside(source).map(part=>{
    const text=part.text.replace(leading,''),offset=part.offset+part.text.indexOf(text);
    if(!text.trim())return null;
    const line=source.slice(0,offset).split('\n').length;
    const record={line,kind:text.match(/^[a-z]+(?:\s+or\s+replace)?(?:\s+(?:unique\s+)?[a-z]+)?/i)?.[0].toLowerCase()||'unknown'};
    const table=text.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][\w.]*)/i);
    const fn=text.match(/^create\s+(?:or\s+replace\s+)?function\s+([a-z_][\w.]*)/i);
    const schema=text.match(/^create\s+(?:schema|extension|type)\s+(?:if\s+not\s+exists\s+)?([a-z_][\w.]*)/i);
    if(table){
      record.object=table[1];record.kind='create table';
      const body=text.slice(text.indexOf('(')+1,text.lastIndexOf(')'));
      record.columnsAndConstraints=splitOutside(body,',',true).map(p=>normalized(p.text.replace(/,$/,'')));
    }else if(fn){record.object=fn[1];record.kind='create function';record.header=normalized(text.split(/\bas\s+\$/i)[0])}
    else if(schema)record.object=schema[1];
    else if(/^(?:alter\s+(?:table|function|default)|create\s+(?:unique\s+)?index|create\s+(?:constraint\s+)?trigger|create\s+policy|grant|revoke|drop\s+(?:policy|trigger))/i.test(text))record.definition=normalized(text);
    if(/^do\b/i.test(text))record.dynamicReview=true;
    if(/^(?:insert\s+into|update|delete\s+from)\b/i.test(text)){record.dataMutation=true;record.target=text.match(/^(?:insert\s+into|update|delete\s+from)\s+([\w.]+)/i)?.[1]}
    return record;
  }).filter(Boolean);
  const refs=[...source.matchAll(/\b(references|from|join|update|into|alter\s+table)\s+((?:public|auth|private)\.[a-z_][a-z_0-9]*)\b/gi)].filter(m=>!/^from$|^join$/i.test(m[1])||!/^\s*\(/.test(source.slice(m.index+m[0].length))).map(m=>m[2].toLowerCase());
  const calls=[...source.matchAll(/\b((?:private|auth|public)\.[a-z_][a-z_0-9]*)\s*\(/gi)].filter(m=>!/\b(?:references|into)\s*$/i.test(source.slice(Math.max(0,m.index-30),m.index))).map(m=>m[1].toLowerCase());
  return {path:relative,sha256:crypto.createHash('sha256').update(source).digest('hex'),statements,relationCandidates:[...new Set(refs)].sort(),functionCandidates:[...new Set(calls)].sort(),requiresBodyReview:/execute\s|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(source)};
}
function inventory(){
  const active=fs.readdirSync(path.join(root,'supabase/migrations')).filter(p=>p.endsWith('.sql')).sort().map(p=>inventoryFile('supabase/migrations/'+p));
  const createdRelations=new Set(active.flatMap(f=>f.statements.filter(s=>s.kind==='create table').map(s=>s.object)));
  const createdFunctions=new Set(active.flatMap(f=>f.statements.filter(s=>s.kind==='create function').map(s=>s.object)));
  const frontendSources=fs.readdirSync(root).filter(p=>p.endsWith('.js')||p==='index.html').map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
  const frontendRelations=[...new Set([...frontendSources.matchAll(/\.from\(\s*['"]([a-z_][a-z_0-9]*)['"]/g)].map(m=>'public.'+m[1]))].sort();
  const frontendRpc=[...new Set([...frontendSources.matchAll(/\b(?:rpc|callSharedOrderAction)\(\s*['"]([a-z_][a-z_0-9]*)['"]/g)].map(m=>'public.'+m[1]))].sort();
  const relationNames=new Set([...createdRelations,...active.flatMap(f=>f.relationCandidates),...frontendRelations]);
  return {formatVersion:1,status:'PARTIAL_REPOSITORY_NOT_A_COMPLETE_BASELINE',method:'Lexical index of current unquoted identifiers; DO/dynamic SQL and function bodies require review; candidate references are not a complete dependency graph.',migrationOrder:active.map(f=>f.path),active,
    supplemental:['supabase/development/10-check-base.sql','supabase/development/30-check-reservations.sql','supabase/development/40-inspect-schema-metadata.sql','future-online/supabase/schema-propose.sql'].map(inventoryFile),
    relationsWithoutCreate:[...new Set(active.flatMap(f=>f.relationCandidates))].filter(r=>r.startsWith('public.')&&!createdRelations.has(r)).sort(),
    frontendRelations,frontendRpc,
    functionsWithoutStaticCreate:[...new Set([...active.flatMap(f=>f.functionCandidates),...frontendRpc])].filter(r=>!createdFunctions.has(r)&&!relationNames.has(r)).sort(),
    createdRelations:[...createdRelations].sort(),createdFunctions:[...createdFunctions].sort()};
}
module.exports={splitOutside,inventoryFile,inventory};
if(require.main===module){try{process.stdout.write(JSON.stringify(inventory(),null,2)+'\n')}catch(error){console.error(error.message);process.exitCode=1}}
