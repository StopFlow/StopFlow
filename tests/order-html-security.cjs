// Run with Node.js, Playwright, Chromium and pdftotext. App resources are served from disk;
// external requests are blocked, and fixtures never leave the disposable browser.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium, devices} = require('playwright');

const root = path.resolve(process.env.STOPFLOW_TEST_ROOT || path.join(__dirname, '..'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'stopflow-order-html-'));
const marker = 'window.__orderHtmlInjection=1';
const attacks = [
  `<img src="data:image/png;base64,AAAA" onerror="${marker}">`,
  `<svg onload="${marker}"></svg>`,
  `</title><script>${marker}</script><title>`,
  `"><svg onload='${marker}'></svg>&lt;b&gt;déjà encodé&lt;/b&gt;`
];
const normal = `Crème brûlée : l'équipe d’aujourd’hui & "L’Union" < 3 > 1 — 2 €`;

function fixture(note, allFields = false) {
  const text = allFields ? note : normal;
  return {
    id: '00000000-0000-4000-8000-000000000001', number: text, supplier: text,
    status: allFields ? note : 'Validé', author: text, validator: text,
    lastEditedName: text, department: 'salle', note,
    inventoryAt: '2026-10-16T10:00:00.000Z', validatedAt: '2026-10-16T10:01:00.000Z',
    updatedAt: '2026-10-16T10:01:00.000Z', createdAt: '2026-10-16T10:00:00.000Z',
    lines: [{id: 100, name: text, category: text, unit: text, stock: 1, target: 4, quantity: 3}],
    stocks: {100: 1}, adjustments: {}
  };
}

async function assertSafe(page, selector, label) {
  // Image error and SVG load handlers execute asynchronously after HTML parsing.
  await page.waitForTimeout(80);
  const result = await page.evaluate(selector => {
    const root = document.querySelector(selector);
    return {found: Boolean(root), executed: Boolean(window.__orderHtmlInjection),
      injectedNodes: root?.querySelectorAll('script,img,svg').length};
  }, selector);
  assert.equal(result.found, true, `${label}: expected rendering is missing`);
  assert.equal(result.executed, false, `${label}: injected JavaScript executed`);
  assert.equal(result.injectedNodes, 0, `${label}: free text created HTML nodes`);
}

async function checkSuggestions(page) {
  const fields = ['title', 'status', 'category', 'priority', 'description'];
  const values = [...attacks, `<script>${marker}</script>`, normal];
  for (const field of fields) {
    for (const value of values) {
      const suggestion = {
        title: normal, status: 'Nouvelle', category: 'Organisation', priority: 'Normale',
        description: normal, createdAt: '2026-10-16T10:00:00.000Z', [field]: value
      };
      await page.evaluate(suggestion => {
        db.suggestions = [suggestion];
        window.__orderHtmlInjection = 0;
        renderSuggestions();
      }, suggestion);
      await assertSafe(page, '#suggestionList', `suggestion ${field}`);
      const rendered = await page.evaluate(() => {
        const card = document.querySelector('#suggestionList > div');
        return {
          title: card.querySelector('b').textContent,
          status: card.querySelector('.badge').textContent,
          metadata: card.querySelector('.muted').textContent,
          description: card.querySelector('p').textContent,
          date: fmt(db.suggestions[0].createdAt), stored: db.suggestions[0]
        };
      });
      assert.equal(rendered.title, suggestion.title);
      assert.equal(rendered.status, suggestion.status);
      assert.equal(rendered.metadata, `${suggestion.category} · ${suggestion.priority} · ${rendered.date}`);
      assert.equal(rendered.description, suggestion.description);
      assert.deepEqual(rendered.stored, suggestion, 'Rendering must not modify suggestion data');
    }
  }
  await page.evaluate(() => { db.suggestions = []; renderSuggestions(); });
  assert.equal(await page.locator('#suggestionList').textContent(), 'Aucune idée partagée pour le moment.');
}

async function runViewport(browser, mobile) {
  const context = await browser.newContext({
    ...(mobile ? devices['iPhone 13'] : {viewport: {width: 1280, height: 900}}),
    serviceWorkers: 'block', timezoneId: 'Europe/Brussels'
  });
  const errors = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'blob:' || url.protocol === 'data:') return route.continue();
    if (url.origin !== 'http://localhost') return route.abort('blockedbyclient');
    const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (filename.includes('/') || filename.startsWith('.') || !fs.existsSync(path.join(root, filename))) {
      return route.fulfill({status: 404, body: ''});
    }
    const type = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml'}[path.extname(filename)] || 'application/octet-stream';
    return route.fulfill({contentType: type, body: fs.readFileSync(path.join(root, filename))});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://localhost/', {waitUntil: 'networkidle'});
    await page.waitForFunction(() => window.__stopflowDraftExperienceInstalled && window.stopflow073HistoryUx?.active && window.stopflow073InventoryStandard?.active && window.stopflow080SuggestionsUx?.active);
    await page.waitForTimeout(3500); // Allow the repository's existing startup layers to finish.
    await checkSuggestions(page);
    for (const [index, value] of [...attacks, normal].entries()) {
      const order = fixture(value);
      await page.evaluate(order => {
        session = {...session, id: null, name: 'Security test', role: ROLE.ADMIN, authMode: 'local'};
        db.orders = [order];
        db.settings = {establishment: 'Brasserie L’Union & équipe', manager: 'Test', footer: 'Merci à l’équipe & à bientôt !'};
        window.__orderHtmlInjection = 0;
        showDetail(order.id);
      }, order);
      await assertSafe(page, '#modalBox', 'order detail');
      assert.equal(await page.locator('#modalBox > p').last().textContent(), `Remarque : ${value}`);
      assert.equal(await page.locator('#modalBox h2').textContent(), `${order.number} — ${order.supplier}`);
      assert.equal(await page.locator('#modalBox tbody td').first().textContent(), `${normal}${normal}`);

      await page.evaluate(order => showPrintView(order), order);
      for (const selector of ['#printSheet', '#printArea']) {
        await assertSafe(page, selector, selector);
        assert.equal(await page.locator(`${selector} > p`).textContent(), `Remarque : ${value}`);
        assert.equal(await page.locator(`${selector} .print-foot`).textContent(), 'Merci à l’équipe & à bientôt !');
      }
      await page.evaluate(() => document.getElementById('printScreen').classList.add('hidden'));

      const popupPromise = context.waitForEvent('page');
      await page.evaluate(order => openPrintableWindow(order), order);
      const popup = await popupPromise;
      popup.on('pageerror', error => errors.push(error.message));
      await popup.waitForLoadState('domcontentloaded');
      await assertSafe(popup, 'body', 'print window');
      assert.equal(await popup.title(), `${order.number} - ${order.supplier}`);
      assert.equal(await popup.locator('body > p').textContent(), `Remarque : ${value}`);
      await popup.evaluate(() => { window.print = () => { window.__printRequested = true; }; });
      await popup.getByRole('button', {name: 'Lancer l’impression'}).click();
      assert.equal(await popup.evaluate(() => window.__printRequested), true);
      await popup.close();

      const pdf = await page.evaluate(async order => {
        const data = new Uint8Array(await createSimplePDF(order).arrayBuffer());
        return btoa(String.fromCharCode(...data));
      }, order);
      const pdfPath = path.join(scratch, `${mobile ? 'mobile' : 'desktop'}-${index}.pdf`);
      fs.writeFileSync(pdfPath, Buffer.from(pdf, 'base64'));
      const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {encoding: 'utf8'});
      assert(text.includes('StopFlow - Bon de commande'), 'PDF must parse as a real order document');
      assert(text.includes(value.startsWith('<') || value.startsWith('"') ? value : 'Crème brûlée'), 'PDF must keep the original note text');
      assert(!text.includes('&amp;') || value.includes('&amp;'), 'PDF must not receive HTML-escaped data');
      assert.equal(await page.evaluate(() => db.orders[0].note), value, 'Rendering must not modify the stored note');
    }

    for (const value of [attacks[0], attacks[2]]) {
      const order = fixture(value, true);
      await page.evaluate(order => {
        db.orders = [order];
        db.settings = {establishment: order.note, manager: order.note, footer: order.note};
        showDetail(order.id);
        showPrintView(order);
      }, order);
      for (const selector of ['#modalBox', '#printSheet', '#printArea']) await assertSafe(page, selector, 'all free-text fields');
      assert.equal(await page.locator('#modalBox h2').textContent(), `${value} — ${value}`);
      assert.equal(await page.locator('#modalBox .badge').textContent(), value);
      assert.equal(await page.locator('#printSheet .print-foot').textContent(), value);
      assert.equal(await page.locator('#printSheet .print-meta > div').first().textContent(), `Établissement${value}`);
      const popupPromise = context.waitForEvent('page');
      await page.evaluate(order => openPrintableWindow(order), order);
      const popup = await popupPromise;
      popup.on('pageerror', error => errors.push(error.message));
      await popup.waitForLoadState('domcontentloaded');
      await assertSafe(popup, 'body', 'print title and metadata');
      assert.equal(await popup.title(), `${value} - ${value}`);
      await popup.close();
    }

    const payload = attacks[0];
    await page.evaluate(payload => {
      const order = db.orders[0];
      Object.assign(order, {id: `draft" data-injected="${payload}`, status: 'Brouillon', lastEditedName: payload});
      db.articles = [{id: `article" data-injected="${payload}`, name: payload, supplier: order.supplier, category: payload, unit: payload, target: 4, active: true}];
      current = {supplier: order.supplier, stocks: {}, adjustments: {}, note: payload, author: payload};
      renderInventory();
      renderSummary();
      renderHistory();
      localStorage.setItem(stopFlowDraftKey(), JSON.stringify({savedAt: new Date().toISOString(), order: {...order, id: 'unsynced-local-draft'}}));
      stopFlowRenderRecovery();
    }, payload);
    for (const selector of ['#inventoryRows', '#summaryRows', '#historyRows', '#stopflowRecoveryBox']) await assertSafe(page, selector, selector);
    assert.equal(await page.locator('#historyRows [data-detail]').getAttribute('data-detail'), `draft" data-injected="${payload}`);
    assert.equal(await page.locator('#historyRows [data-injected]').count(), 0);
    assert.equal(await page.locator('#inventoryRows [data-injected]').count(), 0);
    assert.equal(await page.locator('#summaryRows [data-injected]').count(), 0);
    assert.equal(await page.locator('#generalNote').inputValue(), payload);

    // Exercise the real PDF-opening button separately from the printable HTML document.
    await page.evaluate(() => {
      document.getElementById('printScreen').classList.add('hidden');
      db.orders[0].status = 'Validé';
      showDetail(db.orders[0].id);
    });
    const pdfPopupPromise = context.waitForEvent('page');
    await page.locator('#openPdf').click();
    const pdfPopup = await pdfPopupPromise;
    await pdfPopup.waitForURL(/^blob:/);
    const pdfHeader = await page.evaluate(async url => (await (await fetch(url)).blob()).slice(0,5).text(), pdfPopup.url());
    assert.equal(pdfHeader, '%PDF-');
    await pdfPopup.close();
    assert.deepEqual(errors, [], 'No JavaScript exception may occur in the app or print windows');
    console.log(`PASS ${mobile ? 'Chromium mobile/iPhone viewport' : 'Chromium desktop'}: 30 suggestion cases and empty state; 4 attack notes, normal French text, all metadata, print windows/previews, PDF parsing/opening, history, recovery and quoted attributes`);
  } finally { await context.close(); }
}

(async () => {
  const executablePath = process.env.STOPFLOW_CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
  try { await runViewport(browser, false); await runViewport(browser, true); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => fs.rmSync(scratch, {recursive: true, force: true}));
