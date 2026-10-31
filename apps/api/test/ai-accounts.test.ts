import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture,aiEnv,model,response,vocabItem} from './ai-fixture.ts';
const require=createRequire(import.meta.url),{AiAccounts,usageCost,tokenUsage}=require('../dist/ai-accounts.js'),{validateBody}=require('../dist/validation.js');

test('token accounting separates cached input and rounds once in integer micro-CNY',()=>{
 assert.equal(usageCost(tokenUsage({input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:40}}),model),110);
 assert.equal(usageCost({input:1,output:0,cached:0},{...model,input_yuan_per_million:'0.000001'}),1);
 assert.throws(()=>tokenUsage({prompt_tokens:2,completion_tokens:1,prompt_tokens_details:{cached_tokens:3}}),{code:'AI_USAGE_MISSING'});
 assert.throws(()=>validateBody(['me','ai-settings'],'PUT',{mode:'byok',model_id:'qwen',expected_version:0,api_key:'some-key'}),{code:'INVALID_REQUEST_BODY'});
 assert.throws(()=>validateBody(['me','ai-settings'],'PUT',{mode:'byok',model_id:'qwen',expected_version:0,provider_consent:true,base_url:'https://attacker.test'}),{code:'INVALID_REQUEST_BODY'});
});
test('system generation atomically saves vocabulary and debits actual usage once',async()=>{
 let calls=0;const f=await fixture(async()=>{calls++;return response();});try{
  await f.tx((q:any)=>f.accounts.credit(q,f.dad,'grant',1000000));await f.tx((q:any)=>f.accounts.credit(q,f.dad,'grant',1000000));
  const j=await f.core.vocabulary.create(f.dad,'job',f.child.id,{wordbook_id:f.book.id,words:['cat']});await f.core.vocabulary.processOne();
  assert.equal((await f.core.vocabulary.get(f.dad,j.id)).status,'succeeded');let o=await f.accounts.overview(f.dad);assert.equal(o.balance_micros,20999890);assert.equal(o.frozen_micros,0);assert.equal(calls,1);
  const history=await f.accounts.history(f.dad);assert.equal(history.items[0].charge_micros,110);assert.equal(history.items[0].cached_tokens,40);
  await f.tx((q:any)=>f.accounts.settle(q,history.items[0].id));assert.equal((await f.accounts.overview(f.dad)).balance_micros,20999890);
  assert.equal((await f.accounts.history(f.mom)).items.length,0);assert.equal((await f.accounts.overview(f.mom)).balance_micros,0);
 }finally{await f.close();}
});
test('concurrent reservations cannot overspend; network calls do not hold a transaction',async()=>{
 let entered!:()=>void,finish!:()=>void;const started=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>finish=r);let calls=0;
 const f=await fixture(async()=>{calls++;entered();await gate;return response();});try{
  await f.pg.query('UPDATE wordmate.ai_family_wallets SET balance_micros=0,gift_remaining_micros=0 WHERE family_id=$1',[f.family.id]);await f.tx((q:any)=>f.accounts.credit(q,f.dad,'grant',100000));
  const p1=await f.tx((q:any)=>f.accounts.vocabulary(q,f.dad,undefined,'concurrent-1')),p2=await f.tx((q:any)=>f.accounts.vocabulary(q,f.dad,undefined,'concurrent-2'));
  const work=p1.generate(['cat'],'','小学英语');await started;const status=await f.accounts.overview(f.dad);assert.equal(status.frozen_micros,81920);
  await assert.rejects(p2.generate(['cat'],'','小学英语'),{code:'AI_INSUFFICIENT_BALANCE'});assert.equal(calls,1);finish();const result=await work;await f.tx((q:any)=>f.accounts.settle(q,result.billing_id));assert.equal((await f.accounts.overview(f.dad)).frozen_micros,0);
  await assert.rejects(p1.generate(['cat'],'','小学英语'),{code:'AI_CALL_ALREADY_STARTED'});
 }finally{finish?.();await f.close();}
});
test('BYOK credentials are encrypted, owner-scoped, support custom models and never fallback',async()=>{
 const auth:string[]=[];let fail=false;const f=await fixture(async(_u,init)=>{auth.push((init?.headers as any).Authorization);if(fail)return new Response('{}',{status:401});return response();});try{
  const saved=await f.accounts.save(f.dad,{mode:'byok',model_id:'custom',custom_provider:'deepseek',custom_model:'my-model',api_key:'private-owner-key',expected_version:0});assert.equal(saved.version,1);assert.equal(saved.custom_model,'my-model');assert(!JSON.stringify(saved).includes('private-owner-key'));
  const row=(await f.pg.query('SELECT credential FROM wordmate.ai_capability_settings')).rows[0];assert(!row.credential.includes('private-owner-key'));assert(!Buffer.from(row.credential,'base64').toString().includes('private-owner-key'));
  const p=await f.tx((q:any)=>f.accounts.vocabulary(q,f.dad,undefined,'byok-1')),r=await p.generate(['cat'],'','小学英语');await f.tx((q:any)=>f.accounts.settle(q,r.billing_id));assert.deepEqual(auth,['Bearer private-owner-key']);assert.equal((await f.accounts.overview(f.dad)).balance_micros,20000000);assert.equal((await f.accounts.history(f.dad)).items[0].charge_micros,0);
  await assert.rejects(f.accounts.save(f.dad,{mode:'byok',model_id:'qwen',expected_version:1}),{code:'AI_KEY_REQUIRED'});
  fail=true;const bad=await f.tx((q:any)=>f.accounts.vocabulary(q,f.dad,undefined,'byok-failed'));await assert.rejects(bad.generate(['cat'],'','小学英语'),{code:'UPSTREAM_HTTP_ERROR'});assert.equal(auth.length,2);assert(auth.every(x=>x==='Bearer private-owner-key'));
  await f.accounts.deleteKey(f.dad,1);assert.equal((await f.accounts.overview(f.dad)).mode,'byok');await assert.rejects(f.tx((q:any)=>f.accounts.vocabulary(q,f.dad)),{code:'AI_KEY_REQUIRED'});
 }finally{await f.close();}
});
test('invalid or missing usage and malformed generation release balance while retaining upstream costs',async()=>{
 let mode='invalid';const f=await fixture(async()=>mode==='missing'?response(undefined,null):response({items:[{...vocabItem('cat'),sentence_en:'No target here.'}]}));try{
  await f.tx((q:any)=>f.accounts.credit(q,f.dad,'grant',1000000));
  let p=await f.tx((q:any)=>f.accounts.vocabulary(q,f.dad,undefined,'invalid'));
  await assert.rejects(p.generate(['cat'],'','小学英语'),{code:'GENERATED_CONTENT_REJECTED'});let s=await f.accounts.overview(f.dad);assert.equal(s.balance_micros,21000000);assert.equal(s.frozen_micros,0);
  assert.equal((await f.pg.query("SELECT cost_micros FROM wordmate.ai_calls WHERE reference='invalid'")).rows[0].cost_micros,110);
  mode='missing';p=await f.tx((q:any)=>f.accounts.vocabulary(q,f.dad,undefined,'missing'));await assert.rejects(p.generate(['cat'],'','小学英语'),{code:'AI_USAGE_MISSING'});s=await f.accounts.overview(f.dad);assert.equal(s.frozen_micros,0);assert.equal(s.balance_micros,21000000);
 }finally{await f.close();}
});
test('expired reservations release once and cannot be settled later',async()=>{
 const f=await fixture();try{await f.tx((q:any)=>f.accounts.credit(q,f.dad,'grant',1000000));const p=await f.tx((q:any)=>f.accounts.vocabulary(q,f.dad,undefined,'expired')),r=await p.generate(['cat'],'','小学英语');assert.equal((await f.accounts.overview(f.dad)).frozen_micros,81920);
  await f.pg.query("UPDATE wordmate.ai_calls SET created_at=now()-interval '11 minutes'");await f.accounts.sweep();await f.accounts.sweep();assert.equal((await f.accounts.overview(f.dad)).frozen_micros,0);await assert.rejects(f.tx((q:any)=>f.accounts.settle(q,r.billing_id)),{code:'AI_CALL_EXPIRED'});
 }finally{await f.close();}
});
test('daily cost cap, configuration versions and encrypted ownership fail closed',async()=>{
 const f=await fixture();try{await f.tx((q:any)=>f.accounts.credit(q,f.dad,'grant',1000000));const limited=new AiAccounts(f.db,{...aiEnv,AI_SYSTEM_DAILY_LIMIT_MICROS:'1'},async()=>{throw Error('must not call');});const p=await f.tx((q:any)=>limited.vocabulary(q,f.dad,undefined,'limited'));await assert.rejects(p.generate(['cat'],'','小学英语'),{code:'AI_SYSTEM_BUDGET_EXHAUSTED'});
  const old=await f.tx((q:any)=>f.accounts.select(q,f.dad));await f.accounts.save(f.dad,{mode:'byok',model_id:'qwen',api_key:'my-personal-key',expected_version:0});await assert.rejects(f.tx((q:any)=>f.accounts.select(q,f.dad,old.selection)),{code:'AI_CONFIGURATION_CHANGED'});
  const cipher=(await f.pg.query('SELECT credential FROM wordmate.ai_capability_settings WHERE user_id=$1',[f.dad])).rows[0].credential;
  await f.pg.query("INSERT INTO wordmate.ai_capability_settings(user_id,capability,mode,model_id,credential) VALUES($1,'text','byok','qwen',$2)",[f.mom,cipher]);await assert.rejects(f.tx((q:any)=>f.accounts.select(q,f.mom)),{code:'AI_KEY_STORAGE_UNAVAILABLE'});
 }finally{await f.close();}
});
test('a database save failure rolls back the debit; an explicit retry charges only the saved attempt',async()=>{
 const f=await fixture();try{
  await f.tx((q:any)=>f.accounts.credit(q,f.dad,'grant',1000000));
  await f.pg.exec("CREATE FUNCTION wordmate.reject_test_word() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test save failure'; END $$; CREATE TRIGGER reject_test_word BEFORE INSERT ON wordmate.child_words FOR EACH ROW EXECUTE FUNCTION wordmate.reject_test_word();");
  const j=await f.core.vocabulary.create(f.dad,'save-failure',f.child.id,{wordbook_id:f.book.id,words:['cat']});await f.core.vocabulary.processOne();assert.equal((await f.core.vocabulary.get(f.dad,j.id)).status,'failed');assert.equal((await f.accounts.overview(f.dad)).balance_micros,21000000);assert.equal((await f.accounts.overview(f.dad)).frozen_micros,0);assert.equal((await f.core.words(f.dad,f.child.id)).items.length,0);
  await f.pg.exec('DROP TRIGGER reject_test_word ON wordmate.child_words');await f.core.vocabulary.retry(f.dad,'retry-save',j.id);await f.core.vocabulary.processOne();assert.equal((await f.core.vocabulary.get(f.dad,j.id)).status,'succeeded');assert.equal((await f.accounts.overview(f.dad)).balance_micros,20999890);assert.equal((await f.accounts.history(f.dad)).items.length,2);
 }finally{await f.close();}
});
test('vision usage is billed once, cached imports do not call the provider, and unsupported BYOK vision is rejected',async()=>{
 let calls=0;const f=await fixture(async()=>{calls++;return response({text:'cat',error:null,items:[vocabItem('cat')]});});try{
  await f.tx((q:any)=>f.accounts.credit(q,f.dad,'grant',1000000));const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(1,16);bytes.writeUInt32BE(1,20);const file={name:'test.png',base64:bytes.toString('base64')};
  const first=await f.core.imports.extract(f.dad,f.child.id,file);assert.equal(first.prepared_items[0].input,'cat');await f.core.imports.extract(f.dad,f.child.id,file);assert.equal(calls,1);assert.equal((await f.accounts.overview(f.dad)).balance_micros,20999890);
  const j=await f.core.vocabulary.create(f.dad,'prepared',f.child.id,{wordbook_id:f.book.id,source_type:'vision',raw_text:first.text,prepared_items:first.prepared_items});await f.core.vocabulary.processOne();assert.equal((await f.core.vocabulary.get(f.dad,j.id)).status,'succeeded');assert.equal(calls,1);assert.equal((await f.accounts.overview(f.dad)).balance_micros,20999890);
  await f.accounts.save(f.dad,{mode:'byok',model_id:'custom',custom_provider:'deepseek',custom_model:'private-model',api_key:'private-test-key',expected_version:0});await f.core.imports.extract(f.dad,f.child.id,file);assert.equal(calls,1);await assert.rejects(f.accounts.save(f.dad,{capability:'vision',mode:'byok',model_id:'custom',custom_provider:'deepseek',custom_model:'private-model',api_key:'private-test-key',expected_version:0}),{code:'AI_VISION_UNAVAILABLE'});
 }finally{await f.close();}
});
test('queued tasks keep the quoted tariff when the configured retail prices change',async()=>{
 const f=await fixture();try{
  await f.tx((q:any)=>f.accounts.credit(q,f.dad,'grant',1000000));const quoted=await f.tx((q:any)=>f.accounts.select(q,f.dad));
  const changed=new AiAccounts(f.db,{...aiEnv,AI_MODEL_CATALOG:JSON.stringify([{...model,input_yuan_per_million:'100',output_yuan_per_million:'200',cached_yuan_per_million:'25'}])},async()=>response());
  const p=await f.tx((q:any)=>changed.vocabulary(q,f.dad,JSON.parse(JSON.stringify(quoted.selection)),'old-price')),r=await p.generate(['cat'],'','小学英语');await f.tx((q:any)=>changed.settle(q,r.billing_id));assert.equal((await f.accounts.overview(f.dad)).balance_micros,20999890);
 }finally{await f.close();}
});
