// Invoked by the local, masked PowerShell helper. Values only travel in process
// memory and railway.exe stdin. No credential, PayPal ID or receipt is printed.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {paypalClient,PAYPAL_CYCLES,PAYPAL_EVENTS,validPayPalPlan} from '../core/paypal-billing.mjs';

const namespace='fund-edition-premium-v1';
const key=name=>createHash('sha256').update(namespace+'-'+name).digest('hex').slice(0,32);
export async function prepareMerchant(api,origin,configured={}) {
  const productName='Fund Edition Advanced AI Team';
  const description='Fund Edition software membership ('+namespace+').';
  async function find(path,property,predicate){
    for(let page=1;page<=100;page++){
      const sep=path.includes('?')?'&':'?';
      const result=await api(path+sep+'page_size=20&page='+page);
      if(!Array.isArray(result[property]))throw Error('Could not verify the merchant catalog.');
      const found=result[property].find(predicate);
      if(found)return found;
      if(!result.links?.some(link=>link.rel==='next'))return null;
    }
    throw Error('Catalog pagination limit reached. Provide the two existing plan IDs.');
  }
  let product;
  for(const term of Object.keys(PAYPAL_CYCLES)){
    const id=configured[term];
    if(!id)continue;
    if(!/^P-[A-Z0-9]{5,32}$/.test(id))throw Error('Invalid configured plan ID.');
    const plan=await api('/v1/billing/plans/'+id);
    if(!validPayPalPlan(plan,id,term)||!plan.product_id||(product&&product!==plan.product_id))throw Error('Configured plans must belong to the same membership product.');
    product=plan.product_id;
  }
  if(!product){
    let entry=await find('/v1/catalogs/products','products',p=>p.name===productName&&p.description===description);
    if(!entry)entry=await api('/v1/catalogs/products',{method:'POST',requestId:key('catalog-service'),body:{name:productName,description,type:'SERVICE',category:'SOFTWARE'}});
    product=entry?.id;
  }
  if(!/^PROD-[A-Z0-9]{17}$/.test(product??''))throw Error('Invalid PayPal product ID.');
  const detail=await api('/v1/catalogs/products/'+product);
  if(detail?.id!==product||detail.type!=='SERVICE'||detail.name!==productName||detail.description!==description)throw Error('Could not verify the membership product.');
  const plans={};
  for(const [term,spec] of Object.entries(PAYPAL_CYCLES)){
    const name='Fund Edition Advanced AI Team · '+(term==='monthly'?'Monthly':'Annual');
    let id=configured[term];
    if(!id){
      const existing=await find('/v1/billing/plans?product_id='+product,'plans',p=>p.name===name&&p.status==='ACTIVE');
      id=existing?.id;
    }
    if(!id){
      const result=await api('/v1/billing/plans',{method:'POST',requestId:key(term+'-'+product),body:{product_id:product,name,status:'ACTIVE',
        billing_cycles:[{frequency:{interval_unit:spec.unit,interval_count:1},tenure_type:'REGULAR',sequence:1,total_cycles:0,
          pricing_scheme:{fixed_price:{value:spec.usd,currency_code:'USD'}}}],
        payment_preferences:{auto_bill_outstanding:false,setup_fee:{value:'0',currency_code:'USD'},payment_failure_threshold:1}}});
      id=result.id;
    }
    if(!/^P-[A-Z0-9]{5,32}$/.test(id??''))throw Error('Plan verification failed.');
    const plan=await api('/v1/billing/plans/'+id);
    if(plan?.product_id!==product||!validPayPalPlan(plan,id,term))throw Error('Plan verification failed.');
    plans[term]=id;
  }
  const url=origin+'/api/billing/paypal/webhook';
  const list=await api('/v1/notifications/webhooks');
  let hook=list.webhooks?.find(h=>h.url===url);
  const event_types=PAYPAL_EVENTS.map(name=>({name}));
  if(!hook)hook=await api('/v1/notifications/webhooks',{method:'POST',requestId:key('webhook-'+url),body:{url,event_types}});
  if(!hook?.id)throw Error('Could not verify the webhook.');
  if(!hook.event_types?.some(e=>e.name==='*')&&PAYPAL_EVENTS.some(name=>!hook.event_types?.some(e=>e.name===name))){
    throw Error('The existing webhook is missing subscription or payment events. Add them in PayPal and retry.');
  }
  return {PAYPAL_MONTHLY_PLAN_ID:plans.monthly,PAYPAL_YEARLY_PLAN_ID:plans.yearly,PAYPAL_WEBHOOK_ID:hook.id};
}

async function main(){
  const env=process.env,mode=env.FUNDROOM_PAYPAL_MODE,id=env.PAYPAL_CLIENT_ID,secret=env.PAYPAL_CLIENT_SECRET;
  if(!['sandbox','live'].includes(mode)||!id||!secret||!env.FUNDROOM_RAILWAY_CLI)throw Error('Use the masked Windows helper.');
  const origin='https://fund-edition-web-production.up.railway.app';
  const selection=['--project','e3b98e98-20c2-4c0d-b228-c423d93a4756','--environment','4a065697-545c-4240-9ef4-b87381e235ce','--service','7437a750-1a31-4c2b-8b18-3cf4f6c222ce'];
  const api=paypalClient({mode,id,secret});
  const prepared=await prepareMerchant(api,origin,{monthly:env.PAYPAL_MONTHLY_PLAN_ID,yearly:env.PAYPAL_YEARLY_PLAN_ID});
  const values={PAYPAL_CLIENT_ID:id,PAYPAL_CLIENT_SECRET:secret,...prepared,FUNDROOM_PAYPAL_MODE:mode};
  for(const [key,value] of Object.entries(values)){
    try{execFileSync(env.FUNDROOM_RAILWAY_CLI,['variable','set',key,'--stdin','--skip-deploys',...selection],{input:value,stdio:['pipe','ignore','ignore'],windowsHide:true});}
    catch{throw Error('Railway could not stage '+key+'. It is safe to retry.');}
  }
  console.log('Verified monthly and annual plans and webhook. Staged six private Railway variables. No deployment or charge.');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(err=>{console.error(err.message);process.exitCode=1;});
