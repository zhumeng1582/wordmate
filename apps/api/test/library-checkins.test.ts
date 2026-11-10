import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fixture} from './ai-fixture.ts';

test('poem and character views count independently once a day and respect ownership',async()=>{
 const f=await fixture();try{
  for(const name of ['034_poems.sql','035_poem_fields.sql','040_hanzi.sql','041_hanzi_order.sql','043_library_archive.sql','044_library_checkins.sql'])await f.pg.exec(readFileSync(`apps/api/migrations/${name}`,'utf8'));
  const p=await f.core.poems.create(f.dad,randomUUID(),f.child.id,{title:'春晓',body:'春眠不觉晓。'}),h=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:'春'});
  await f.core.recordLibraryCheckin(f.dad,f.child.id,{kind:'poems',item_id:p.id});await f.core.recordLibraryCheckin(f.dad,f.child.id,{kind:'poems',item_id:p.id});
  let state=await f.core.libraryCheckins(f.dad,f.child.id);assert.deepEqual(state.poems,{total_days:1,checked_in:true});assert.deepEqual(state.hanzi,{total_days:0,checked_in:false});
  await f.core.recordLibraryCheckin(f.dad,f.child.id,{kind:'hanzi',item_id:h.id});state=await f.core.libraryCheckins(f.dad,f.child.id);assert.equal(state.hanzi.total_days,1);
  await f.pg.query("INSERT INTO wordmate.library_checkins(child_id,kind,local_date) VALUES($1,'hanzi',$2::date-1)",[f.child.id,state.date]);state=await f.core.libraryCheckins(f.dad,f.child.id);assert.equal(state.hanzi.total_days,2);assert.equal(state.poems.total_days,1);
  await assert.rejects(f.core.recordLibraryCheckin(f.mom,f.child.id,{kind:'poems',item_id:p.id}),{code:'FAMILY_NOT_FOUND'});await assert.rejects(f.core.recordLibraryCheckin(f.dad,f.child.id,{kind:'poems',item_id:h.id}),{code:'POEM_NOT_FOUND'});
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.daily_activity')).rows[0].n,0);
 }finally{await f.close();}
});
