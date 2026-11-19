import { chownSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from './server.mjs';

export function publicEnvironment(input) {
  // Only explicitly supported settings cross into the application. In
  // particular, never inherit a broker, Stripe, model URL or desktop key.
  const origin=input.FUNDROOM_PUBLIC_ORIGIN || (input.RAILWAY_PUBLIC_DOMAIN && 'https://'+input.RAILWAY_PUBLIC_DOMAIN);
  const key=input.FUNDROOM_HR_KEY?.trim();
  const railwayEdgeOnly = input.FUNDROOM_RAILWAY_EDGE_ONLY === 'true' &&
    Boolean(input.RAILWAY_SERVICE_ID && input.RAILWAY_ENVIRONMENT_ID && input.RAILWAY_PUBLIC_DOMAIN) &&
    origin === 'https://' + input.RAILWAY_PUBLIC_DOMAIN;
  return {
    FUNDROOM_PUBLIC_HOSTED:'true', FUNDROOM_CLOUD_CONTAINER:'true',
    FUNDROOM_RAILWAY_EDGE_ONLY:railwayEdgeOnly ? 'true' : 'false',
    FUNDROOM_PUBLIC_ORIGIN:origin, FUNDROOM_HOST:input.FUNDROOM_CLOUD_BIND==='127.0.0.1'?'127.0.0.1':'0.0.0.0', FUNDROOM_PORT:input.PORT || '3000',
    FUNDROOM_DB_PATH:input.FUNDROOM_DB_PATH || '/data/fund-edition.sqlite',
    FUNDROOM_INVOICE_ORDERS:input.FUNDROOM_INVOICE_ORDERS==='false'?'false':'true',
    FUNDROOM_PAYPAL_ME_GOODS_URL:input.FUNDROOM_PAYPAL_ME_GOODS_URL,
    FUNDROOM_PAYPAL_MONTHLY_GOODS_URL:input.FUNDROOM_PAYPAL_MONTHLY_GOODS_URL,
    FUNDROOM_PAYPAL_YEARLY_GOODS_URL:input.FUNDROOM_PAYPAL_YEARLY_GOODS_URL,
    FUNDROOM_WATCH_ENABLED:input.FUNDROOM_WATCH_ENABLED==='false'?'false':'true',
    FUNDROOM_ENABLE_LOCAL_VOICE:'false', FUNDROOM_ENABLE_HARNESS:key?'true':'false',
    FUNDROOM_PAYPAL_MODE:input.FUNDROOM_PAYPAL_MODE,PAYPAL_CLIENT_ID:input.PAYPAL_CLIENT_ID,
    FUNDROOM_PAYPAL_SANDBOX_CLIENT_ID:input.FUNDROOM_PAYPAL_SANDBOX_CLIENT_ID,
    FUNDROOM_PAYPAL_SANDBOX_CLIENT_SECRET:input.FUNDROOM_PAYPAL_SANDBOX_CLIENT_SECRET,
    PAYPAL_CLIENT_SECRET:input.PAYPAL_CLIENT_SECRET,PAYPAL_WEBHOOK_ID:input.PAYPAL_WEBHOOK_ID,
    PAYPAL_MONTHLY_PLAN_ID:input.PAYPAL_MONTHLY_PLAN_ID,PAYPAL_YEARLY_PLAN_ID:input.PAYPAL_YEARLY_PLAN_ID,
    HARNESSROUTER_API_KEY:key, HARNESSROUTER_HARNESS_ID:'chrn_642e1a7bf73e478686a90bb77fda796a',
    HARNESSROUTER_MODEL:'deepseek-v4.1-flash', FUNDROOM_DEFAULT_PROVIDER:'harnessrouter',
    FUNDROOM_AI_CONCURRENCY:input.FUNDROOM_AI_CONCURRENCY ?? '2',
    FUNDROOM_HOURLY_AI_TASKS:input.FUNDROOM_HOURLY_AI_TASKS ?? '40',
    FUNDROOM_MODEL_30D_LIMIT:input.FUNDROOM_MODEL_30D_LIMIT ?? '300',
    FUNDROOM_GUEST_AI_DAILY_LIMIT:input.FUNDROOM_GUEST_AI_DAILY_LIMIT ?? '80'
  };
}

if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  if(process.getuid?.()===0){
    if(!lstatSync('/data').isDirectory())throw Error('Mount a directory at /data.');
    chownSync('/data',1000,1000);
    process.setgroups([]);process.setgid(1000);process.setuid(1000);
  }
  process.umask(0o077);
  const app=await createApp({env:publicEnvironment(process.env)});
  app.server.listen(app.port,app.host,()=>console.log('Fund Edition is listening on port '+app.server.address().port));
  for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>app.server.close());
}
