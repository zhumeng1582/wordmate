import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
import type {Database} from '../src/ports.ts';
import {seedLegacyPublishedBook,seedLegacySubscription} from './legacy-sharing-fixture.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');

test('first release rejects public creation and cached replay while preserving historical learning and exit controls',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));
 for(const file of ['008_shared_wordbooks.sql','009_child_profiles.sql'])await pg.exec(readFileSync(`apps/api/migrations/${file}`,'utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))},scheduler=await createScheduler();
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),scheduler,'shared-books');
 try{
  const dad=(await core.login('dev-dad')).user.id,mom=(await core.login('dev-mom')).user.id;
  const family=await core.createFamily(dad,'family',{name:'家长家庭'}),child=await core.createChild(dad,'child',family.id,{nickname:'小明',school_grade:'小学三年级',gender:'boy'}),book=await core.createWordbook(dad,'book',child.id,{name:'旅行词汇'});
  const batch=await core.createBatch(dad,'batch',child.id,{wordbook_id:book.id,words:['apple','book']});
  await core.confirmBatch(dad,'confirm',batch.id,{expected_version:batch.version,selections:batch.items.map((i:any)=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});
  const published=await seedLegacyPublishedBook(db,dad,child.id,book.id);
  const momFamily=await core.createFamily(mom,'mom-family',{name:'另一家庭'}),learner=await core.createChild(mom,'mom-child',momFamily.id,{nickname:'小红'});
  const joined=await seedLegacySubscription(db,scheduler,mom,learner.id,published.id);
  // Simulate successful requests cached by the old deployment, before any release guard.
  for(const [actor,op,key,payload,response] of [[dad,`book:share:${book.id}`,'old-publish',{published:true},{published:true}],[mom,`book:join:${learner.id}:${published.id}`,'old-join',{},joined]] as const){
   const digest=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
   await pg.query(`INSERT INTO wordmate.idempotency_keys(actor_user_id,operation,key,request_hash,status,expires_at,http_status,response_body) VALUES($1,$2,$3,$4,'completed',now()+interval '1 day',200,$5)`,[actor,op,key,digest,JSON.stringify(response)]);
  }
  await assert.rejects(core.searchSharedWordbooks(mom,{q:'apple'}),{status:403,code:'PUBLIC_SHARING_DISABLED'});
  await assert.rejects(core.sharedWordbook(mom,published.id),{code:'PUBLIC_SHARING_DISABLED'});
  for(const key of ['new-publish','old-publish'])await assert.rejects(core.shareWordbook(dad,key,child.id,book.id,{published:true}),{code:'PUBLIC_SHARING_DISABLED'});
  for(const key of ['new-join','old-join'])await assert.rejects(core.joinSharedWordbook(mom,key,learner.id,published.id),{code:'PUBLIC_SHARING_DISABLED'});
  assert.equal((await core.wordbooks(mom,learner.id)).items[0].read_only,true);
  const localWords=await core.words(mom,learner.id,{wordbook_id:joined.id});assert.equal(localWords.total,2);
  await pg.query("UPDATE wordmate.review_cards SET state='review' WHERE child_id=$1 AND child_word_id=$2",[learner.id,localWords.items[0].id]);
  await assert.rejects(core.createBatch(mom,'readonly',learner.id,{wordbook_id:joined.id,words:['cat']}),{code:'WORDBOOK_NOT_FOUND'});
  await assert.rejects(core.shareWordbook(mom,'unauthorized-stop',child.id,book.id,{published:false}),{code:'FAMILY_NOT_FOUND'});
  const invite=await core.createInvite(dad,'invite',family.id),claim=await core.claimInvite(mom,'claim',{invite_token:invite.invite_token});await core.approveInvite(dad,'approve',claim.id);
  await assert.rejects(core.shareWordbook(mom,'not-publisher',child.id,book.id,{published:false}),{code:'SHARE_OWNER_REQUIRED'});
  const off=await core.shareWordbook(dad,'stop',child.id,book.id,{published:false,title:'Ignored update'});assert.equal(off.published,false);assert.equal(off.title,book.name);
  assert.equal((await core.shareWordbook(dad,'stop-again',child.id,book.id,{published:false})).version,off.version,'repeated stop does not mutate history');
  const progress=await core.words(mom,learner.id,{wordbook_id:joined.id});assert.equal(progress.total,2);assert.equal(progress.learned_count,1);
  // Archiving a legacy live source still unpublishes; subscriber progress survives.
  await pg.query('UPDATE wordmate.shared_wordbooks SET published=true WHERE id=$1',[published.id]);
  await core.archiveWordbook(dad,'archive',child.id,book.id);
  assert.equal((await pg.query('SELECT published FROM wordmate.shared_wordbooks WHERE id=$1',[published.id])).rows[0].published,false);
  await core.shareWordbook(dad,'stop-archived',child.id,book.id,{published:false});
  assert.equal((await core.words(mom,learner.id,{wordbook_id:joined.id})).learned_count,1);
  const privateBook=await core.createWordbook(dad,'private',child.id,{name:'新词本'});
  await assert.rejects(core.shareWordbook(dad,'no-draft',child.id,privateBook.id,{published:false}),{code:'SHARED_WORDBOOK_NOT_FOUND'});
  assert.equal((await pg.query('SELECT count(*)::int n FROM wordmate.shared_wordbooks')).rows[0].n,1,'no new public records');
  await core.leaveSharedWordbook(mom,'leave',learner.id,published.id);assert.equal((await core.wordbooks(mom,learner.id)).items.length,0);
 }finally{await pg.close();}
});
