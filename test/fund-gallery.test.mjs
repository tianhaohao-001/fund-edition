import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG} from '../web/catalog-data.mjs';
import {salonDirectory,salonDetailHead,galleryUrl} from '../web/strategy-salon.mjs';
import {studyVisual} from '../web/fund-gallery.mjs';
import {chartSample,exchangeFunds} from '../web/fund-gallery-data.mjs';

const url=id=>'/?lang=en-US&lobby=motion'+(id?'&catalog='+id:'')+'#/lab';

test('category routes reach every market and style dossier while preserving language and preview',()=>{
  for (const [group,section,count] of [['markets','market',9],['people','persona',5]]) {
    const html=salonDirectory({items:CATALOG,lang:'en-US',url,backUrl:'/',query:new URLSearchParams({group})});
    assert.equal((html.match(/data-catalog-id=/g)||[]).length,count);
    for(const item of CATALOG.filter(x=>x.section===section)){
      assert.ok(html.includes('data-catalog-id="'+item.id+'"'));
      const back=galleryUrl(url,group);
      assert.match(back,/lobby=motion/);
      const detail=salonDetailHead(item,'en-US',back);
      assert.ok(detail.includes('group='+group));
      const dossier=studyVisual(item,'en-US');
      if(item.id==='buffett')assert.match(dossier,/data-buffett-study/);
      else assert.ok(dossier.includes('Opening this dossier does not run a model.'));
    }
  }
});

test('exchange-only bars take precedence while mutual fund values retain their units and observation basis',()=>{
  const bars=[['2026-01-02',11,12,10,10.5],['2026-01-05',10,11,9,10.1]];
  for(const ticker of exchangeFunds) {
    assert.equal(chartSample(ticker,{[ticker]:bars}).kind,'candles');
    assert.notEqual(chartSample(ticker)?.kind,'candles');
  }
  for(const symbol of ['FCNTX','AGTHX','VWELX'])assert.equal(chartSample(symbol).kind,'nav');
  assert.equal(chartSample('PSTKX').unit,'index');
  assert.equal(chartSample('AGTHX').rows.at(-1)[1],88.21);
});
