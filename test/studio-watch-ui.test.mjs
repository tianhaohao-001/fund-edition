import test from 'node:test';
import assert from 'node:assert/strict';
import {setLanguage} from '../web/i18n.mjs';
import {renderWatch} from '../web/studio-watch.mjs';

test('Studio watch renders only archived AI receipts and differentiates source outages, changes and retained checks',()=>{
 const slot=Date.parse('2026-11-18T15:30:00Z');
 const evidence={symbols:[{symbol:'SPY',basis:'holding'}],quotes:[{symbol:'SPY',provider:'Nasdaq',asOf:'2026-11-18',valueUsd:103,status:'dated',sourceUrl:'https://www.nasdaq.com/market-activity/etf/spy'}],news:[],feeds:[{name:'Test source',checkedAt:slot,status:'unavailable',url:'https://example.invalid/unapproved'}]};
 const base={fundId:'test',eligible:true,available:true,enabled:true,intervalMinutes:120,nextAt:slot+3600000,nextKind:'market',nextMarket:slot+3600000,marketSession:'closed',mandate:'Follow <evidence>',older:slot-1,history:[]};
 const record={packet:evidence,rule:'review-change',ai:{status:'complete',decision:'REQUEST_PAPER_REVIEW',model:'test-model',refs:['Q1'],responseId:'fixture-receipt',zh:'核对价格变化。',en:'Check the change in price.'},signals:{baseline:false,newHeadlines:[],changes:[{symbol:'SPY',previous:100,value:103,from:'2026-11-17',to:'2026-11-18',percent:3}]},followup:{type:'paper-review',status:'recorded'},finishedAt:slot};
 try {
   setLanguage('en-US');
   const view=renderWatch({...base,history:[{slot,started:slot,status:'complete',kind:'market',record}]});
   for(const s of ['US market closed','120 min','Maya’s review','fixture-receipt','Q1','Newly observed headlines','last usable quote','+3.00%','$100.00','paper review was recorded','No order was placed','News sources were unavailable','Load earlier checks','Follow &lt;evidence&gt;'])assert.ok(view.includes(s),s);
   const missed=renderWatch({...base,history:[{slot,started:slot+86_400_000+300_000,status:'missed',kind:'market',record:{reason:'service-resumed'}}]});
   assert.match(missed,/Scheduled for.*Nov 18.*Resumed at.*Nov 19/u);
   assert.ok(!view.includes('href="https://example.invalid'));
   assert.ok(!view.includes('核对价格变化'));
   setLanguage('zh-CN');
   const rule=renderWatch({...base,older:null,history:[{slot,started:slot,status:'complete',kind:'news',record:{...record,ai:{status:'unchanged'}}},{slot:slot-3600000,started:slot-3600000,status:'interrupted',kind:'open',record:null}]});
   for(const s of ['策略规则记录','没有重复请求模型','执行中断','新闻来源暂不可用','本次未下单'])assert.ok(rule.includes(s),s);
   assert.ok(!rule.includes('fixture-receipt'));assert.ok(!rule.includes('data-watch-older'));
 }finally{setLanguage('zh-CN');}
});
