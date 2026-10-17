// Checks the synchronous iOS gesture contract, not visibility of an actual iOS keyboard.
// Resources and temperature data stay local; no Supabase requests are made.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, devices} = require('playwright');
const root = path.resolve(process.env.STOPFLOW_TEST_ROOT || path.join(__dirname, '..'));

async function inspectGesture(page, selector, kind, alreadyFocused = false) {
  return page.evaluate(({selector, kind, alreadyFocused}) => {
    const field = document.querySelector(selector);
    field.value = "Remarque conservée : l'équipe & <texte>";
    if (alreadyFocused) field.focus(); else field.blur();
    if (kind === 'readonly') field.readOnly = true;
    if (kind === 'disabled') field.disabled = true;
    field.setSelectionRange(4, 12);
    const selection = [field.selectionStart, field.selectionEnd];
    const originalFocus = field.focus;
    const originalPrevent = Event.prototype.preventDefault;
    let inTouchEnd = false, focusCalls = 0, synchronous = true, prevented = 0, bubbled = false;
    const observe = () => { bubbled = true; };
    window.addEventListener('touchend', observe);
    field.focus = function(...args) {
      focusCalls++;
      synchronous = synchronous && inTouchEnd;
      return originalFocus.apply(this, args);
    };
    Event.prototype.preventDefault = function(...args) {
      if (this.target === field) prevented++;
      return originalPrevent.apply(this, args);
    };
    const touch = (x, y, identifier = 1) => new Touch({identifier, target:field, clientX:x, clientY:y});
    const dispatch = (type, touches, changedTouches) => {
      const event = new TouchEvent(type, {bubbles:true, cancelable:true, touches, changedTouches});
      inTouchEnd = type === 'touchend';
      field.dispatchEvent(event);
      inTouchEnd = false;
      return event;
    };
    const start = touch(50, 50), other = touch(70, 70, 2);
    try {
      dispatch('touchstart', kind === 'multitouch' ? [start, other] : [start], [start]);
      if (kind === 'scroll') {
        dispatch('touchmove', [touch(50, 90)], [touch(50, 90)]);
        // Return to the start: a displacement-only check would incorrectly reopen the keyboard.
        dispatch('touchmove', [start], [start]);
      }
      if (kind === 'cancel') dispatch('touchcancel', [], [start]);
      const end = dispatch('touchend', [], kind === 'multitouch' ? [start, other] : [start]);
      if (kind === 'tap') dispatch('touchend', [], [start]); // A duplicated end must not focus twice.
      return {selector, kind, alreadyFocused, focusCalls, synchronous, prevented,
        defaultPrevented:end.defaultPrevented, bubbled, value:field.value,
        selectionBefore:selection, selectionAfter:[field.selectionStart, field.selectionEnd],
        connected:field.isConnected, same:document.querySelector(selector) === field,
        active:document.activeElement === field};
    } finally {
      field.focus = originalFocus;
      Event.prototype.preventDefault = originalPrevent;
      window.removeEventListener('touchend', observe);
      field.readOnly = false;
      field.disabled = false;
    }
  }, {selector, kind, alreadyFocused});
}

async function run(browser, pointerEvents) {
  const context = await browser.newContext({...devices['iPhone 13'], serviceWorkers:'block'});
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost') return route.abort('blockedbyclient');
    const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (filename.includes('/') || filename.startsWith('.') || !fs.existsSync(path.join(root, filename))) return route.fulfill({status:404, body:''});
    const type = {'.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml'}[path.extname(filename)] || 'application/octet-stream';
    return route.fulfill({contentType:type, body:fs.readFileSync(path.join(root, filename))});
  });
  await context.addInitScript(pointerEvents => {
    localStorage.setItem('stopflowLogged', JSON.stringify({email:'contact@srlreunion.com'}));
    if (!pointerEvents) Object.defineProperty(window, 'PointerEvent', {value:undefined, configurable:true});
    window.__focusRegistrations = [];
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, callback, options) {
      const stack = new Error().stack || '';
      if (type === 'touchend' && /stopflow-073-inventory-mobile-ux|stopflow-070-temperature-v3\.js/.test(stack) && String(callback).includes('.focus(')) {
        window.__focusRegistrations.push({global:this === window || this === document,
          target:this.id || this.className, passive:options?.passive});
      }
      return add.call(this, type, callback, options);
    };
  }, pointerEvents);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://localhost/', {waitUntil:'networkidle'});
    await page.waitForFunction(() => window.stopflow073InventoryMobileUx?.active && window.stopflow070TemperatureV3?.active);
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
      newInventory('Colruyt');
      activeArticles().forEach(article => { current.stocks[article.id] = 0; });
      renderSummary(); page('summary'); window.stopflow073InventoryMobileUx.showValidation();
    });
    const validation = '#sf73ValidationNote';
    const results = [];
    for (const [kind, focused] of [['tap',false], ['tap',true], ['scroll',false], ['cancel',false], ['multitouch',false], ['readonly',false], ['disabled',false]]) {
      results.push(await inspectGesture(page, validation, kind, focused));
    }
    await page.evaluate(() => {
      supabaseClient = {rpc:async name => {
        if (name !== 'load_temperature_dashboard_070') throw new Error(`Unexpected fixture RPC: ${name}`);
        return {data:{equipment:[{id:'focus-fixture', name:'Frigo témoin', active:true, equipment_type:'fridge', min_allowed:0, max_allowed:6}], rounds:[], readings:[]}, error:null};
      }};
      window.stopflow070TemperatureV3.open();
    });
    await page.locator('.sf70-tv3-note').waitFor();
    const temperature = '#sf70TemperatureV3 .sf70-tv3-note';
    for (const [kind, focused] of [['tap',false], ['tap',true], ['scroll',false], ['cancel',false], ['multitouch',false], ['readonly',false], ['disabled',false]]) {
      results.push(await inspectGesture(page, temperature, kind, focused));
    }
    // Print enough evidence before asserting, including the unmodified baseline's missing activation.
    console.log(JSON.stringify({pointerEvents, gestures:results.map(({selector,kind,alreadyFocused,focusCalls,prevented}) => ({selector,kind,alreadyFocused,focusCalls,prevented}))}));
    for (const result of results) {
      assert.equal(result.focusCalls, result.kind === 'tap' ? 1 : 0, `${result.selector}: ${result.kind} must focus synchronously only for a tap`);
      assert.equal(result.synchronous, true);
      assert.equal(result.prevented, 0, 'No capture layer or local bridge may cancel text gestures');
      assert.equal(result.defaultPrevented, false);
      assert.equal(result.bubbled, true, 'Native text gestures must continue to bubble');
      assert.equal(result.connected && result.same, true);
      assert.equal(result.value, "Remarque conservée : l'équipe & <texte>");
      if (result.alreadyFocused) assert.deepEqual(result.selectionAfter, result.selectionBefore, 'An existing selection must not move to the end');
      if (result.kind === 'tap') assert.equal(result.active, true);
    }
    const bindings = await page.evaluate(() => window.__focusRegistrations);
    assert(bindings.length >= 2, 'Both note fields must have a local touch-end activation');
    assert(bindings.every(binding => !binding.global && binding.passive === true), 'No new global or canceling touch owner');
    assert.deepEqual(errors, []);
    console.log(`PASS synchronous note focus with ${pointerEvents ? 'Pointer Events' : 'Touch Events fallback'}; taps, selection, scroll, cancel, multitouch and uncanceled propagation`);
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.STOPFLOW_CHROMIUM_PATH || '/usr/bin/chromium'});
  try { await run(browser, true); await run(browser, false); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
