import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fixture} from './ai-fixture.ts';

test('monthly character quiz persists answers, scores once and protects family scope',async()=>{
 const f=await fixture();try{
  for(const name of ['040_hanzi.sql','041_hanzi_order.sql','043_library_archive.sql','045_hanzi_learning.sql','046_hanzi_review_cards.sql','047_hanzi_monthly_quizzes.sql','048_hanzi_quiz_lease.sql','049_hanzi_makeup.sql'])await f.pg.exec(readFileSync(`apps/api/migrations/${name}`,'utf8'));
  for(const [character,pinyin] of [['春','chūn'],['夏','xià'],['秋','qiū'],['冬','dōng']]){const h=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character,pinyin});await f.core.recordHanziLearning(f.dad,f.child.id,{event_id:randomUUID(),hanzi_id:h.id,kind:'learn'});}
  const month=(await f.core.hanziProgress(f.dad,f.child.id)).date.slice(0,7),preview=await f.core.hanziQuizzes.preview(f.dad,f.child.id,month);assert.equal(preview.eligible_count,4);
  let quiz=await f.core.hanziQuizzes.create(f.dad,'quiz-create',f.child.id,{month,mode:'sample',sample_count:10});assert.equal(quiz.total_count,4);
  assert.equal((await f.core.hanziQuizzes.create(f.dad,'quiz-create',f.child.id,{month,mode:'sample',sample_count:10})).id,quiz.id);await assert.rejects(f.core.hanziQuizzes.create(f.dad,'another',f.child.id,{month,mode:'full'}),{code:'ACTIVE_QUIZ_EXISTS'});
  await assert.rejects(f.core.hanziQuizzes.get(f.mom,f.child.id,quiz.id),{code:'FAMILY_NOT_FOUND'});
  const invitation=await f.core.createInvite(f.dad,'invite',f.family.id);await f.core.claimInvite(f.mom,'claim',{invite_token:invitation.invite_token});await f.core.approveInvite(f.dad,'approve',invitation.id);
  const started=await f.core.hanziQuizzes.resume(f.dad,'resume',f.child.id,quiz.id,{expected_version:quiz.version});quiz=started.quiz;let lease={lease_id:started.session.id,lease_generation:started.session.lease_generation};
  await assert.rejects(f.core.hanziQuizzes.resume(f.mom,'other-resume',f.child.id,quiz.id,{expected_version:quiz.version}),{code:'CHILD_BUSY'});
  const items=(await f.core.hanziQuizzes.items(f.dad,f.child.id,quiz.id)).items;assert.equal(items.length,4);assert(!('correct_answer' in items[0]));
  const page1=await f.core.hanziQuizzes.items(f.dad,f.child.id,quiz.id,{limit:2}),page2=await f.core.hanziQuizzes.items(f.dad,f.child.id,quiz.id,{limit:2,cursor:page1.next_cursor});assert.equal(page1.items.length,2);assert.equal(page2.items.length,2);assert.equal(page2.next_cursor,null);assert.equal(new Set([...page1.items,...page2.items].map(x=>x.id)).size,4);
  const answer=items[0].options[0],body={answer,expected_version:1,...lease};const saved=await f.core.hanziQuizzes.answer(f.dad,'answer-one',f.child.id,quiz.id,items[0].id,body);assert.deepEqual(await f.core.hanziQuizzes.answer(f.dad,'answer-one',f.child.id,quiz.id,items[0].id,body),saved);
  await assert.rejects(f.core.hanziQuizzes.answer(f.dad,'answer-again',f.child.id,quiz.id,items[0].id,body),{code:'ANSWER_VERSION_CONFLICT'});
  quiz=await f.core.hanziQuizzes.get(f.dad,f.child.id,quiz.id);assert.equal(quiz.answered_count,1);assert.equal(quiz.first_unanswered,2);await assert.rejects(f.core.hanziQuizzes.submit(f.dad,'submit-no',f.child.id,quiz.id,{expected_version:quiz.version,...lease}),{code:'CONFIRM_UNANSWERED'});
  const takeover=await f.core.hanziQuizzes.resume(f.mom,'takeover',f.child.id,quiz.id,{expected_version:quiz.version,expected_session_id:lease.lease_id,confirmed:true},true);await assert.rejects(f.core.hanziQuizzes.answer(f.dad,'old-lease',f.child.id,quiz.id,items[1].id,{answer:items[1].options[0],expected_version:1,...lease}),{code:'SESSION_EXPIRED'});lease={lease_id:takeover.session.id,lease_generation:takeover.session.lease_generation};quiz=takeover.quiz;
  await assert.rejects(f.core.hanziQuizzes.heartbeat(f.dad,f.child.id,quiz.id,lease),{code:'SESSION_EXPIRED'});assert.equal((await f.core.hanziQuizzes.heartbeat(f.mom,f.child.id,quiz.id,lease)).ended,false);
  const result=await f.core.hanziQuizzes.submit(f.mom,'submit',f.child.id,quiz.id,{expected_version:quiz.version,confirm_unanswered:true,...lease});assert.equal(result.result.unanswered_count,3);assert.equal(result.answered_count,1);
  const repeated=await f.core.hanziQuizzes.submit(f.dad,'submit-again',f.child.id,quiz.id,{expected_version:quiz.version,...lease});assert.deepEqual(repeated.result,result.result);
  assert.equal((await f.pg.query("SELECT count(*)::int n FROM wordmate.hanzi_learning_events WHERE child_id=$1 AND kind='test'",[f.child.id])).rows[0].n,1);
  assert.equal((await f.core.hanziQuizzes.list(f.dad,f.child.id)).items[0].status,'submitted');assert.equal((await f.core.hanziMistakes(f.dad,f.child.id)).items.length,saved.correct?3:4);
  const calendar=await f.core.hanziCalendar(f.dad,f.child.id,month),today=calendar.days.find(x=>x.date===calendar.today);assert.equal(today.wrong_words,saved.correct?3:4);assert.equal(today.quiz_count,1);assert.equal(today.studied_words,4);
  for(let n=0;n<3;n++)await f.pg.query("INSERT INTO wordmate.hanzi_monthly_quizzes(child_id,created_by,month,timezone_snapshot,mode,eligible_count,status) VALUES($1,$2,$3,'Asia/Shanghai','full',4,'abandoned')",[f.child.id,f.dad,month+'-01']);
  const first=await f.core.hanziQuizzes.list(f.dad,f.child.id,{limit:2}),second=await f.core.hanziQuizzes.list(f.dad,f.child.id,{limit:2,cursor:first.next_cursor});assert.equal(first.items.length,2);assert.equal(second.items.length,2);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,4);assert.equal(second.next_cursor,null);
 }finally{await f.close();}
});
