import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary} from '../src/providers.ts';
import {CheckinShareImageCache,shareImageGenerator} from '../src/checkin-share-images.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');

test('poster cache queues once per account, stores privately, and returns authorized bytes',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/006_checkin_shares.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/010_checkin_share_images.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/011_checkin_poster_pool.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/008_shared_wordbooks.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/014_release_fixes.sql','utf8'));
 const db={query:(s:string,p?:any[])=>pg.query(s,p),transaction:(fn:any)=>pg.transaction((q:any)=>fn({query:(s:string,p?:any[])=>q.query(s,p)}))};
 let generated=0,generatedCopy='';const objects=new Map<string,Uint8Array>();const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
 const cache=new CheckinShareImageCache(db,{async put(k,b){objects.set(k,b);},async get(k){const b=objects.get(k);if(!b)throw Error('missing');return b;},async delete(k){objects.delete(k);}},async(_theme,copy)=>{generated++;generatedCopy=copy??'';return {bytes,mime_type:'image/png'};});
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),{} as any,'test',()=>new Date(Date.now()+86400000),undefined,undefined,undefined,undefined,cache);
 try{
  const dad=(await core.login('dev-dad')).user.id,other=(await core.login('dev-outsider')).user.id;
  const family=await core.createFamily(dad,'f',{name:'private'}),child=await core.createChild(dad,'c',family.id,{nickname:'Learner'});
  const date=new Date(Date.now()+86400000).toISOString().slice(0,10);await pg.query("INSERT INTO wordmate.daily_activity(child_id,local_date,distinct_words,goal_snapshot,timezone_snapshot) VALUES($1,$2,1,10,'Asia/Shanghai')",[child.id,date]);
  const first=await core.checkinShare.create(dad,child.id,{date}),again=await core.checkinShare.create(dad,child.id,{date});
  assert.equal(first.image.status,'pending');assert.equal(again.image.id,first.image.id);assert.equal(generated,0);
  assert.equal(await cache.processOne(),true);assert.equal(generated,1);assert.match(generatedCopy,/Every small step helps you grow/);assert.equal(Number((await pg.query("SELECT count(*) n FROM wordmate.checkin_poster_background_pool WHERE generation_date=(now() AT TIME ZONE 'Asia/Shanghai')::date")).rows[0].n),10);assert.equal((await core.checkinShare.imageStatus(dad,first.image.id)).status,'pending');
  assert.equal(await cache.processOne(),true);assert.equal((await core.checkinShare.imageStatus(dad,first.image.id)).status,'succeeded');
  const image=await core.checkinShare.imageContent(dad,first.image.id);assert.equal(image.mime_type,'image/png');assert.deepEqual(image.bytes,bytes);
  await assert.rejects(core.checkinShare.imageStatus(other,first.image.id),{code:'SHARE_IMAGE_NOT_FOUND'});
  assert.equal(objects.size,1);
  const assignedKey=(await pg.query('SELECT storage_key FROM wordmate.checkin_share_images WHERE id=$1',[first.image.id])).rows[0].storage_key;
  await pg.query("UPDATE wordmate.checkin_share_images SET expires_at=now()-interval '1 second' WHERE id=$1",[first.image.id]);assert.equal(await cache.processOne(),true);assert(objects.has(assignedKey));
  await assert.rejects(core.checkinShare.imageStatus(dad,first.image.id),{code:'SHARE_IMAGE_NOT_FOUND'});
 }finally{await pg.close();}
});

test('poster provider reuses Qwen/OCR credentials, blends encouragement copy with the landscape prompt, and downloads the short-lived PNG URL',async()=>{
 const requests:any[]=[];const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
 const generate=await shareImageGenerator({OCR_API_KEY:'existing-qwen-key',OCR_WORKSPACE_ID:'workspace-123',POSTER_IMAGE_REGION:'cn-beijing'},async(input:any,init:any)=>{
  requests.push({url:String(input),init});
  if(requests.length===1)return new Response(JSON.stringify({output:{task_id:'task-12345678',task_status:'PENDING'}}),{status:200,headers:{'content-type':'application/json'}});
  if(requests.length===2)return new Response(JSON.stringify({output:{task_status:'SUCCEEDED',choices:[{message:{content:[{image:'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/poster.png?Expires=short'}]}}]}}),{status:200,headers:{'content-type':'application/json'}});
  return new Response(bytes,{status:200,headers:{'content-type':'image/png'}});
 },async()=>{});
 assert.ok(generate);const result=await generate('growth','Every word is a small step forward. 每个词都是向前的一小步。');assert.equal(result.mime_type,'image/png');assert.deepEqual(result.bytes,Buffer.from(bytes));
 assert.match(requests[0].url,/workspace-123\.cn-beijing\.maas\.aliyuncs\.com\/api\/v1\/services\/aigc\/image-generation\/generation/);
 assert.equal(requests[0].init.headers.Authorization,'Bearer existing-qwen-key');assert.equal(requests[0].init.headers['X-DashScope-Async'],'enable');
 const prompt=JSON.parse(requests[0].init.body).input.messages[0].content[0].text;assert.match(prompt,/成长主题/);assert.match(prompt,/Soft watercolor/);assert.match(prompt,/Every word is a small step forward/);assert.match(prompt,/mountains, a lake, ocean/);assert.match(prompt,/No text or lettering/);
 assert.equal(requests.length,3);assert.match(requests[1].url,/\/api\/v1\/tasks\/task-12345678$/);assert.equal(requests[1].init.headers.Authorization,'Bearer existing-qwen-key');assert.equal(requests[2].init.redirect,'error');
});

test('poster provider accepts DashScope OSS result hosts and rejects unrelated hosts',async()=>{
 for(const [host,allowed] of [['dashscope-a717.oss-accelerate.aliyuncs.com',true],['dashscope-result-bj.oss-cn-beijing.aliyuncs.com',true],['other.oss-accelerate.aliyuncs.com',false],['dashscope-a717.oss-accelerate.aliyuncs.com.attacker.test',false]]){
  let requests=0;const generate=await shareImageGenerator({OCR_API_KEY:'key',OCR_WORKSPACE_ID:'workspace-123'},async()=>{
   requests++;
   if(requests===1)return new Response(JSON.stringify({output:{task_id:'task-12345678'}}));
   if(requests===2)return new Response(JSON.stringify({output:{task_status:'SUCCEEDED',results:[{url:`https://${host}/poster.png`}]}}));
   return new Response(Uint8Array.from([137,80,78,71,13,10,26,10,0]),{headers:{'content-type':'image/png'}});
  },async()=>{});
  assert.ok(generate);
  if(allowed){await generate('growth');assert.equal(requests,3);}
  else{await assert.rejects(generate('growth'),(e:any)=>e.code==='POSTER_IMAGE_URL_HOST_REJECTED');assert.equal(requests,2);}
 }
});

function deferred<T>(){
 let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
for(const pool of [false,true])for(const lateFailure of [false,true]){
 test(`${pool?'pool':'account'} poster lease: old queued jobs are claimed once; late ${lateFailure?'failure':'success'} cannot change a replacement`,{timeout:10000},async()=>{
  const pg=new PGlite();
  const plans=[0,1].map(()=>({started:deferred<void>(),result:deferred<{bytes:Uint8Array;mime_type:'image/png'}>()}));
  const workers:Promise<boolean>[]=[];
  try{
   for(const file of ['deliverables/0.1/database/001_schema.sql','apps/api/migrations/008_shared_wordbooks.sql','apps/api/migrations/010_checkin_share_images.sql','apps/api/migrations/011_checkin_poster_pool.sql','apps/api/migrations/014_release_fixes.sql'])await pg.exec(readFileSync(file,'utf8'));
   const db={query:(s:string,p?:any[])=>pg.query(s,p),transaction:(fn:any)=>pg.transaction((q:any)=>fn({query:(s:string,p?:any[])=>q.query(s,p)}))};
   const objects=new Map<string,Uint8Array>();let calls=0;
   const cache=new CheckinShareImageCache(db,{async put(k,b){objects.set(k,b);},async get(k){return objects.get(k)!;},async delete(k){objects.delete(k);}},async()=>{
    const plan=plans[calls++];assert.ok(plan,'unexpected duplicate generation');plan.started.resolve();return plan.result.promise;
   },pool);
   const actor=(await pg.query("INSERT INTO wordmate.users(wx_app_id,wx_open_id,display_name) VALUES('lease','actor','test') RETURNING id")).rows[0].id;
   const table=pool?'checkin_poster_background_pool':'checkin_share_images';
   let id:string;
   if(pool){
    await pg.query("INSERT INTO wordmate.checkin_poster_background_pool(generation_date,slot,theme,prompt_copy,status,created_at) SELECT (now() AT TIME ZONE 'Asia/Shanghai')::date,slot,'growth','test',CASE WHEN slot=0 THEN 'pending' ELSE 'failed' END,now()-interval '10 minutes' FROM generate_series(0,9) slot");
    id=(await pg.query('SELECT id FROM wordmate.checkin_poster_background_pool WHERE slot=0')).rows[0].id;
   }else{
    id=(await cache.obtain(actor,'growth')).id;
    await pg.query("UPDATE wordmate.checkin_share_images SET created_at=now()-interval '10 minutes' WHERE id=$1",[id]);
   }
   workers.push(cache.processOne());await plans[0].started.promise;
   const original=(await pg.query(`SELECT lease_token,lease_until FROM wordmate.${table} WHERE id=$1`,[id])).rows[0];
   assert.ok(original.lease_token);assert.ok(new Date(original.lease_until)>new Date());
   assert.equal(await cache.processOne(),false,'a second worker must leave an unexpired claim alone even for an old job');
   assert.equal(calls,1);
   await pg.query(`UPDATE wordmate.${table} SET lease_until=now()-interval '1 second' WHERE id=$1`,[id]);
   workers.push(cache.processOne());await plans[1].started.promise;
   const replacement=(await pg.query(`SELECT lease_token FROM wordmate.${table} WHERE id=$1`,[id])).rows[0];
   assert.notEqual(replacement.lease_token,original.lease_token);
   if(lateFailure){
    plans[0].result.reject(Error('late worker failure'));await workers[0];
    const stillRunning=(await pg.query(`SELECT status,lease_token FROM wordmate.${table} WHERE id=$1`,[id])).rows[0];
    assert.equal(stillRunning.status,'processing');assert.equal(stillRunning.lease_token,replacement.lease_token);
   }
   const winningBytes=Uint8Array.from([137,80,78,71,13,10,26,10,2]);
   plans[1].result.resolve({bytes:winningBytes,mime_type:'image/png'});await workers[1];
   if(!lateFailure){plans[0].result.resolve({bytes:Uint8Array.from([137,80,78,71,13,10,26,10,1]),mime_type:'image/png'});await workers[0];}
   const saved=(await pg.query(`SELECT status,storage_key,lease_token,lease_until FROM wordmate.${table} WHERE id=$1`,[id])).rows[0];
   assert.equal(saved.status,'succeeded');assert.ok(saved.storage_key.includes(replacement.lease_token));
   assert.equal(saved.lease_token,null);assert.equal(saved.lease_until,null);
   assert.deepEqual(objects.get(saved.storage_key),winningBytes);assert.equal(objects.size,1,'a stale upload is removed without deleting the winner');
   assert.equal(calls,2);assert.equal(await cache.processOne(),false);
  }finally{
   for(const plan of plans)plan.result.resolve({bytes:Uint8Array.from([137,80,78,71,13,10,26,10,0]),mime_type:'image/png'});
   await Promise.allSettled(workers);await pg.close();
  }
 });
}

test('release migration preserves existing data, unpublishes archived sources and recovers legacy poster jobs',async()=>{
 const pg=new PGlite();
 try{
  for(const file of ['deliverables/0.1/database/001_schema.sql','apps/api/migrations/008_shared_wordbooks.sql','apps/api/migrations/010_checkin_share_images.sql','apps/api/migrations/011_checkin_poster_pool.sql'])await pg.exec(readFileSync(file,'utf8'));
  const actor=(await pg.query("INSERT INTO wordmate.users(wx_app_id,wx_open_id,display_name) VALUES('upgrade','actor','existing user') RETURNING id")).rows[0].id;
  const family=await pg.transaction(async tx=>{
   const id=(await tx.query("INSERT INTO wordmate.families(name,owner_user_id) VALUES('existing family',$1) RETURNING id",[actor])).rows[0].id;
   await tx.query("INSERT INTO wordmate.family_members(family_id,user_id,display_name) VALUES($1,$2,'existing member')",[id,actor]);return id;
  });
  const child=(await pg.query("INSERT INTO wordmate.children(family_id,nickname) VALUES($1,'existing child') RETURNING id",[family])).rows[0].id;
  const book=(await pg.query("INSERT INTO wordmate.wordbooks(child_id,name,created_by,archived_at) VALUES($1,'archived',$2,now()) RETURNING id",[child,actor])).rows[0].id;
  await pg.query("INSERT INTO wordmate.shared_wordbooks(source_wordbook_id,source_child_id,publisher_user_id,title,published) VALUES($1,$2,$3,'legacy public source',true)",[book,child,actor]);
  const accountJob=(await pg.query("INSERT INTO wordmate.checkin_share_images(requested_by,theme,status) VALUES($1,'growth','processing') RETURNING id",[actor])).rows[0].id;
  const poolJob=(await pg.query("INSERT INTO wordmate.checkin_poster_background_pool(generation_date,slot,theme,prompt_copy,status) VALUES((now() AT TIME ZONE 'Asia/Shanghai')::date,0,'growth','legacy pool','processing') RETURNING id")).rows[0].id;
  const migration=readFileSync('apps/api/migrations/014_release_fixes.sql','utf8');await pg.exec(migration);await pg.exec(migration);
  const shared=(await pg.query('SELECT published,version FROM wordmate.shared_wordbooks WHERE source_wordbook_id=$1',[book])).rows[0];
  assert.equal(shared.published,false);assert.equal(shared.version,2,'rerunning migration does not mutate repaired snapshots');
  assert.equal((await pg.query('SELECT nickname FROM wordmate.children WHERE id=$1',[child])).rows[0].nickname,'existing child');
  const db={query:(s:string,p?:any[])=>pg.query(s,p),transaction:(fn:any)=>pg.transaction((q:any)=>fn({query:(s:string,p?:any[])=>q.query(s,p)}))};
  const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
  const cache=new CheckinShareImageCache(db,{async put(){},async get(){return bytes;},async delete(){}},async()=>({bytes,mime_type:'image/png'}),false);
  assert.equal(await cache.processOne(),true);
  assert.equal((await pg.query('SELECT status FROM wordmate.checkin_share_images WHERE id=$1',[accountJob])).rows[0].status,'succeeded');
  await cache.prepareDailyPool(1);
  assert.equal((await pg.query('SELECT status FROM wordmate.checkin_poster_background_pool WHERE id=$1',[poolJob])).rows[0].status,'succeeded');
 }finally{await pg.close();}
});
