import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
test('textbook unit can be joined, studied, removed and rejoined without losing progress',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/025_new_sailing.sql','utf8'));
 const db={query:(s:string,p?:any[])=>pg.query(s,p),transaction:(fn:any)=>pg.transaction((q:any)=>fn({query:(s:string,p?:any[])=>q.query(s,p)}))};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'textbooks');
 try{
  const actor=(await core.login('dev-dad')).user.id,other=(await core.login('dev-mom')).user.id;
  const family=await core.createFamily(actor,'family',{name:'家庭'}),child=await core.createChild(actor,'child',family.id,{nickname:'孩子'});
  const units=(await core.textbookUnits(actor,child.id)).items;assert.equal(units.length,20);assert.equal(units.reduce((n:number,u:any)=>n+u.word_count,0),147);
  await assert.rejects(core.joinTextbookUnit(other,'bad',child.id,units[0].id),{code:'FAMILY_NOT_FOUND'});
  const joined=await core.joinTextbookUnit(actor,'join',child.id,units[0].id);
  assert.equal((await core.joinTextbookUnit(actor,'again',child.id,units[0].id)).id,joined.id);
  const words=await core.words(actor,child.id,{wordbook_id:joined.id});assert.equal(words.total,10);assert(words.items.every((w:any)=>w.meaning_zh));
  const session=await core.startSession(actor,'learn',child.id,{source:'new_words'});assert((await core.cards(actor,session.id)).items.length>0);
  await core.heartbeat(actor,session.id,{lease_generation:session.lease_generation},true);
  await pg.query("UPDATE wordmate.review_cards SET state='review' WHERE child_id=$1 AND child_word_id=$2",[child.id,words.items[0].id]);
  await core.archiveWordbook(actor,'remove',child.id,joined.id);
  const rejoined=await core.joinTextbookUnit(actor,'rejoin',child.id,units[0].id);assert.equal(rejoined.id,joined.id);
  assert.equal((await core.words(actor,child.id,{wordbook_id:joined.id})).learned_count,1);
 }finally{await pg.close();}
});
test('one volume joins once and preserves words already learned in an older unit book',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/025_new_sailing.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/026_textbook_volumes.sql','utf8'));
 const db={query:(s:string,p?:any[])=>pg.query(s,p),transaction:(fn:any)=>pg.transaction((q:any)=>fn({query:(s:string,p?:any[])=>q.query(s,p)}))},core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'volumes');
 try{
  const actor=(await core.login('dev-dad')).user.id,other=(await core.login('dev-mom')).user.id,family=await core.createFamily(actor,'family2',{name:'家庭'}),child=await core.createChild(actor,'child2',family.id,{nickname:'孩子'});
  const volumes=(await core.textbookVolumes(actor,child.id)).items;assert.equal(volumes.length,4);assert(volumes.every((v:any)=>v.word_count>0));
  await assert.rejects(core.textbookVolumes(other,child.id),{code:'FAMILY_NOT_FOUND'});
  const old=await core.joinTextbookUnit(actor,'old',child.id,'new-sailing-1-a-1'),oldWords=await core.words(actor,child.id,{wordbook_id:old.id});
  await pg.query("UPDATE wordmate.review_cards SET state='review' WHERE child_id=$1 AND child_word_id=$2",[child.id,oldWords.items[0].id]);
  const volume=await core.joinTextbookVolume(actor,'volume',child.id,'new-sailing-1-a');assert.equal((await core.joinTextbookVolume(actor,'again',child.id,'new-sailing-1-a')).id,volume.id);
  const words=await core.words(actor,child.id,{wordbook_id:volume.id,limit:100});assert.equal(words.total,volumes[0].word_count);assert(words.items.some((w:any)=>w.id===oldWords.items[0].id));assert.equal(words.learned_count,1);
  assert.equal((await core.textbookVolumes(actor,child.id)).items[0].joined_book_id,volume.id);
  await core.archiveWordbook(actor,'remove-volume',child.id,volume.id);const rejoined=await core.joinTextbookVolume(actor,'rejoin-volume',child.id,'new-sailing-1-a');assert.equal(rejoined.id,volume.id);assert.equal((await core.words(actor,child.id,{wordbook_id:volume.id})).learned_count,1);
 }finally{await pg.close();}
});
test('user corrections replace only provided units and preserve unspecified second-grade units',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/025_new_sailing.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/026_textbook_volumes.sql','utf8'));
 try{
  const before=(await pg.query("SELECT lemma FROM wordmate.textbook_unit_words WHERE unit_id='new-sailing-2-b-2' ORDER BY ordinal")).rows;
  const sql=readFileSync('apps/api/migrations/027_textbook_corrections.sql','utf8');await pg.exec(sql);await pg.exec(sql);
  const supplied=JSON.parse(readFileSync('apps/api/data/textbooks/new-sailing-user-20261102.json','utf8'));
  for(const [unit,expected] of Object.entries(supplied)){const actual=(await pg.query('SELECT lemma FROM wordmate.textbook_unit_words WHERE unit_id=$1 ORDER BY ordinal',[unit])).rows.map((x:any)=>x.lemma);assert.deepEqual(actual,expected);}
  const first=(await pg.query("SELECT lemma FROM wordmate.textbook_unit_words WHERE unit_id='new-sailing-1-a-1' ORDER BY ordinal")).rows.map((x:any)=>x.lemma);assert.deepEqual(first,['hello','nice','to','meet','you','hi',"let's",'play','OK','be','friend','I','my','name']);
  const unchanged=(await pg.query("SELECT lemma FROM wordmate.textbook_unit_words WHERE unit_id='new-sailing-2-b-2' ORDER BY ordinal")).rows;assert.deepEqual(unchanged,before);
  const numbered=(await pg.query("SELECT lemma FROM wordmate.textbook_unit_words WHERE unit_id='new-sailing-1-b-4' ORDER BY ordinal LIMIT 6")).rows.map((x:any)=>x.lemma);assert.deepEqual(numbered,['seven','eight','nine','ten','eleven','twelve']);
 }finally{await pg.close();}
});
