import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fixture} from './ai-fixture.ts';
import {validateBody} from '../src/validation.ts';

test('only new-character study answers change learning state; manual marks cannot set or clear it',async()=>{
 const f=await fixture();try{
  for(const name of ['040_hanzi.sql','041_hanzi_order.sql','043_library_archive.sql','045_hanzi_learning.sql','046_hanzi_review_cards.sql','047_hanzi_monthly_quizzes.sql','048_hanzi_quiz_lease.sql','049_hanzi_makeup.sql','050_hanzi_books.sql','056_import_order.sql','051_hanzi_study_sessions.sql'])await f.pg.exec(readFileSync(`apps/api/migrations/${name}`,'utf8'));
  const characters=[] as any[];for(const character of ['春','夏','秋'])characters.push(await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character}));
  const [a,b,c]=characters;
  for(const learned of [true,false]){await assert.rejects(f.core.hanzi.mark(f.dad,f.child.id,a.id,{learned,expected_version:a.version}),{code:'HANZI_LEARNING_FLOW_REQUIRED'});assert.throws(()=>validateBody(['children',f.child.id,'hanzi',a.id,'mark'],'PUT',{learned,expected_version:a.version}),{code:'INVALID_REQUEST_BODY'});}
  const started=await f.core.hanziStudy.create(f.dad,'new',f.child.id,{source:'new',ids:[a.id,b.id]}),lease={lease_id:started.session.id,lease_generation:started.session.lease_generation};assert.equal(started.round.items.length,2);
  assert.equal((await f.core.hanzi.get(f.dad,f.child.id,a.id)).learned_at,null);assert.equal((await f.core.hanziProgress(f.dad,f.child.id)).completed,0);
  const body={...lease,ordinal:1,action:'learn',correct:false,event_id:randomUUID()};const first=await f.core.hanziStudy.answer(f.dad,'first',f.child.id,started.round.id,body);assert.equal(first.wrong_count,1);assert.equal(first.current.hanzi_id,b.id);assert((await f.core.hanzi.get(f.dad,f.child.id,a.id)).learned_at);assert.equal((await f.core.hanzi.get(f.dad,f.child.id,b.id)).learned_at,null);
  assert.deepEqual(await f.core.hanziStudy.answer(f.dad,'first',f.child.id,started.round.id,body),first);assert.equal((await f.core.hanziProgress(f.dad,f.child.id)).completed,1);
  const completed=await f.core.hanziStudy.answer(f.dad,'second',f.child.id,started.round.id,{...lease,ordinal:2,action:'learn',correct:true,event_id:randomUUID()});assert.equal(completed.correct_count,1);assert.equal(completed.wrong_count,1);assert.equal(completed.status,'completed');
  await assert.rejects(f.core.hanziStudy.create(f.dad,'already-learned',f.child.id,{source:'new',ids:[a.id]}),{code:'HANZI_UNAVAILABLE'});await assert.rejects(f.core.hanziStudy.create(f.dad,'unlearned-review',f.child.id,{source:'review',ids:[c.id]}),{code:'HANZI_UNAVAILABLE'});
  const review=await f.core.hanziStudy.create(f.dad,'review',f.child.id,{source:'review',ids:[a.id]}),before=(await f.core.hanzi.get(f.dad,f.child.id,a.id)).learned_at;await f.core.hanziStudy.answer(f.dad,'review-answer',f.child.id,review.round.id,{lease_id:review.session.id,lease_generation:review.session.lease_generation,ordinal:1,action:'review',correct:true,event_id:randomUUID()});assert.deepEqual((await f.core.hanzi.get(f.dad,f.child.id,a.id)).learned_at,before);assert.equal((await f.core.hanziProgress(f.dad,f.child.id)).completed,2);
 }finally{await f.close();}
});

test('character study rounds resume across parents, save answers once and reject stale leases',async()=>{
 const f=await fixture();try{
  for(const name of ['040_hanzi.sql','041_hanzi_order.sql','043_library_archive.sql','045_hanzi_learning.sql','046_hanzi_review_cards.sql','047_hanzi_monthly_quizzes.sql','048_hanzi_quiz_lease.sql','049_hanzi_makeup.sql','050_hanzi_books.sql','056_import_order.sql','051_hanzi_study_sessions.sql'])await f.pg.exec(readFileSync(`apps/api/migrations/${name}`,'utf8'));
  const a=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:'春'}),b=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:'夏'});
  const invitation=await f.core.createInvite(f.dad,'invite',f.family.id);await f.core.claimInvite(f.mom,'claim',{invite_token:invitation.invite_token});await f.core.approveInvite(f.dad,'approve',invitation.id);
  const started=await f.core.hanziStudy.create(f.dad,'create',f.child.id,{source:'new',ids:[a.id,b.id]}),lease={lease_id:started.session.id,lease_generation:started.session.lease_generation},id=started.round.id;
  const conflicting= randomUUID();await f.core.recordHanziLearning(f.dad,f.child.id,{event_id:conflicting,hanzi_id:b.id,kind:'learn'});await assert.rejects(f.core.hanziStudy.answer(f.dad,'conflict',f.child.id,id,{ordinal:1,action:'learn',event_id:conflicting,...lease}),{code:'EVENT_CONFLICT'});assert.equal((await f.core.hanziStudy.get(f.dad,f.child.id,id)).answered_count,0);
  const body={ordinal:1,action:'learn',event_id:randomUUID(),...lease},saved=await f.core.hanziStudy.answer(f.dad,'answer',f.child.id,id,body);assert.equal(saved.answered_count,1);assert.deepEqual(await f.core.hanziStudy.answer(f.dad,'answer',f.child.id,id,body),saved);
  assert.equal((await f.core.hanziProgress(f.dad,f.child.id)).completed,2);const active=(await f.core.hanziStudy.active(f.mom,f.child.id)).round;assert.equal(active.answered_count,1);
  await assert.rejects(f.core.hanziStudy.resume(f.mom,'resume',f.child.id,id,{expected_version:active.version}),{code:'CHILD_BUSY'});
  const takeover=await f.core.hanziStudy.resume(f.mom,'takeover',f.child.id,id,{expected_version:active.version,expected_session_id:lease.lease_id,confirmed:true},true);assert.deepEqual(await f.core.hanziStudy.answer(f.dad,'answer',f.child.id,id,body),saved);assert.equal((await f.core.hanziStudy.get(f.mom,f.child.id,id)).active_session.id,takeover.session.id);
  await assert.rejects(f.core.hanziStudy.answer(f.dad,'stale',f.child.id,id,{ordinal:2,action:'learn',event_id:randomUUID(),...lease}),{code:'SESSION_EXPIRED'});
  const completed=await f.core.hanziStudy.answer(f.mom,'finish',f.child.id,id,{ordinal:2,action:'learn',event_id:randomUUID(),lease_id:takeover.session.id,lease_generation:takeover.session.lease_generation});assert.equal(completed.status,'completed');assert.equal((await f.core.hanziProgress(f.dad,f.child.id)).completed,2);assert.equal((await f.core.hanziStudy.active(f.mom,f.child.id)).round,null);
 }finally{await f.close();}
});

test('released and expired character leases preserve the unfinished round',async()=>{
 const f=await fixture();try{
  for(const name of ['040_hanzi.sql','041_hanzi_order.sql','043_library_archive.sql','045_hanzi_learning.sql','046_hanzi_review_cards.sql','047_hanzi_monthly_quizzes.sql','048_hanzi_quiz_lease.sql','049_hanzi_makeup.sql','050_hanzi_books.sql','056_import_order.sql','051_hanzi_study_sessions.sql'])await f.pg.exec(readFileSync(`apps/api/migrations/${name}`,'utf8'));
  const h=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:'山'}),started=await f.core.hanziStudy.create(f.dad,'start',f.child.id,{source:'new',ids:[h.id]}),id=started.round.id,old={lease_id:started.session.id,lease_generation:started.session.lease_generation};
  await f.core.hanziStudy.heartbeat(f.dad,f.child.id,id,old,true);const round=(await f.core.hanziStudy.active(f.dad,f.child.id)).round;assert.equal(round.active_session,null);const resumed=await f.core.hanziStudy.resume(f.dad,'resume',f.child.id,id,{expected_version:round.version});await assert.rejects(f.core.hanziStudy.answer(f.dad,'old',f.child.id,id,{ordinal:1,action:'learn',event_id:randomUUID(),...old}),{code:'SESSION_EXPIRED'});
  await f.pg.query("UPDATE wordmate.hanzi_study_rounds SET lease_until=now()-interval '1 minute' WHERE id=$1",[id]);const expired=(await f.core.hanziStudy.active(f.dad,f.child.id)).round;assert.equal(expired.active_session,null);const rejoined=await f.core.hanziStudy.resume(f.dad,'resume-again',f.child.id,id,{expected_version:expired.version});assert(rejoined.session.lease_generation>resumed.session.lease_generation);assert.equal(rejoined.round.current.character,'山');
 }finally{await f.close();}
});
