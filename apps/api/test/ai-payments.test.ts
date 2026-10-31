import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,createCipheriv} from 'node:crypto';
import {fixture,aiEnv} from './ai-fixture.ts';
const require=createRequire(import.meta.url),{AiPayments,paymentHmac}=require('../dist/ai-payments.js');
const env={...aiEnv,AUTH_MODE:'wechat',WECHAT_APP_ID:'ai-test',WECHAT_APP_SECRET:'test-app-secret',AI_RECHARGE_ENABLED:'true',WECHAT_VIRTUAL_OFFER_ID:'offer-test',WECHAT_VIRTUAL_APP_KEY:'payment-test-key',WECHAT_VIRTUAL_NOTIFY_TOKEN:'notify-test-token',WECHAT_VIRTUAL_AES_KEY:Buffer.alloc(32,3).toString('base64').slice(0,43),WECHAT_VIRTUAL_PRODUCTS:JSON.stringify([{id:'credit10',label:'Test credit',amount_fen:1000,credit_micros:10000000}])};
const encrypt=(event:any)=>{const message=Buffer.from(JSON.stringify(event)),size=Buffer.alloc(4);size.writeUInt32BE(message.length);const raw=Buffer.concat([Buffer.alloc(16,4),size,message,Buffer.from(env.WECHAT_APP_ID)]),pad=32-raw.length%32,key=Buffer.from(env.WECHAT_VIRTUAL_AES_KEY+'=','base64'),cipher=createCipheriv('aes-256-cbc',key,key.subarray(0,16));cipher.setAutoPadding(false);const encrypted=Buffer.concat([cipher.update(Buffer.concat([raw,Buffer.alloc(pad,pad)])),cipher.final()]).toString('base64');const timestamp=String(Math.floor(Date.now()/1000)),nonce='test-nonce',msg_signature=createHash('sha1').update([env.WECHAT_VIRTUAL_NOTIFY_TOKEN,timestamp,nonce,encrypted].sort().join('')).digest('hex');return {body:{Encrypt:encrypted},query:{timestamp,nonce,msg_signature}};};

test('recharge is disabled until configured; no fake production credit endpoint',async()=>{
 const f=await fixture();try{const payments=new AiPayments(f.db,f.accounts,aiEnv,async()=>{throw Error('must not call');});assert.equal((await payments.catalog(f.dad)).enabled,false);await assert.rejects(payments.create(f.dad,'request-0001',{family_id:f.family.id,product_id:'credit10',code:'test',platform:'android'}),{code:'PAYMENT_NOT_ENABLED'});assert.equal((await f.accounts.overview(f.dad)).balance_micros,20000000);}finally{await f.close();}
});
test('virtual purchase signs server prices, verifies owner and credits paid orders exactly once',async()=>{
 const f=await fixture();let status=1,left=1000,badAmount=false,openId='dev-dad',queryCalls=0,provided=0;try{
  const payments=new AiPayments(f.db,f.accounts,env,async(input,init)=>{
   const u=new URL(String(input));if(u.pathname==='/sns/jscode2session')return Response.json({openid:openId,session_key:'server-session-key'});
   if(u.pathname==='/cgi-bin/stable_token')return Response.json({access_token:'access-token-test',expires_in:7200});
   const body=String(init?.body);assert.equal(u.searchParams.get('pay_sig'),paymentHmac(env.WECHAT_VIRTUAL_APP_KEY,`${u.pathname}&${body}`));const p=JSON.parse(body);
   if(u.pathname==='/xpay/notify_provide_goods'){provided++;return Response.json({errcode:0});}
   assert.equal(u.pathname,'/xpay/query_order');assert.equal(p.openid,'dev-dad');assert.equal(p.env,0);assert.equal(p.out_trade_no,undefined);queryCalls++;
   return Response.json({errcode:0,order:{order_id:p.order_id,wx_order_id:'wx-order-test',env_type:1,order_type:0,status,order_fee:badAmount?999:1000,paid_fee:1000,left_fee:left}});
  });
  const body={family_id:f.family.id,product_id:'credit10',code:'fresh-code',platform:'android' as const};const order=await payments.create(f.dad,'request-0001',body),signed=JSON.parse(order.pay_data.signData);
  assert.equal(signed.goodsPrice,1000);assert.equal(signed.buyQuantity,1);assert.equal(signed.env,0);assert.equal(order.pay_data.signature,paymentHmac('server-session-key',order.pay_data.signData));assert(!JSON.stringify(order).includes('server-session-key'));
  assert.equal((await payments.create(f.dad,'request-0001',body)).id,order.id);
  await payments.check(f.dad,order.id);assert.equal((await f.accounts.overview(f.dad)).balance_micros,20000000);
  await f.pg.query("UPDATE wordmate.ai_recharge_orders SET created_at=now()-interval '25 hours',last_checked_at=NULL");await payments.check(f.dad,order.id);assert.equal((await payments.catalog(f.dad)).orders[0].state,'closed');
  await assert.rejects(payments.check(f.mom,order.id),{code:'FAMILY_NOT_FOUND'});
  openId='dev-mom';await assert.rejects(payments.create(f.dad,'request-0002',body),{code:'PAYMENT_IDENTITY_MISMATCH'});openId='dev-dad';
  await f.pg.query('UPDATE wordmate.ai_recharge_orders SET last_checked_at=NULL');status=2;badAmount=true;
  await assert.rejects(payments.check(f.dad,order.id),{code:'PAYMENT_VERIFICATION_FAILED'});assert.equal((await f.accounts.overview(f.dad)).balance_micros,20000000);
  await f.pg.query('UPDATE wordmate.ai_recharge_orders SET last_checked_at=NULL');badAmount=false;
  await payments.check(f.dad,order.id);await payments.check(f.dad,order.id);assert.equal((await f.accounts.overview(f.dad)).balance_micros,30000000);assert.equal(provided,1);
  assert.equal((await f.pg.query("SELECT count(*)::int n FROM wordmate.ai_family_wallet_entries WHERE kind='credit'")).rows[0].n,1);
  const invitation=await f.core.createInvite(f.dad,'payment-invite',f.family.id);await f.core.claimInvite(f.mom,'payment-claim',{invite_token:invitation.invite_token});await f.core.approveInvite(f.dad,'payment-approve',invitation.id);await f.pg.query('UPDATE wordmate.ai_recharge_orders SET last_checked_at=NULL');await payments.check(f.mom,order.id);assert.equal((await f.accounts.overview(f.mom)).balance_micros,30000000);assert.equal((await payments.catalog(f.mom)).orders[0].id,order.id);
  // A verified partial refund claws back proportional credit, once per cumulative amount.
  status=4;left=600;await f.pg.query('UPDATE wordmate.ai_recharge_orders SET last_checked_at=NULL');await payments.check(f.dad,order.id);await payments.check(f.dad,order.id);assert.equal((await f.accounts.overview(f.dad)).balance_micros,26000000);
  const secondFamily=await f.core.createFamily(f.dad,'payment-other-family',{name:'另一个家庭'});assert.equal((await f.accounts.overview(f.dad,secondFamily.id)).balance_micros,20000000);
  // Charge-back after spending may leave debt, which blocks further system AI calls.
  await f.pg.query('UPDATE wordmate.ai_family_wallets SET balance_micros=100,gift_remaining_micros=0 WHERE family_id=$1',[f.family.id]);status=5;left=0;await f.pg.query('UPDATE wordmate.ai_recharge_orders SET last_checked_at=NULL');await payments.check(f.dad,order.id);assert.equal((await f.accounts.overview(f.dad,f.family.id)).balance_micros,-5999900);assert.equal((await payments.catalog(f.dad,f.family.id)).orders[0].state,'refunded');assert(queryCalls>=4);assert.equal((await f.accounts.overview(f.dad,secondFamily.id)).balance_micros,20000000);
  // Late refund reconciliation must retain the original encrypted payer identity after erasure.
  await f.pg.query("UPDATE wordmate.users SET status='deleted',wx_open_id='deleted:random-test' WHERE id=$1",[f.dad]);await f.pg.query('UPDATE wordmate.ai_recharge_orders SET last_checked_at=NULL');await payments.check(f.dad,order.id,false,true);assert.equal(Number((await f.pg.query('SELECT balance_micros FROM wordmate.ai_family_wallets WHERE family_id=$1',[f.family.id])).rows[0].balance_micros),-5999900);
  // A stale pre-refund query must never restore refunded credit or regress order state.
  status=4;left=1000;await f.pg.query('UPDATE wordmate.ai_recharge_orders SET last_checked_at=NULL');await payments.check(f.dad,order.id);assert.equal((await payments.catalog(f.dad,f.family.id)).orders[0].state,'refunded');
 }finally{await f.close();}
});
test('AES callbacks reject tampering and query WeChat before changing a balance',async()=>{
 const f=await fixture();let status=1,queried=0;try{
  const payments=new AiPayments(f.db,f.accounts,env,async(input,init)=>{
   const path=new URL(String(input)).pathname;if(path==='/sns/jscode2session')return Response.json({openid:'dev-dad',session_key:'session'});if(path==='/cgi-bin/stable_token')return Response.json({access_token:'token',expires_in:7200});if(path==='/xpay/notify_provide_goods')return Response.json({errcode:0});
   queried++;const p=JSON.parse(String(init?.body));return Response.json({errcode:0,order:{order_id:p.order_id,wx_order_id:'wx-callback-order',env_type:1,order_type:0,status,order_fee:1000,paid_fee:1000,left_fee:1000}});
  });
  const order=await payments.create(f.dad,'callback-request',{family_id:f.family.id,product_id:'credit10',code:'code',platform:'android'}),event={Event:'xpay_goods_deliver_notify',Env:0,OpenId:'dev-dad',OutTradeNo:order.id},notification=encrypt(event);
  await assert.rejects(payments.notify({...notification.query,msg_signature:'0'.repeat(40)},notification.body),{code:'PAYMENT_NOTIFY_INVALID'});assert.equal(queried,0);
  await assert.rejects(payments.notify(notification.query,{Encrypt:notification.body.Encrypt.slice(0,-4)+'abcd'}),{code:'PAYMENT_NOTIFY_INVALID'});assert.equal((await f.accounts.overview(f.dad)).balance_micros,20000000);
  await assert.rejects(payments.notify(notification.query,notification.body),{code:'PAYMENT_VERIFICATION_PENDING'});assert.equal((await f.accounts.overview(f.dad)).balance_micros,20000000);
  status=2;await f.pg.query('UPDATE wordmate.ai_recharge_orders SET last_checked_at=NULL');assert.equal((await payments.notify(notification.query,notification.body)).ErrCode,0);assert.equal((await f.accounts.overview(f.dad)).balance_micros,30000000);
  await payments.notify(notification.query,notification.body);assert.equal((await f.accounts.overview(f.dad)).balance_micros,30000000);
  const other=encrypt({...event,OpenId:'dev-mom'});await assert.rejects(payments.notify(other.query,other.body),{code:'PAYMENT_ORDER_NOT_FOUND'});
 }finally{await f.close();}
});
