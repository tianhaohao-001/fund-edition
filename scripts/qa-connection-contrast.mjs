import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {createApp} from '../server.mjs';

const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=require(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const baseline=process.argv.includes('--baseline'), production=baseline||process.argv.includes('--production');
const out=resolve('release/review-web/connections-readability',baseline?'before':production?'production':'candidate');
await mkdir(out,{recursive:true});
const cached=join(process.env.TEMP||'','fundroom-device-asr-lab/browsers');
if(!process.env.PLAYWRIGHT_BROWSERS_PATH&&existsSync(cached))process.env.PLAYWRIGHT_BROWSERS_PATH=cached;
const installed=playwright.webkit.executablePath(),localKit=join(cached,'webkit-2336','Playwright.exe');
const browser=await playwright.webkit.launch({headless:true,...(!existsSync(installed)&&existsSync(localKit)?{executablePath:localKit}:{})});
let server;
let origin='https://fund-edition-web-production.up.railway.app';
if(!production){
  ({server}=await createApp({env:{FUNDROOM_DB_PATH:':memory:',FUNDROOM_BROKER_DB_PATH:':memory:',FUNDROOM_ENABLE_LOCAL_VOICE:'false'}}));
  server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
}
function scan(){
  const rows=[];
  function channels(css) {
    if(css==='transparent')return [0,0,0,0];
    const digits=css.match(/[\d.]+/g)?.map(Number)??[];
    return digits.length>=3?[digits[0],digits[1],digits[2],digits[3]??1]:[0,0,0,0];
  }
  function blend(front,back){const a=front[3]+back[3]*(1-front[3]);if(!a)return [0,0,0,0];return [0,1,2].map(i=>(front[i]*front[3]+back[i]*back[3]*(1-front[3]))/a).concat(a);}
  function luminance(rgb){const [r,g,b]=rgb.map(x=>{const n=x/255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;}
  function colors(el,f){
    let front=f,back=[0,0,0,0];
    for(let parent=el;parent;parent=parent.parentElement){
      const c=getComputedStyle(parent),bg=channels(c.backgroundColor);
      front=blend(front,bg);back=blend(back,bg);
      front[3]*=Number(c.opacity);back[3]*=Number(c.opacity);
    }
    const surface=[255,255,255,1],a=blend(front,surface),b=blend(back,surface);
    return {fg:a.slice(0,3).map(Math.round),bg:b.slice(0,3).map(Math.round),ratio:+((Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05)).toFixed(3)};
  }
  function inspect(el,text,pseudo){
    const style=getComputedStyle(el,pseudo),rect=el.getBoundingClientRect();
    if(!rect.width||!rect.height||rect.bottom<0&&el.matches('.skip-link')||style.visibility!=='visible')return;
    rows.push({element:(el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+el.classList[0]),text:text.trim().slice(0,70),...colors(el,channels(style.color))});
  }
  const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walk.nextNode()){const n=walk.currentNode;if(!n.textContent.trim())continue;const el=n.parentElement;if(!el||el.closest('[hidden],script,style,noscript,option,dialog:not([open]),[aria-hidden="true"]'))continue;
    const r=document.createRange();r.selectNodeContents(n);if(!r.getClientRects().length)continue;inspect(el,n.textContent);}
  for(const el of document.querySelectorAll('input,select')){if(el.getClientRects().length)inspect(el,el.value||el.placeholder||'field',!el.value&&el.placeholder?'::placeholder':null);}
  const controls=[...document.querySelectorAll('button,a[href],summary,input,select,textarea')].filter(el=>el.getClientRects().length&&!el.closest('dialog:not([open])')&&!el.matches('.skip-link')).map(el=>{const r=el.getBoundingClientRect();return {text:(el.innerText||el.getAttribute('aria-label')||el.tagName).trim().slice(0,60),width:+r.width.toFixed(1),height:+r.height.toFixed(1)};});
  return {viewport:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,minimum:Math.min(...rows.map(x=>x.ratio)),rows,controls};
}
const report={at:new Date().toISOString(),origin,engine:'Playwright WebKit on Windows, with mobile Safari viewport emulation',version:browser.version(),results:[]};
try{
 for(const width of baseline?[390]:[375,390,1440])for(const scheme of ['light','dark'])for(const lang of baseline?['zh-CN']:['zh-CN','en-US']){
  const mobile=width<500,defaultLang=width===375?'en-US':'zh-CN';
  const c=await browser.newContext({...(!mobile?{}:playwright.devices['iPhone 13']),viewport:{width,height:mobile?844:900},deviceScaleFactor:1,colorScheme:scheme,locale:lang,serviceWorkers:'block'});
  const p=await c.newPage();
  async function check(name){
    const record=await p.evaluate(scan);report.results.push({name,scheme,width,lang,...record});
    const imageFile=name+'-'+scheme+'-'+width+(lang===defaultLang?'':'-'+lang)+'.png';
    await p.screenshot({path:join(out,imageFile)});return record;
  }
  await p.goto(origin+'/?lang='+lang+'#/connections?view=broker');await p.locator('.connection-panel').waitFor();await p.evaluate(()=>document.fonts.ready);
  await check('connections');
  if(!baseline){
    const row=p.locator('.broker-demo-option').nth(lang==='en-US'?1:0);
    if(await row.count()){
      await row.focus();await p.keyboard.press('Tab');const focused=await p.evaluate(()=>{const el=document.activeElement,s=getComputedStyle(el);return {el:el.outerHTML.slice(0,130),outline:s.outlineStyle,width:parseFloat(s.outlineWidth)};});
      assert.ok(focused.width>=2&&focused.outline!=='none',JSON.stringify(focused));
      report.results.at(-1).keyboardFocus=focused;
      await row.click();await check('broker-selection');
      if(!production){
        await p.locator('.broker-demo-guide summary').click();
        await check('broker-guide');
        await p.locator('[data-demo-action="connect"]').click();
        await p.locator('[data-demo-state="connected"]').waitFor();
        await check('broker-connected');
        await p.locator('[data-demo-action="disconnect"]').click();
        await check('broker-disconnect');
        await p.locator('[data-demo-action="confirm-disconnect"]').click();
        await p.locator('[data-demo-state="choose"]').waitFor();
        await p.locator('[data-action="refresh-connections"]').click();
        await p.locator('.connection-time').waitFor();
        await p.locator('.connection-panel').evaluate(el=>el.scrollIntoView({block:'start'}));
        await check('environment');
        await p.locator('.header-menu').click();await p.locator('#account-sheet[open]').waitFor();
        await check('workspace-menu');
      }
    }
    if(!production){
      await p.goto(origin+'/broker.html?lang='+lang);await p.locator('#broker-unavailable:not([hidden])').waitFor();
      await check('private-console');
      // Visual-only paper configuration: no credential and no request to any broker.
      await p.route('**/api/broker/status',route=>route.fulfill({json:{enabled:true,feed:'iex',modes:{paper:{enabled:true,allowedSymbols:['TEST'],maxOrderUsd:100}}}}));
      await p.route('**/api/broker/action',()=>{throw Error('Private visual inspection must never submit an order.');});
      await p.reload();await p.locator('#broker-workspace:not([hidden])').waitFor();
      await check('private-config-fixture');
    }
  }
  await c.close();
 }
 await writeFile(join(out,'audit.json'),JSON.stringify(report,null,2));
 console.log(report.results.map(({name,width,scheme,minimum,overflow,rows})=>({name,width,scheme,minimum,overflow,low:rows.filter(x=>x.ratio<4.5).map(x=>x.text)})));
 if(!baseline)for(const x of report.results){assert.equal(x.overflow,0,x.name);assert.ok(x.minimum>=4.5,x.name+': '+x.minimum);for(const control of x.controls)assert.ok(control.width>=44&&control.height>=44,JSON.stringify(control));}
}finally{await browser.close();if(server)await new Promise(done=>server.close(done));}
