// Test data represents pre-release records; public creation is deliberately unavailable in Core.
import type {Database,Scheduler} from '../src/ports.ts';
export async function seedLegacyPublishedBook(db:Database,actor:string,child:string,book:string){
 return db.transaction(async q=>{
  const shared=(await q.query(`INSERT INTO wordmate.shared_wordbooks(source_wordbook_id,source_child_id,publisher_user_id,title,published,word_count) SELECT id,child_id,$1,name,true,(SELECT count(*) FROM wordmate.wordbook_words WHERE wordbook_id=$2) FROM wordmate.wordbooks WHERE id=$2 RETURNING *`,[actor,book])).rows[0];
  await q.query(`INSERT INTO wordmate.shared_wordbook_items(shared_wordbook_id,ordinal,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,ipa_gb,ipa_us) SELECT $1,row_number() OVER(ORDER BY w.id),w.lemma,w.normalized_lemma,w.part_of_speech,w.sense_key,w.meaning_zh,w.ipa_gb,w.ipa_us FROM wordmate.wordbook_words x JOIN wordmate.child_words w ON w.id=x.child_word_id WHERE x.wordbook_id=$2 AND w.child_id=$3`,[shared.id,book,child]);
  return shared;
 });
}
export async function seedLegacySubscription(db:Database,scheduler:Scheduler,actor:string,child:string,shared:string){
 return db.transaction(async q=>{
  const source=(await q.query('SELECT * FROM wordmate.shared_wordbooks WHERE id=$1',[shared])).rows[0];
  const book=(await q.query(`INSERT INTO wordmate.wordbooks(child_id,name,created_by,shared_source_id,shared_source_version,read_only) VALUES($1,$2,$3,$4,$5,true) RETURNING *`,[child,source.title,actor,shared,source.version])).rows[0];
  await q.query('INSERT INTO wordmate.shared_wordbook_subscriptions(shared_wordbook_id,child_id,local_wordbook_id,shared_version,joined_by) VALUES($1,$2,$3,$4,$5)',[shared,child,book.id,source.version,actor]);
  const items=(await q.query('SELECT * FROM wordmate.shared_wordbook_items WHERE shared_wordbook_id=$1',[shared])).rows;
  for(const i of items){
   const w=(await q.query(`INSERT INTO wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source,ipa_gb,ipa_us,created_by) VALUES($1,$2,$3,$4,$5,$6,'ai:shared',$7,$8,$9) RETURNING id`,[child,i.lemma,i.normalized_lemma,i.part_of_speech,i.sense_key,i.meaning_zh,i.ipa_gb,i.ipa_us,actor])).rows[0];
   await q.query('INSERT INTO wordmate.wordbook_words(child_id,wordbook_id,child_word_id) VALUES($1,$2,$3)',[child,book.id,w.id]);
   await q.query('INSERT INTO wordmate.review_cards(child_id,child_word_id,scheduler_state,scheduler_version,parameter_version,due_at) VALUES($1,$2,$3,$4,$5,$6)',[child,w.id,JSON.stringify(scheduler.empty(new Date())),scheduler.version,scheduler.parameterVersion,new Date()]);
  }
  return book;
 });
}
