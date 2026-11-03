import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary} from '../src/providers.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
test('wordbook locates the next eligible word in learning order and reports each status across pages',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));
 const db={query:(s:string,p?:any[])=>pg.query(s,p),transaction:(fn:any)=>pg.transaction((q:any)=>fn({query:(s:string,p?:any[])=>q.query(s,p)}))};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),{} as any,'test');
 try{
  const actor=(await core.login('dev-dad')).user.id,family=await core.createFamily(actor,'family',{name:'家'}),child=await core.createChild(actor,'child',family.id,{nickname:'孩子'}),book=await core.createWordbook(actor,'book',child.id,{name:'词本'});
  await pg.query(`INSERT INTO wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source,created_at) SELECT $1,'word'||n,'word'||n,'n','sense','词','fixture',now()+n*interval '1 second' FROM generate_series(1,125) n`,[child.id]);
  await pg.query('INSERT INTO wordmate.wordbook_words(child_id,wordbook_id,child_word_id) SELECT child_id,$2,id FROM wordmate.child_words WHERE child_id=$1',[child.id,book.id]);
  await pg.query(`INSERT INTO wordmate.review_cards(child_id,child_word_id,scheduler_version,parameter_version,state,suspended_at) SELECT child_id,id,'test','test',CASE WHEN substring(lemma from 5)::int<=15 THEN 'review' ELSE 'new' END,CASE WHEN lemma='word16' THEN now() ELSE NULL END FROM wordmate.child_words WHERE child_id=$1`,[child.id]);
  const edited=await core.renameWordbook(actor,'edit',child.id,book.id,{name:'分类词本',grade:'三年级',textbook:'人教版',category:'阅读',expected_version:book.version});assert.equal(edited.grade,'三年级');const oldClient=await core.renameWordbook(actor,'old-edit',child.id,book.id,{name:'分类词本2',expected_version:edited.version});assert.equal(oldClient.textbook,'人教版');assert.equal(oldClient.category,'阅读');
  const first=await core.words(actor,child.id,{wordbook_id:book.id,limit:10});assert.equal(first.learned_count,15);assert.equal(first.items[0].lemma,'word125');assert.equal(first.items[0].learning_status,'new');assert.ok(first.first_unlearned_cursor);
  const next=await core.words(actor,child.id,{wordbook_id:book.id,limit:10,cursor:first.first_unlearned_cursor});const target=next.items.find((w:any)=>w.id===first.first_unlearned_id);assert.equal(target.lemma,'word17');assert.equal(target.learning_status,'new');assert.equal(next.items.find((w:any)=>w.lemma==='word16').learning_status,'paused');const after=await core.words(actor,child.id,{wordbook_id:book.id,limit:10,cursor:next.next_cursor});assert.equal(after.items.find((w:any)=>w.lemma==='word15').learning_status,'learned');
  await pg.query("UPDATE wordmate.review_cards SET state='review' WHERE child_id=$1 AND suspended_at IS NULL",[child.id]);const done=await core.words(actor,child.id,{wordbook_id:book.id,limit:10});assert.equal(done.first_unlearned_id,null);
 }finally{await pg.close();}
});
