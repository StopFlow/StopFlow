// Real PostgreSQL persistence through a test-only Playwright RPC bridge.
// Legacy StopFlow reads are fixtures; no cloud request, token or production DB.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,devices}=require('playwright');
const {createDb,users,tenants}=require('./helpers/reservations-db.cjs');
const {roomArgs}=require('./reservations-postgres.cjs');
const root=path.resolve(__dirname,'..');

async function scenario(browser,mobile){
  const db=await createDb();
  const context=await browser.newContext(mobile?{...devices['iPhone 13'],serviceWorkers:'block'}:{viewport:{width:1365,height:950},serviceWorkers:'block'});
  let user=users.admin,failNext=false;
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!=='http://localhost')return route.abort('blockedbyclient');
    if(url.pathname==='/__reservations_rpc'){
      const {name,args}=request.postDataJSON();
      if(failNext&&name.startsWith('reservations_save')){failNext=false;return route.abort('failed')}
      try{return route.fulfill({json:{data:db.rpc(user,name,args),error:null}})}
      catch(error){return route.fulfill({json:{data:null,error:{code:error.code,message:error.message}}})}
    }
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(file.includes('/')||file.startsWith('.')||!fs.existsSync(path.join(root,file)))return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(path.join(root,file))});
  });
  await context.addInitScript(()=>localStorage.setItem('stopflowLogged',JSON.stringify({email:'contact@srlreunion.com'})));
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  const press=async locator=>mobile?locator.tap():locator.click();
  const action=(name,id)=>page.locator(`#sf91Reservations [data-action="${name}"]${id?`[data-id="${id}"]`:''}`).first();
  async function boot(){
    await page.goto('http://localhost/',{waitUntil:'networkidle'});
    await page.locator('#app[data-sf80-startup-ready="1"]').waitFor();
    await page.waitForFunction(()=>window.stopflowReservations?.active&&window.stopflow070CardNavigation?.active);
    await page.waitForTimeout(3200);
    await attach();
  }
  async function attach(){
    await page.evaluate(async id=>{
      session={...session,id,authMode:'supabase',department:'salle'};
      const empty=()=>{const q={select:()=>q,eq:()=>q,order:()=>q,in:()=>q,limit:()=>q,then:(resolve,reject)=>Promise.resolve({data:[],error:null}).then(resolve,reject)};return q};
      supabaseClient={from:empty,rpc:async(name,args={})=>{
        if(!name.startsWith('reservations_'))return {data:[],error:null};
        return (await fetch('/__reservations_rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})})).json();
      }};
      await window.stopflowReservations.refreshAccess();
    },user);
  }
  async function navigate(){
    if(mobile)await press(page.locator('#sf70Home [data-sf70-card="zone:reservations"]'));
    else await page.locator('#sf53DesktopNav [data-sf70-zone="reservations"]').press('Enter');
    await page.locator('#sf91Reservations').waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('#sf91Reservations').getAttribute('aria-busy')==='false'&&document.querySelector('#sf91Reservations [data-action="refresh"]'));
  }
  async function saved(){await page.waitForFunction(()=>document.querySelector('#sf91Reservations').getAttribute('aria-busy')==='false'&&document.querySelector('#sf91Status').textContent.includes('Enregistrement confirmé'))}
  const read=()=>db.rpc(users.admin,'reservations_read',{p_establishment_id:tenants.a});
  const roomName='Salle <svg onload="window.__reservationXss=1"> & équipe';
  try{
    await boot();await navigate();
    assert((await page.locator('#sf91Reservations h1').textContent()).includes('Réservations — Plan de salle'));
    assert.equal(await action('create-room').count(),1);
    await press(action('create-room'));
    const roomForm=page.locator('#sf91RoomForm');
    await roomForm.locator('[name="name"]').fill(roomName);
    await roomForm.locator('[name="description"]').fill("Description : l'équipe & <texte>");
    await press(roomForm.locator('[type="submit"]'));await saved();
    let room=read().rooms[0];assert.equal(room.name,roomName);
    assert.equal(await page.locator('#sf91Reservations').locator('svg,img,script').count(),0);
    assert.equal(await page.evaluate(()=>Boolean(window.__reservationXss)),false);
    for(const [label,capacity,shape] of [['A-1',4,'round'],['B-1',2,'square'],['C-1',6,'rectangle']]){
      const form=page.locator('#sf91TableForm');
      await form.locator('[name="label"]').fill(label);
      await form.locator('[name="capacity"]').fill(String(capacity));
      await form.locator('[name="shape"]').selectOption(shape);
      await press(form.locator('[type="submit"]'));await saved();
    }
    assert.equal(read().tables.length,3);
    assert((await page.locator('#sf91Reservations').textContent()).includes('12 couverts théoriques'));
    assert.equal(await page.locator('.sf91-table.round').count(),1);assert.equal(await page.locator('.sf91-table.square').count(),1);assert.equal(await page.locator('.sf91-table.rectangle').count(),1);
    assert((await page.locator('.sf91-provisional').textContent()).includes('provisoire'));
    await press(page.locator('.sf91-table.round'));
    assert((await page.locator('.sf91-properties').textContent()).includes('4 couverts'));
    const duplicate=page.locator('#sf91TableForm');
    await duplicate.locator('[name="label"]').fill('a-1');
    await press(duplicate.locator('[type="submit"]'));
    await page.waitForFunction(()=>document.querySelector('#sf91Status').textContent.includes('existe déjà'));
    assert.equal(await duplicate.locator('[name="label"]').inputValue(),'a-1');assert.equal(read().tables.length,3);
    await duplicate.locator('[name="capacity"]').fill('0');
    assert.equal(await duplicate.evaluate(form=>form.checkValidity()),false);
    const first=read().tables.find(t=>t.label==='A-1');
    await press(action('edit-table',first.id));
    const edit=page.locator('#sf91TableForm');
    await edit.locator('[name="label"]').fill('A-2');await edit.locator('[name="capacity"]').fill('5');await edit.locator('[name="shape"]').selectOption('rectangle');
    await press(edit.locator('[type="submit"]'));await saved();
    assert.equal(read().tables.find(t=>t.id===first.id).label,'A-2');
    const last=read().tables.find(t=>t.label==='C-1');await press(action('archive-table',last.id));await saved();
    assert.equal(read().tables.find(t=>t.id===last.id).active,false);
    assert((await page.locator('#sf91Reservations').textContent()).includes('7 couverts théoriques'));
    await press(action('edit-room',room.id));
    await roomForm.locator('[name="name"]').fill('Salle renommée');await roomForm.locator('[name="sort_order"]').fill('8');
    await press(roomForm.locator('[type="submit"]'));await saved();
    room=read().rooms.find(r=>r.id===room.id);assert.equal(room.name,'Salle renommée');assert.equal(room.sort_order,8);

    // Real PostgreSQL concurrent edit: stale form must retain the user's input.
    await press(action('edit-table',first.id));
    const current=read().tables.find(t=>t.id===first.id);
    db.rpc(users.admin,'reservations_save_table',{p_establishment_id:tenants.a,p_room_id:room.id,p_id:first.id,p_expected_version:current.version,p_label:'Concurrent serveur',p_capacity:5,p_shape:'rectangle',p_active:true});
    await edit.locator('[name="label"]').fill('Saisie locale conservée');
    await press(edit.locator('[type="submit"]'));
    await page.waitForFunction(()=>document.querySelector('#sf91Status').textContent.includes('autre personne'));
    assert.equal(await edit.locator('[name="label"]').inputValue(),'Saisie locale conservée');
    assert.equal(read().tables.find(t=>t.id===first.id).label,'Concurrent serveur');
    await press(action('refresh'));
    await page.waitForFunction(()=>document.querySelector('#sf91Reservations').getAttribute('aria-busy')==='false');
    await press(action('new-room'));
    await roomForm.locator('[name="name"]').fill('Échec réseau conservé');failNext=true;
    await press(roomForm.locator('[type="submit"]'));
    await page.waitForFunction(()=>document.querySelector('#sf91Status').classList.contains('error'));
    assert.equal(await roomForm.locator('[name="name"]').inputValue(),'Échec réseau conservé');assert.equal(read().rooms.length,1);
    await roomForm.locator('[name="name"]').fill('Seconde salle');await press(roomForm.locator('[type="submit"]'));await saved();
    const second=read().rooms.find(r=>r.name==='Seconde salle');
    await page.locator('[data-filter="room"]').selectOption(second.id);
    assert((await page.locator('#sf91Reservations').textContent()).includes('0 couverts théoriques'));
    await page.locator('[data-filter="room"]').selectOption(room.id);
    await press(action('archive-room',room.id));await saved();assert.equal(read().rooms.find(r=>r.id===room.id).active,false);
    assert.equal(read().tables.length,3);assert.equal(await page.locator('[data-filter="room"]').inputValue(),second.id);
    await boot();await navigate();await press(action('manage'));
    assert((await page.locator('.sf91-list').first().textContent()).includes('Salle renommée'));
    assert.equal(read().tables.find(t=>t.id===first.id).label,'Concurrent serveur');
    user=users.reader;await attach();await page.evaluate(()=>window.stopflowReservations.open());
    await page.waitForFunction(()=>document.querySelector('#sf91Reservations').getAttribute('aria-busy')==='false');
    assert.equal(await action('manage').count(),0);assert.equal(await page.locator('#sf91RoomForm,#sf91TableForm').count(),0);
    const denied=await page.evaluate(async est=>(await supabaseClient.rpc('reservations_save_room',{p_establishment_id:est,p_id:null,p_expected_version:null,p_name:'Interdit',p_description:'',p_sort_order:0,p_active:true})).error.code,tenants.a);
    assert.equal(denied,'42501');
    const forbidden=await page.evaluate(async est=>(await supabaseClient.rpc('reservations_read',{p_establishment_id:est})).error.code,tenants.b);assert.equal(forbidden,'42501');
    assert.equal(await page.locator('#sf91Reservations').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
    await press(action('home'));await page.locator('#sf70Home').waitFor({state:'visible'});
    assert.deepEqual(errors,[]);
    console.log(`PASS Reservations ${mobile?'mobile/touch':'desktop/keyboard'}: real PostgreSQL CRUD/reload, capacity, shapes, archive, immutable IDs, duplicates, form validation, concurrent edit, network failure, XSS, tenant denial, read-only access and home navigation`);
  }catch(error){console.error(await page.evaluate(()=>({visible:[...document.querySelectorAll('#app .page:not(.hidden)')].map(n=>n.id),zone:window.stopflow070CardNavigation?.runtime.currentZone,status:document.querySelector('#sf91Status')?.textContent,focus:document.activeElement?.outerHTML.slice(0,150)})));throw error}
  finally{await context.close();db.close()}
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.STOPFLOW_CHROMIUM_PATH||'/usr/bin/chromium'});
  try{await scenario(browser,false);await scenario(browser,true)}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
