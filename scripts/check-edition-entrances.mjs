// Browser regression for both products' normal entry and in-page return paths.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=new URL(process.argv[2]||'http://127.0.0.1:3365/');
const local=process.argv.includes('--local');
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
const browser=await chromium.launch(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{});
const results=[];
try{
 if(output)await mkdir(output,{recursive:true});
 for(const [width,height,language] of [[320,568,'zh-CN'],[390,844,'en-US'],[1440,900,'zh-CN'],[1280,800,'en-US']]){
  const context=await browser.newContext({viewport:{width,height}});
  if(local)await context.addInitScript(l=>localStorage.setItem('morrowfolio.language',l),language);
  const page=await context.newPage(),issues=[];
  page.on('pageerror',error=>issues.push(error.message));
  await page.goto(base+'?lang='+language,{waitUntil:'domcontentloaded'});
  const left=()=>page.locator('a[data-edition=studio]'),right=()=>page.locator('a[data-edition=funds]');
  await left().waitFor();await page.evaluate(()=>document.fonts.ready);
  const positions=await page.locator('.ed-action').evaluateAll(buttons=>buttons.map(n=>{const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height,hit:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('[data-edition]')?.dataset.edition}}));
  assert.equal(positions.length,2);assert.deepEqual(positions.map(p=>p.hit),['studio','funds']);
  assert(positions.every(p=>p.top>=0&&p.bottom<=height&&p.height>=44),'Both choices must be visible before a scroll');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.equal(overflow,0);await left().click();await page.waitForURL(local?/#\/fund$/:/\/studio(\?|$)/);
  await page.locator('.receiver-lens').waitFor();
  await page.locator(local?'.workspace-toolbar a[href="#/"]':'a.back').click();await right().waitFor();
  await right().click();await page.waitForURL(local?/#\/lab$/:/\/funds(\?|$)/);
  await page.locator('[data-person-feature] a[data-catalog-id="buffett"]').waitFor();
  await page.locator('[data-fund-feature] a[data-catalog-id="wellington"]').waitFor();
  await page.goBack();await left().waitFor();
  await right().focus();await page.keyboard.press('Enter');await page.waitForURL(local?/#\/lab$/:/\/funds(\?|$)/);
  assert(!issues.length,issues.join('\n'));
  results.push({width,height,language,positions,overflow,visited:['home','studio','in-page back','funds','browser back','keyboard funds']});
  await context.close();
 }
 if(output)await writeFile(path.join(output,local?'local-entry-regression.json':'hosted-entry-regression.json'),JSON.stringify({origin:base.origin,results},null,2));
 console.log(results.map(r=>r.width+'px '+r.language+' passed').join('\n'));
}finally{await browser.close()}

