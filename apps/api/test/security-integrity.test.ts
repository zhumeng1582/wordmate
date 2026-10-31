import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {Core} from '../src/core.ts';
import {Privacy} from '../src/privacy.ts';
import {Lifecycle} from '../src/lifecycle.ts';
import {CheckinShareImageCache} from '../src/checkin-share-images.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
import type {VocabularyProvider} from '../src/vocabulary.ts';
import type {Database,Sql} from '../src/ports.ts';
import type {AudioRuntime} from '../src/audio-runtime.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
const result=(word:string,i:number)=>({input_index:i,input:word,status:'ok',lemma:word,part_of_speech:'noun',meaning_zh:'释义'+word,ipa_gb:'/test/',ipa_us:'/test/',sentence_en:`I see the ${word}.`,sentence_zh:'这是学习用的例句。',reason:null});
async function fixture(provider?:VocabularyProvider){
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));
 for(const f of readdirSync('apps/api/migrations').sort())await pg.exec(readFileSync(`apps/api/migrations/${f}`,'utf8'));
 const sql:string[]=[];const wrap=(q:any):Sql=>({query:(s,p)=>{sql.push(s);return q.query(s,p);}});
 const db:Database={...wrap(pg),transaction:fn=>pg.transaction((q:any)=>fn(wrap(q)))};
 const privacy=new Privacy(db,{NODE_ENV:'development'}),spool=mkdtempSync(join(tmpdir(),'wordmate-security-')),objects=new Map<string,Uint8Array>();
 let now=new Date(),calls=0,deny=false;
 const runtime:AudioRuntime={profile:{provider:'test',model:'test'},voices:[{id:'us',accent:'en-US',gender:'Female'}],storageProfile:'test',stores:{test:{async put(k,b){objects.set(k,b);},async get(k){return objects.get(k)!;},async stat(k){return objects.has(k)?{size:objects.get(k)!.length}:null;},async delete(k){if(deny)throw Error('delete denied');objects.delete(k);}}},synthesize:async()=>{calls++;return {bytes:Buffer.from('ID3-security-test')};},spoolDir:spool,pricePer10000Characters:'1'};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'security',()=>now,provider,runtime,undefined,undefined,undefined,(q,actor)=>privacy.assertConsent(q,actor)),life=new Lifecycle(db,runtime);
 const login=async(code:string)=>{const x=await core.login(code);await privacy.accept(x.user.id,{policy_version:privacy.policy.version,policy_hash:privacy.policy.hash,guardian_confirmed:true});return x.user.id;};
 const dad=await login('dev-dad'),mom=await login('dev-mom'),family=await core.createFamily(dad,'family',{name:'安全回归家庭'});
 const words=async(actor=dad,familyId=family.id,list=['apple'])=>{const child=await core.createChild(actor,randomUUID(),familyId,{nickname:'孩子'}),book=await core.createWordbook(actor,randomUUID(),child.id,{name:'词本'});const batch=await core.createBatch(actor,randomUUID(),child.id,{wordbook_id:book.id,words:list});await core.confirmBatch(actor,randomUUID(),batch.id,{expected_version:1,selections:batch.items.map((i:any)=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});return {child,book,items:(await core.words(actor,child.id)).items};};
 const joinMom=async()=>{const i=await core.createInvite(dad,'invite',family.id);await core.claimInvite(mom,'claim',{invite_token:i.invite_token});await core.approveInvite(dad,'approve',i.id);};
 const audio=async(actor:string,word:any,rate=1)=>core.audio.create(actor,randomUUID(),{word_id:word.id,content_version:1,accent:'en-US',voice_id:'us',speech_rate:rate});
 return {pg,db,privacy,core,life,runtime,objects,sql,dad,mom,family,words,joinMom,login,audio,calls:()=>calls,deny:(b:boolean)=>deny=b,now:()=>now,advance:(ms:number)=>now=new Date(now.getTime()+ms),close:async()=>{await pg.close();rmSync(spool,{recursive:true,force:true});}};
}
test('paid audio uses family funds after deletion or re-registration without a rolling attempt cap',async()=>{
 const f=await fixture();try{
  const a=await f.words();await f.audio(f.dad,a.items[0]);await f.core.audio.processOne();assert.equal(f.calls(),1);
  const del=await f.life.deleteChild(f.dad,a.child.id,{confirm_nickname:a.child.nickname,expected_version:1});await f.life.processOne();assert.equal((await f.life.job(f.dad,del.id)).status,'succeeded');
  const b=await f.words(),limited=await f.audio(f.dad,b.items[0]);await f.core.audio.processOne();assert.equal((await f.core.audio.get(f.dad,limited.job_id)).status,'succeeded');assert.equal(f.calls(),2);
  assert.equal((await f.pg.query("SELECT count(*)::int n FROM wordmate.provider_usage_events WHERE kind='audio'")).rows[0].n,0);
  const familyJob=await f.life.deleteFamily(f.dad,f.family.id,{confirm_name:f.family.name,expected_version:1,confirm_data_deletion:true});await f.life.processOne();assert.equal((await f.life.job(f.dad,familyJob.id)).status,'succeeded');await f.life.deleteAccount(f.dad);
  const newDad=await f.login('dev-dad');assert.notEqual(newDad,f.dad);const family=await f.core.createFamily(newDad,'new-family',{name:'新家庭'}),c=await f.words(newDad,family.id),again=await f.audio(newDad,c.items[0]);await f.core.audio.processOne();assert.equal((await f.core.audio.get(newDad,again.job_id)).status,'succeeded');assert.equal(f.calls(),3);
  f.advance(86400001);const fresh=await f.audio(newDad,c.items[0],1.1);await f.core.audio.processOne();assert.equal((await f.core.audio.get(newDad,fresh.job_id)).status,'succeeded');assert.equal(f.calls(),4);
 }finally{await f.close();}
});
test('vocabulary budget remains charged after deleting its child',async()=>{
 let calls=0;const provider:VocabularyProvider={provider:'test',model:'test',promptVersion:'test',generate:async words=>{calls++;return {items:words.map(result)};}};
 const f=await fixture(provider);try{
  const a=await f.words(),job=await f.core.vocabulary.create(f.dad,'ai',a.child.id,{wordbook_id:a.book.id,words:['cat']});await f.core.vocabulary.processOne();assert.equal((await f.core.vocabulary.get(f.dad,job.id)).status,'succeeded');
  const key=createHash('sha256').update('security:dev-dad').digest('hex');
  await f.pg.query("INSERT INTO wordmate.provider_usage_events(kind,job_id,attempt,budget_key,child_id,created_at) SELECT 'vocabulary',gen_random_uuid(),1,$1,$2,$3 FROM generate_series(1,59)",[key,a.child.id,f.now()]);
  await f.life.deleteChild(f.dad,a.child.id,{confirm_nickname:a.child.nickname,expected_version:1});await f.life.processOne();
  const b=await f.words(),limited=await f.core.vocabulary.create(f.dad,'limited',b.child.id,{wordbook_id:b.book.id,words:['dog']});await f.core.vocabulary.processOne();assert.equal((await f.core.vocabulary.get(f.dad,limited.id)).error_code,'AI_DAILY_LIMIT');assert.equal(calls,1);
 }finally{await f.close();}
});
test('audio admission rejects queue flooding before creating another asset',async()=>{
 const f=await fixture();try{const a=await f.words();
  for(let n=0;n<40;n++)await f.audio(f.dad,a.items[0],0.5+n/100);
  await assert.rejects(f.audio(f.dad,a.items[0],1.25),{code:'AUDIO_QUEUE_LIMIT'});
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.audio_assets')).rows[0].n,40);
 }finally{await f.close();}
});
test('failed poster expiry and child cleanup retain the object record until storage deletion succeeds',async()=>{
 const f=await fixture();try{
  const a=await f.words(),key='checkin/private.png';f.objects.set(key,Buffer.from('private image'));
  const cache=new CheckinShareImageCache(f.db,{async put(){},async get(k){return f.objects.get(k)!;},async delete(k){await f.runtime.stores.test.delete!(k);}},async()=>{throw Error('No provider call expected');},false);
  cache.setAuthorization((q,actor,scope)=>f.privacy.authorizePoster(q,actor,scope));
  await f.pg.query("INSERT INTO wordmate.checkin_share_images(id,requested_by,cache_scope,theme,status,storage_key,mime_type,expires_at) VALUES($1,$2,$3,'growth','succeeded',$4,'image/png',now()-interval '1 minute')",[randomUUID(),f.dad,a.child.id+':2026-10-24',key]);
  f.deny(true);await assert.rejects(cache.processOne());assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.checkin_share_images')).rows[0].n,1);
  const life=new Lifecycle(f.db,f.runtime,cache),job=await life.deleteChild(f.dad,a.child.id,{confirm_nickname:a.child.nickname,expected_version:1});await life.processOne();assert.equal((await life.job(f.dad,job.id)).status,'failed');assert(f.objects.has(key));
  f.deny(false);await life.retry(f.dad,job.id);await life.processOne();assert.equal((await life.job(f.dad,job.id)).status,'succeeded');assert(!f.objects.has(key));
 }finally{await f.close();}
});
test('archive rejects new reviews, prunes only unavailable unanswered cards, and preserves committed replay',async()=>{
 const f=await fixture();try{
  const a=await f.words(f.dad,f.family.id,['apple','cat']),other=await f.core.createWordbook(f.dad,'other',a.child.id,{name:'保留词本'});
  const batch=await f.core.createBatch(f.dad,'link',a.child.id,{wordbook_id:other.id,words:['apple']});await f.core.confirmBatch(f.dad,'link-confirm',batch.id,{expected_version:1,selections:batch.items.map((i:any)=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});
  const s=await f.core.startSession(f.dad,'session',a.child.id,{source:'scheduled'}),cards=(await f.core.cards(f.dad,s.id)).items,cat=cards.find((c:any)=>c.lemma==='cat'),apple=cards.find((c:any)=>c.lemma==='apple');
  await f.core.archiveWordbook(f.dad,'archive',a.child.id,a.book.id);
  const answer=(c:any)=>({session_id:s.id,card_id:c.id,event_id:randomUUID(),expected_version:c.version,lease_generation:1,rating:'good'});
  await assert.rejects(f.core.review(f.dad,answer(cat)),{code:'WORD_UNAVAILABLE'});
  const page=await f.core.cards(f.dad,s.id);assert.equal(page.remaining,1);assert.equal(page.items[0].lemma,'apple');
  const body=answer(apple),saved=await f.core.review(f.dad,body);await f.core.archiveWordbook(f.dad,'archive-last',a.child.id,other.id);assert.deepEqual(await f.core.review(f.dad,body),JSON.parse(JSON.stringify(saved)));
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.review_logs')).rows[0].n,1);
 }finally{await f.close();}
});
test('makeup cannot mint a replacement reward; migration removes only invalid unspent grants',async()=>{
 const f=await fixture();try{
  const a=await f.words();await f.core.setLearningGoal(f.dad,'goal',a.child.id,{daily_goal:1,expected_version:1});
  const today=new Date(f.now().getTime()+8*3600000).toISOString().slice(0,10),prior=(n:number)=>new Date(Date.parse(today)-n*86400000).toISOString().slice(0,10);
  for(let n=1;n<=14;n++)await f.pg.query("INSERT INTO wordmate.daily_activity(child_id,local_date,distinct_words,goal_snapshot,timezone_snapshot) VALUES($1,$2,1,1,'Asia/Shanghai')",[a.child.id,prior(n)]);
  const practice=async()=>{const s=await f.core.startSession(f.dad,randomUUID(),a.child.id,{source:'manual',word_ids:[a.items[0].id]}),c=(await f.core.cards(f.dad,s.id)).items[0];await f.core.review(f.dad,{session_id:s.id,card_id:c.id,event_id:randomUUID(),expected_version:c.version,lease_generation:1,rating:'good'});await f.core.heartbeat(f.dad,s.id,{lease_generation:1},true);};
  await practice();assert.equal((await f.core.today(f.dad,a.child.id)).makeup_credits,1);
  await f.core.useCheckinMakeup(f.dad,'spend',a.child.id,{date:prior(15)});await practice();assert.equal((await f.core.today(f.dad,a.child.id)).makeup_credits,0);
  await assert.rejects(f.core.useCheckinMakeup(f.dad,'no-refill',a.child.id,{date:prior(16)}),{code:'NO_MAKEUP_CREDIT'});
  await f.pg.query('INSERT INTO wordmate.checkin_makeup_credits(child_id,streak_start,milestone_days,milestone_date) VALUES($1,$2,15,$3)',[a.child.id,prior(15),prior(1)]);
  await f.pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.checkin_makeup_credits WHERE child_id=$1',[a.child.id])).rows[0].n,1);
 }finally{await f.close();}
});
test('authorized parent owns an edited job after the original requester withdraws',async()=>{
 let empty=true;const provider:VocabularyProvider={provider:'test',model:'test',promptVersion:'test',rawPromptVersion:'test-raw',generate:async words=>({items:words.map(result)}),generateRaw:async()=>empty?{error:'NO_WORDS_FOUND',items:[]}:{error:null,items:[result('cat',0)]}};
 const f=await fixture(provider);try{
  await f.joinMom();const a=await f.words(),task=await f.core.vocabulary.create(f.dad,'original',a.child.id,{wordbook_id:a.book.id,raw_text:'unrecognized'});await f.core.vocabulary.processOne();await f.privacy.withdraw(f.dad);empty=false;
  await f.core.vocabulary.replace(f.mom,'edit',task.id,{wordbook_id:a.book.id,raw_text:'cat',source_type:'text',expected_attempts:1});await f.core.vocabulary.processOne();assert.equal((await f.core.vocabulary.get(f.mom,task.id)).status,'succeeded');
  assert.equal((await f.pg.query('SELECT requested_by FROM wordmate.generation_jobs WHERE id=$1',[task.id])).rows[0].requested_by,f.mom);
  await assert.rejects(f.core.words(f.dad,a.child.id),{code:'PRIVACY_CONSENT_REQUIRED'});
 }finally{await f.close();}
});
test('only current owner may create children, including replay, and annotation locks family before word',async()=>{
 const f=await fixture();try{
  await f.joinMom();await assert.rejects(f.core.createChild(f.mom,'not-owner',f.family.id,{nickname:'孩子'}),{code:'OWNER_REQUIRED'});
  const child=await f.core.createChild(f.dad,'owned-child',f.family.id,{nickname:'孩子'}),a=await f.words();f.sql.length=0;
  await f.core.patchWordAnnotations(f.dad,'mark',a.items[0].id,{expected_version:0,favorite:true});
  const familyLock=f.sql.findIndex(s=>/FROM families .*FOR UPDATE/.test(s)),wordLock=f.sql.findIndex(s=>/FROM child_words .*FOR UPDATE/.test(s));assert(familyLock>=0&&wordLock>familyLock);
  await f.life.transfer(f.dad,f.family.id,{member_user_id:f.mom,expected_version:1});
  await assert.rejects(f.core.createChild(f.dad,'owned-child',f.family.id,{nickname:'孩子'}),{code:'OWNER_REQUIRED'});
  assert((await f.core.createChild(f.mom,'new-owner',f.family.id,{nickname:'新孩子'})).id);assert(child.id);
 }finally{await f.close();}
});

test('production preflight role mode can initialize the actual OSS adapter without static keys',async()=>{
 const {spawnSync}=await import('node:child_process'),{createOssStorage}=await import('../../../packages/ai/src/oss-storage.ts');
 const env={AI_CREDENTIAL_KEY:'10'.repeat(32),NODE_ENV:'production',AUTH_MODE:'wechat',DATABASE_URL:'postgresql://example:example@db.example/wordmate',WECHAT_APP_ID:'example',WECHAT_APP_SECRET:'example',DICTIONARY_PROVIDER:'none',MINIAPP_API_BASE:'https://example.com/api',LLM_PROVIDER:'qwen',QWEN_API_KEY:'example',QWEN_MODEL:'example',OCR_PROVIDER:'qwen',OCR_WORKSPACE_ID:'example',OCR_API_KEY:'example',OCR_MODEL:'example',TTS_PROVIDER:'cosyvoice',COSYVOICE_API_KEY:'example',COSYVOICE_WORKSPACE_ID:'example',OSS_BUCKET:'examplebucket',OSS_REGION:'cn-beijing',OSS_ENDPOINT:'https://oss-cn-beijing.aliyuncs.com',OSS_AUDIO_PREFIX:'production/audio/',AUDIO_STORAGE_PROFILE:'production',OSS_CREDENTIAL_MODE:'ecs_ram_role',OSS_RAM_ROLE_NAME:'WordmateRole',PRIVACY_OPERATOR_NAME:'example',PRIVACY_CONTACT:'example@example.com',PRIVACY_BACKUP_RETENTION_DAYS:'7'};
 const check=spawnSync(process.execPath,['scripts/check-production-env.cjs'],{env,encoding:'utf8'});assert.equal(check.status,0,check.stdout);
 let calls=0;const storage=createOssStorage(env,async()=>{calls++;throw Error('No cloud calls during initialization');});assert.equal(typeof storage.get,'function');assert.equal(calls,0);
});
