import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
test('public wordbooks publish, search, copy examples, preserve independent progress and stop safely',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/022_shared_wordbook_author.sql','utf8'));
 const db={query:(s:string,p?:any[])=>pg.query(s,p),transaction:(fn:any)=>pg.transaction((q:any)=>fn({query:(s:string,p?:any[])=>q.query(s,p)}))},scheduler=await createScheduler(),core=new Core(db,new DevIdentity(),new FixtureDictionary(),scheduler,'sharing');
 try{
  const dad=(await core.login('dev-dad')).user.id,mom=(await core.login('dev-mom')).user.id;
  const family=await core.createFamily(dad,'family',{name:'家庭'}),child=await core.createChild(dad,'child',family.id,{nickname:'孩子'}),book=await core.createWordbook(dad,'book',child.id,{name:'旅行词本',grade:'三年级',textbook:'人教版',category:'旅行'});
  const batch=await core.createBatch(dad,'batch',child.id,{wordbook_id:book.id,words:['apple','book']});await core.confirmBatch(dad,'confirm',batch.id,{expected_version:batch.version,selections:batch.items.map((i:any)=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});
  const words=(await core.words(dad,child.id,{wordbook_id:book.id})).items,apple=words.find((w:any)=>w.lemma==='apple');
  const sentence=(await pg.query("INSERT INTO wordmate.sentences(child_id,text_en,translation_zh,level,model,prompt_version,status) VALUES($1,'An apples is red.','苹果是红色的。','test','test','test','validated') RETURNING id",[child.id])).rows[0];await pg.query("INSERT INTO wordmate.sentence_targets(child_id,sentence_id,child_word_id,surface,start_utf16,end_utf16) VALUES($1,$2,$3,'apples',3,9)",[child.id,sentence.id,apple.id]);
  assert.equal((await core.searchSharedWordbooks(mom,{})).items.length,0);
  await assert.rejects(core.shareWordbook(mom,'unauthorized',child.id,book.id,{published:true,title:'词本',author:'作者'}),{code:'FAMILY_NOT_FOUND'});
  await assert.rejects(core.shareWordbook(dad,'no-author',child.id,book.id,{published:true,title:'词本'}),{code:'INVALID_TEXT'});
  const share=await core.shareWordbook(dad,'publish',child.id,book.id,{published:true,title:'旅行英语',description:'出行词汇',author:'小书屋'});assert.equal(share.word_count,2);
  assert.equal((await core.searchSharedWordbooks(dad,{child_id:child.id})).items[0].is_source,true);
  await assert.rejects(core.searchSharedWordbooks(mom,{child_id:child.id}),{code:'FAMILY_NOT_FOUND'});
  for(const q of ['旅行','小书屋','apple','三年级','人教版'])assert.equal((await core.searchSharedWordbooks(mom,{q})).items[0].id,share.id);assert.equal((await core.searchSharedWordbooks(mom,{grade:'三年级',textbook:'人教版',category:'旅行'})).items.length,1);assert.equal((await core.searchSharedWordbooks(mom,{grade:'四年级'})).items.length,0);
  const detail=await core.sharedWordbook(mom,share.id);assert.equal(detail.author,'小书屋');assert.equal(detail.items.find((x:any)=>x.lemma==='apple').example_en,'An apples is red.');assert(!JSON.stringify(detail).includes(child.id));
  const family2=await core.createFamily(mom,'other-family',{name:'另一个家庭'}),learner=await core.createChild(mom,'other-child',family2.id,{nickname:'另一个孩子'});
  assert.equal((await core.searchSharedWordbooks(mom,{child_id:learner.id})).items[0].is_source,false);
  const joined=await core.joinSharedWordbook(mom,'join',learner.id,share.id);assert.equal((await core.joinSharedWordbook(mom,'again',learner.id,share.id)).id,joined.id);
  const copy=await core.words(mom,learner.id,{wordbook_id:joined.id});assert.equal(copy.total,2);const joinedBook=(await core.wordbooks(mom,learner.id)).items.find((b:any)=>b.id===joined.id);assert.equal(joinedBook.grade,'三年级');assert.equal(joinedBook.textbook,'人教版');assert.equal(joinedBook.category,'旅行');assert.notEqual(copy.items.find((w:any)=>w.lemma==='apple').id,apple.id);assert.equal(copy.items.find((w:any)=>w.lemma==='apple').example.text_en,'An apples is red.');const copiedTarget=await pg.query('SELECT surface,start_utf16,end_utf16 FROM wordmate.sentence_targets WHERE child_word_id=$1',[copy.items.find((w:any)=>w.lemma==='apple').id]);assert.equal(copiedTarget.rows[0].surface,'apples');assert.equal(copiedTarget.rows[0].end_utf16,9);
  await pg.query("UPDATE wordmate.review_cards SET state='review' WHERE child_id=$1 AND child_word_id=$2",[learner.id,copy.items[0].id]);
  await core.shareWordbook(dad,'stop',child.id,book.id,{published:false});assert.equal((await core.searchSharedWordbooks(mom,{})).items.length,0);await assert.rejects(core.sharedWordbook(mom,share.id),{code:'SHARED_WORDBOOK_NOT_FOUND'});await assert.rejects(core.joinSharedWordbook(mom,'join',learner.id,share.id),{code:'SHARED_WORDBOOK_NOT_FOUND'});assert.equal((await core.words(mom,learner.id,{wordbook_id:joined.id})).learned_count,1);
  await core.leaveSharedWordbook(mom,'leave',learner.id,share.id);await core.shareWordbook(dad,'republish',child.id,book.id,{published:true,title:'旅行英语',author:'小书屋',description:''});const rejoined=await core.joinSharedWordbook(mom,'rejoin',learner.id,share.id);assert.equal(rejoined.id,joined.id);assert.equal((await core.words(mom,learner.id,{wordbook_id:joined.id})).learned_count,1);
 }finally{await pg.close();}
});
