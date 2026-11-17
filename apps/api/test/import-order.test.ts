import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fixture,response,vocabItem} from './ai-fixture.ts';
async function setup(){const f=await fixture(async()=>response({items:['zebra','apple','cat'].map(vocabItem)}));for(const n of ['024_textbook_sources.sql','025_new_sailing.sql','026_textbook_volumes.sql','028_word_tutor.sql','029_tutor_learning.sql',...readdirSync('apps/api/migrations').filter(n=>/^0(3[4-9]|[45]\d)_/.test(n)).sort()])await f.pg.exec(readFileSync('apps/api/migrations/'+n,'utf8'));return f;}
const poem=(title:string,body:string)=>({title,body,author:'李白',dynasty:'唐',annotations:'注释',translation:'译文'});
async function ready(f:any,book:string,items:any[]){const id=randomUUID();await f.core.poemImports.create(f.dad,f.child.id,{id,book_id:book,raw_text:items.map(x=>x.title+'\n'+x.body).join('\n')});await f.pg.query("UPDATE wordmate.poem_import_jobs SET status='ready',results=$2::jsonb WHERE id=$1",[id,JSON.stringify([{items,incomplete:false}])]);return id;}
test('poem save deduplicates same-batch, punctuation variants and retries while retaining book source order',async()=>{const f=await setup();try{
 const a=poem('静夜思','床前明月光，疑是地上霜。'),b=poem('早发白帝城','朝辞白帝彩云间。'),c=poem('赠汪伦','李白乘舟将欲行。');
 const existing=await f.core.poems.create(f.dad,randomUUID(),f.child.id,a);await f.core.poems.mark(f.dad,f.child.id,existing.id,{memorized:true,expected_version:existing.version});
 const book=await f.core.poems.books.create(f.dad,randomUUID(),f.child.id,{name:'顺序诗本'}),id=await ready(f,book.id,[b,a,c]);
 const input={items:[b,a,{...a,title:'《静夜思》',body:'床前明月光\n疑是地上霜'},c]};
 const saved=await f.core.poemImports.save(f.dad,f.child.id,id,input);assert.equal(saved.saved_count,2);assert.equal(saved.skipped_count,2);assert.deepEqual(await f.core.poemImports.save(f.dad,f.child.id,id,input),saved);
 const listed=await f.core.poems.list(f.dad,f.child.id,0,'all','','all',book.id);assert.deepEqual(listed.items.map((x:any)=>x.title),[b.title,a.title,c.title]);assert(listed.items[1].memorized_at);
 const d=poem('new poem','new body');const overlapBook=await f.core.poems.books.create(f.dad,randomUUID(),f.child.id,{name:'overlap'});const overlap=await ready(f,overlapBook.id,[b,b,b,d,a]);await f.core.poemImports.save(f.dad,f.child.id,overlap,{items:[b,d,a]});assert.deepEqual((await f.core.poems.list(f.dad,f.child.id,0,'all','','all',overlapBook.id)).items.map((x:any)=>x.title),[b.title,d.title,a.title]);
 const retry=await ready(f,book.id,[b,a,c]);assert.equal((await f.core.poemImports.save(f.dad,f.child.id,retry,{items:[b,a,c]})).saved_count,0);assert.equal((await f.core.poems.list(f.dad,f.child.id,0,'all','','all',book.id)).overall_total,3);
 const shared=await f.core.poems.books.share(f.dad,randomUUID(),f.child.id,book.id,{published:true,author:'家长'});assert.deepEqual((await f.core.poems.books.shared(f.dad,shared.id)).items.map((x:any)=>x.title),[b.title,a.title,c.title]);
}finally{await f.close();}});
test('hanzi book order is independent of existing character order and duplicate imports preserve learning',async()=>{const f=await setup();try{
 await f.core.hanzi.importCharacters(f.dad,randomUUID(),f.child.id,['人','地','天']);const all=await f.core.hanzi.list(f.dad,f.child.id);const old=all.items.find((x:any)=>x.character==='天');await f.pg.query('UPDATE wordmate.hanzi SET learned_at=now(),important=true WHERE id=$1',[old.id]);
 const book=await f.core.hanzi.createBook(f.dad,randomUUID(),f.child.id,{name:'新字本'});const saved=await f.core.hanzi.importCharacters(f.dad,randomUUID(),f.child.id,['天','地','天','人','山'],undefined,book.id);assert.equal(saved.added_count??saved.added,1);
 const first=await f.core.hanzi.list(f.dad,f.child.id,'all','','all',book.id,{limit:2}),next=await f.core.hanzi.list(f.dad,f.child.id,'all','','all',book.id,{limit:2,cursor:first.next_cursor});assert.deepEqual([...first.items,...next.items].map((x:any)=>x.character),['天','地','人','山']);assert(first.items[0].learned_at);assert(first.items[0].important);
 await f.core.hanzi.importCharacters(f.dad,randomUUID(),f.child.id,['山','天'],undefined,book.id);assert.deepEqual((await f.core.hanzi.list(f.dad,f.child.id,'all','','all',book.id)).items.map((x:any)=>x.character),['天','地','人','山']);
 const share=await f.core.hanzi.shareBook(f.dad,randomUUID(),f.child.id,book.id,{published:true,author:'家长'});assert.deepEqual((await f.core.hanzi.shared(f.dad,share.id)).items.map((x:any)=>x.character),['天','地','人','山']);
}finally{await f.close();}});
test('word confirmation order and pagination follow source ordinals and repeated imports do not duplicate words or examples',async()=>{const f=await setup();try{
 const create=()=>f.core.vocabulary.create(f.dad,randomUUID(),f.child.id,{wordbook_id:f.book.id,words:['zebra','apple','cat'],review_before_save:true});
 const job=await create();await f.core.vocabulary.processOne();let candidates=await f.core.vocabulary.candidates(f.dad,job.id);assert.equal(candidates.items.length,3);
 await f.core.vocabulary.confirmCandidates(f.dad,randomUUID(),job.id,{decisions:[...candidates.items].reverse().map((x:any)=>({item_id:x.id,selected:true}))});
 const first=await f.core.words(f.dad,f.child.id,{wordbook_id:f.book.id,limit:2}),next=await f.core.words(f.dad,f.child.id,{wordbook_id:f.book.id,limit:2,cursor:first.next_cursor});assert.deepEqual([...first.items,...next.items].map((x:any)=>x.lemma),['zebra','apple','cat']);
 const again=await create();await f.core.vocabulary.processOne();candidates=await f.core.vocabulary.candidates(f.dad,again.id);await f.core.vocabulary.confirmCandidates(f.dad,randomUUID(),again.id,{decisions:candidates.items.map((x:any)=>({item_id:x.id,selected:true}))});
 assert.equal((await f.core.words(f.dad,f.child.id,{wordbook_id:f.book.id})).total,3);assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.sentences')).rows[0].n,3);assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.review_cards')).rows[0].n,3);
}finally{await f.close();}});
test('multi-chunk prepared vocabulary and shared copies retain source order even when words already exist',async()=>{const f=await setup();try{
 const words=Array.from({length:35},(_,i)=>'word'+String.fromCharCode(97+Math.floor(i/26))+String.fromCharCode(97+i%26));
 const job=await f.core.vocabulary.create(f.dad,randomUUID(),f.child.id,{wordbook_id:f.book.id,source_type:'vision',raw_text:words.join('\n'),prepared_items:words.map(vocabItem)});
 await f.core.vocabulary.processOne();await f.core.vocabulary.processOne();assert.equal((await f.core.vocabulary.get(f.dad,job.id)).saved_count,35);
 assert.deepEqual((await f.core.words(f.dad,f.child.id,{wordbook_id:f.book.id,limit:50})).items.map((x:any)=>x.lemma),words);
 const share=await f.core.shareWordbook(f.dad,randomUUID(),f.child.id,f.book.id,{published:true,title:'顺序词本',author:'家长'});
 const child=await f.core.createChild(f.dad,randomUUID(),f.family.id,{nickname:'弟弟'});const prior=[words[1],words[0]];await f.core.vocabulary.create(f.dad,randomUUID(),child.id,{wordbook_id:(await f.core.createWordbook(f.dad,randomUUID(),child.id,{name:'已有词本'})).id,source_type:'vision',raw_text:prior.join('\n'),prepared_items:prior.map(vocabItem)});await f.core.vocabulary.processOne();const local=await f.core.joinSharedWordbook(f.dad,randomUUID(),child.id,share.id);
 assert.deepEqual((await f.core.words(f.dad,child.id,{wordbook_id:local.id,limit:50})).items.map((x:any)=>x.lemma),words);
 const before=await f.pg.query('SELECT order_key::text FROM wordmate.wordbook_words ORDER BY child_id,wordbook_id,child_word_id');await f.pg.exec(readFileSync('apps/api/migrations/056_import_order.sql','utf8'));const after=await f.pg.query('SELECT order_key::text FROM wordmate.wordbook_words ORDER BY child_id,wordbook_id,child_word_id');assert.deepEqual(after.rows,before.rows);
}finally{await f.close();}});
test('new word and poem batches prepend without reversing source order or moving duplicates',async()=>{const f=await setup();try{
 const old=await f.core.poems.create(f.dad,randomUUID(),f.child.id,poem('旧诗','旧的正文'));
 const book=(await f.core.poems.books.list(f.dad,f.child.id)).items[0];
 const a=poem('新诗甲','甲的正文'),b=poem('新诗乙','乙的正文'),job=await ready(f,book.id,[a,b]);await f.core.poemImports.save(f.dad,f.child.id,job,{items:[a,b]});
 const listed=await f.core.poems.list(f.dad,f.child.id,0,'all','','all',book.id);assert.deepEqual(listed.items.map((p:any)=>p.title),[a.title,b.title,old.title]);
 const prior=await f.pg.query('SELECT id,order_key::text,version FROM wordmate.poems ORDER BY id');const again=await ready(f,book.id,[b,a]);await f.core.poemImports.save(f.dad,f.child.id,again,{items:[b,a]});assert.deepEqual((await f.pg.query('SELECT id,order_key::text,version FROM wordmate.poems ORDER BY id')).rows,prior.rows);
 const add=async(words:string[])=>{const job=await f.core.vocabulary.create(f.dad,randomUUID(),f.child.id,{wordbook_id:f.book.id,source_type:'vision',raw_text:words.join('\n'),prepared_items:words.map(vocabItem)});await f.core.vocabulary.processOne();return job;};await add(['oldword']);await add(['zebra','apple','cat']);assert.deepEqual((await f.core.words(f.dad,f.child.id,{wordbook_id:f.book.id,limit:2})).items.map((p:any)=>p.lemma),['zebra','apple']);const all=(await f.core.words(f.dad,f.child.id,{wordbook_id:f.book.id,limit:100})).items;assert.deepEqual(all.map((p:any)=>p.lemma),['zebra','apple','cat','oldword']);await add(['apple','zebra']);assert.deepEqual((await f.core.words(f.dad,f.child.id,{wordbook_id:f.book.id,limit:100})).items.map((p:any)=>p.lemma),all.map((p:any)=>p.lemma));
 }finally{await f.close();}});
