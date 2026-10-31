import {createHash,createHmac,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';
import type {Database,Sql,Row} from './ports.ts';
import {ensure,DomainError} from './errors.ts';
import type {AiAccounts} from './ai-accounts.ts';
type Env=Record<string,string|undefined>;
type Product={id:string;label:string;amount_fen:number;credit_micros:number};
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
export const paymentHmac=(key:string,message:string)=>createHmac('sha256',key).update(message).digest('hex');
const equals=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

// WeChat Virtual Payment / cash goods purchase. This is not the merchant API v3.
export class AiPayments{
 private db:Database;private accounts:AiAccounts;private env:Env;private fetcher:typeof fetch;private token?:{value:string;expires:number};
 readonly enabled:boolean;readonly products:Product[];
 constructor(db:Database,accounts:AiAccounts,env:Env,fetcher:typeof fetch=fetch){
  this.db=db;this.accounts=accounts;this.env=env;this.fetcher=fetcher;this.enabled=env.AI_RECHARGE_ENABLED==='true';
  try{this.products=JSON.parse(env.WECHAT_VIRTUAL_PRODUCTS||'[]');}catch{throw new DomainError(500,'PAYMENT_CONFIGURATION_INVALID');}
  ensure(Array.isArray(this.products)&&this.products.length<=20&&this.products.every(p=>p&&/^[a-zA-Z0-9_-]{1,64}$/.test(p.id)&&typeof p.label==='string'&&Number.isSafeInteger(p.amount_fen)&&p.amount_fen>=100&&p.amount_fen<=100000&&Number.isSafeInteger(p.credit_micros)&&p.credit_micros>0&&p.credit_micros<=10000000000)&&new Set(this.products.map(p=>p.id)).size===this.products.length,500,'PAYMENT_CONFIGURATION_INVALID');
  if(this.enabled)ensure(env.AUTH_MODE==='wechat'&&env.WECHAT_APP_ID&&env.WECHAT_APP_SECRET&&env.WECHAT_VIRTUAL_OFFER_ID&&env.WECHAT_VIRTUAL_APP_KEY&&env.WECHAT_VIRTUAL_NOTIFY_TOKEN&&env.WECHAT_VIRTUAL_AES_KEY&&/^[A-Za-z0-9+/]{43}$/.test(env.WECHAT_VIRTUAL_AES_KEY)&&this.products.length>0&&accounts.systemReady()&&accounts.canStoreCredentials(),500,'PAYMENT_CONFIGURATION_INVALID');
 }
 private tx<T>(fn:(q:Sql)=>Promise<T>){return this.db.transaction(async q=>{await q.query('SET LOCAL search_path TO wordmate,public');return fn(q);});}
 private async json(url:string,init?:RequestInit){try{const r=await this.fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(8000)});ensure(r.ok,502,'PAYMENT_UNAVAILABLE');const b:any=await r.json();ensure(!b.errcode,502,'PAYMENT_UNAVAILABLE');return b;}catch{throw new DomainError(502,'PAYMENT_UNAVAILABLE');}}
 async catalog(actor:string,familyId?:string){return this.tx(async q=>{const f=await this.accounts.family(q,actor,familyId);const orders=(await q.query('SELECT id,user_id,family_id,product_id,amount_fen,credit_micros,state,refunded_fen,created_at FROM ai_recharge_orders WHERE family_id=$2 OR (user_id=$1 AND family_id IS NULL) ORDER BY created_at DESC LIMIT 30',[actor,f?.id??null])).rows;return {family_id:f?.id??null,enabled:this.enabled,ios_enabled:this.env.WECHAT_VIRTUAL_IOS_ENABLED==='true',products:this.enabled?this.products:[],orders:orders.map(o=>({...o,credit_micros:Number(o.credit_micros)})),notice:this.enabled?'充值进入当前家庭的共享余额；每个家庭一次性赠送 20 元，赠送额度不能退款。自带 Key 的费用由供应商收取。':'充值暂未开放；每个家庭已一次性获赠 20 元系统 AI 额度，所有有效成员共享。'};});}
 async create(actor:string,clientKey:string,b:{family_id:string;product_id:string;code:string;platform:'ios'|'android'|'other'}){
  ensure(this.enabled,503,'PAYMENT_NOT_ENABLED');ensure(b.platform!=='ios'||this.env.WECHAT_VIRTUAL_IOS_ENABLED==='true',422,'PAYMENT_IOS_UNAVAILABLE');
  ensure(/^[a-zA-Z0-9_-]{8,128}$/.test(clientKey),422,'INVALID_REQUEST_BODY');const product=this.products.find(p=>p.id===b.product_id);ensure(product,422,'PAYMENT_PRODUCT_UNAVAILABLE');
  const family=await this.tx(q=>this.accounts.family(q,actor,b.family_id,true));
  const u=await one(this.db,"SELECT wx_open_id,wx_app_id FROM wordmate.users WHERE id=$1 AND status='active'",[actor]);ensure(u&&u.wx_app_id===this.env.WECHAT_APP_ID,401,'ACCOUNT_UNAVAILABLE');
  const session=await this.json(`https://api.weixin.qq.com/sns/jscode2session?${new URLSearchParams({appid:this.env.WECHAT_APP_ID!,secret:this.env.WECHAT_APP_SECRET!,js_code:b.code,grant_type:'authorization_code'})}`);
  ensure(session.openid===u.wx_open_id&&typeof session.session_key==='string',401,'PAYMENT_IDENTITY_MISMATCH');
  const order=await this.tx(async q=>{
   await this.accounts.family(q,actor,family!.id,true);ensure(await one(q,"SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",[actor]),401,'ACCOUNT_UNAVAILABLE');const old=await one(q,'SELECT * FROM ai_recharge_orders WHERE user_id=$1 AND client_key=$2',[actor,clientKey]);if(old){ensure(old.product_id===product!.id&&old.family_id===family!.id,409,'IDEMPOTENCY_CONFLICT');return old;}
   const count=await one(q,"SELECT count(*)::int n FROM ai_recharge_orders WHERE user_id=$1 AND created_at>now()-interval '24 hours'",[actor]);ensure(count.n<20,429,'PAYMENT_ORDER_LIMIT');
   return one(q,'INSERT INTO ai_recharge_orders(id,user_id,client_key,payer_identity,product_id,amount_fen,credit_micros,family_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[randomBytes(16).toString('hex'),actor,clientKey,this.accounts.sealPaymentIdentity(actor,u.wx_open_id),product!.id,product!.amount_fen,product!.credit_micros,family!.id]);
  });
  if(order.state!=='pending')return {id:order.id,state:order.state};
  const signData=JSON.stringify({offerId:this.env.WECHAT_VIRTUAL_OFFER_ID,buyQuantity:1,env:0,currencyType:'CNY',productId:order.product_id,goodsPrice:order.amount_fen,outTradeNo:order.id,attach:order.id});
  return {id:order.id,state:order.state,pay_data:{mode:'short_series_goods',signData,paySig:paymentHmac(this.env.WECHAT_VIRTUAL_APP_KEY!,`requestVirtualPayment&${signData}`),signature:paymentHmac(session.session_key,signData)}};
 }
 private async accessToken(){
  if(this.token&&this.token.expires>Date.now())return this.token.value;
  const b=await this.json('https://api.weixin.qq.com/cgi-bin/stable_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credential',appid:this.env.WECHAT_APP_ID,secret:this.env.WECHAT_APP_SECRET,force_refresh:false})});ensure(typeof b.access_token==='string'&&Number.isFinite(b.expires_in),502,'PAYMENT_UNAVAILABLE');this.token={value:b.access_token,expires:Date.now()+(b.expires_in-120)*1000};return this.token.value;
 }
 private async api(path:string,payload:unknown){const body=JSON.stringify(payload),token=await this.accessToken();try{return await this.json(`https://api.weixin.qq.com${path}?${new URLSearchParams({access_token:token,pay_sig:paymentHmac(this.env.WECHAT_VIRTUAL_APP_KEY!,`${path}&${body}`)})}`,{method:'POST',headers:{'Content-Type':'application/json'},body});}catch(e){this.token=undefined;throw e;}}
 async check(actor:string,id:string,force=false,trusted=false):Promise<Row>{
  ensure(this.enabled,503,'PAYMENT_NOT_ENABLED');ensure(/^[a-f0-9]{32}$/.test(id),404,'PAYMENT_ORDER_NOT_FOUND');
  const claim=await this.tx(async q=>{
   const initial=await one(q,'SELECT family_id,user_id FROM ai_recharge_orders WHERE id=$1',[id]);ensure(initial,404,'PAYMENT_ORDER_NOT_FOUND');if(!trusted){if(initial.family_id)await this.accounts.family(q,actor,initial.family_id,true);else ensure(initial.user_id===actor,404,'PAYMENT_ORDER_NOT_FOUND');}
   const row=await one(q,'SELECT * FROM ai_recharge_orders WHERE id=$1 FOR UPDATE',[id]);
   const recent=row.last_checked_at&&new Date(row.last_checked_at).getTime()>Date.now()-(force?2000:10000);if(recent)return {row,query:false};
   await q.query('UPDATE ai_recharge_orders SET last_checked_at=now() WHERE id=$1',[id]);return {row,query:true};
  });
  if(claim.query){
   const result=await this.api('/xpay/query_order',{openid:this.accounts.openPaymentIdentity(claim.row.user_id,claim.row.payer_identity),env:0,order_id:id});const o=result.order;
   if(o){
    ensure(o.order_id===id&&o.env_type===1&&[0,7].includes(o.order_type)&&o.order_fee===claim.row.amount_fen,502,'PAYMENT_VERIFICATION_FAILED');
    if([2,3,4,5,7,8].includes(o.status)){
     ensure(typeof o.wx_order_id==='string'&&o.wx_order_id.length>0&&o.paid_fee===claim.row.amount_fen&&Number.isSafeInteger(o.left_fee)&&o.left_fee>=0&&o.left_fee<=o.paid_fee,502,'PAYMENT_VERIFICATION_FAILED');
     const refunded=o.paid_fee-o.left_fee;
     await this.tx(async q=>{
      if(claim.row.family_id)await q.query('SELECT id FROM families WHERE id=$1 FOR UPDATE',[claim.row.family_id]);await q.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[claim.row.user_id]);const order=await one(q,'SELECT * FROM ai_recharge_orders WHERE id=$1 FOR UPDATE',[id]);ensure(!order.platform_order_id||order.platform_order_id===o.wx_order_id,502,'PAYMENT_VERIFICATION_FAILED');
      const legacy=await one(q,"SELECT user_id,amount_micros FROM ai_wallet_entries WHERE kind='credit' AND reference=$1",[`recharge:${id}`]);
      if(order.family_id){if(!legacy)await this.accounts.credit(q,order.user_id,`recharge:${id}`,Number(order.credit_micros),order.family_id);else ensure(legacy.user_id===order.user_id&&Number(legacy.amount_micros)===Number(order.credit_micros),502,'PAYMENT_VERIFICATION_FAILED');}else await this.accounts.creditLegacy(q,order.user_id,`recharge:${id}`,Number(order.credit_micros));
      if(refunded>order.refunded_fen){
       const before=Number(BigInt(order.credit_micros)*BigInt(order.refunded_fen)/BigInt(order.amount_fen)),after=Number(BigInt(order.credit_micros)*BigInt(refunded)/BigInt(order.amount_fen)),delta=after-before;
       if(order.family_id)await q.query("INSERT INTO ai_family_wallet_entries(family_id,user_id,kind,reference,amount_micros) VALUES($1,$2,'refund',$3,$4)",[order.family_id,order.user_id,`${id}:${refunded}`,-delta]);else await q.query("INSERT INTO ai_wallet_entries(user_id,kind,reference,amount_micros) VALUES($1,'refund',$2,$3)",[order.user_id,`${id}:${refunded}`,-delta]);
       // Refunds may create debt when credit has been spent. Future calls then stop.
       if(order.family_id)await q.query('UPDATE ai_family_wallets SET balance_micros=balance_micros-$2 WHERE family_id=$1',[order.family_id,delta]);else await q.query('UPDATE ai_wallets SET balance_micros=balance_micros-$2 WHERE user_id=$1',[order.user_id,delta]);
      }
      await q.query('UPDATE ai_recharge_orders SET state=$2,platform_order_id=$3,refunded_fen=greatest(refunded_fen,$4),updated_at=now() WHERE id=$1',[id,Math.max(refunded,order.refunded_fen)===o.paid_fee?'refunded':'paid',o.wx_order_id,refunded]);
     });
     if([2,3].includes(o.status))await this.api('/xpay/notify_provide_goods',{order_id:id,env:0});
    }else if(o.status===6||[0,1].includes(o.status)&&new Date(claim.row.created_at).getTime()<Date.now()-86400000)await this.db.query("UPDATE wordmate.ai_recharge_orders SET state='closed',updated_at=now() WHERE id=$1 AND state='pending'",[id]);
   }else if(new Date(claim.row.created_at).getTime()<Date.now()-86400000)await this.db.query("UPDATE wordmate.ai_recharge_orders SET state='closed',updated_at=now() WHERE id=$1 AND state='pending'",[id]);
  }
  const row=await one(this.db,'SELECT id,user_id,family_id,product_id,amount_fen,credit_micros,state,refunded_fen,created_at FROM wordmate.ai_recharge_orders WHERE id=$1',[id]);return {...row,credit_micros:Number(row.credit_micros)};
 }
 verify(query:Record<string,unknown>,encrypted?:string){
  ensure(this.enabled,503,'PAYMENT_NOT_ENABLED');const timestamp=String(query.timestamp??''),nonce=String(query.nonce??''),signature=String((encrypted?query.msg_signature:query.signature)??'');
  ensure(/^\d{10}$/.test(timestamp)&&Math.abs(Date.now()/1000-Number(timestamp))<300&&nonce.length>0&&nonce.length<=128&&/^[a-f0-9]{40}$/.test(signature),401,'PAYMENT_NOTIFY_INVALID');
  const expected=createHash('sha1').update([this.env.WECHAT_VIRTUAL_NOTIFY_TOKEN!,timestamp,nonce,...(encrypted?[encrypted]:[])].sort().join('')).digest('hex');ensure(equals(expected,signature),401,'PAYMENT_NOTIFY_INVALID');
 }
 private decrypt(encrypted:string){
  try{const key=Buffer.from(this.env.WECHAT_VIRTUAL_AES_KEY!+'=','base64'),decipher=createDecipheriv('aes-256-cbc',key,key.subarray(0,16));decipher.setAutoPadding(false);const padded=Buffer.concat([decipher.update(Buffer.from(encrypted,'base64')),decipher.final()]),pad=padded[padded.length-1];ensure(pad>=1&&pad<=32&&padded.subarray(-pad).every(b=>b===pad),401,'PAYMENT_NOTIFY_INVALID');const raw=padded.subarray(0,-pad),length=raw.readUInt32BE(16);ensure(length>0&&length<=raw.length-20&&raw.subarray(20+length).toString()===this.env.WECHAT_APP_ID,401,'PAYMENT_NOTIFY_INVALID');return JSON.parse(raw.subarray(20,20+length).toString());}catch{throw new DomainError(401,'PAYMENT_NOTIFY_INVALID');}
 }
 async notify(query:Record<string,unknown>,body:any){
  ensure(typeof body?.Encrypt==='string',401,'PAYMENT_NOTIFY_INVALID');this.verify(query,body.Encrypt);const event=this.decrypt(body.Encrypt);
  const id=event.Event==='xpay_goods_deliver_notify'?event.OutTradeNo:event.Event==='xpay_refund_notify'?event.MchOrderId:undefined;
  ensure(event.Env===0&&typeof id==='string'&&/^[a-f0-9]{32}$/.test(id),422,'PAYMENT_NOTIFY_UNSUPPORTED');
  const order=await one(this.db,'SELECT user_id,payer_identity FROM wordmate.ai_recharge_orders WHERE id=$1',[id]);ensure(order&&this.accounts.openPaymentIdentity(order.user_id,order.payer_identity)===event.OpenId,404,'PAYMENT_ORDER_NOT_FOUND');
  // Even an authenticated notification is only a wakeup; always verify money with WeChat.
  const confirmed=await this.check(order.user_id,id,true,true);ensure(confirmed&&['paid','refunded'].includes(confirmed.state)&&(event.Event!=='xpay_refund_notify'||confirmed.refunded_fen>0),503,'PAYMENT_VERIFICATION_PENDING');return {ErrCode:0,ErrMsg:'success'};
 }
 async reconcile(){
  if(!this.enabled)return;const rows=(await this.db.query("SELECT id,user_id FROM wordmate.ai_recharge_orders WHERE ((state IN ('pending','paid') AND (last_checked_at IS NULL OR last_checked_at<now()-interval '5 minutes')) OR (state='closed' AND last_checked_at<now()-interval '1 day')) AND created_at>now()-interval '180 days' ORDER BY CASE state WHEN 'pending' THEN 0 WHEN 'paid' THEN 1 ELSE 2 END,last_checked_at ASC NULLS FIRST LIMIT 10")).rows;
  for(const r of rows){try{await this.check(r.user_id,r.id,false,true);}catch{/* Retried on the next cycle. No upstream details in logs. */}}
 }
}
