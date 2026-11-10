import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fixture} from './ai-fixture.ts';

test('archives hide and restore all three libraries without losing learning state',async()=>{
 const f=await fixture();try{
  for(const name of ['034_poems.sql','035_poem_fields.sql','040_hanzi.sql','041_hanzi_order.sql','043_library_archive.sql'])await f.pg.exec(readFileSync(`apps/api/migrations/${name}`,'utf8'));
  const poem=await f.core.poems.create(f.dad,randomUUID(),f.child.id,{title:'春晓',body:'春眠不觉晓。'});
  const memorized=await f.core.poems.mark(f.dad,f.child.id,poem.id,{memorized:true,expected_version:poem.version});
  const archivedPoem=await f.core.poems.archive(f.dad,f.child.id,poem.id,{archived:true,expected_version:memorized.version});
  assert.equal((await f.core.poems.list(f.dad,f.child.id,0)).total,0);
  assert.equal((await f.core.poems.list(f.dad,f.child.id,0,'all','','all')).items.length,1);
  await assert.rejects(f.core.poems.archive(f.mom,f.child.id,poem.id,{archived:false,expected_version:archivedPoem.version}),{code:'FAMILY_NOT_FOUND'});
  const restoredPoem=await f.core.poems.archive(f.dad,f.child.id,poem.id,{archived:false,expected_version:archivedPoem.version});assert(restoredPoem.memorized_at);
  const character=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:'春'});
  const learned=await f.core.hanzi.mark(f.dad,f.child.id,character.id,{learned:true,expected_version:character.version});
  const archivedCharacter=await f.core.hanzi.archive(f.dad,f.child.id,character.id,{archived:true,expected_version:learned.version});
  assert.equal((await f.core.hanzi.list(f.dad,f.child.id)).items.length,0);assert.equal((await f.core.hanzi.list(f.dad,f.child.id,'all','','all')).items.length,1);
  assert((await f.core.hanzi.archive(f.dad,f.child.id,character.id,{archived:false,expected_version:archivedCharacter.version})).learned_at);
  const batch=await f.core.createBatch(f.dad,randomUUID(),f.child.id,{wordbook_id:f.book.id,words:['apple']});await f.core.confirmBatch(f.dad,randomUUID(),batch.id,{expected_version:1,selections:batch.items.map((item:any)=>({item_id:item.id,action:'select',candidate_id:item.candidates[0].candidate_id}))});
  const word=(await f.core.words(f.dad,f.child.id)).items[0];const archivedWord=await f.core.archiveWord(f.dad,f.child.id,word.id,{archived:true,expected_version:word.version});
  assert.equal((await f.core.words(f.dad,f.child.id)).items.length,0);assert.equal((await f.core.words(f.dad,f.child.id,{archive:'all'})).items.length,1);assert.equal((await f.core.today(f.dad,f.child.id)).new_count,0);
  await assert.rejects(f.core.archiveWord(f.dad,f.child.id,word.id,{archived:false,expected_version:word.version}),{code:'WORD_CHANGED'});
  await f.core.archiveWord(f.dad,f.child.id,word.id,{archived:false,expected_version:archivedWord.version});assert.equal((await f.core.today(f.dad,f.child.id)).new_count,1);
 }finally{await f.close();}
});
