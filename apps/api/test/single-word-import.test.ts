import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './ai-fixture.ts';
import {isSingleWord} from '../src/word-senses.ts';

test('word form accepts contractions and hyphenated words but not phrases',()=>{
 for(const s of ['nice',"can't",'mother-in-law','T-shirt','Mr.'])assert.equal(isSingleWord(s),true,s);
 for(const s of ['have a nice day','ice cream','hello world','你好',''])assert.equal(isSingleWord(s),false,s);
});
test('AI review and saved old candidates cannot import phrases',async()=>{
 const f=await fixture();try{
  const provider={provider:'test',model:'test',promptVersion:'test',rawPromptVersion:'raw',generate:async()=>({items:[]}),generateRaw:async()=>({error:null,items:[{input_index:0,input:'nice',status:'ok',lemma:'nice',part_of_speech:'adjective',meaning_zh:'美好的',sentence_en:'A nice day.',sentence_zh:'美好的一天。'}, {input_index:1,input:'have a nice day',status:'ok',lemma:'have a nice day',part_of_speech:'phrase',meaning_zh:'祝你愉快',sentence_en:'Have a nice day.',sentence_zh:'祝你今天愉快。'}]})};
  f.core.vocabulary=new (requireVocabulary())({tx:f.tx,child:(q:any,a:string,id:string)=>f.core.tutorChild(q,a,id),write:(...args:any[])=>(f.core as any).write(...args),now:()=>new Date(),day:async()=>''},(f.core as any).scheduler,provider);
  const job=await f.core.vocabulary.create(f.dad,randomUUID(),f.child.id,{wordbook_id:f.book.id,raw_text:'nice\nhave a nice day',review_before_save:true});await f.core.vocabulary.processOne();
  const state=await f.core.vocabulary.get(f.dad,job.id);assert.equal(state.items.find((x:any)=>x.input==='have a nice day').status,'invalid');assert.match(state.items.find((x:any)=>x.input==='have a nice day').reason,/短语/);assert.equal((await f.core.vocabulary.candidates(f.dad,job.id)).items.length,1);
  const candidate=(await f.core.vocabulary.candidates(f.dad,job.id)).items[0];await f.core.vocabulary.confirmCandidates(f.dad,randomUUID(),job.id,{decisions:[{item_id:candidate.id,selected:true}]});assert.deepEqual((await f.core.words(f.dad,f.child.id)).items.map((x:any)=>x.lemma),['nice']);
  const second=await f.core.vocabulary.create(f.dad,randomUUID(),f.child.id,{wordbook_id:f.book.id,raw_text:'nice\nhave a nice day',theme:'different',review_before_save:true});await f.core.vocabulary.processOne();const old=(await f.core.vocabulary.candidates(f.dad,second.id)).items[0];await f.pg.query("UPDATE wordmate.batch_items SET candidates=jsonb_set(candidates,'{0,lemma}',to_jsonb('have a nice day'::text)) WHERE id=$1",[old.id]);await f.core.vocabulary.confirmCandidates(f.dad,randomUUID(),second.id,{decisions:[{item_id:old.id,selected:true}]});const checked=await f.core.vocabulary.get(f.dad,second.id);assert.equal(checked.items.find((x:any)=>x.input==='nice').status,'invalid');assert.deepEqual((await f.core.words(f.dad,f.child.id)).items.map((x:any)=>x.lemma),['nice']);
 }finally{await f.close();}
});
import {createRequire} from 'node:module';
const requireVocabulary=()=>createRequire(import.meta.url)('../dist/vocabulary.js').Vocabulary;
