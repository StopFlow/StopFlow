'use strict';
// DOM/transport simulation, not a browser or a real Auth session.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require.resolve('../stopflow-pilot-team.js'),'utf8');
function harness(status='approved',hash='') {
  const listeners={},nodes=new Map(),calls=[];let original=0,bootstrap=0;
  function node(id='') {
    const n={id,innerHTML:'',dataset:{},classList:{add(){},remove(){}},setAttribute(){},
      prepend(x){nodes.set(x.id,x);},appendChild(x){nodes.set(x.id,x);},querySelector(selector){return selector==='button'?{}:null;},
      remove(){},showModal(){calls.push('dialog');},close(){}};
    nodes.set(id,n);return n;
  }
  for(const id of ['app','login'])node(id);const main=node('main');
  const context={status,is_owner:status==='approved',profile:{first:'Fictif',role:'admin'},pending_count:2,requests:[]};
  const sdk={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='pilot_team_context'?context:{status:'pending'}};},
    auth:{signUp:async args=>{calls.push(['signup',args]);return {data:{session:{},user:{id:'synthetic'}}};},
      verifyOtp:async()=>{calls.push('verify');return {data:{user:{id:'owner'}}};},
      updateUser:async()=>{calls.push('password');return {data:{}};}}};
  const window={qrcode:require('../stopflow-qr.js'),stopflowEnvironment:{environment:'development',supabaseUrl:'https://mmrdpyhoawwoplbzqwag.supabase.co'},
    stopflowPilotStart(){bootstrap++;},addEventListener(){},stopflow070CardNavigation:{openHome(){calls.push('home');}},
    stopflow070BackNavigation:{back(){calls.push('back');}},stopflowReservations:{confirmLeave:()=>true}};
  const box={window,document:{body:node('body'),getElementById:id=>nodes.get(id)||null,
    querySelector:selector=>selector==='#app main.main'?main:null,querySelectorAll:()=>[],
    createElement:()=>node(),addEventListener:(type,fn)=>listeners[type]=fn},
    supabaseClient:sdk,session:{id:'owner'},location:{hash,search:'',pathname:'/'},
    history:{replaceState(){calls.push('strip-link');}},URLSearchParams,
    confirm:()=>true,loadAuthenticatedProfile:async()=>{original++;},page(){},initSupabaseClient:()=>true,showLogin(){calls.push('login');}};
  vm.createContext(box);vm.runInContext(source,box,{timeout:1000});
  function click(action){listeners.click({target:{closest:s=>s==='[data-pilot-action]'?{dataset:{pilotAction:action}}:null},preventDefault(){},stopImmediatePropagation(){}});}
  return {box,context,calls,nodes,listeners,click,get original(){return original;},get bootstrap(){return bootstrap;}};
}
(async()=>{
  let groups=0;
  for(const status of ['pending','rejected','revoked','unregistered']){
    const h=harness(status);await h.box.loadAuthenticatedProfile({user_metadata:{first_name:'Fictif'}});
    assert.equal(h.original,0);assert.equal(h.box.session,null);assert.equal(h.box.document.body.dataset.pilotEntry,'pending');
    assert(h.nodes.get('sfPilotGate').innerHTML.includes('aucun accès')||h.nodes.get('sfPilotGate').innerHTML.includes('pas consulter')||status==='rejected'||status==='revoked');
  }groups++;
  const h=harness();assert.equal(h.bootstrap,1);await h.box.loadAuthenticatedProfile({id:'owner'});assert.equal(h.original,1);
  assert.equal(h.calls[0][0],'pilot_team_context');groups++;
  h.click('home');h.click('back');h.click('install');await new Promise(setImmediate);assert(h.calls.includes('home')&&h.calls.includes('back')&&h.calls.includes('dialog'));
  assert(h.nodes.get('sfPilotToolbar').innerHTML.includes('Mon profil'));assert(h.nodes.get('sfPilotToolbar').innerHTML.includes('Déconnexion'));groups++;
  const a=harness('activation_required','#pilot_activation='+'a'.repeat(64)+'&type=invite');
  assert.equal(a.bootstrap,0);assert(a.calls.includes('strip-link'));assert.equal(a.box.document.body.dataset.pilotEntry,'activation');
  const form={id:'sfPilotActivation',reportValidity:()=>true,elements:{password:{value:'SYNTHETIC_ONLY_PASSWORD'},confirmation:{value:'SYNTHETIC_ONLY_PASSWORD'}},querySelector:()=>({})};
  const event={target:form,preventDefault(){},stopImmediatePropagation(){}};
  a.listeners.submit(event);await new Promise(setImmediate);
  assert.equal(a.calls.filter(x=>x==='verify').length,1);assert.equal(a.calls.filter(x=>x==='password').length,1);
  assert(a.calls.some(x=>Array.isArray(x)&&x[0]==='pilot_owner_activation_complete'));assert.equal(form.elements.password.value,'');groups++;
  const resume=harness('activation_required');await resume.box.loadAuthenticatedProfile({id:'owner'});assert.equal(resume.original,0);assert.equal(resume.box.document.body.dataset.pilotEntry,'activation');groups++;
  const signup=harness('pending');const button={};const sf={id:'sfPilotSignup',reportValidity:()=>true,querySelector:()=>button,
    elements:{first:{value:'Equipe'},last:{value:'Fictive'},email:{value:'staff@example.invalid'},password:{value:'SYNTHETIC_ONLY_PASSWORD'}}};
  signup.listeners.submit({target:sf,preventDefault(){},stopImmediatePropagation(){}});await new Promise(setImmediate);
  const create=signup.calls.find(x=>Array.isArray(x)&&x[0]==='signup')[1];
  assert.deepEqual(Object.keys(create.options.data).sort(),['first_name','last_name']);
  assert(signup.calls.some(x=>Array.isArray(x)&&x[0]==='pilot_request_access'));assert.equal(signup.original,0);assert.equal(sf.elements.password.value,'');groups++;
  const css=fs.readFileSync(require.resolve('../stopflow-pilot-team.css'),'utf8');
  for(const selector of ['#app>.sidebar','#sf52MenuButton','#sf52Drawer','#sf53CollapseButton','.mobilebar'])assert(css.includes(selector));
  const index=fs.readFileSync(require.resolve('../index.html'),'utf8');assert(index.includes('window.stopflowPilotStart = () => bootstrapAuth();'));
  assert(index.indexOf('stopflow-qr.js?v=2.0.4')<index.indexOf('stopflow-pilot-team.js?v='));groups++;
  console.log(JSON.stringify({resultat:'PASS',groupes:groups,type:'SIMULATION_DOM_AUTH_RPC',navigateur_reel:false}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
