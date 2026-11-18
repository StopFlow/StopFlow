'use strict';
// Read-only proof from a cookie-free HTTP client. No arbitrary URL, credential
// input, account creation or business request is accepted by this endpoint.
const APP='https://stopflow-app-git-pilot-stopflow-v1-20261117-stopflow.vercel.app';
const AUTH='https://mmrdpyhoawwoplbzqwag.supabase.co';
const BRANCH='pilot/stopflow-v1-20261117';
async function bounded(response,limit){
  const reader=response.body?.getReader();if(!reader)return '';
  const chunks=[];let total=0;
  try{for(;;){const item=await reader.read();if(item.done)break;total+=item.value.byteLength;
    if(total>limit){await reader.cancel();throw new Error('LIMIT');}chunks.push(Buffer.from(item.value));}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}
async function check(env,fetcher){
  if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!==BRANCH||env.VERCEL_PROJECT_ID!=='prj_C4dXTXjVVhTQGxq7NfrORAH7QCF4'
    ||env.STOPFLOW_SUPABASE_URL!==AUTH||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.STOPFLOW_SUPABASE_PUBLIC_KEY||''))
    return {resultat:'REFUSE',motif:'PERIMETRE_PILOTE_NON_CONFIRME'};
  const results=await Promise.allSettled([
    fetcher(APP+'/',{redirect:'manual',signal:AbortSignal.timeout(10000)}).then(async r=>{
      const text=await bounded(r,250000);
      return {http:r.status,application:text.includes('stopflow-pilot-team.js?v=20261118-team1'),sans_cookie_et_sans_auth_vercel:true};}),
    fetcher(AUTH+'/auth/v1/settings',{redirect:'manual',headers:{apikey:env.STOPFLOW_SUPABASE_PUBLIC_KEY},signal:AbortSignal.timeout(10000)}).then(async r=>{
      const text=await bounded(r,50000);let data={};if(r.status===200)data=JSON.parse(text);
      return {http:r.status,inscriptions_autorisees:typeof data.disable_signup==='boolean'?!data.disable_signup:null,
        email_active:typeof data.external?.email==='boolean'?data.external.email:null,
        confirmation_email_requise:typeof data.mailer_autoconfirm==='boolean'?!data.mailer_autoconfirm:null};})
  ]);
  const filtered=results.map(r=>r.status==='fulfilled'?r.value:{lecture:'NON_CONFIRMEE',type:'TRANSPORT_OU_REPONSE'});
  return {resultat:filtered[0].http===200&&filtered[0].application&&filtered[1].http===200?'PASS_LECTURES_PILOTE':'NON_CONFIRME',
    acces_anonyme:filtered[0],auth_public:filtered[1],creation_compte:false,lecture_metier:false,
    livraison_email:'NON_VERIFIEE',redirections_auth:'NON_VERIFIEES'};
}
async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({resultat:'METHODE_REFUSEE'}));}
  try{const result=await check(process.env,fetch);res.statusCode=result.resultat==='REFUSE'?403:200;res.end(JSON.stringify(result));}
  catch{res.statusCode=503;res.end(JSON.stringify({resultat:'NON_CONFIRME',motif:'LECTURE_PILOTE_INACCESSIBLE'}));}
}
module.exports=handler;module.exports.check=check;
