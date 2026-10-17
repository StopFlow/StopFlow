'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {scenario}=require('./reservations-browser.cjs');
const {users}=require('./helpers/reservations-db.cjs');

async function navigation({page,mobile,boot,attach,navigate,press,action,db,setUser}){
  const nav=()=>page.locator('#sf53DesktopNav [data-sf70-zone="reservations"]');
  const home=async()=>{
    await press(action('home'));await page.locator('#sf70Home').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>rememberedStopFlowPage()),'dashboard','Keep the legacy home key, not its internal alias');
  };
  const visible=async()=>{
    await page.locator('#sf91Reservations').waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('#sf91Reservations').getAttribute('aria-busy')==='false');
    assert.equal(await page.evaluate(()=>window.stopflow070CardNavigation.runtime.currentZone),'reservations');
  };
  async function keyboard(key){
    // Force the real refresh between focus and activation, without timers,
    // event instrumentation, dispatchEvent or a synthetic .click().
    const result=await page.evaluate(()=>{
      const node=document.querySelector('#sf53DesktopNav [data-sf70-zone="reservations"]');
      node.focus();const before=document.activeElement===node;
      for(let i=0;i<5;i++)window.stopflow070CardNavigation.refreshMenus();
      return {before,connected:node.isConnected,focused:document.activeElement===node};
    });
    await page.keyboard.press(key);
    assert.deepEqual(result,{before:true,connected:true,focused:true},'An unchanged menu refresh must preserve the focused button');
    await visible();await home();
  }
  if(!mobile){await keyboard('Enter');await keyboard('Space')}
  else{
    assert.equal(await page.evaluate(()=>{
      const node=document.querySelector('#sf52DrawerContent [data-sf70-zone="reservations"]');
      window.stopflow070CardNavigation.refreshMenus();
      return node===document.querySelector('#sf52DrawerContent [data-sf70-zone="reservations"]');
    }),true,'Mobile menu refresh must retain unchanged buttons');
    await navigate();await visible();await home();
  }
  if(!mobile){
    const box=await nav().boundingBox();assert(box);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.evaluate(()=>window.stopflow070CardNavigation.refreshMenus());
    await page.mouse.up();await visible();await home();
  }

  await boot();
  if(!mobile)await keyboard('Enter');else{await navigate();await visible();await home()}

  // Respect the existing startup cover: a user cannot navigate before ready.
  // A queued historical restore must then respect the page actually opened.
  await page.evaluate(()=>{localStorage.setItem('stopflowLastPage','dashboard');showApp()});
  await page.locator('#app[data-sf80-startup-ready="1"]').waitFor();
  await navigate();
  await page.evaluate(()=>restoreRememberedStopFlowPage());
  assert.equal(await page.evaluate(()=>rememberedStopFlowPage()),'sf91Reservations');
  assert.equal(await page.evaluate(()=>window.stopflow070CardNavigation.runtime.currentZone),'reservations','A stale restore must not return to home');
  await visible();await home();

  // Hold a context response, leave Reservations, then release it. A late
  // response must neither reopen the page nor restore a previous identity.
  let release,started;
  let gate=new Promise(resolve=>{release=resolve});
  let entered=new Promise(resolve=>{started=resolve});
  let defer=true;
  await page.route('**/__reservations_rpc',async route=>{
    if(defer&&route.request().postDataJSON().name==='reservations_context'){
      // Capture the old user's actual DB response before switching identity.
      const data=db.rpc(users.admin,'reservations_context');
      defer=false;started();await gate;
      return route.fulfill({json:{data,error:null}});
    }
    await route.fallback();
  });
  await page.evaluate(()=>{window.__navigationPending=window.stopflowReservations.open()});
  await entered;
  await page.evaluate(()=>window.stopflow070CardNavigation.openHome());
  release();await page.evaluate(()=>window.__navigationPending);
  assert.equal(await page.evaluate(()=>window.stopflow070CardNavigation.runtime.currentZone),'home');
  await page.locator('#sf70Home').waitFor({state:'visible'});

  gate=new Promise(resolve=>{release=resolve});entered=new Promise(resolve=>{started=resolve});defer=true;
  await page.evaluate(()=>{window.__navigationPending=window.stopflowReservations.open()});await entered;
  setUser(users.other);await attach();
  release();await page.evaluate(()=>window.__navigationPending);
  assert.deepEqual(await page.locator('[data-filter="establishment"] option').evaluateAll(nodes=>nodes.map(n=>n.textContent)),['Établissement témoin B']);
  await home();
  setUser(users.admin);await attach();
  await page.evaluate(async()=>{session={...session,authMode:'local',id:null};await window.stopflowReservations.refreshAccess()});
  assert.equal(await nav().count(),0,'Logging out must remove the conditional entry');
  assert.equal(await page.locator('#sf70Home [data-sf70-card="zone:reservations"]').count(),0);
  await attach();await navigate();await visible();
  assert.equal(await nav().count(),1,'Login must restore exactly one authorized entry');
  for(let i=0;i<5;i++){await home();await navigate();await visible()}
  console.log(`PASS Reservations navigation ${mobile?'mobile/touch':'desktop/keyboard'}: stable menu identity, refresh during activation, reload, login, delayed responses, identity switch, conditional entry and rapid navigation`);
}

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.STOPFLOW_CHROMIUM_PATH||'/usr/bin/chromium'});
  try{await scenario(browser,false,navigation);await scenario(browser,true,navigation)}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
