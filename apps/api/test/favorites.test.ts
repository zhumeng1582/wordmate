import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
import {FixtureQuizBuilder,StoredMeaningQuizBuilder} from '../src/quiz.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
test('favorites share one annotation across list, review and a separately scoped quiz',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));
 const db={query:(s:string,p?:any[])=>pg.query(s,p),transaction:(fn:any)=>pg.transaction((q:any)=>fn({query:(s:string,p?:any[])=>q.query(s,p)}))},now=new Date(),month=new Date(now.getTime()+8*3600000).toISOString().slice(0,7),core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'favorite',()=>now);
 try{
  const actor=(await core.login('dev-dad')).user.id,other=(await core.login('dev-outsider')).user.id,family=await core.createFamily(actor,'family',{name:'家'}),child=await core.createChild(actor,'child',family.id,{nickname:'孩子'}),book=await core.createWordbook(actor,'book',child.id,{name:'词本'}),batch=await core.createBatch(actor,'batch',child.id,{wordbook_id:book.id,words:['apple','book']});
  await core.confirmBatch(actor,'confirm',batch.id,{expected_version:batch.version,selections:batch.items.map((i:any)=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});
  const words=(await core.words(actor,child.id)).items,chosen=words[0];assert.equal((await core.wordAnnotations(actor,chosen.id)).favorite,false);await assert.rejects(core.wordAnnotations(other,chosen.id),{code:'FAMILY_NOT_FOUND'});
  const mark=await core.patchWordAnnotations(actor,'star',chosen.id,{expected_version:0,favorite:true});assert.equal(mark.favorite,true);assert.equal((await core.wordAnnotations(actor,chosen.id)).version,1);assert.equal((await core.words(actor,child.id,{mark:'favorite'})).total,1);
  const session=await core.startSession(actor,'review-favorites',child.id,{source:'favorites'});assert.equal(session.total,1);assert.equal((await core.cards(actor,session.id)).items[0].child_word_id,chosen.id);await core.heartbeat(actor,session.id,{lease_generation:session.lease_generation},true);
  assert.equal((await core.quizzes.preview(actor,child.id,month)).eligible_count,0);assert.equal((await core.quizzes.preview(actor,child.id,month,'favorites')).eligible_count,1);
  let quiz=await core.quizzes.create(actor,'favorite-quiz',child.id,{month,scope:'favorites',mode:'full'});assert.equal(quiz.scope,'favorites');assert.equal(quiz.total_count,1);await core.quizzes.prepare(new FixtureQuizBuilder());quiz=await core.quizzes.get(actor,quiz.id);assert.equal(quiz.status,'ready');assert.equal((await core.quizzes.items(actor,quiz.id,{})).items[0].word.id,chosen.id);
  await core.patchWordAnnotations(actor,'unstar',chosen.id,{expected_version:1,favorite:false});assert.equal((await core.words(actor,child.id,{mark:'favorite'})).total,0);assert.equal((await core.quizzes.items(actor,quiz.id,{})).items.length,1,'active quiz keeps its original question snapshot');
 }finally{await pg.close();}
});
test('shared vocabulary can be used for favorite quiz questions without a model call',()=>{
 const question=new StoredMeaningQuizBuilder().build({lemma:'journey',meaning_zh:'旅程',dictionary_source:'shared'});
 assert.equal(question.options.length,4);assert(question.options.some(option=>option.id===question.correctId&&option.text==='旅程'));
});
