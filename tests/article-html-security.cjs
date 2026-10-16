// Run with Node.js, Playwright and Chromium. All app resources come from disk;
// external requests are blocked and saves use only disposable local browser data.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, devices} = require('playwright');

const root = path.resolve(process.env.STOPFLOW_TEST_ROOT || path.join(__dirname, '..'));
const marker = 'window.__articleHtmlInjection=1';
const values = [
  `<img src="data:image/png;base64,AAAA" onerror="${marker}">`,
  `<svg onload="${marker}"></svg>`,
  `<script>${marker}</script>`,
  `" data-injected="yes"><svg onload='${marker}'></svg>&lt;b&gt;déjà encodé&lt;/b&gt;`,
  `Crème brûlée : l'équipe d’aujourd’hui & "L’Union" < 3 > 1 — 2 €`
];
const fixture = value => ({id: 900001, name: value, supplier: 'Colruyt', category: value,
  unit: value, target: 4, active: true, sortOrder: 1, purchasePrice: null});
let checkpoint = '';

async function assertSafe(page, selector, label) {
  await page.waitForTimeout(80); // Give image errors and SVG load events time to execute.
  const result = await page.evaluate(selector => {
    const node = document.querySelector(selector);
    return {found: Boolean(node), executed: window.__articleHtmlInjection,
      injected: node?.querySelectorAll('script,img,svg,[data-injected],[onerror],[onload]').length};
  }, selector);
  assert.equal(result.found, true, `${label}: missing rendering`);
  assert.equal(result.executed, 0, `${label}: injected JavaScript executed`);
  assert.equal(result.injected, 0, `${label}: data created HTML nodes or attributes`);
}

async function click(page, selector, mobile) {
  const locator = page.locator(selector);
  if (mobile) {
    await locator.evaluate(node => node.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'}));
    // Existing mobile cards ignore taps within 220 ms of scrolling.
    await page.waitForTimeout(260);
    await locator.tap();
  } else await locator.click();
}

async function navigateToArticles(page, mobile) {
  await page.locator('#app[data-sf80-startup-ready="1"]').waitFor();
  await click(page, '#sf70Home [data-sf70-card="zone:general"]', mobile);
  await click(page, '#sf70ZonePage [data-sf70-card="scoped:articles.manage"]', mobile);
  await click(page, '#sf70GeneralDetail [data-sf70-card="salle"]', mobile);
  await page.locator('#articles').waitFor({state: 'visible'});
}

async function render(page, article, historical) {
  await page.evaluate(({article, historical}) => {
    // Keep another row, as in the real catalog. A one-row mobile page can leave
    // the existing relative header over the modal's sticky action bar.
    db.articles = [article, {...article, id: 900002, name: 'Article témoin', category: 'Témoin', unit: 'pièce', target: 4, sortOrder: 2}];
    window.__articleHtmlInjection = 0;
    document.querySelector('#articleSupplier').value = article.supplier;
    if (historical) window.__historicalArticles.render();
  }, {article, historical});
  if (!historical) await page.locator('#articleSupplier').selectOption(article.supplier);
}

async function checkList(page, article, label) {
  await assertSafe(page, '#articleRows', label);
  const rendered = await page.evaluate(() => {
    const row = document.querySelector('#articleRows tr');
    return {texts: [...row.querySelectorAll('td')].slice(0, 4).map(td => td.textContent),
      target: row.querySelector('[data-target]').getAttribute('value'),
      ids: ['target', 'active', 'edit', 'price'].filter(key => row.querySelector(`[data-${key}]`))
        .map(key => row.querySelector(`[data-${key}]`).dataset[key])};
  });
  assert.deepEqual(rendered.texts, [article.name, article.supplier, article.category, article.unit]);
  assert.equal(rendered.target, String(article.target));
  assert(rendered.ids.length >= 3);
  assert.deepEqual(rendered.ids, Array(rendered.ids.length).fill(String(article.id)));
}

async function checkEditor(page, article, historical, mobile, label) {
  checkpoint = `${label}, payload ${values.indexOf(article.name) + 1}`;
  if (historical) await page.evaluate(id => window.__historicalArticles.modal(id), article.id);
  else await click(page, '#articleRows tr:first-child [data-edit]', mobile);
  await assertSafe(page, '#modalBox', label);
  for (const [selector, value] of [['#mName', article.name], ['#mCat', article.category], ['#mUnit', article.unit]]) {
    assert.equal(await page.locator(selector).inputValue(), value, `${label}: ${selector} must keep literal text`);
  }
  // Edit all three text fields through real controls, save locally, then reopen.
  const next = {...article, name: `${article.name} — modifié`, category: `${article.category} — modifié`,
    unit: `${article.unit} — modifié`, target: 7};
  for (const [selector, value] of [['#mName', next.name], ['#mCat', next.category], ['#mUnit', next.unit]]) {
    if (await page.locator(selector).evaluate(node => node.tagName === 'SELECT')) {
      // The existing category enhancement only permits listed values.
      // Keep the malicious category, already selected, and verify its saved value below.
      next.category = article.category;
      await page.locator(selector).selectOption(article.category);
    } else await page.locator(selector).fill(value);
  }
  await page.locator('#mTarget').fill('7');
  await click(page, '#saveArticle', mobile);
  await page.locator('#modal').waitFor({state: 'hidden'});
  const stored = await page.evaluate(id => ({memory: db.articles.find(item => item.id === id),
    persisted: JSON.parse(localStorage.getItem('stopflowData')).articles.find(item => item.id === id)}), article.id);
  for (const saved of [stored.memory, stored.persisted]) {
    for (const key of ['id', 'name', 'supplier', 'category', 'unit', 'target']) assert.equal(saved[key], next[key], `${label}: saved ${key}`);
  }
  await checkList(page, next, `${label} saved list`);
  if (historical) await page.evaluate(id => window.__historicalArticles.modal(id), article.id);
  else await page.locator('#articleRows tr:first-child [data-edit]').click();
  await assertSafe(page, '#modalBox', `${label} reopened editor`);
  assert.equal(await page.locator('#mName').inputValue(), next.name);
  assert.equal(await page.locator('#mUnit').inputValue(), next.unit);
  await click(page, '#closeModal', mobile);
}

async function checkAttributes(page, historical, label) {
  for (const key of ['id', 'target']) {
    const article = {...fixture('Article normal'), [key]: `4" data-injected="yes"><svg onload='${marker}'></svg>`};
    await render(page, article, historical);
    await checkList(page, article, `${label} ${key} attribute`);
    if (key === 'target') {
      if (historical) await page.evaluate(id => window.__historicalArticles.modal(id), article.id);
      else await page.evaluate(id => articleModal(id), article.id);
      await assertSafe(page, '#modalBox', `${label} target modal attribute`);
      await page.evaluate(() => document.querySelector('#modal').classList.add('hidden'));
    }
  }
}

async function checkSupplier(page, historical, mobile, label) {
  const article = {...fixture(values[4]), supplier: values[3]};
  await page.evaluate(article => {
    db.suppliers.push({id: null, code: 'security-test', name: article.supplier, active: true, sortOrder: 30});
    document.querySelector('#articleSupplier').add(new Option(article.supplier, article.supplier));
  }, article);
  await render(page, article, historical);
  await checkList(page, article, `${label} supplier`);
  if (historical) await page.evaluate(id => window.__historicalArticles.modal(id), article.id);
  else await click(page, '#articleRows tr:first-child [data-edit]', mobile);
  await assertSafe(page, '#modalBox', `${label} supplier editor`);
  if (!historical) assert.equal(await page.locator('#mSupplier').inputValue(), article.supplier);
  await click(page, '#closeModal', mobile);
  await page.evaluate(() => { db.suppliers = db.suppliers.filter(supplier => supplier.code !== 'security-test'); });
}

async function checkIntermediateModal(page) {
  // Article tools also provides an editor before the 0.8 editor replaces it.
  for (const value of values) {
    const article = fixture(value);
    await render(page, article, false);
    await page.evaluate(id => window.__articleToolsModal(id), article.id);
    await assertSafe(page, '#modalBox', 'intermediate article-tools editor');
    for (const [selector, expected] of [['#mName', value], ['#mCat', value], ['#mUnit', value]]) {
      assert.equal(await page.locator(selector).inputValue(), expected);
    }
    await page.evaluate(() => document.querySelector('#modal').classList.add('hidden'));
  }
  const article = {...fixture(values[4]), target: values[3]};
  await render(page, article, false);
  await page.evaluate(id => window.__articleToolsModal(id), article.id);
  await assertSafe(page, '#modalBox', 'intermediate article-tools target attribute');
  assert.equal(await page.locator('#mTarget').getAttribute('value'), article.target);
  await page.evaluate(() => document.querySelector('#modal').classList.add('hidden'));
}

async function runViewport(browser, mobile) {
  const context = await browser.newContext({
    ...(mobile ? devices['iPhone 13'] : {viewport: {width: 1280, height: 900}}),
    serviceWorkers: 'block', timezoneId: 'Europe/Brussels'
  });
  let releaseImage;
  let heldImages = 0;
  const imageGate = new Promise(resolve => { releaseImage = resolve; });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.protocol === 'blob:' || url.protocol === 'data:') return route.continue();
    if (url.origin !== 'http://localhost') return route.abort('blockedbyclient');
    if (url.pathname === '/api/pwa-icon' && request.resourceType() === 'image') {
      heldImages++;
      await imageGate;
      return route.fulfill({status: 404, body: ''});
    }
    const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (filename.includes('/') || filename.startsWith('.') || !fs.existsSync(path.join(root, filename))) return route.fulfill({status: 404, body: ''});
    let body = fs.readFileSync(path.join(root, filename));
    if (filename === 'index.html') {
      // Capture the original functions before the deferred scripts install overrides.
      // Actual early navigation below still uses the application's own event handlers.
      body = body.toString().replace('\nbootstrapAuth();', '\nwindow.__historicalArticles={render:renderArticles,modal:articleModal};\nbootstrapAuth();');
    }
    if (filename === 'supabase-article-tools.js') {
      body = body.toString().replace('  renderSuppliers=function(){', '  window.__articleToolsModal=articleModal;\n  renderSuppliers=function(){');
    }
    const type = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml'}[path.extname(filename)] || 'application/octet-stream';
    return route.fulfill({contentType: type, body});
  });
  await context.addInitScript(article => {
    localStorage.setItem('stopflowLogged', JSON.stringify({email: 'contact@srlreunion.com'}));
    localStorage.setItem('stopflowData', JSON.stringify({articles: [article], orders: [], suggestions: []}));
    window.__articleHtmlInjection = 0;
  }, fixture(values[0]));
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [], dialogs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  try {
    await page.goto('http://localhost/', {waitUntil: 'domcontentloaded'});
    await page.waitForTimeout(3500); // Let scheduled navigation restores finish; keep window.load blocked.
    assert(heldImages > 0, 'An image must be pending to reproduce the loading window');
    assert.equal(await page.evaluate(() => document.readyState), 'interactive');
    await navigateToArticles(page, mobile);
    // This assertion deliberately fails on commit 796d9e1: the UI executes the img payload.
    await assertSafe(page, '#articleRows', 'actual navigation before window.load');
    for (const historical of [false, true]) {
      const label = historical ? 'historical functions alone' : 'actual UI before window.load';
      for (const value of values) {
        const article = fixture(value);
        await render(page, article, historical);
        await checkList(page, article, label);
        await checkEditor(page, article, historical, mobile, label);
      }
      await checkAttributes(page, historical, label);
      await checkSupplier(page, historical, mobile, label);
      assert.equal(await page.evaluate(() => document.readyState), 'interactive');
    }
    releaseImage();
    await page.waitForLoadState('load');
    await page.waitForTimeout(3500);
    assert.equal(await page.evaluate(() => document.readyState), 'complete');
    // A fresh real navigation also verifies the supplier onchange handler after replacement.
    await page.evaluate(() => window.stopflow070CardNavigation.openHome());
    await navigateToArticles(page, mobile);
    for (const value of values) {
      const article = fixture(value);
      await render(page, article, false);
      await checkList(page, article, 'overridden UI after window.load');
      await checkEditor(page, article, false, mobile, 'overridden UI after window.load');
    }
    await checkAttributes(page, false, 'overridden UI after window.load');
    await checkSupplier(page, false, mobile, 'overridden UI after window.load');
    await checkIntermediateModal(page);
    assert.deepEqual(errors, [], 'No JavaScript exceptions');
    assert.deepEqual(dialogs, [], 'No unexpected validation or save errors');
    console.log(`PASS Articles ${mobile ? 'Chromium mobile/iPhone viewport (touch)' : 'Chromium desktop'}: early navigation, historical functions alone, loaded overrides; name/category/unit payloads, quoted attributes, editing and local persistence`);
  } catch (error) {
    console.error({checkpoint});
    await page.screenshot({path: '/tmp/stopflow-articles-failure.png', fullPage: true});
    console.error(await page.evaluate(() => ({readyState: document.readyState,
      visiblePages: [...document.querySelectorAll('#app .page:not(.hidden)')].map(node => node.id),
      cards: [...document.querySelectorAll('#app .page:not(.hidden) [data-sf70-card]')].map(node => node.dataset.sf70Card),
      controls: ['#modal', '#modalBox', '#saveArticle', '#mUnit'].map(selector => {
        const node = document.querySelector(selector); return {selector, rect: node?.getBoundingClientRect().toJSON(), scrollTop: node?.scrollTop};
      })})));
    throw error;
  } finally { releaseImage(); await context.close(); }
}

(async () => {
  const executablePath = process.env.STOPFLOW_CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
  try {
    if (!process.argv.includes('--mobile-only')) await runViewport(browser, false);
    await runViewport(browser, true);
  }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
