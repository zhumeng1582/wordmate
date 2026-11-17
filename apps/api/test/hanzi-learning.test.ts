import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fixture,seedHanziLearning} from './ai-fixture.ts';

test('character progress counts distinct completed characters and freezes today goal',async()=>{
 const f=await fixture();try{
  for(const name of ['040_hanzi.sql','041_hanzi_order.sql','043_library_archive.sql','045_hanzi_learning.sql','046_hanzi_review_cards.sql','047_hanzi_monthly_quizzes.sql','048_hanzi_quiz_lease.sql','049_hanzi_makeup.sql'])await f.pg.exec(readFileSync(`apps/api/migrations/${name}`,'utf8'));
  const a=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:'春'}),b=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:'夏'});
  let progress=await f.core.hanziProgress(f.dad,f.child.id);assert.equal(progress.daily_goal,10);assert.equal(progress.version,0);
  progress=await f.core.setHanziGoal(f.dad,randomUUID(),f.child.id,{daily_goal:2,expected_version:0});assert.equal(progress.goal,2);
  const event={event_id:randomUUID(),hanzi_id:a.id,kind:'learn'};
  progress=await f.core.recordHanziLearning(f.dad,f.child.id,event);assert.equal(progress.completed,1);
  await f.core.recordHanziLearning(f.dad,f.child.id,event);
  await f.core.recordHanziLearning(f.dad,f.child.id,{event_id:randomUUID(),hanzi_id:a.id,kind:'test',correct:false});
  progress=await f.core.setHanziGoal(f.dad,randomUUID(),f.child.id,{daily_goal:5,expected_version:1});assert.equal(progress.goal,2);assert.equal(progress.completed,1);
  await seedHanziLearning(f,b.id);assert((await f.core.hanziDue(f.dad,f.child.id)).items.some(x=>x.id===b.id));
  const review={event_id:randomUUID(),hanzi_id:b.id,kind:'review',correct:false};progress=await f.core.recordHanziLearning(f.dad,f.child.id,review);assert.equal(progress.completed,2);assert.equal(progress.checked_in,true);assert.equal(progress.total_days,1);assert.equal(progress.streak_days,1);assert(!(await f.core.hanziDue(f.dad,f.child.id)).items.some(x=>x.id===b.id));
  let mistakes=(await f.core.hanziMistakes(f.dad,f.child.id)).items;assert.equal(mistakes.length,2);assert.equal(mistakes.find(x=>x.id===b.id).wrong_count,1);
  const before=(await f.pg.query('SELECT version FROM wordmate.hanzi_review_cards WHERE hanzi_id=$1',[b.id])).rows[0].version;await f.core.recordHanziLearning(f.dad,f.child.id,review);assert.equal((await f.pg.query('SELECT version FROM wordmate.hanzi_review_cards WHERE hanzi_id=$1',[b.id])).rows[0].version,before);
  mistakes=(await f.core.hanziMistakes(f.dad,f.child.id)).items;assert.equal(mistakes.find(x=>x.id===b.id).wrong_count,1);const wrongFirst=await f.core.hanziMistakes(f.dad,f.child.id,undefined,{limit:1}),wrongSecond=await f.core.hanziMistakes(f.dad,f.child.id,undefined,{limit:1,cursor:wrongFirst.next_cursor});assert.equal(wrongFirst.items.length,1);assert.equal(wrongSecond.items.length,1);assert.notEqual(wrongFirst.items[0].id,wrongSecond.items[0].id);assert.equal(wrongSecond.next_cursor,null);assert.equal((await f.core.hanziMistakes(f.dad,f.child.id,undefined,{limit:1,q:'春'})).items[0].id,a.id);await assert.rejects(f.core.hanziMistakes(f.mom,f.child.id),{code:'FAMILY_NOT_FOUND'});
  await f.core.hanzi.delete(f.dad,f.child.id,b.id);progress=await f.core.hanziProgress(f.dad,f.child.id);assert.equal(progress.completed,2);
  await assert.rejects(f.core.recordHanziLearning(f.dad,f.child.id,{...event,hanzi_id:b.id}),{code:'EVENT_CONFLICT'});
  await assert.rejects(f.core.hanziProgress(f.mom,f.child.id),{code:'FAMILY_NOT_FOUND'});
 }finally{await f.close();}
});

test('character learning calendar and makeup use real study milestones without inventing study',async()=>{
 const f=await fixture();try{
  for(const name of ['040_hanzi.sql','041_hanzi_order.sql','043_library_archive.sql','045_hanzi_learning.sql','046_hanzi_review_cards.sql','047_hanzi_monthly_quizzes.sql','048_hanzi_quiz_lease.sql','049_hanzi_makeup.sql'])await f.pg.exec(readFileSync(`apps/api/migrations/${name}`,'utf8'));
  const h=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:'春'}),initial=await f.core.hanziProgress(f.dad,f.child.id);await f.core.setHanziGoal(f.dad,randomUUID(),f.child.id,{daily_goal:1,expected_version:0});
  for(let n=1;n<=14;n++){await f.pg.query("INSERT INTO wordmate.hanzi_daily_activity(child_id,local_date,goal_snapshot,timezone_snapshot) VALUES($1,$2::date-$3::integer,1,'Asia/Shanghai')",[f.child.id,initial.date,n]);await f.pg.query("INSERT INTO wordmate.hanzi_learning_events(event_id,child_id,hanzi_id,actor_id,local_date,kind) VALUES($1,$2,$3,$4,$5::date-$6::integer,'review')",[randomUUID(),f.child.id,h.id,f.dad,initial.date,n]);}
  let state=await f.core.recordHanziLearning(f.dad,f.child.id,{event_id:randomUUID(),hanzi_id:h.id,kind:'learn'});assert.equal(state.streak_days,15);assert.equal(state.makeup_credits,1);
  const missing=new Date(Date.parse(initial.date+'T00:00:00Z')-15*86400000).toISOString().slice(0,10),key=randomUUID();state=await f.core.useHanziMakeup(f.dad,key,f.child.id,{date:missing});assert.equal(state.streak_days,16);assert.equal(state.makeup_credits,0);assert.deepEqual(await f.core.useHanziMakeup(f.dad,key,f.child.id,{date:missing}),state);
  const calendar=await f.core.hanziCalendar(f.dad,f.child.id,missing.slice(0,7)),day=calendar.days.find(x=>x.date===missing);assert.equal(day.makeup,true);assert.equal(day.studied_words,0);
  const range=await f.core.hanziHistoryRange(f.dad,f.child.id,{date:initial.date});assert.equal(range.count,1);assert.equal(range.items[0].id,h.id);
  await assert.rejects(f.core.useHanziMakeup(f.dad,randomUUID(),f.child.id,{date:new Date(Date.parse(initial.date+'T00:00:00Z')+86400000).toISOString().slice(0,10)}),{code:'MAKEUP_DATE_NOT_PAST'});await assert.rejects(f.core.useHanziMakeup(f.dad,randomUUID(),f.child.id,{date:initial.date}),{code:'MAKEUP_DATE_NOT_PAST'});await assert.rejects(f.core.hanziCalendar(f.mom,f.child.id),{code:'FAMILY_NOT_FOUND'});
 }finally{await f.close();}
});

test('makeup migration preserves previously earned character streak milestones',async()=>{
 const f=await fixture();try{
  for(const name of ['040_hanzi.sql','041_hanzi_order.sql','043_library_archive.sql','045_hanzi_learning.sql','046_hanzi_review_cards.sql','047_hanzi_monthly_quizzes.sql','048_hanzi_quiz_lease.sql'])await f.pg.exec(readFileSync(`apps/api/migrations/${name}`,'utf8'));
  const h=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:'春'});
  for(let n=0;n<30;n++){await f.pg.query("INSERT INTO wordmate.hanzi_daily_activity(child_id,local_date,goal_snapshot,timezone_snapshot) VALUES($1,DATE '2025-01-01'+$2::integer,1,'Asia/Shanghai')",[f.child.id,n]);await f.pg.query("INSERT INTO wordmate.hanzi_learning_events(event_id,child_id,hanzi_id,actor_id,local_date,kind) VALUES($1,$2,$3,$4,DATE '2025-01-01'+$5::integer,'review')",[randomUUID(),f.child.id,h.id,f.dad,n]);}
  const migration=readFileSync('apps/api/migrations/049_hanzi_makeup.sql','utf8');await f.pg.exec(migration);await f.pg.exec(migration);
  const rows=(await f.pg.query('SELECT milestone_days FROM wordmate.hanzi_makeup_credits WHERE child_id=$1 ORDER BY milestone_days',[f.child.id])).rows;assert.deepEqual(rows.map(x=>x.milestone_days),[15,30]);
 }finally{await f.close();}
});
