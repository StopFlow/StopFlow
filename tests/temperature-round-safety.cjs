// Node.js + Playwright + Chromium. All app files are served from disk;
// external traffic is blocked and every RPC uses an in-memory fixture.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, devices} = require('playwright');
const root = path.resolve(process.env.STOPFLOW_TEST_ROOT || path.join(__dirname, '..'));
const saveSelector = '#sf70TemperatureV3 [data-tv3-action="save-round"]';
const normal = "L'équipe & le joint : \"à revoir\" < 3 > 1.\nDeuxième ligne.";
const formNote = normal.replace(/\n/g, ' '); // The existing temperature note control is single-line.
const attack = '<img src=x onerror="window.__temperatureXss=1"><svg onload="window.__temperatureXss=1"></svg><script>window.__temperatureXss=1</script>\' & < > "';
const long = 'RemarqueSansEspace'.repeat(80);

async function fillRound(page) {
  await page.evaluate(note => {
    document.querySelectorAll('#sf70TemperatureV3 .sf70-tv3-reading').forEach((row, index) => {
      const input = row.querySelector('.sf70-tv3-value');
      input.value = String([4.2, -18, 3][index]);
      input.dispatchEvent(new Event('input', {bubbles:true}));
      row.querySelector('.sf70-tv3-note').value = index === 0 ? note : '';
    });
  }, formNote);
}

async function values(page) {
  return page.evaluate(() => [...document.querySelectorAll('#sf70TemperatureV3 .sf70-tv3-reading')]
    .map(row => [row.querySelector('.sf70-tv3-value').value, row.querySelector('.sf70-tv3-note').value]));
}

async function assertBusy(page, busy) {
  assert.equal(await page.evaluate(() => window.stopflow070TemperatureV3.state.saving), busy);
  assert.equal(await page.locator(saveSelector).getAttribute('aria-busy'), String(busy));
  if (busy) {
    assert.equal(await page.locator(saveSelector).isDisabled(), true);
    assert.equal(await page.locator(saveSelector).textContent(), 'Enregistrement…');
  }
}

async function extraTapWhilePending(page) {
  // Native second tap on the disabled control, then a direct event sequence to
  // verify the local submission guard independently of disabled-button behavior.
  const box = await page.locator(saveSelector).boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator(saveSelector).evaluate(node => {
    node.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, cancelable:true, pointerType:'touch', button:0}));
    node.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
  });
}

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.STOPFLOW_CHROMIUM_PATH || '/usr/bin/chromium'});
  const context = await browser.newContext({...devices['iPhone 13'], serviceWorkers:'block'});
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost') return route.abort('blockedbyclient');
    const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (filename.includes('/') || filename.startsWith('.') || !fs.existsSync(path.join(root, filename))) return route.fulfill({status:404, body:''});
    const type = {'.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml'}[path.extname(filename)] || 'application/octet-stream';
    return route.fulfill({contentType:type, body:fs.readFileSync(path.join(root, filename))});
  });
  await context.addInitScript(() => localStorage.setItem('stopflowLogged', JSON.stringify({email:'contact@srlreunion.com'})));
  const page = await context.newPage();
  const errors = [], dialogs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  try {
    await page.goto('http://localhost/', {waitUntil:'networkidle'});
    await page.waitForFunction(() => window.stopflow070TemperatureV3?.active && window.stopflow070TemperatureV3Visibility?.active);
    await page.waitForTimeout(3500);
    await page.evaluate(({normal, attack, long}) => {
      window.__temperatureXss = 0;
      const equipment = [1,2,3].map(i => ({id:'equipment-'+i, name:'Frigo & '+i, active:true, equipment_type:i===2?'freezer':'fridge', min_allowed:i===2?-25:0, max_allowed:i===2?-15:6}));
      const notes = [normal, '', null, '  ', attack, long];
      const rounds = [{id:'past-round', completed_at:'2026-10-17T08:00:00Z', performed_by_name:'Émilie & équipe', equipment_count:notes.length, anomaly_count:1}];
      const readings = notes.map((note,i) => ({round_id:'past-round', equipment:'Équipement '+i, equipment_location:'Cuisine & réserve', temperature:i===1?12:3, anomaly:i===1, note}));
      window.__roundFixture = {equipment, rounds, readings, calls:[], pending:[], persisted:0, holdLoad:false, pendingLoads:[]};
      const data = () => structuredClone({equipment,rounds,readings});
      window.__resolveRoundLoad = () => window.__roundFixture.pendingLoads.shift()(data());
      window.__finishRound = kind => {
        const f=window.__roundFixture, pending=f.pending.shift();
        if(kind==='network') return pending.reject(new TypeError('Erreur réseau simulée'));
        if(kind==='server') return pending.resolve({data:null,error:{message:'Erreur RPC simulée'}});
        const id='saved-round-'+(++f.persisted);
        rounds.unshift({id,completed_at:new Date().toISOString(),performed_by_name:'Employé témoin',equipment_count:pending.args.p_readings.length,anomaly_count:0});
        readings.unshift(...pending.args.p_readings.map(row=>({...row,round_id:id,equipment:row.equipment_id,anomaly:false})));
        pending.resolve({data:{round_id:id,anomaly_count:0},error:null});
      };
      supabaseClient = {rpc:async(name,args) => {
        const f=window.__roundFixture;
        if(name==='load_temperature_dashboard_070') {
          const result=f.holdLoad?await new Promise(resolve=>f.pendingLoads.push(resolve)):data();
          return {data:result,error:null};
        }
        if(name!=='save_temperature_round_070') throw new Error('Unexpected fixture RPC: '+name);
        f.calls.push(structuredClone(args));
        return new Promise((resolve,reject)=>f.pending.push({args:structuredClone(args),resolve,reject}));
      }};
      window.stopflow070TemperatureV3.open();
    }, {normal,attack,long});
    await page.locator('#sf70TemperatureV3 .sf70-tv3-reading').first().waitFor();
    await page.locator('#sf70TemperatureV3 [data-tv3-action="toggle-round"]').first().tap();
    const history = page.locator('#sf70TemperatureV3 .sf70-tv3-round-detail');
    assert.deepEqual(await history.locator('.sf70-tv3-history-note').allTextContents(), [normal,attack,long]);
    assert.equal(await history.locator('img,svg,script').count(), 0);
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => window.__temperatureXss), 0);
    assert((await history.textContent()).includes('12 °C'));
    assert((await history.textContent()).includes('Hors limite'));
    assert((await page.locator('.sf70-tv3-round-head').textContent()).includes('Émilie & équipe'));
    assert.match(await page.locator('.sf70-tv3-round-head').textContent(), /17\/10\/(?:20)?26/);
    for (const width of [390,1280]) {
      await page.setViewportSize({width,height:844});
      await page.waitForTimeout(100); // Let the existing responsive navigation settle.
      await page.evaluate(() => window.stopflow070TemperatureV3.open());
      await page.locator(saveSelector).waitFor({state:'visible'});
      await page.waitForFunction(() => !window.stopflow070TemperatureV3.state.loading);
      await page.locator('#sf70TemperatureV3 [data-tv3-action="toggle-round"]').first().tap();
      assert.equal(await history.isVisible(),true);
      const overflow = await page.evaluate(() => [...document.querySelectorAll('.sf70-tv3-history-line')]
        .filter(node => node.scrollWidth > node.clientWidth + 1)
        .map(node => ({width:node.clientWidth,scrollWidth:node.scrollWidth,display:getComputedStyle(node).display,
          whiteSpace:getComputedStyle(node).whiteSpace,noteWrap:node.querySelector('.sf70-tv3-history-note') && getComputedStyle(node.querySelector('.sf70-tv3-history-note')).overflowWrap})));
      assert.deepEqual(overflow, [], `History must wrap long remarks at ${width}px`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(100);
    await page.evaluate(() => window.stopflow070TemperatureV3.open());
    await page.locator(saveSelector).waitFor({state:'visible'});
    await page.waitForFunction(() => !window.stopflow070TemperatureV3.state.loading);
    console.log('PASS history: normal/multiline/special and malicious text, empty/null/blank omitted, date/employee/temperature/anomaly kept, mobile/desktop wrapping');

    await fillRound(page);
    const entered = await values(page);
    await page.locator(saveSelector).tap();
    await page.waitForFunction(() => window.__roundFixture.calls.length === 1);
    await assertBusy(page,true);
    await extraTapWhilePending(page);
    // Existing delayed decorators and field input must not re-enable the busy button.
    await page.evaluate(() => {
      document.querySelector('.sf70-tv3-value').dispatchEvent(new Event('input',{bubbles:true}));
      window.stopflow070TemperatureV3Visibility.refresh();
    });
    await page.waitForTimeout(500);
    await assertBusy(page,true);
    assert.equal(await page.evaluate(() => window.__roundFixture.calls.length),1);
    await page.evaluate(() => window.__finishRound('network'));
    await page.waitForFunction(() => window.stopflow070TemperatureV3.state.saving === false);
    await assertBusy(page,false);
    assert.equal(await page.locator(saveSelector).isEnabled(),true);
    assert.deepEqual(await values(page),entered);

    await page.locator(saveSelector).tap();
    await page.waitForFunction(() => window.__roundFixture.calls.length === 2);
    await page.evaluate(() => window.__finishRound('server'));
    await page.waitForFunction(() => window.stopflow070TemperatureV3.state.saving === false);
    assert.equal(await page.locator(saveSelector).isEnabled(),true);
    assert.deepEqual(await values(page),entered);

    await page.locator(saveSelector).tap();
    await page.waitForFunction(() => window.__roundFixture.calls.length === 3);
    await page.evaluate(() => { window.__roundFixture.holdLoad=true;window.__finishRound('success'); });
    await page.waitForFunction(() => window.__roundFixture.pendingLoads.length === 1);
    await assertBusy(page,true);
    await extraTapWhilePending(page);
    assert.equal(await page.evaluate(() => window.__roundFixture.calls.length),3);
    await page.evaluate(() => { window.__roundFixture.holdLoad=false;window.__resolveRoundLoad(); });
    await page.waitForFunction(() => window.stopflow070TemperatureV3.state.saving === false);
    await assertBusy(page,false);
    assert.equal(await page.locator(saveSelector).isDisabled(),true,'Fresh empty round must require readings');
    assert.equal(await page.evaluate(() => window.__roundFixture.persisted),1);
    assert.deepEqual(await page.evaluate(() => window.__roundFixture.calls.map(call=>call.p_readings)), [
      [4.2,-18,3].map((temperature,i)=>({equipment_id:'equipment-'+(i+1),temperature,note:i===0?formNote:''})),
      [4.2,-18,3].map((temperature,i)=>({equipment_id:'equipment-'+(i+1),temperature,note:i===0?formNote:''})),
      [4.2,-18,3].map((temperature,i)=>({equipment_id:'equipment-'+(i+1),temperature,note:i===0?formNote:''}))
    ]);
    assert.equal(await page.locator('.sf70-tv3-round').first().locator('.sf70-tv3-history-note').textContent(),formNote);
    console.log('PASS pending submission: one RPC despite rapid repeated taps/events and decorators; network/RPC errors preserve fields and allow retry; lock covers dashboard reload; one saved round');

    await fillRound(page);
    await page.locator(saveSelector).tap();
    await page.waitForFunction(() => window.__roundFixture.calls.length === 4);
    await page.evaluate(() => window.__finishRound('success'));
    await page.waitForFunction(() => window.stopflow070TemperatureV3.state.saving === false);
    assert.equal(await page.evaluate(() => window.__roundFixture.persisted),2);
    assert.equal(await page.evaluate(() => window.__roundFixture.calls.length),4);
    assert.deepEqual(errors,[]);
    assert.deepEqual(dialogs.slice(0,2),['Erreur réseau simulée','Erreur RPC simulée']);
    assert.equal(dialogs.filter(value=>value.startsWith('Relevé complet enregistré')).length,2);
    console.log('PASS next round: a single tap sends one RPC and saves once; UI remains usable after success');
  } finally { await context.close();await browser.close(); }
})().catch(error => { console.error(error);process.exitCode=1; });
