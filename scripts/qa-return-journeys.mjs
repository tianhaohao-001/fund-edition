import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../server.mjs';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}
const observe = process.argv.includes('--observe');
const output = resolve('release/review-web/return-journeys');
const webkitPath = join(process.env.PLAYWRIGHT_BROWSERS_PATH || join(tmpdir(), 'fund-edition-browser-qa'), 'webkit-2336/Playwright.exe');
const { server } = await createApp({env: {
  FUNDROOM_DB_PATH: ':memory:', FUNDROOM_BROKER_DB_PATH: ':memory:',
  FUNDROOM_ENABLE_HARNESS: 'false', FUNDROOM_ENABLE_LOCAL_VOICE: 'false',
}});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
const report = [];
const browsers = [];
try {
  const edge = await playwright.chromium.launch({channel: 'msedge', headless: true});
  browsers.push(edge);
  const webkit = await playwright.webkit.launch({executablePath: webkitPath, headless: true});
  browsers.push(webkit);
  for (const [browser, width, language] of [[edge, 1440, 'en-US'], [webkit, 390, 'zh-CN']]) {
    const next = language === 'en-US' ? 'zh-CN' : 'en-US';
    const context = await browser.newContext({viewport:{width, height: width === 390 ? 844 : 900}, locale: language,
      reducedMotion: 'reduce', isMobile: width === 390, hasTouch: width === 390, serviceWorkers: 'block'});
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const result = {browser: width === 390 ? 'WebKit' : 'Edge', width, language, errors};
    report.push(result);
    const check = (key, actual, expected) => {
      result[key] = {actual, expected};
      if (!observe) assert.deepEqual(actual, expected, key);
    };
    await page.goto(origin + '/funds?id=ark-innovation&lang=' + language);
    await page.locator('[data-study-id="ark-innovation"]').waitFor();
    await page.locator('.header-utilities .wallet-nav').click();
    await page.locator('#wallet-product').waitFor();
    await page.locator('.wallet-back').click();
    await page.locator('[data-edition=funds]').waitFor();
    await page.locator('.ed-playback[data-paused=true]').waitFor();
    const lobbyTabs = await page.locator('.ed-spread a').count();
    check('lobbyDoors', lobbyTabs, 2);
    await page.locator('[data-edition=funds]').focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-salon-directory]').waitFor();
    check('galleryLinkAfterReentry', new URL(page.url()).searchParams.get('catalog'), null);
    await page.reload();
    await page.locator('[data-salon-directory], [data-study-id]').first().waitFor();
    check('galleryAfterReload', await page.locator('[data-salon-directory]').count(), 1);
    if (!observe) {
      await page.goBack();
      await page.locator('[data-edition=funds]').waitFor();
      await page.goBack();
      await page.locator('#wallet-product').waitFor();
      await page.goBack();
      await page.locator('[data-study-id=ark-innovation]').waitFor();
      check('restoredResearchDeepLink', new URL(page.url()).searchParams.get('catalog'), 'ark-innovation');
      await page.goForward();
      await page.locator('#wallet-product').waitFor();
      check('portfolioURLAfterForward', new URL(page.url()).searchParams.get('catalog'), null);
    }
    await page.goto(origin + '/funds?lang=' + language);
    await page.locator('.sx-markets').click();
    await page.locator('[data-fg-filter=etf]').click();
    const flip = async (lang) => {
      await page.locator('.brand-language button[lang="'+lang+'"]:visible').first().focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(value => document.documentElement.lang === value, lang);
    };
    await flip(next);
    check('marketFilterAfterLanguage', await page.locator('[data-fg-filter=etf]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-fg-filter=etf]').click();
    await flip(language);
    await page.locator('[data-fg-filter=etf]').click();
    await page.locator('[data-catalog-id=ark-innovation]').click();
    await page.locator('[data-study-id=ark-innovation]').waitFor();
    const tabs = page.locator('[data-fg-dossier] [role=tab]');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    check('dossierKeyboardTab', await tabs.nth(1).getAttribute('aria-selected'), 'true');
    await page.goBack();
    await page.locator('[data-salon-directory]').waitFor();
    check('marketFilterAfterBack', await page.locator('[data-fg-filter=etf]').getAttribute('aria-pressed'), 'true');
    await page.reload();
    await page.locator('[data-fg-filter=etf]').waitFor();
    check('marketFilterAfterReload', await page.locator('[data-fg-filter=etf]').getAttribute('aria-pressed'), 'true');
    await page.goto(origin + '/studio?lang=' + language);
    await page.locator('[data-action=prepare-team]').click();
    const desk = page.locator('#draft-recruiting');
    await desk.waitFor();
    const candidate = desk.locator('[name=draft-talent]').nth(2);
    const candidateId = await candidate.inputValue();
    const target = desk.locator('[data-draft-target]');
    const targetId = await target.locator('option').nth(1).getAttribute('value');
    await candidate.check();
    await target.selectOption(targetId);
    await flip(next);
    check('candidateAfterLanguage', await desk.locator('[name=draft-talent]:checked').inputValue(), candidateId);
    check('replacementAfterLanguage', await target.inputValue(), targetId);
    check('replaceActionAfterLanguage', await desk.locator('button').getAttribute('data-action'), 'replace-draft-seat');
    if (!observe) {
      const before = await page.locator('[data-formation-seat]').count();
      const changed = page.waitForResponse(response => response.url().endsWith('/api/action') && response.request().postDataJSON()?.action === 'adjustDraftRoster');
      await desk.locator('button').click();
      const response = await changed;
      const receipt = await response.json();
      const roster = receipt.guide.draft.roster.map(member => member.id);
      check('recordedReplacement', {count:roster.length, hired:roster.includes(candidateId), replaced:!roster.includes(targetId)}, {count:before, hired:true, replaced:true});
      await page.reload();
      await page.locator('[data-formation-seat="'+candidateId+'"]').waitFor();
      check('replacedSeatAfterReload', await page.locator('[data-formation-seat="'+targetId+'"]').count(), 0);
    }
    check('viewportOverflow', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    check('runtimeErrors', [...errors], []);
    await context.close();
  }
} finally {
  await mkdir(output, {recursive:true});
  await writeFile(join(output, observe ? 'before.json' : 'verified.json'), JSON.stringify({at:new Date().toISOString(),report}, null, 2));
  for (const browser of browsers) await browser.close();
  await new Promise(done => server.close(done));
}
console.log(JSON.stringify(report));
