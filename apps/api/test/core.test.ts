import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
import type {Scheduler,Database} from '../src/ports.ts';
const require=createRequire(import.meta.url);
const {PGlite}=require(process.env.PGLITE_MODULE??'@electric-sql/pglite');
// A deterministic scheduler double validates transaction semantics, not FSRS behavior.
const scheduler:Scheduler={version:'test-only',parameterVersion:'test-only',empty:now=>({due:now}),next:(_state,rating,now)=>({state:{due:new Date(now.getTime()+86400000),rating},label:'review',due:new Date(now.getTime()+86400000)})};
for (const [label,activeScheduler] of [['fixture',scheduler],['real FSRS',await createScheduler()]] as const) test(`${label}: login → isolated family → confirmed batch → durable, deduplicated review`,async()=>{
  const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));
  const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
  let now=new Date();const core=new Core(db,new DevIdentity(),new FixtureDictionary(),activeScheduler,'test-app',()=>now);
  try{
    const login=await core.login('dev-dad'),dad=await core.authenticate(login.access_token),mom=await core.login('dev-mom');
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
