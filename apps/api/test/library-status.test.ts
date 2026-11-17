import {inflateSync} from 'node:zlib';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fixture,seedHanziLearning} from './ai-fixture.ts';
test('all three libraries expose disjoint states, exclude archives from learning and restore history',async()=>{
 const f=await fixture();try{
  for(const name of ['034_poems.sql','056_import_order.sql','035_poem_fields.sql','040_hanzi.sql','041_hanzi_order.sql'])await f.pg.exec(readFileSync(`apps/api/migrations/${name}`,'utf8'));
  await f.pg.exec(readFileSync('apps/api/migrations/043_library_archive.sql','utf8'));
  const batch=await f.core.createBatch(f.dad,randomUUID(),f.child.id,{wordbook_id:f.book.id,words:['apple','book','cat','dog']});await f.core.confirmBatch(f.dad,randomUUID(),batch.id,{expected_version:1,selections:batch.items.map((item:any)=>({item_id:item.id,action:'select',candidate_id:item.candidates[0].candidate_id}))});
  const words=(await f.core.words(f.dad,f.child.id)).items;
  await f.tx(async q=>{await q.query("UPDATE review_cards SET state='review',suspended_at=now() WHERE child_word_id=ANY($1::uuid[])",[[words[1].id,words[3].id]]);});
  for(const index of [2,3])await f.core.archiveWord(f.dad,f.child.id,words[index].id,{archived:true,expected_version:words[index].version});
  const characters=[] as any[],poems=[] as any[];
  for(let i=0;i<4;i++){
   let h=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:['春','夏','秋','冬'][i]});let p=await f.core.poems.create(f.dad,randomUUID(),f.child.id,{title:'诗'+i,body:'诗句'+i});
   if(i%2){h=await seedHanziLearning(f,h.id);p=await f.core.poems.mark(f.dad,f.child.id,p.id,{memorized:true,expected_version:p.version});}
   if(i>=2){h=await f.core.hanzi.archive(f.dad,f.child.id,h.id,{archived:true,expected_version:h.version});p=await f.core.poems.archive(f.dad,f.child.id,p.id,{archived:true,expected_version:p.version});}characters.push(h);poems.push(p);
  }
  const readers=[(status:string)=>f.core.words(f.dad,f.child.id,{status,archive:'all'}),(status:string)=>f.core.hanzi.list(f.dad,f.child.id,status,'','all'),(status:string)=>f.core.poems.list(f.dad,f.child.id,0,status,'','all')];
  for(const read of readers){const all=await read('all'),seen=new Set<string>();assert.equal(all.items.length,4);for(const [status,count] of [['unlearned',1],['learned',1],['archived',2]] as const){const page=await read(status);assert.equal(page.items.length,count);for(const row of page.items){assert.equal(row.library_status,status);assert(!seen.has(row.id));seen.add(row.id);}}assert.equal(seen.size,4);assert.equal((await read('all')).learned_count??(await read('all')).memorized_count,1);}
  assert.equal((await f.core.word(f.dad,f.child.id,words[0].id)).learning_status,'new');assert.equal((await f.core.word(f.dad,f.child.id,words[1].id)).learning_status,'learned');assert.equal((await f.core.word(f.dad,f.child.id,words[3].id)).learning_status,'learned');
  const progress=await f.core.words(f.dad,f.child.id);assert.equal(progress.book_total,2);assert.equal(progress.learned_count,1);assert.equal((await f.core.today(f.dad,f.child.id)).new_count,1);
  for(const read of readers){for(const status of ['all','unlearned','archived']){const page=await read(status);assert.equal(page.overall_total,4);assert.equal(page.overall_learned_count,3);}}
  const bookProgress=await f.core.words(f.dad,f.child.id,{wordbook_id:f.book.id,limit:1});assert.equal(bookProgress.overall_total,4);assert.equal(bookProgress.overall_learned_count,3);
  for(const read of readers){
   for(const [status,count] of [['unlearned,learned',2],['unlearned,archived',3],['learned,archived',3],['unlearned,learned,archived',4]] as const){
    const page=await read(status);assert.equal(page.items.length,count);assert.equal(new Set(page.items.map((item:any)=>item.id)).size,count);
    assert(page.items.every((item:any)=>status.split(',').includes(item.library_status)));
   }
   for(const status of ['',',','all,archived','learned,learned','unlearned,other',"learned') OR TRUE --"]){await assert.rejects(read(status),{code:'INVALID_REQUEST_BODY'});}
  }
  for(const status of ['unlearned,archived','learned,archived','unlearned,learned,archived']){
   const seen=new Set<string>();let cursor:string|undefined;
   do{const page=await f.core.words(f.dad,f.child.id,{status,limit:1,...(cursor?{cursor}:{})});for(const item of page.items){assert(!seen.has(item.id));seen.add(item.id);assert(status.split(',').includes(item.library_status));}cursor=page.next_cursor??undefined;}while(cursor);
   assert.equal(seen.size,status.split(',').length===3?4:3);
   const exported=await f.core.exportWords(f.dad,f.child.id,{all:true,wordbook_id:f.book.id,status});assert.equal(exported.count,seen.size);
  }
  for(const status of ['unlearned,archived','unlearned,learned,archived']){
   const wordStart=await f.core.words(f.dad,f.child.id,{status,limit:1});
   const wordTarget=await f.core.words(f.dad,f.child.id,{status,limit:1,...(wordStart.first_unlearned_cursor?{cursor:wordStart.first_unlearned_cursor}:{})});
   assert(wordTarget.items.some((item:any)=>item.id===wordStart.first_unlearned_id));
   const hanziStart=await f.core.hanzi.list(f.dad,f.child.id,status,'','all',undefined,{limit:1});
   const hanziTarget=await f.core.hanzi.list(f.dad,f.child.id,status,'','all',undefined,{limit:1,...(hanziStart.first_unlearned_cursor?{cursor:hanziStart.first_unlearned_cursor}:{})});
   assert(hanziTarget.items.some((item:any)=>item.id===hanziStart.first_unlearned_id));
  }
  assert.equal((await f.core.poems.list(f.dad,f.child.id,0,'memorized','','all')).items.length,1);
  await assert.rejects(f.core.hanzi.mark(f.dad,f.child.id,characters[3].id,{learned:false,expected_version:characters[3].version}),{code:'HANZI_LEARNING_FLOW_REQUIRED'});
  await assert.rejects(f.core.poems.mark(f.dad,f.child.id,poems[3].id,{memorized:false,expected_version:poems[3].version}),{code:'LIBRARY_ITEM_ARCHIVED'});
  assert((await f.core.hanzi.archive(f.dad,f.child.id,characters[3].id,{archived:false,expected_version:characters[3].version})).learned_at);assert((await f.core.poems.archive(f.dad,f.child.id,poems[3].id,{archived:false,expected_version:poems[3].version})).memorized_at);
  assert.equal((await f.core.hanzi.list(f.dad,f.child.id,'learned')).items.length,2);assert.equal((await f.core.poems.list(f.dad,f.child.id,0,'learned')).items.length,2);
  const exported=await f.core.exportWords(f.dad,f.child.id,{all:true,wordbook_id:f.book.id,status:'learned'});assert.equal(exported.count,1);const bytes=Buffer.from(exported.base64,'base64'),source=bytes.toString('latin1');let text='';for(const m of source.matchAll(/<< \/Filter \/FlateDecode \/Length (\d+) >>\nstream\n/g)){const start=m.index!+m[0].length,stream=inflateSync(bytes.subarray(start,start+Number(m[1]))).toString('ascii');for(const value of stream.matchAll(/<([0-9A-F]+)> Tj/g))text+=Buffer.from(value[1],'hex').swap16().toString('utf16le');}assert(text.includes(words[1].lemma));assert(!text.includes(words[0].lemma));
  // Cancelling mastery preserves learning history. Only never-started items
  // leave the learned total when their mastery mark is removed.
  for(const read of readers)assert.equal((await read('all')).overall_learned_count,3);
  await f.core.archiveWord(f.dad,f.child.id,words[2].id,{archived:false,expected_version:words[2].version+1});
  await f.core.hanzi.archive(f.dad,f.child.id,characters[2].id,{archived:false,expected_version:characters[2].version});
  await f.core.poems.archive(f.dad,f.child.id,poems[2].id,{archived:false,expected_version:poems[2].version});
  for(const read of readers){const page=await read('all');assert.equal(page.overall_learned_count,2);assert.equal(page.overall_total,4);}
 }finally{await f.close();}
});
