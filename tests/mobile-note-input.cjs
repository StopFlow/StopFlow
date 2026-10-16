// Run with Node.js, Playwright, Chromium and pdftotext. No external requests:
// inventory saves are local, and temperature RPCs use an in-browser fixture.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium, devices} = require('playwright');
const root = path.resolve(process.env.STOPFLOW_TEST_ROOT || path.join(__dirname, '..'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'stopflow-mobile-notes-'));
const inventoryNote = "Réserve & équipe : l'apéritif < 3.\nDeuxième ligne : porte fermée.";
const temperatureNote = "Porte restée ouverte — vérifier l'équipe & le joint.";

async function tap(page, selector) {
  await page.locator(selector).evaluate(node => node.scrollIntoView({block: 'center', behavior: 'instant'}));
  await page.waitForTimeout(280); // Existing cards reject taps within 220 ms of scrolling.
  // Read the live DOM in one task, even on the unfixed page which replaces its controls every frame.
  const box = await page.evaluate(selector => document.querySelector(selector)?.getBoundingClientRect().toJSON(), selector);
  assert(box?.width && box?.height, `${selector} must be visible`);
  const point = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  await page.touchscreen.tap(point.x, point.y);
  return point;
}

async function assertFocused(page, selector) {
  assert.equal(await page.locator(selector).evaluate(node => document.activeElement === node), true,
    `${selector}: native focus was lost`);
}

async function controlGesture(page, selector) {
  // Exercise the existing pointer owner and its compatibility click on the same
  // control. Chromium's native tap may retarget its click to a newly rendered
  // button (e.g. Continue -> Confirm); that separate limitation is documented.
  await page.evaluate(selector => {
    const node=document.querySelector(selector);
    if(!node)throw new Error(`Missing control: ${selector}`);
    const init = {bubbles:true, cancelable:true, pointerId:1, pointerType:'touch', isPrimary:true, button:0, clientX:10, clientY:10};
    node.dispatchEvent(new PointerEvent('pointerdown', init));
    node.dispatchEvent(new PointerEvent('pointerup', init));
    node.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
  }, selector);
}

async function checkInventory(page) {
  await tap(page, '#sf70Home [data-sf70-card="zone:salle"]');
  await tap(page, '#sf70ZonePage [data-sf70-card="inventory.use"]');
  await tap(page, '[data-sf73-start-supplier="colruyt"]');
  await page.locator('#inventory').waitFor({state: 'visible'});
  await tap(page, '#setAllZero');
  const stockSelector = '#inventoryRows tr:first-child [data-stock]';
  for (const [control, expected] of [['[data-plus]', '1'], ['[data-minus]', '0'], ['[data-plus]', '1']]) {
    // Check the unchanged stock calculation independently of compatibility-click
    // behavior in Chromium touch emulation (documented separately).
    await page.locator(`#inventoryRows tr:first-child ${control}`).evaluate(node => node.click());
    await page.waitForTimeout(100);
    assert.equal(await page.locator(stockSelector).inputValue(), expected, 'Each stock action must change stock exactly once');
  }
  await tap(page, '#showSummary');
  await page.locator('#summary').waitFor({state: 'visible'});
  assert.equal(await page.locator('#sf73MobileReviewRoot .sf73-review-card').count(),
    await page.evaluate(() => activeArticles().length));
  await controlGesture(page, '#sf73SummaryContinue');
  await page.evaluate(() => { window.__validationTextarea = document.getElementById('sf73ValidationNote'); });
  await tap(page, '#sf73ValidationNote');
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.__validationTextarea === document.getElementById('sf73ValidationNote')),
    true, 'Validation textarea must survive observer refreshes');
  await assertFocused(page, '#sf73ValidationNote');
  // Type through the current focus; locator.fill()/press() would hide lost-focus bugs.
  await page.keyboard.type(inventoryNote, {delay: 10});
  await page.evaluate(() => {
    const probe = document.createElement('span'); probe.id = 'noteRefreshProbe'; document.body.appendChild(probe);
    probe.classList.add('changed');
    window.stopflow073InventoryMobileUx.refresh();
    window.stopflow073InventoryMobileUx.showValidation();
    const article=activeArticles()[0], stock=current.stocks[article.id];
    current.stocks[article.id]=stock+1; window.stopflow073InventoryMobileUx.showValidation();
    current.stocks[article.id]=stock; window.stopflow073InventoryMobileUx.showValidation();
  });
  const viewport = page.viewportSize();
  await page.setViewportSize({width: viewport.width, height: 560});
  await page.waitForTimeout(120);
  await assertFocused(page, '#sf73ValidationNote');
  assert.equal(await page.locator('#sf73ValidationNote').inputValue(), inventoryNote);
  assert.equal(await page.evaluate(() => window.__validationTextarea === document.getElementById('sf73ValidationNote')), true);
  assert.deepEqual(await page.evaluate(() => [current.note, document.getElementById('generalNote').value]), [inventoryNote, inventoryNote]);
  // Blur/refocus simulates Done/reopening; an emulator cannot assert an iOS keyboard is visible.
  await page.locator('#sf73ValidationNote').evaluate(node => node.blur());
  await page.setViewportSize(viewport);
  await tap(page, '#sf73ValidationNote');
  await assertFocused(page, '#sf73ValidationNote');
  assert.equal(await page.locator('#sf73ValidationNote').inputValue(), inventoryNote);
  await controlGesture(page, '#sf73ValidationBack');
  await controlGesture(page, '#sf73SummaryContinue');
  assert.equal(await page.locator('#sf73ValidationNote').inputValue(), inventoryNote, 'Back/continue must keep the note');
  // A genuine change of inventory data must still refresh the validation panel.
  await page.evaluate(() => { current.stocks[activeArticles()[0].id] = 0; window.stopflow073InventoryMobileUx.showValidation(); });
  assert.equal(await page.locator('#sf73ValidationNote').inputValue(), inventoryNote);
  const expectedQuantity = await page.evaluate(() => activeArticles().reduce((sum, article) => sum + calc(article), 0));
  assert.equal(await page.locator('#sf73MobileReviewRoot .sf73-review-kpi strong').nth(2).textContent(), String(expectedQuantity));
  await page.evaluate(() => {
    const original = upsertOrder; window.__orderSaveCount = 0;
    upsertOrder = async function(...args) {
      window.__orderSaveCount++;
      await new Promise(resolve => setTimeout(resolve, 180));
      return original.apply(this, args);
    };
  });
  await page.waitForTimeout(950); // Respect the existing guard after the preceding Back gesture.
  await controlGesture(page, '#sf73ValidationConfirm');
  await controlGesture(page, '#sf73ValidationConfirm'); // Repeat while the first save is pending.
  await page.locator('#sf73InventoryComplete').waitFor({state: 'visible'});
  const orders = await page.evaluate(() => db.orders);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].status, 'Validé');
  assert.equal(orders[0].note, inventoryNote);
  assert.equal(await page.evaluate(() => window.__orderSaveCount), 1, 'Exactly one validation must be saved');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('stopflowData')).orders[0].note), inventoryNote);
  // Inspect the real completion PDF button's blob, including the note.
  const popupPromise = page.context().waitForEvent('page');
  await tap(page, '#sf73DonePdf');
  const popup = await popupPromise;
  await popup.waitForURL(/^blob:/);
  const pdf = await page.evaluate(async url => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  }, popup.url());
  const filename = path.join(scratch, 'inventory-note.pdf');
  fs.writeFileSync(filename, Buffer.from(pdf, 'base64'));
  const pdfText = execFileSync('pdftotext', ['-layout', filename, '-'], {encoding: 'utf8'});
  assert(pdfText.includes('Réserve & équipe'));
  assert(pdfText.includes('Deuxième ligne'));
  await popup.close();
  await tap(page, '#sf73DoneHistory');
  await page.locator('#history').waitFor({state: 'visible'});
  await page.evaluate(() => showDetail(db.orders[0].id));
  assert((await page.locator('#modalBox').textContent()).includes(inventoryNote));
  await page.locator('#closeModal').click();
  await page.evaluate(() => window.stopflow070CardNavigation.openHome());
  console.log('PASS mobile inventory: stock click actions, pointer-owned summary/validation controls, native note taps, multiline focus/resize/blur/refocus, one validation, local persistence, history and actual PDF');
}

async function checkTemperatures(page) {
  await page.evaluate(() => {
    const equipment = [1, 2, 3].map(i => ({id: `fixture-equipment-${i}`, name: `Équipement ${i}`,
      equipment_type: i === 2 ? 'freezer' : 'fridge', active: true,
      min_allowed: i === 2 ? -25 : 0, max_allowed: i === 2 ? -15 : 6}));
    window.__temperatureSaves = [];
    let rounds = [], readings = [];
    supabaseClient = {rpc: async (name, args) => {
      if (name === 'load_temperature_dashboard_070') {
        // Rows arrive after the 450 ms decoration callbacks from the navigation tap.
        await new Promise(resolve => setTimeout(resolve, 700));
        return {data: {equipment, rounds, readings}, error: null};
      }
      if (name !== 'save_temperature_round_070') throw new Error(`Unexpected fixture RPC: ${name}`);
      window.__temperatureSaves.push(structuredClone(args));
      readings = args.p_readings.map(item => ({...item, round_id: 'fixture-round', equipment: item.equipment_id}));
      rounds = [{id: 'fixture-round', equipment_count: 3, anomaly_count: 0, completed_at: new Date().toISOString()}];
      await new Promise(resolve => setTimeout(resolve, 100));
      return {data: {anomaly_count: 0}, error: null};
    }};
  });
  await tap(page, '#sf70Home [data-sf70-card="zone:cuisine"]');
  await tap(page, '#sf70ZonePage [data-sf70-card="temperatures.use"]');
  await page.locator('#sf70TemperatureV3 .sf70-tv3-note').first().waitFor();
  await page.waitForTimeout(600);
  const firstNote = '.sf70-tv3-reading[data-equipment-id="fixture-equipment-1"] .sf70-tv3-note';
  await page.evaluate(() => { window.__temperatureNote = document.querySelector('.sf70-tv3-note'); });
  await tap(page, firstNote); // First gesture on a fresh reading must be a text-field gesture.
  await page.waitForTimeout(600); // Includes every existing delayed decorate()/prepareInputs() callback.
  await assertFocused(page, firstNote);
  assert.equal(await page.locator(firstNote).evaluate(node => node.readOnly || node.inputMode === 'none'), false);
  await page.keyboard.type(temperatureNote, {delay: 8});
  const viewport = page.viewportSize();
  await page.setViewportSize({width: viewport.width, height: 560});
  await page.waitForTimeout(100);
  await assertFocused(page, firstNote);
  await page.setViewportSize(viewport);
  assert.equal(await page.locator(firstNote).inputValue(), temperatureNote);
  // The keypad API must reject a note as well as its pointer/click selectors.
  await page.evaluate(() => window.stopflow070TemperatureV3MobileKeypad.open(document.querySelector('.sf70-tv3-note')));
  assert.equal(await page.evaluate(() => window.stopflow070TemperatureV3MobileKeypad.state.open), false);
  const keys = [['4', 'decimal', '2'], ['minus', '1', '8'], ['3']];
  for (const [index, digits] of keys.entries()) {
    await tap(page, `.sf70-tv3-reading[data-equipment-id="fixture-equipment-${index + 1}"] .sf70-tv3-value`);
    assert.equal(await page.evaluate(() => window.stopflow070TemperatureV3MobileKeypad.state.input.matches('.sf70-tv3-value')), true);
    assert.equal(await page.locator(firstNote).evaluate(node => document.activeElement === node), false,
      'Opening the numeric keypad must release the native text keyboard');
    for (const key of digits) await tap(page, `#sf70TempKeypadOverlay [data-key="${key}"]`);
    assert.equal(await page.locator(`.sf70-tv3-reading[data-equipment-id="fixture-equipment-${index + 1}"] .sf70-tv3-value`).inputValue(), ['4.2', '-18', '3'][index]);
    if (index === 0) {
      await tap(page, '#sf70TempKeypadOverlay [data-keypad-action="next"]');
      assert.equal(await page.evaluate(() => window.stopflow070TemperatureV3MobileKeypad.state.input.closest('.sf70-tv3-reading').dataset.equipmentId), 'fixture-equipment-2');
    }
    await tap(page, '#sf70TempKeypadOverlay [data-keypad-action="close"]');
  }
  await tap(page, firstNote);
  await assertFocused(page, firstNote);
  assert.equal(await page.locator(firstNote).inputValue(), temperatureNote);
  assert.equal(await page.evaluate(() => window.__temperatureNote === document.querySelector('.sf70-tv3-note')), true);
  await tap(page, '#sf70TemperatureV3 [data-tv3-action="save-round"]');
  await page.waitForFunction(() => window.__temperatureSaves.length === 1 && window.stopflow070TemperatureV3.state.rounds.length === 1);
  await page.waitForTimeout(300);
  const sent = await page.evaluate(() => window.__temperatureSaves);
  assert.equal(sent.length, 1, 'One touch must send one round');
  assert.equal(sent[0].p_readings.length, 3);
  assert.equal(sent[0].p_readings[0].note, temperatureNote);
  assert.deepEqual(sent[0].p_readings.map(row => row.temperature), [4.2, -18, 3]);
  assert.equal(await page.evaluate(() => window.stopflow070TemperatureV3.state.readings[0].note), temperatureNote);
  console.log('PASS mobile temperatures: first-touch native focus, stable note, numeric-only keypad, decimals/negative/next, note preserved and one fixture RPC with 3 equipment readings');
}

async function checkChecklistTap(page) {
  // Isolate the unchanged checkbox component; no invented run ID is sent to the app's business handlers.
  const probe = await page.context().newPage();
  try {
    await probe.route('http://localhost/checklist-fixture', route => route.fulfill({contentType:'text/html', body:'<!doctype html><title>Checklist fixture</title>'}));
    await probe.goto('http://localhost/checklist-fixture');
    await probe.setContent('<meta name="viewport" content="width=device-width"><section id="checklists"><div id="checklistRunner"><div class="checklist-item"><div class="checklist-item-main"><input type="checkbox" data-run-check="fixture-check"><span class="checklist-item-label">Tâche témoin</span></div></div></div></section>');
    await probe.addScriptTag({content: fs.readFileSync(path.join(root, 'stopflow-080-checklist-input-fix.js'), 'utf8')});
    await probe.evaluate(() => {
      window.__checklistChanges = 0;
      document.querySelector('input').addEventListener('change', () => window.__checklistChanges++);
      window.stopflow080ChecklistInputFix.refresh();
    });
    await probe.locator('#checklistRunner input').evaluate(node => node.click());
    assert.equal(await probe.locator('#checklistRunner input').isChecked(), true);
    assert.equal(await probe.evaluate(() => window.__checklistChanges), 1);
    await probe.locator('#checklistRunner input').evaluate(node => node.click());
    assert.equal(await probe.locator('#checklistRunner input').isChecked(), false);
    assert.equal(await probe.evaluate(() => window.__checklistChanges), 2);
    console.log('PASS isolated unchanged checklist checkbox: one change per click');
  } finally { await probe.close(); }
}

(async () => {
  const executablePath = process.env.STOPFLOW_CHROMIUM_PATH || '/usr/bin/chromium';
  const browser = await chromium.launch({headless: true, executablePath});
  const context = await browser.newContext({...devices['iPhone 13'], serviceWorkers: 'block', timezoneId: 'Europe/Brussels'});
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'blob:' || url.protocol === 'data:') return route.continue();
    if (url.origin !== 'http://localhost') return route.abort('blockedbyclient');
    const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (filename.includes('/') || filename.startsWith('.') || !fs.existsSync(path.join(root, filename))) return route.fulfill({status: 404, body: ''});
    const type = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml'}[path.extname(filename)] || 'application/octet-stream';
    return route.fulfill({contentType: type, body: fs.readFileSync(path.join(root, filename))});
  });
  await context.addInitScript(() => localStorage.setItem('stopflowLogged', JSON.stringify({email: 'contact@srlreunion.com'})));
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [], dialogs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  try {
    await page.goto('http://localhost/', {waitUntil: 'networkidle'});
    await page.locator('#app[data-sf80-startup-ready="1"]').waitFor();
    await page.waitForTimeout(3500);
    if (!process.argv.includes('--checklist-only') && !process.argv.includes('--temperature-only')) await checkInventory(page);
    if (!process.argv.includes('--checklist-only') && !process.argv.includes('--inventory-only')) await checkTemperatures(page);
    await checkChecklistTap(page);
    assert.deepEqual(errors, []);
    assert(dialogs.every(message => message.startsWith('Relevé complet enregistré')), `Unexpected dialog: ${dialogs.join('; ')}`);
  } catch (error) {
    console.error(await page.evaluate(() => ({pages:[...document.querySelectorAll('#app .page:not(.hidden)')].map(n=>n.id),
      note:document.querySelector('#sf73ValidationNote')?.getBoundingClientRect().toJSON(),
      summary:document.getElementById('summary')?.className, root:document.getElementById('sf73MobileReviewRoot')?.outerHTML.slice(0,300)})));
    await page.screenshot({path:'/tmp/stopflow-mobile-notes-failure.png',fullPage:true});
    throw error;
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => fs.rmSync(scratch, {recursive: true, force: true}));
