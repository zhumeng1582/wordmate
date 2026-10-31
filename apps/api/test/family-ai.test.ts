import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fixture,aiEnv,model,response,vocabItem} from './ai-fixture.ts';
const require=createRequire(import.meta.url),{AiAccounts}=require('../dist/ai-accounts.js'),{AiPayments}=require('../dist/ai-payments.js');
const migration=()=>readFileSync('apps/api/migrations/018_family_ai.sql','utf8');
async function join(f:any){const invite=await f.core.createInvite(f.dad,'invite',f.family.id);await f.core.claimInvite(f.mom,'claim',{invite_token:invite.invite_token});await f.core.approveInvite(f.dad,'approve',invite.id);}
const png=()=>{const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(1,16);bytes.writeUInt32BE(1,20);return {name:'test.png',base64:bytes.toString('base64')};};

test('families get one shared 20-CNY gift; members share charges and isolated families cannot access it',async()=>{
 const f=await fixture();try{
  assert.equal((await f.accounts.overview(f.dad)).mode,'system');assert.equal((await f.accounts.overview(f.dad,undefined,'vision')).mode,'system');assert.equal((await f.accounts.overview(f.dad)).balance_micros,20000000);
  await join(f);assert.equal((await f.accounts.overview(f.mom)).balance_micros,20000000);
  const job=await f.core.vocabulary.create(f.mom,'shared-spend',f.child.id,{wordbook_id:f.book.id,words:['cat']});await f.core.vocabulary.processOne();assert.equal((await f.core.vocabulary.get(f.dad,job.id)).status,'succeeded');
  for(const user of [f.dad,f.mom]){const o=await f.accounts.overview(user);assert.equal(o.balance_micros,19999890);assert.equal(o.gift_remaining_micros,19999890);assert.equal((await f.accounts.history(user)).items[0].user_id,f.mom);}
  await f.pg.exec(migration());await f.pg.exec(migration());assert.equal((await f.accounts.overview(f.dad)).balance_micros,19999890);assert.equal((await f.pg.query("SELECT count(*)::int n FROM wordmate.ai_family_wallet_entries WHERE kind='gift'")).rows[0].n,1);
  const other=await f.core.createFamily(f.dad,'other-family',{name:'另一家庭'});assert.equal((await f.accounts.overview(f.dad,other.id)).balance_micros,20000000);assert.equal((await f.accounts.overview(f.dad,f.family.id)).balance_micros,19999890);
  await assert.rejects(f.accounts.overview(f.mom,other.id),{code:'FAMILY_NOT_FOUND'});assert.equal((await f.accounts.overview(f.dad)).family_id,null);
  // Task billing follows the child's family, even with multiple family memberships.
  const j2=await f.core.vocabulary.create(f.dad,'child-family',f.child.id,{wordbook_id:f.book.id,words:['cat'],theme:'different'});await f.core.vocabulary.processOne();assert.equal((await f.core.vocabulary.get(f.dad,j2.id)).status,'succeeded');assert.equal((await f.accounts.overview(f.dad,other.id)).balance_micros,20000000);
  await f.pg.query("UPDATE wordmate.family_members SET status='removed' WHERE family_id=$1 AND user_id=$2",[f.family.id,f.mom]);await assert.rejects(f.accounts.history(f.mom,f.family.id),{code:'FAMILY_NOT_FOUND'});
 }finally{await f.close();}
});

test('two parents cannot overspend their shared wallet with concurrent reservations',async()=>{
 let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);let calls=0;
 const f=await fixture(async()=>{calls++;enter();await gate;return response();});try{
  await join(f);await f.pg.query('UPDATE wordmate.ai_family_wallets SET balance_micros=100000,gift_remaining_micros=100000 WHERE family_id=$1',[f.family.id]);
  const dad=await f.tx((q:any)=>f.accounts.vocabulary(q,f.dad,undefined,'dad-call')),mom=await f.tx((q:any)=>f.accounts.vocabulary(q,f.mom,undefined,'mom-call'));
  const work=dad.generate(['cat'],'','小学英语');await entered;assert.equal((await f.accounts.overview(f.mom)).frozen_micros,81920);await assert.rejects(mom.generate(['cat'],'','小学英语'),{code:'AI_INSUFFICIENT_BALANCE'});assert.equal(calls,1);
  release();const result=await work;await f.tx((q:any)=>f.accounts.settle(q,result.billing_id));assert.equal((await f.accounts.overview(f.mom)).balance_micros,99890);
 }finally{release?.();await f.close();}
});

test('text and vision switch independently across models/providers, use separate keys, and save prepared results without text credentials',async()=>{
 const seen:any[]=[];const catalog=[{...model,id:'text',model:'text-qwen',vision:false},{...model,id:'vision-a',model:'vision-a'},{...model,id:'vision-b',model:'vision-b'},{...model,id:'vision-openai',provider:'openai',model:'vision-openai'}];
 const env={...aiEnv,AI_MODEL_CATALOG:JSON.stringify(catalog),AI_SYSTEM_MODEL_ID:'text',AI_SYSTEM_VISION_MODEL_ID:'vision-a',QWEN_API_KEY:'system-text-key',OCR_API_KEY:'system-vision-key'};
 const f=await fixture(async(url,init)=>{
  const b=JSON.parse(String(init?.body)),test=b.text?.format?.name==='connection_test'||b.response_format?.json_schema?.name==='connection_test',vision=String(url).includes('/responses')||b.messages?.[1]?.content?.some?.((x:any)=>x.type==='image_url');seen.push({url:String(url),body:b,key:(init?.headers as any).Authorization});
  const data=test?{ok:true}:vision?{text:'cat',error:null,items:[vocabItem('cat')]}:{items:[vocabItem('cat')]};
  return String(url).includes('/responses')?Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}],usage:{input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:40}}}):response(data);
 },env);try{
  await f.accounts.save(f.dad,{mode:'byok',model_id:'custom',custom_provider:'deepseek',custom_model:'my-text',api_key:'private-text-key',expected_version:0});
  const p=await f.tx((q:any)=>f.accounts.vocabulary(q,f.dad,undefined,'text-switch')),r=await p.generate(['cat'],'','小学英语');await f.tx((q:any)=>f.accounts.settle(q,r.billing_id));assert.equal(seen[0].body.model,'my-text');assert.equal(seen[0].key,'Bearer private-text-key');
  await f.core.imports.extract(f.dad,f.child.id,png());assert.equal(seen[1].body.model,'vision-a');assert.equal(seen[1].key,'Bearer system-vision-key');
  await f.accounts.save(f.dad,{capability:'vision',mode:'system',model_id:'vision-b',expected_version:0});await f.core.imports.extract(f.dad,f.child.id,png());assert.equal(seen[2].body.model,'vision-b');
  await f.accounts.save(f.dad,{capability:'vision',mode:'byok',model_id:'vision-openai',api_key:'private-vision-key',expected_version:1});const prepared=await f.core.imports.extract(f.dad,f.child.id,png());assert.match(seen[3].url,/api\.openai\.com\/v1\/responses$/);assert.equal(seen[3].key,'Bearer private-vision-key');assert.equal(seen[3].body.input[0].content[1].type,'input_image');assert.equal(seen[3].body.store,false);
  assert.equal((await f.accounts.overview(f.dad)).custom_model,'my-text');assert.equal((await f.accounts.overview(f.dad)).balance_micros,19999780);
  await f.accounts.test(f.dad,'vision',f.family.id);assert.equal(seen[4].body.input[0].content[1].type,'input_image');
  await f.accounts.deleteKey(f.dad,1,'text');const job=await f.core.vocabulary.create(f.dad,'save-prepared',f.child.id,{wordbook_id:f.book.id,source_type:'vision',raw_text:prepared.text,prepared_items:prepared.prepared_items});await f.core.vocabulary.processOne();assert.equal((await f.core.vocabulary.get(f.dad,job.id)).status,'succeeded');assert.equal(seen.length,5);
  await f.accounts.deleteKey(f.dad,2,'vision');await assert.rejects(f.core.imports.extract(f.dad,f.child.id,png()),{code:'AI_KEY_REQUIRED'});assert.equal(seen.length,5);
 }finally{await f.close();}
});

test('upgrade grants existing families once, preserves ambiguous balances, and does not double-credit historical paid orders',async()=>{
 const f=await fixture(undefined,aiEnv,true);try{
  await f.tx((q:any)=>f.accounts.creditLegacy(q,f.dad,'recharge:'+'a'.repeat(32),10000000));await f.tx((q:any)=>f.accounts.creditLegacy(q,f.mom,'legacy-mom',700000));await join(f);await f.core.createFamily(f.mom,'mom-family',{name:'妈妈另一个家庭'});
  await f.pg.query("INSERT INTO wordmate.ai_recharge_orders(id,user_id,client_key,payer_identity,product_id,amount_fen,credit_micros,state,platform_order_id) VALUES($1,$2,'legacy-order',$3,'old',1000,10000000,'paid','legacy-wx')",['a'.repeat(32),f.dad,f.accounts.sealPaymentIdentity(f.dad,'dev-dad')]);
  await f.pg.exec(migration());await f.pg.exec(migration());assert.equal((await f.accounts.overview(f.dad)).balance_micros,30000000);assert.equal((await f.accounts.overview(f.mom,f.family.id)).legacy_balance_micros,700000);
  const payments=new AiPayments(f.db,f.accounts,{...aiEnv,AUTH_MODE:'wechat',WECHAT_APP_ID:'ai-test',WECHAT_APP_SECRET:'test',AI_RECHARGE_ENABLED:'true',WECHAT_VIRTUAL_OFFER_ID:'offer',WECHAT_VIRTUAL_APP_KEY:'key',WECHAT_VIRTUAL_NOTIFY_TOKEN:'token',WECHAT_VIRTUAL_AES_KEY:Buffer.alloc(32,1).toString('base64').slice(0,43),WECHAT_VIRTUAL_PRODUCTS:JSON.stringify([{id:'old',label:'old',amount_fen:1000,credit_micros:10000000}])},async(url)=>String(url).includes('/stable_token')?Response.json({access_token:'token',expires_in:7200}):Response.json({errcode:0,order:{order_id:'a'.repeat(32),env_type:1,order_type:0,status:4,order_fee:1000,paid_fee:1000,left_fee:1000,wx_order_id:'legacy-wx'}}));
  await payments.check(f.dad,'a'.repeat(32));assert.equal((await f.accounts.overview(f.dad)).balance_micros,30000000);
 }finally{await f.close();}
});

test('the existing pinned Beijing Qwen model has usable text/vision defaults and tiered quotes',async()=>{
 const env={...aiEnv,AI_MODEL_CATALOG:'',QWEN_MODEL:'qwen3.7-flash-2026-07-15',OCR_MODEL:'qwen3.7-flash-2026-07-15',OCR_WORKSPACE_ID:'test-workspace',OCR_API_KEY:'system-vision-key'};
 const f=await fixture(undefined,env);try{
  const text=await f.accounts.overview(f.dad),vision=await f.accounts.overview(f.dad,undefined,'vision');assert.equal(text.mode,'system');assert.equal(vision.mode,'system');assert.equal(text.models.find((m:any)=>m.id===text.model_id).system_available,true);assert.equal(vision.models.find((m:any)=>m.id===vision.model_id).system_available,true);
  const configured=f.accounts.models.find((m:any)=>m.id===text.model_id),{usageCost}=require('../dist/ai-accounts.js');assert.equal(usageCost({input:32768,output:1,cached:0},configured),6555);assert.equal(usageCost({input:32769,output:1,cached:0},configured),19664);assert.equal(text.models.find((m:any)=>m.id===text.model_id).max_charge_micros,58983);
  const quote=await f.tx((q:any)=>f.accounts.select(q,f.dad));assert.equal(quote.selection.tariff.pricing_tiers.length,3);
 }finally{await f.close();}
});
