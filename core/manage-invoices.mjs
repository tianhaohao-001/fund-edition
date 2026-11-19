// Operator-only console. This file is outside the public web root. It never contacts PayPal.
import {DatabaseSync} from 'node:sqlite';
import {createInterface} from 'node:readline/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {invoiceRecords} from './invoice-membership.mjs';

export async function runInvoiceConsole(args,env=process.env){
  const [action,id]=args;
  if(!['list','show','claim','attach','paid','void','refund'].includes(action)||action!=='list'&&!/^FE-[0-9A-F]{18}$/.test(id??'')){
    throw Error('Usage: node core/manage-invoices.mjs list | show|claim|attach|paid|void|refund FE-ORDER');
  }
  const file=env.FUNDROOM_DB_PATH??'/data/fund-edition.sqlite';
  if(!existsSync(file))throw Error('The configured membership database does not exist.');
  const readOnly=['list','show'].includes(action);
  const db=new DatabaseSync(file,{readOnly});db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
  const terminal=createInterface({input:process.stdin,output:process.stdout});
  const ask=async prompt=>(await terminal.question(prompt+' ')).trim();
  try{
    const ops=invoiceRecords(db,{readOnly});
    if(action==='list'){console.table(ops.list());return;}
    if(action==='show'){
      const order=ops.inspect(id);
      // Only this explicitly private command reveals the buyer address. Links and bank IDs are intentionally omitted.
      console.log({order:order.id,recipient:order.buyerEmail,status:order.status,amountUsd:order.amountUsd,term:order.cadence,method:order.method,reportedTransactionId:order.reportedTransactionId});return;
    }
    if(action==='claim'){console.log(ops.claim(id).status);return;}
    if(!process.stdin.isTTY)throw Error('Run the operator command in a private interactive terminal.');
    if(action==='attach'){
      const method=await ask('What did you send to this buyer in PayPal? invoice / request');
      const providerRef=(await ask('PayPal invoice or request reference:')).toUpperCase();
      const url=method==='invoice'?await ask('Individual buyer invoice share URL (www.paypal.com):'):null;
      if(await ask('Confirm that the buyer, order reference, Goods & Services, USD and one-time amount match. Type ISSUED:')!=='ISSUED')throw Error('No change.');
      console.log(ops.attach(id,{method,providerRef,url}).status);return;
    }
    const order=ops.inspect(id);
    if(action==='paid'){
      console.log('Verify COMPLETED in your own PayPal Activity and reconcile it to the private order. A buyer screenshot or notification cannot establish receipt.');
      const direct=order.method==='goods-link';
      const orderReference=(await ask(direct?'FE order number in the official payment note (leave blank if missing):':'Order reference shown in the official invoice/request or its payment details:')).toUpperCase();
      const buyerTransactionId=direct&&!orderReference?(await ask('Search the submitted BUYER transaction ID in your merchant PayPal Activity. Enter the buyer ID used to find this exact payment:')).toUpperCase():null;
      const verifiedPayerConfirmation=Boolean(buyerTransactionId)&&order.reportedTransactionId===buyerTransactionId&&
        await ask('Confirm the buyer ID resolves to this seller receipt and the payer verified this FE order through the contact on that payment. Type PAYER-CONFIRMED:')==='PAYER-CONFIRMED';
      const input={orderReference,buyerTransactionId,verifiedPayerConfirmation,providerRef:direct?id:(await ask('PayPal invoice/request reference:')).toUpperCase(),transactionId:(await ask('SELLER transaction ID from your own PayPal Activity (used for deduplication):')).toUpperCase(),
        payerEmail:await ask('Payer email from your PayPal transaction details:'),
        currency:await ask('Currency of gross receipt:'),amount:await ask('Gross receipt amount with two decimals:'),
        status:await ask('Merchant transaction status (COMPLETED):'),category:await ask('Payment category (goods-services):'),
        confirm:await ask('Confirm recipient is this merchant and payer corresponds to this order. Type VERIFIED:')==='VERIFIED'};
      const receipt=ops.settle(id,input);console.log({id,status:receipt.status,startsAt:receipt.startsAt,endsAt:receipt.endsAt});return;
    }
    const providerRef=order.method==='goods-link'?id:order.providerRef?(await ask('Original PayPal invoice/request reference:')).toUpperCase():null;
    const input={action,providerRef};
    if(action==='refund'){
      input.transactionId=(await ask('Original completed transaction ID:')).toUpperCase();input.reversalRef=(await ask('Completed refund or reversal ID in PayPal:')).toUpperCase();
    }
    input.confirm=await ask(action==='refund'?'Confirm full refund/reversal is already completed in PayPal. Type REVERSED:':'Confirm you checked merchant Activity for this order and it is unpaid. For an individual invoice, also void it in PayPal. Type VOID:')===(action==='refund'?'REVERSED':'VOID');
    console.log(ops.closeOrder(id,input).status);
  }finally{terminal.close();db.close();}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)runInvoiceConsole(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
