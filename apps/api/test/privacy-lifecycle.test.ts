import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {Core} from '../src/core.ts';
import {seedLegacyPublishedBook,seedLegacySubscription} from './legacy-sharing-fixture.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
import {Privacy} from '../src/privacy.ts';
import {Lifecycle} from '../src/lifecycle.ts';
import type {Database} from '../src/ports.ts';
import type {AudioRuntime} from '../src/audio-runtime.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
async function fixture(){
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));
 for(const file of readdirSync('apps/api/migrations').sort())await pg.exec(readFileSync(`apps/api/migrations/${file}`,'utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s:string,p?:any[])=>tx.query(s,p)}))};
 const privacy=new Privacy(db,{NODE_ENV:'development'}),objects=new Map<string,Uint8Array>(),spool=mkdtempSync(join(tmpdir(),'wordmate-privacy-'));
 let denyDelete=false,synthGate:Promise<void>|undefined;
 const runtime:AudioRuntime={profile:{provider:'test',model:'test'},voices:[{id:'us',accent:'en-US',gender:'Female'}],storageProfile:'test',stores:{test:{async put(k,b){objects.set(k,b);},async get(k){return objects.get(k)!;},async stat(k){return objects.has(k)?{size:objects.get(k)!.length}:null;},async delete(k){if(denyDelete)throw Error('forbidden');objects.delete(k);}}},synthesize:async()=>{await synthGate;return {bytes:Buffer.from('ID3-test-audio')};},spoolDir:spool,pricePer10000Characters:'1'};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'privacy',()=>new Date(),undefined,runtime,undefined,undefined,undefined,(q,actor)=>privacy.assertConsent(q,actor));
 const life=new Lifecycle(db,runtime);
 const login=async(code:string)=>{const user=await core.login(code);await privacy.accept(user.user.id,{policy_version:privacy.policy.version,policy_hash:privacy.policy.hash,guardian_confirmed:true});return user;};
 const dad=await login('dev-dad'),mom=await login('dev-mom'),other=await login('dev-outsider');
 const family=await core.createFamily(dad.user.id,'family',{name:'测试家庭'}),child=await core.createChild(dad.user.id,'child',family.id,{nickname:'测试孩子'});
 const words=async()=>{const book=await core.createWordbook(dad.user.id,'book',child.id,{name:'词本'}),batch=await core.createBatch(dad.user.id,'batch',child.id,{wordbook_id:book.id,words:['apple','book']});await core.confirmBatch(dad.user.id,'confirm',batch.id,{expected_version:batch.version,selections:batch.items.map((i:any)=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});return {book,items:(await core.words(dad.user.id,child.id)).items};};
 const joinMom=async()=>{const invite=await core.createInvite(dad.user.id,'invite',family.id),claim=await core.claimInvite(mom.user.id,'claim',{invite_token:invite.invite_token});await core.approveInvite(dad.user.id,'approve',claim.id);};
 return {pg,db,core,privacy,life,dad,mom,other,family,child,objects,words,joinMom,setDeny:(b:boolean)=>denyDelete=b,setGate:(p:Promise<void>)=>synthGate=p,close:async()=>{await pg.close();rmSync(spool,{recursive:true,force:true});}};
}
test('consent is explicit, idempotent, content-bound and withdrawn without deleting another guardian data',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.privacy.accept(f.dad.user.id,{policy_version:f.privacy.policy.version,policy_hash:'0'.repeat(64),guardian_confirmed:true}),{code:'PRIVACY_POLICY_CHANGED'});
  const updated=new Privacy(f.db,{NODE_ENV:'development',PRIVACY_OPERATOR_NAME:'changed'});assert.equal((await updated.consent(f.dad.user.id)).accepted,false);
  await f.privacy.accept(f.dad.user.id,{policy_version:f.privacy.policy.version,policy_hash:f.privacy.policy.hash,guardian_confirmed:true});
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.privacy_consent_events WHERE user_id=$1',[f.dad.user.id])).rows[0].n,1);
  await f.joinMom();await f.words();const session=await f.core.startSession(f.dad.user.id,'session',f.child.id,{source:'scheduled'});
  await f.privacy.withdraw(f.dad.user.id);await f.privacy.withdraw(f.dad.user.id);
  assert.equal((await f.privacy.consent(f.dad.user.id)).accepted,false);
  await assert.rejects(f.core.words(f.dad.user.id,f.child.id),{code:'PRIVACY_CONSENT_REQUIRED'});
  assert.equal((await f.core.words(f.mom.user.id,f.child.id)).total,2);
  assert.equal((await f.pg.query('SELECT status FROM wordmate.study_sessions WHERE id=$1',[session.id])).rows[0].status,'revoked');
  assert.equal((await f.life.overview(f.dad.user.id)).families.length,1,'withdrawn users can still manage deletion');
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.privacy_consent_events WHERE user_id=$1',[f.dad.user.id])).rows[0].n,2);
  const prod=new Privacy(f.db,{NODE_ENV:'production'});await assert.rejects(prod.accept(f.dad.user.id,{policy_version:prod.policy.version,policy_hash:prod.policy.hash,guardian_confirmed:true}),{code:'PRIVACY_POLICY_NOT_READY'});
 }finally{await f.close();}
});
test('child deletion freezes immediately, deletes full learning graph and objects, and retains private retryable receipt',async()=>{
 const f=await fixture();try{
  const {items}=await f.words(),actor=f.dad.user.id;
  await assert.rejects(f.life.deleteChild(f.other.user.id,f.child.id,{confirm_nickname:f.child.nickname,expected_version:1}),{code:'FAMILY_NOT_FOUND'});
  await assert.rejects(f.life.deleteChild(actor,f.child.id,{confirm_nickname:'错误昵称',expected_version:1}),{code:'CONFIRMATION_MISMATCH'});
  const session=await f.core.startSession(actor,'session',f.child.id,{source:'scheduled'}),cards=await f.core.cards(actor,session.id);
  await f.core.review(actor,{session_id:session.id,card_id:cards.items[0].id,event_id:'11111111-1111-4111-8111-111111111111',expected_version:cards.items[0].version,lease_generation:session.lease_generation,rating:'again'});
  await f.core.patchWordAnnotations(actor,'annotation',items[0].id,{expected_version:0,favorite:true});
  await f.core.imports.extract(actor,f.child.id,{name:'words.txt',base64:Buffer.from('apple').toString('base64')});
  await f.core.audio.create(actor,'audio',{word_id:items[0].id,content_version:1,accent:'en-US',voice_id:'us',speech_rate:1});await f.core.audio.processOne();assert.equal(f.objects.size,1);
  const body={confirm_nickname:f.child.nickname,expected_version:1},job=await f.life.deleteChild(actor,f.child.id,body);
  await assert.rejects(f.core.words(actor,f.child.id),{code:'CHILD_NOT_FOUND'});
  assert.equal((await f.life.deleteChild(actor,f.child.id,body)).id,job.id);
  f.setDeny(true);await f.life.processOne();assert.equal((await f.life.job(actor,job.id)).status,'failed');
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.child_words WHERE child_id=$1',[f.child.id])).rows[0].n,2,'records are preserved if object cleanup fails');
  await assert.rejects(f.life.job(f.other.user.id,job.id),{code:'DELETION_NOT_FOUND'});
  f.setDeny(false);await f.life.retry(actor,job.id);await f.life.processOne();
  assert.equal((await f.life.job(actor,job.id)).status,'succeeded');assert.equal(f.objects.size,0);
  for(const table of ['children','child_words','review_cards','review_logs','study_sessions','generation_jobs','audio_assets','wordbooks'])assert.equal((await f.pg.query(`SELECT count(*)::int n FROM wordmate.${table}`)).rows[0].n,0,table);
  assert.equal((await f.life.deleteChild(actor,f.child.id,body)).id,job.id);
  assert.equal((await f.pg.query("SELECT completed_at FROM wordmate.deletion_tombstones WHERE kind='delete_child' AND target_id=$1",[f.child.id])).rows[0].completed_at!==null,true);
 }finally{await f.close();}
});
test('late audio synthesis cannot recreate deleted child records, spool or objects',async()=>{
 const f=await fixture();let release!:()=>void;try{
  const {items}=await f.words();let started!:()=>void;const entered=new Promise<void>(r=>started=r),gate=new Promise<void>(r=>release=r);f.setGate((async()=>{started();await gate;})());
  await f.core.audio.create(f.dad.user.id,'audio',{word_id:items[0].id,content_version:1,accent:'en-US',voice_id:'us',speech_rate:1});const worker=f.core.audio.processOne();await entered;
  // Wait until the durable claim has been committed, without relying on wall-clock sleeps.
  while(!(await f.pg.query("SELECT 1 FROM wordmate.generation_jobs WHERE kind='audio' AND status='running'")).rows.length)await new Promise(r=>setTimeout(r,1));
  const job=await f.life.deleteChild(f.dad.user.id,f.child.id,{confirm_nickname:f.child.nickname,expected_version:1});await f.life.processOne();
  release();await worker;assert.equal((await f.life.job(f.dad.user.id,job.id)).status,'succeeded');assert.equal(f.objects.size,0);
 }finally{release?.();await f.close();}
});
test('family dissolution blocks other members, preserves transferred family and supports account erasure',async()=>{
 const f=await fixture();try{
  const {items}=await f.words();await f.joinMom();
  await assert.rejects(f.life.deleteAccount(f.dad.user.id),{code:'OWNER_TRANSFER_OR_DISSOLVE_REQUIRED'});
  await assert.rejects(f.life.deleteFamily(f.dad.user.id,f.family.id,{confirm_name:f.family.name,expected_version:1,confirm_data_deletion:true}),{code:'FAMILY_HAS_OTHER_MEMBERS'});
  await assert.rejects(f.life.leave(f.dad.user.id,f.family.id),{code:'OWNER_TRANSFER_OR_DISSOLVE_REQUIRED'});
  await f.core.saveProfile(f.dad.user.id,'parent-profile',{display_name:'家长头像测试',expected_version:1,avatar_base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII=',avatar_mime:'image/png'});
  await f.life.transfer(f.dad.user.id,f.family.id,{member_user_id:f.mom.user.id,expected_version:1});
  await f.life.deleteAccount(f.dad.user.id);await assert.rejects(f.core.authenticate(f.dad.access_token),{code:'UNAUTHENTICATED'});
  assert.equal((await f.core.words(f.mom.user.id,f.child.id)).items.length,items.length);
  const old=(await f.pg.query('SELECT * FROM wordmate.users WHERE id=$1',[f.dad.user.id])).rows[0];assert.equal(old.status,'deleted');assert.equal(old.avatar_bytes,null);assert.equal(old.avatar_mime,null);assert.notEqual(old.wx_open_id,'dev-dad');
  const newLogin=await f.core.login('dev-dad');assert.notEqual(newLogin.user.id,f.dad.user.id);assert.deepEqual(newLogin.families,[]);
  const version=(await f.core.me(f.mom.user.id)).families[0].version;
  const job=await f.life.deleteFamily(f.mom.user.id,f.family.id,{confirm_name:f.family.name,expected_version:version,confirm_data_deletion:true});
  await f.life.processOne();assert.equal((await f.life.job(f.mom.user.id,job.id)).status,'succeeded');
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.families')).rows[0].n,0);
  await f.life.deleteAccount(f.mom.user.id);
 }finally{await f.close();}
});
test('removed and departed parents lose family access and leases while learning records survive',async()=>{
 const f=await fixture();try{
  await f.joinMom();await f.words();const session=await f.core.startSession(f.mom.user.id,'session',f.child.id,{source:'scheduled'});
  await f.life.leave(f.dad.user.id,f.family.id,f.mom.user.id);await assert.rejects(f.core.words(f.mom.user.id,f.child.id),{code:'FAMILY_NOT_FOUND'});
  assert.equal((await f.pg.query('SELECT status FROM wordmate.study_sessions WHERE id=$1',[session.id])).rows[0].status,'revoked');
  assert.equal((await f.core.words(f.dad.user.id,f.child.id)).total,2);
 }finally{await f.close();}
});

test('maintenance ledger replays deletion onto restored data before access can resume',async()=>{
 const f=await fixture();try{
  await f.words();await assert.rejects(f.life.restoreLedger({version:1,entries:[{kind:'invalid',target_id:f.child.id}]}),{code:'INVALID_DELETION_LEDGER'});
  assert.equal((await f.core.words(f.dad.user.id,f.child.id)).total,2);
  await f.life.restoreLedger({version:1,entries:[{kind:'delete_child',target_id:f.child.id,family_id:f.family.id,requested_by:f.dad.user.id}]});
  await assert.rejects(f.core.words(f.dad.user.id,f.child.id),{code:'CHILD_NOT_FOUND'});await f.life.processOne();
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.children')).rows[0].n,0);
  const ledger=await f.life.exportLedger();assert.equal(ledger.entries[0].target_id,f.child.id);assert.ok(ledger.entries[0].completed_at);
  await f.life.restoreLedger(ledger);assert.equal((await f.life.jobs(f.dad.user.id)).items.length,1,'replaying an already erased target does not create new jobs');
 }finally{await f.close();}
});

test('deleting a source child preserves other families independent subscribed copies',async()=>{
 const f=await fixture();try{
  const {book}=await f.words();
  const published=await seedLegacyPublishedBook(f.db,f.dad.user.id,f.child.id,book.id);
  const family=await f.core.createFamily(f.mom.user.id,'other-family',{name:'另一家庭'}),child=await f.core.createChild(f.mom.user.id,'other-child',family.id,{nickname:'另一孩子'});
  const joined=await seedLegacySubscription(f.db,await createScheduler(),f.mom.user.id,child.id,published.id);
  const job=await f.life.deleteChild(f.dad.user.id,f.child.id,{confirm_nickname:f.child.nickname,expected_version:1});await f.life.processOne();
  assert.equal((await f.life.job(f.dad.user.id,job.id)).status,'succeeded');
  assert.equal((await f.core.words(f.mom.user.id,child.id,{wordbook_id:joined.id})).total,2);
  const copy=(await f.core.wordbooks(f.mom.user.id,child.id)).items[0];assert.equal(copy.shared_source_id,null);assert.equal(copy.read_only,false);
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.shared_wordbooks')).rows[0].n,0);
 }finally{await f.close();}
});

test('remaining guardian can explicitly resume shared audio after the original parent withdraws',async()=>{
 const f=await fixture();try{
  const {items}=await f.words();await f.joinMom();const request={word_id:items[0].id,content_version:1,accent:'en-US',voice_id:'us',speech_rate:1};
  const original=await f.core.audio.create(f.dad.user.id,'audio',request);await f.privacy.withdraw(f.dad.user.id);
  const cached=await f.core.audio.create(f.mom.user.id,'mom-audio',request);assert.equal(cached.job_id,original.job_id);assert.equal(cached.status,'failed');assert.equal(cached.retryable,true);
  await f.core.audio.retry(f.mom.user.id,'mom-retry',original.job_id);await f.core.audio.processOne();assert.equal((await f.core.audio.get(f.mom.user.id,original.job_id)).status,'succeeded');
  await assert.rejects(f.core.audio.get(f.dad.user.id,original.job_id),{code:'PRIVACY_CONSENT_REQUIRED'});
 }finally{await f.close();}
});

test('data management login requires an existing account and never restores learning consent implicitly',async()=>{
 const f=await fixture();try{
  await f.privacy.withdraw(f.dad.user.id);
  const login=await f.core.login('dev-dad',undefined,true);assert.equal(login.is_new_user,false);assert.equal(await f.core.managementOnly(login.access_token),true);assert.equal((await f.privacy.consent(f.dad.user.id)).accepted,false);
  assert.equal((await f.life.overview(f.dad.user.id)).families.length,1);
  await f.privacy.accept(f.dad.user.id,{policy_version:f.privacy.policy.version,policy_hash:f.privacy.policy.hash,guardian_confirmed:true});await f.core.upgradeSession(f.dad.user.id,login.access_token);assert.equal(await f.core.managementOnly(login.access_token),false);
  await f.life.deleteAccount(f.other.user.id);await assert.rejects(f.core.login('dev-outsider',undefined,true),{code:'ACCOUNT_NOT_FOUND'});
 }finally{await f.close();}
});
