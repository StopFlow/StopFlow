'use strict';
const assert=require('node:assert/strict');const {check}=require('../api/pilot-access-check.js');
const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'pilot/stopflow-v1-20261117',VERCEL_PROJECT_ID:'prj_C4dXTXjVVhTQGxq7NfrORAH7QCF4',
 STOPFLOW_SUPABASE_URL:'https://mmrdpyhoawwoplbzqwag.supabase.co',STOPFLOW_SUPABASE_PUBLIC_KEY:'sb_publishable_SYNTHETIC_ONLY'};
(async()=>{
 let calls=0;const fake=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');
  if(url.endsWith('/auth/v1/settings')){assert.deepEqual(Object.keys(options.headers),['apikey']);return new Response(JSON.stringify({external:{email:true},disable_signup:false,mailer_autoconfirm:false}));}
  assert.equal(url,'https://stopflow-app-git-pilot-stopflow-v1-20261117-stopflow.vercel.app/');assert(!options.headers);
  return new Response('<script src="stopflow-pilot-team.js?v=20261118-team1"></script>');};
 const ok=await check(env,fake);assert.equal(ok.resultat,'PASS_LECTURES_PILOTE');assert.equal(ok.auth_public.confirmation_email_requise,true);assert.equal(calls,2);
 const refuse=await check({...env,VERCEL_ENV:'production'},fake);assert.equal(refuse.resultat,'REFUSE');assert.equal(calls,2);
 const unavailable=await check(env,async()=>{throw Error('SYNTHETIC_SECRET_CANARY');});assert.equal(unavailable.resultat,'NON_CONFIRME');assert(!JSON.stringify(unavailable).includes('CANARY'));
 console.log(JSON.stringify({resultat:'PASS',groupes:3,type:'SIMULATION_LECTURE_ANONYME',reseau_reel:false}));
})().catch(()=>{console.error('PILOT_ACCESS_CHECK_FAILED');process.exitCode=1;});
