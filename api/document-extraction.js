'use strict';
const crypto=require('node:crypto');const {extract}=require('../server/document-extraction.cjs');
const TARGET='https://mmrdpyhoawwoplbzqwag.supabase.co',BRANCH='pilot/stopflow-v1-20261117';
async function read(response,limit,binary=false){const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Object.assign(Error('LIMIT'),{code:'SIZE_LIMIT'});chunks.push(Buffer.from(chunk));}const b=Buffer.concat(chunks);return binary?b:JSON.parse(b.toString('utf8'));}
async function run(body,authorization,env,fetcher=fetch,extractor=extract){
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!==BRANCH||env.STOPFLOW_SUPABASE_URL!==TARGET||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.STOPFLOW_SUPABASE_PUBLIC_KEY||''))return {http:403,data:{status:'PILOT_REQUIRED'}};
 if(!/^Bearer [A-Za-z0-9_.-]{40,8192}$/.test(authorization||'')||!['cuisine','salle','nettoyage'].includes(body?.department)||!/^[a-f0-9-]{36}$/.test(body?.id||''))return {http:400,data:{status:'REQUEST_REFUSED'}};
 const headers={apikey:env.STOPFLOW_SUPABASE_PUBLIC_KEY,authorization,'Content-Type':'application/json'};
 const response=await fetcher(TARGET+'/rest/v1/rpc/pilot_documents',{method:'POST',headers,body:JSON.stringify({p_action:'file_info',p_request:null,p_payload:body}),redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!response.ok)return {http:403,data:{status:'DOCUMENT_ACCESS_REFUSED'}};
 const file=await read(response,5000);if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(file.path)||file.bytes>15728640)throw Error('FILE_METADATA');
 const original=await fetcher(TARGET+'/storage/v1/object/authenticated/pilot-receipts-private/'+file.path,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!original.ok)return {http:409,data:{status:'PRIVATE_ORIGINAL_UNAVAILABLE',draft_preserved:true}};
 const bytes=await read(original,15728640,true);
 if(bytes.length!==file.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)return {http:409,data:{status:'ORIGINAL_HASH_MISMATCH',draft_preserved:true}};
 return {http:200,data:await extractor(bytes,file.mime,undefined,body.rotation||0)};
}
async function handler(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');if(req.method!=='POST')return res.status(405).json({status:'METHOD_REFUSED'});
 try{const out=await run(req.body,req.headers.authorization,process.env);res.status(out.http).json(out.data);}catch(e){res.status(503).json({status:['PAGE_LIMIT','TEXT_LIMIT','SIZE_LIMIT'].includes(e.code)?e.code:'EXTRACTION_UNAVAILABLE',manual_entry:true,draft_preserved:true});}}
module.exports=handler;module.exports.run=run;
