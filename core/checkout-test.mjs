import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {BillingError} from './stripe-billing.mjs';
import {paypalClient} from './paypal-billing.mjs';
import {afterTerm} from './invoice-membership.mjs';

const prices={monthly:'9.99',yearly:'99.99'};
const guid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const providerId=/^[A-Z0-9]{8,32}$/;
const cookieName='fundroom_checkout_test';
const fail=(status,code,message)=>{throw new BillingError(status,code,message);};
const invalid=()=>fail(400,'test-input','Choose a valid test order and term.');
const unclear=()=>fail(409,'test-unverified','The sandbox payment could not be verified.');
const notApproved=()=>fail(409,'test-approval-required','Approve the test order first.');
const conflict=()=>fail(409,'test-pending','Finish or cancel the current test order first.');
const iso=value=>value?new Date(value).toISOString():null;
export const TEST_PATHS=new Set(['state','create','approve','capture','cancel'].map(action=>'/api/checkout-test/'+action));

export function testOwner(request,response,secure){
  let token=request.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!/^[a-zA-Z0-9_-]{43}$/.test(token??'')){
    if(request.method!=='GET')fail(401,'test-session','Reopen the test checkout to start a test session.');
    token=randomBytes(32).toString('base64url');
    response.setHeader('Set-Cookie',cookieName+'='+token+'; Path=/api/checkout-test; HttpOnly; SameSite=Lax; Max-Age=34560000'+(secure?'; Secure':''));
  }
  return createHash('sha256').update('checkout-test:'+token).digest('hex');
}

export function testCheckoutRecords(db){
  db.exec(`CREATE TABLE IF NOT EXISTS checkout_test_orders(
    id TEXT PRIMARY KEY,owner TEXT NOT NULL,mode TEXT NOT NULL,cadence TEXT NOT NULL,request_key TEXT NOT NULL,
    status TEXT NOT NULL,created INTEGER NOT NULL,provider_id TEXT,approval TEXT,receipt TEXT,starts INTEGER,ends INTEGER,
    UNIQUE(owner,mode,request_key),UNIQUE(mode,provider_id),UNIQUE(mode,receipt));
    CREATE INDEX IF NOT EXISTS checkout_test_recent ON checkout_test_orders(owner,mode,created);
    CREATE UNIQUE INDEX IF NOT EXISTS checkout_test_open ON checkout_test_orders(owner,mode)
    WHERE status IN ('new','created','approved','capturing');`);
  const get=id=>db.prepare('SELECT * FROM checkout_test_orders WHERE id=?').get(id);
  const latest=(owner,mode)=>db.prepare('SELECT * FROM checkout_test_orders WHERE owner=? AND mode=? ORDER BY created DESC,rowid DESC LIMIT 1').get(owner,mode);
  const access=(owner,mode,now)=>db.prepare("SELECT * FROM checkout_test_orders WHERE owner=? AND mode=? AND status='captured' AND ends>? ORDER BY ends DESC LIMIT 1").get(owner,mode,now);
  function reserve(owner,mode,cadence,key,now){
    const previous=db.prepare('SELECT * FROM checkout_test_orders WHERE owner=? AND mode=? AND request_key=?').get(owner,mode,key);
    if(previous){if(previous.cadence!==cadence)conflict();return previous;}
    const open=latest(owner,mode);
    if(open&&['new','created','approved','capturing'].includes(open.status)){if(open.cadence!==cadence)conflict();return open;}
    db.prepare("DELETE FROM checkout_test_orders WHERE (ends IS NOT NULL AND ends<?) OR (ends IS NULL AND created<?)").run(now-86400000,now-7*86400000);
    if(db.prepare('SELECT count(*) AS n FROM checkout_test_orders WHERE created>?').get(now-86400000).n>=2500)
      fail(429,'test-capacity','Daily test checkout capacity reached.');
    const id=randomUUID();
    db.prepare('INSERT INTO checkout_test_orders(id,owner,mode,cadence,request_key,status,created) VALUES(?,?,?,?,?,?,?)').run(id,owner,mode,cadence,key,'new',now);
    return get(id);
  }
  function step(id,status,required){
    const result=db.prepare('UPDATE checkout_test_orders SET status=? WHERE id=? AND status=?').run(status,id,required);
    return result.changes===1;
  }
  return {get,latest,access,reserve,step,attach(id,provider,url){
    db.prepare("UPDATE checkout_test_orders SET provider_id=?,approval=?,status='created' WHERE id=? AND status='new'").run(provider,url,id);
  },finish(row,receipt,now){
    db.prepare("UPDATE checkout_test_orders SET receipt=?,starts=?,ends=?,status='captured' WHERE id=? AND status='capturing'")
      .run(receipt,now,afterTerm(now,row.cadence),row.id);
  }};
}

function approvedUrl(order){
  const link=order.links?.find(x=>['approve','payer-action'].includes(x.rel));
  let url;try{url=new URL(link?.href);}catch{unclear();}
  if(url.origin!=='https://www.sandbox.paypal.com'||url.username||url.password||url.searchParams.get('token')!==order.id)unclear();
  return url.href;
}

function verifyUnit(order,row){
  const unit=order?.purchase_units?.[0];
  if(order?.id!==row.provider_id||order.intent!=='CAPTURE'||order.purchase_units?.length!==1||
    unit.reference_id!==row.id||unit.custom_id!==row.id||unit.amount?.currency_code!=='USD'||unit.amount?.value!==prices[row.cadence])unclear();
  return unit;
}

export function testCheckout({records,env,fetchImpl}){
  const legacy=env.FUNDROOM_PAYPAL_MODE==='sandbox';
  const explicit=env.FUNDROOM_PAYPAL_SANDBOX_CLIENT_ID||env.FUNDROOM_PAYPAL_SANDBOX_CLIENT_SECRET;
  const id=explicit?env.FUNDROOM_PAYPAL_SANDBOX_CLIENT_ID:legacy&&env.PAYPAL_CLIENT_ID;
  const secret=explicit?env.FUNDROOM_PAYPAL_SANDBOX_CLIENT_SECRET:legacy&&env.PAYPAL_CLIENT_SECRET;
  const sandbox=id?.trim?.()&&secret?.trim?.()?paypalClient({mode:'sandbox',id:id.trim(),secret:secret.trim(),fetchImpl}):null;
  const modeFor=value=>{
    if(!value)return sandbox?'sandbox':'simulation';
    if(value==='sandbox'&&!sandbox)fail(503,'test-sandbox-unavailable','PayPal Sandbox is not configured. Choose the on-site simulation.');
    if(!['simulation','sandbox'].includes(value))invalid();
    return value;
  };
  function state(owner,mode,row=records.latest(owner,mode)){
    const active=records.access(owner,mode,Date.now());
    return {mode,sandboxAvailable:Boolean(sandbox),testAccess:{active:Boolean(active),cadence:active?.cadence??null,endsAt:iso(active?.ends)},
      order:row?{id:row.id,mode,cadence:row.cadence,status:row.status,amountUsd:prices[row.cadence],currency:'USD',startsAt:iso(row.starts),endsAt:iso(row.ends),
        receipt:row.receipt,approvalUrl:row.status==='created'?row.approval:null}:null};
  }
  async function run(action,owner,input,origin){
    const mode=modeFor(input.mode);
    if(action==='state')return state(owner,mode);
    let row;
    if(action==='create'){
      if(!guid.test(input.requestKey)||!Object.hasOwn(prices,input.cadence))invalid();
      row=records.reserve(owner,mode,input.cadence,input.requestKey,Date.now());
      if(row.status==='new'){
        if(mode==='simulation')records.attach(row.id,null,null);
        else {
          const returnUrl=new URL('/checkout-test.html',origin);
          returnUrl.searchParams.set('mode','sandbox');
          returnUrl.searchParams.set('lang',input.language==='en-US'?'en-US':'zh-CN');
          returnUrl.searchParams.set('order',row.id);
          const cancelUrl=new URL(returnUrl);cancelUrl.searchParams.set('step','cancel');returnUrl.searchParams.set('step','return');
          const order=await sandbox('/v2/checkout/orders',{method:'POST',requestId:row.id,body:{intent:'CAPTURE',purchase_units:[{
            reference_id:row.id,custom_id:row.id,description:'Fund Edition test access',amount:{currency_code:'USD',value:prices[row.cadence]}}],
            payment_source:{paypal:{experience_context:{return_url:returnUrl.href,cancel_url:cancelUrl.href,user_action:'PAY_NOW',shipping_preference:'NO_SHIPPING'}}}}});
          if(!providerId.test(order.id)||!['PAYER_ACTION_REQUIRED','CREATED','APPROVED'].includes(order.status))unclear();
          records.attach(row.id,order.id,approvedUrl(order));
        }
      }
      return state(owner,mode,records.get(row.id));
    }
    if(!guid.test(input.id))invalid();
    row=records.get(input.id);
    if(!row||row.owner!==owner||row.mode!==mode)fail(404,'test-order-missing','This test order is unavailable.');
    if(action==='cancel'){
      if(['captured','capturing'].includes(row.status))conflict();
      if(row.status!=='cancelled')records.step(row.id,'cancelled',row.status);
    }else if(action==='approve'){
      if(mode!=='simulation')fail(403,'test-external-approval','Only the sandbox buyer can approve at PayPal.');
      if(row.status!=='approved'&&!records.step(row.id,'approved','created'))conflict();
    }else if(action==='capture'&&row.status!=='captured'){
      if(['new','cancelled'].includes(row.status))notApproved();
      if(mode==='simulation'){
        if(row.status!=='approved'||!records.step(row.id,'capturing','approved'))notApproved();
        records.finish(row,'SIM-'+row.id,Date.now());
      }else{
        const path='/v2/checkout/orders/'+row.provider_id;
        let order=await sandbox(path);
        verifyUnit(order,row);
        if(!['APPROVED','COMPLETED'].includes(order.status))notApproved();
        if(row.status!=='capturing'&&!records.step(row.id,'capturing','created')){
          if(records.get(row.id).status==='captured')return state(owner,mode,records.get(row.id));
          conflict();
        }
        if(order.status!=='COMPLETED')order=await sandbox(path+'/capture',{method:'POST',requestId:'c-'+row.id,body:{}});
        // Some capture responses contain only an order ID and status; fetch the authoritative representation.
        if(!order.purchase_units?.[0]?.amount||!order.purchase_units[0].custom_id)order=await sandbox(path);
        const unit=verifyUnit(order,row),captures=unit.payments?.captures,receipt=captures?.[0];
        if(order.status!=='COMPLETED'||captures?.length!==1||!providerId.test(receipt.id)||receipt.status!=='COMPLETED'||
          receipt.amount?.currency_code!=='USD'||receipt.amount.value!==prices[row.cadence]||receipt.final_capture!==true)unclear();
        records.finish(row,receipt.id,Date.now());
      }
    }
    return state(owner,mode,records.get(row.id));
  }
  return {run};
}
