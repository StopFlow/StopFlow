'use strict';
const {build,hash}=require('../server/receipt-control-pdf.cjs');
const TARGET='https://mmrdpyhoawwoplbzqwag.supabase.co',BRANCH='pilot/stopflow-v1-20261117',UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const allowedErrors=new Set(['ORIGINAL_HASH_MISMATCH','ORIGINAL_PDF_UNREADABLE','ORIGINAL_IMAGE_UNREADABLE','ORIGINAL_TOTAL_LIMIT','ANNEX_PAGE_LIMIT','CONTROL_PDF_SIZE_LIMIT','CONTROL_SOURCE_INVALID']);
async function read(r,limit,binary=false){const chunks=[];let n=0;for await(const c of r.body){n+=c.length;if(n>limit)throw Object.assign(Error('SIZE_LIMIT'),{code:'SIZE_LIMIT'});chunks.push(Buffer.from(c));}const b=Buffer.concat(chunks);return binary?b:JSON.parse(b.toString('utf8'));}
async function run(body,authorization,env,fetcher=fetch,builder=build){
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!==BRANCH||env.STOPFLOW_SUPABASE_URL!==TARGET||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.STOPFLOW_SUPABASE_PUBLIC_KEY||''))return {http:403,data:{status:'PILOT_REQUIRED'}};
 if(!/^Bearer [A-Za-z0-9_.-]{40,8192}$/.test(authorization||'')||!['cuisine','salle'].includes(body?.department)||!UUID.test(body?.id||'')||!UUID.test(body?.request_id||'')||!Number.isSafeInteger(body.version)||body.version<1)return {http:400,data:{status:'REQUEST_REFUSED'}};
 const headers={apikey:env.STOPFLOW_SUPABASE_PUBLIC_KEY,authorization};
 async function rpc(action,payload,request=null){const r=await fetcher(TARGET+'/rest/v1/rpc/pilot_receipt_controls',{method:'POST',headers:{...headers,'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(8000),body:JSON.stringify({p_action:action,p_request:request,p_payload:{department:body.department,id:body.id,...payload}})});if(!r.ok){let e={};try{e=await read(r,5000);}catch{}throw Object.assign(Error('RPC_REFUSED'),{code:['42501','40001','23514','23505','22023'].includes(e.code)?e.code:'RPC_UNCONFIRMED'});}return read(r,500000);}
 async function download(file){if(!new RegExp('^'+body.id+'/[a-f0-9-]{36}$').test(file.path)||file.bytes>15728640)throw Object.assign(Error('PATH'),{code:'CONTROL_SOURCE_INVALID'});const r=await fetcher(TARGET+'/storage/v1/object/authenticated/pilot-receipts-private/'+file.path,{headers,redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Object.assign(Error('ORIGINAL_UNAVAILABLE'),{code:r.status===404?'STORED_FILE_ABSENT':'ORIGINAL_UNAVAILABLE'});const bytes=await read(r,15728640,true);if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Object.assign(Error('HASH'),{code:'ORIGINAL_HASH_MISMATCH'});return bytes;}
 const job=await rpc('prepare',{version:body.version},body.request_id);
 if(job.status==='obsolete')return {http:409,data:{status:'CONTROL_SOURCE_CHANGED',code:'40001',control_id:job.id,draft_preserved:true,previous_attempt_obsolete:true}};
 if(job.status==='completed'){
  const file=await rpc('pdf_info',{control_id:job.id});if(!file)throw Object.assign(Error('PDF_MISSING'),{code:'PDF_READ_UNCONFIRMED'});await download(file);return {http:200,data:{status:'CONTROL_CONFIRMED',control_id:job.id,version:job.version,pdf_file_id:file.id,document_id:body.id,replayed:true}};
 }
 if(job.pdf_file_id){const file=await rpc('pdf_info',{control_id:job.id});if(!file)throw Object.assign(Error('PDF_MISSING'),{code:'PDF_READ_UNCONFIRMED'});try{await download(file);const done=await rpc('finalize',{control_id:job.id},nullUUID(job.id,'finalize',job.request_actor));if(done.status!=='completed')throw Error('FINAL_READ');return {http:200,data:{status:'CONTROL_CONFIRMED',control_id:job.id,version:job.version,pdf_file_id:file.id,document_id:body.id,replayed:true}};}catch(e){if(e.code!=='STORED_FILE_ABSENT')throw e;}}
 const originals=[];for(const file of job.originals)originals.push({file,bytes:await download(file)});
 const pdf=await builder(job,originals);
 // The version ID is also the immutable PDF ID/path. Concurrent requests cannot create a second artifact.
 const registered=await rpc('register_pdf',{control_id:job.id,sha256:pdf.sha256,bytes:pdf.bytes.length},nullUUID(job.id,'register',job.request_actor));
 if(registered.status!=='completed'){
  const upload=await fetcher(TARGET+'/storage/v1/object/pilot-receipts-private/'+body.id+'/'+job.id,{method:'POST',headers:{...headers,'content-type':'application/pdf','x-upsert':'false'},redirect:'error',signal:AbortSignal.timeout(12000),body:pdf.bytes});
  if(!upload.ok&&upload.status!==409&&upload.status!==400)throw Object.assign(Error('UPLOAD'),{code:'PDF_UPLOAD_UNCONFIRMED'});
 }
 // Verify the actual private bytes, even after an acknowledged upload or duplicate-object response.
 await download({path:body.id+'/'+job.id,bytes:pdf.bytes.length,sha256:pdf.sha256});
 const done=await rpc('finalize',{control_id:job.id},nullUUID(job.id,'finalize',job.request_actor));
 const observed=await rpc('job',{control_id:job.id});if(done.status!=='completed'||observed.status!=='completed'||observed.pdf_file_id!==job.id)throw Object.assign(Error('FINAL_READ'),{code:'PDF_READ_UNCONFIRMED'});
 return {http:200,data:{status:'CONTROL_CONFIRMED',control_id:job.id,version:job.version,pdf_file_id:observed.pdf_file_id,document_id:body.id,replayed:false,pages:pdf.pages}};
}
function nullUUID(id,action,actor){const crypto=require('node:crypto'),hex=crypto.createHash('sha256').update('receipt-pdf:'+id+':'+action+':'+actor).digest('hex');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);}
async function handler(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');if(req.method!=='POST')return res.status(405).json({status:'METHOD_REFUSED'});
 try{const out=await run(req.body,req.headers.authorization,process.env);return res.status(out.http).json(out.data);}catch(e){const code=['42501','40001','23514','23505','22023'].includes(e.code)?e.code:null;return res.status(code==='42501'?403:code?409:503).json({status:allowedErrors.has(e.code)?e.code:code?'CONTROL_REFUSED':'CONTROL_PDF_UNCONFIRMED',code,draft_preserved:true});}}
module.exports=handler;module.exports.run=run;
