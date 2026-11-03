import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Core,newWordsGroupSize} from '../src/core.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
import type {Scheduler,Database} from '../src/ports.ts';
const require=createRequire(import.meta.url);
const {PGlite}=require(process.env.PGLITE_MODULE??'@electric-sql/pglite');
test('new word rounds use the daily goal and leave a smaller final round',()=>{assert.equal(newWordsGroupSize(0),0);assert.equal(newWordsGroupSize(1),1);assert.equal(newWordsGroupSize(10),10);assert.equal(newWordsGroupSize(200,500),100);assert.equal(newWordsGroupSize(12,5),5);let remaining=23;const groups=[];while(remaining){const size=newWordsGroupSize(remaining,10);groups.push(size);remaining-=size;}assert.deepEqual(groups,[10,10,3]);});
test('resuming remaining new words through a manual session preserves daily counts and the original wrong answer',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));
 const db:Database={query:(sql,params)=>pg.query(sql,params),transaction:fn=>pg.transaction((tx:any)=>fn({query:(sql,params)=>tx.query(sql,params)}))};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'resume-test');
 try{
  const login=await core.login('dev-dad'),actor=await core.authenticate(login.access_token),family=await core.createFamily(actor,randomUUID(),{name:'恢复学习家庭'}),child=await core.createChild(actor,randomUUID(),family.id,{nickname:'宝宝'}),book=await core.createWordbook(actor,randomUUID(),child.id,{name:'新词'});
  const batch=await core.createBatch(actor,randomUUID(),child.id,{wordbook_id:book.id,words:['apple','book']});await core.confirmBatch(actor,randomUUID(),batch.id,{expected_version:1,selections:batch.items.map((item:any)=>({item_id:item.id,action:'select',candidate_id:item.candidates[0].candidate_id}))});
  const initial=await core.startSession(actor,randomUUID(),child.id,{source:'new_words'}),cards=(await core.cards(actor,initial.id)).items;
  await core.review(actor,{session_id:initial.id,card_id:cards[0].id,event_id:randomUUID(),expected_version:cards[0].version,lease_generation:initial.lease_generation,rating:'again'});
  await core.heartbeat(actor,initial.id,{lease_generation:initial.lease_generation},true);
  const resumed=await core.startSession(actor,randomUUID(),child.id,{source:'manual',word_ids:[cards[1].child_word_id]}),remaining=(await core.cards(actor,resumed.id)).items;
  assert.equal(remaining.length,1);assert.equal(remaining[0].practice_only,false);assert.equal(remaining[0].id,cards[1].id);
  const saved=await core.review(actor,{session_id:resumed.id,card_id:remaining[0].id,event_id:randomUUID(),expected_version:remaining[0].version,lease_generation:resumed.lease_generation,rating:'good'});
  assert.equal(saved.today.completed_words,2);assert.equal(saved.today.new_words,2);
  const first=await pg.query('SELECT rating FROM wordmate.review_logs WHERE card_id=$1',[cards[0].id]);assert.equal(first.rows.length,1);assert.equal(first.rows[0].rating,'again');
 }finally{await pg.close();}
});
// A deterministic scheduler double validates transaction semantics, not FSRS behavior.
const scheduler:Scheduler={version:'test-only',parameterVersion:'test-only',empty:now=>({due:now}),next:(_state,rating,now)=>({state:{due:new Date(now.getTime()+86400000),rating},label:'review',due:new Date(now.getTime()+86400000)})};
for (const [label,activeScheduler] of [['fixture',scheduler],['real FSRS',await createScheduler()]] as const) test(`${label}: login → isolated family → confirmed batch → durable, deduplicated review`,async()=>{
  const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));
  const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
  let now=new Date();const core=new Core(db,new DevIdentity(),new FixtureDictionary(),activeScheduler,'test-app',()=>now);
  try{
    const login=await core.login('dev-dad'),dad=await core.authenticate(login.access_token),mom=await core.login('dev-mom');
    const promoCode=(await core.me(dad)).referral_code;assert.match(promoCode,/^[a-f0-9]{16}$/);
    await core.login('dev-outsider',promoCode);
    await core.login('dev-outsider','invalid-reassignment');
    const referral=await pg.query('SELECT invited_user_id,inviter_user_id,referral_code FROM wordmate.user_referrals');
    assert.equal(referral.rows.length,1);assert.equal(referral.rows[0].inviter_user_id,dad);assert.equal(referral.rows[0].referral_code,promoCode);
    const family=await core.createFamily(dad,'family1',{name:'测试家庭'});
    assert.deepEqual(await core.createFamily(dad,'family1',{name:'测试家庭'}),family);
    await assert.rejects(core.createFamily(dad,'family1',{name:'改名'}),{code:'IDEMPOTENCY_CONFLICT'});
    const child=await core.createChild(dad,'child1',family.id,{nickname:'宝宝'});
    await assert.rejects(core.today(mom.user.id,child.id),{code:'FAMILY_NOT_FOUND'});
    await assert.rejects(core.members(mom.user.id,family.id),{code:'FAMILY_NOT_FOUND'});
    assert.equal((await core.members(dad,family.id)).items.length,1);
    const invite=await core.createInvite(dad,'invite1',family.id);
    assert.match(invite.invite_token,/^[A-Za-z0-9_-]{43}$/);
    await assert.rejects(core.claimInvite(dad,'self-claim',{invite_token:invite.invite_token}),{code:'ALREADY_MEMBER'});
    const claimed=await core.claimInvite(mom.user.id,'claim1',{invite_token:invite.invite_token});
    assert.deepEqual(await core.claimInvite(mom.user.id,'claim1',{invite_token:invite.invite_token}),JSON.parse(JSON.stringify(claimed)));
    await assert.rejects(core.claimInvite(mom.user.id,'claim-again',{invite_token:invite.invite_token}),{code:'INVITE_UNAVAILABLE'});
    const expired=await core.createInvite(dad,'expired-invite',family.id);
    await pg.query('UPDATE wordmate.family_invites SET created_at=$3,expires_at=$2 WHERE id=$1',[expired.id,new Date(now.getTime()-1),new Date(now.getTime()-86400001)]);
    await assert.rejects(core.claimInvite(mom.user.id,'expired-claim',{invite_token:expired.invite_token}),{code:'INVITE_UNAVAILABLE'});
    await assert.rejects(core.today(mom.user.id,child.id),{code:'FAMILY_NOT_FOUND'});
    await core.approveInvite(dad,'approve1',invite.id);
    assert.equal((await core.today(mom.user.id,child.id)).child.id,child.id);
    const sharedMembers=(await core.members(mom.user.id,family.id)).items;
    assert.equal(sharedMembers.length,2);assert.equal(sharedMembers[0].role,'owner');
    await assert.rejects(core.createInvite(mom.user.id,'invite2',family.id),{code:'OWNER_REQUIRED'});
    const book=await core.createWordbook(dad,'book1',child.id,{name:'日常词汇'});
    const batch=await core.createBatch(dad,'batch1',child.id,{wordbook_id:book.id,words:['apple','book','unknownword']});
    assert.equal(batch.items[2].status,'invalid');
    const selections=batch.items.map((i:any)=>({item_id:i.id,action:i.candidates.length?'select':'skip',...(i.candidates.length?{candidate_id:i.candidates[0].candidate_id}:{})}));
    const saved=await core.confirmBatch(dad,'confirm1',batch.id,{expected_version:1,selections});assert.equal(saved.child_word_ids.length,2);
    const newSession=await core.startSession(dad,'new-session',child.id,{source:'new_words'});assert.equal(newSession.total,2);assert.equal((await core.cards(dad,newSession.id)).items.length,2);
    await core.heartbeat(dad,newSession.id,{lease_generation:1},true);await assert.rejects(core.startSession(dad,'empty-review',child.id,{source:'review'}),{code:'EMPTY_REVIEW_QUEUE'});
    const bad=await core.createBatch(dad,'batch2',child.id,{wordbook_id:book.id,words:['cat','dog']});
    await assert.rejects(core.confirmBatch(dad,'bad-confirm',bad.id,{expected_version:1,selections:bad.items.map((i:any,n:number)=>({item_id:i.id,action:'select',candidate_id:n?'invalid':i.candidates[0].candidate_id}))}),{code:'INVALID_CANDIDATE'});
    assert.equal((await core.words(dad,child.id)).items.length,2); // partial INSERT rolled back
    const session=await core.startSession(dad,'session1',child.id,{source:'scheduled'});
    await assert.rejects(core.startSession(dad,'session2',child.id,{source:'scheduled'}),{code:'CHILD_BUSY'});
    await assert.rejects(core.cards(mom.user.id,session.id),{code:'SESSION_NOT_OWNED'});
    const cards=await core.cards(dad,session.id);assert.equal(cards.items.length,2);assert.equal('meaning_zh' in cards.items[0],false);
    const request={session_id:session.id,card_id:cards.items[0].id,event_id:randomUUID(),expected_version:1,rating:'again',lease_generation:1};
    const result=await core.review(dad,request);assert.equal(result.today.completed_words,1);assert.equal(result.version,2);
    assert.deepEqual(await core.review(dad,request),result);
    await assert.rejects(core.review(dad,{...request,rating:'good'}),{code:'EVENT_CONFLICT'});
    await assert.rejects(core.review(dad,{...request,event_id:randomUUID()}),{code:'CARD_CONFLICT'});
    const mistakes=await pg.query('SELECT count(*)::int n FROM wordmate.mistake_events');assert.equal(mistakes.rows[0].n,1);
    const logs=await pg.query('SELECT count(*)::int n FROM wordmate.review_logs');assert.equal(logs.rows[0].n,1);
    now=new Date(now.getTime()+121000);
    await assert.rejects(core.review(dad,{...request,card_id:cards.items[1].id,event_id:randomUUID()}),{code:'SESSION_EXPIRED'});
    assert.deepEqual(await core.review(dad,request),result); // successful event remains replayable
    const restarted=await core.startSession(dad,'session3',child.id,{source:'scheduled'});assert.notEqual(restarted.id,session.id);
    // Membership is rechecked even for idempotent response replay.
    await pg.query("UPDATE wordmate.family_members SET status='removed' WHERE user_id=$1",[dad]);
    await assert.rejects(core.confirmBatch(dad,'confirm1',batch.id,{expected_version:1,selections}),{code:'FAMILY_NOT_FOUND'});
  }finally{await pg.close();}
});
