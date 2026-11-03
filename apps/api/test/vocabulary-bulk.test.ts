import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
import type {Database} from '../src/ports.ts';
import type {VocabularyProvider} from '../src/vocabulary.ts';
import {vocabularyImportChunks} from '../src/vocabulary-import.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
const result=(word:string,input_index:number)=>({input_index,input:word,status:'ok',lemma:word,part_of_speech:'noun',ipa_gb:'/test/',ipa_us:'/test/',meaning_zh:`测试${word}`,sentence_en:`I see ${word}.`,sentence_zh:'我看到了。',reason:null});
async function fixture(provider:VocabularyProvider){
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/021_vocabulary_bulk_index.sql','utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'bulk-test',()=>new Date(),provider),actor=(await core.login('dev-dad')).user.id;
 const family=await core.createFamily(actor,'family',{name:'测试'}),child=await core.createChild(actor,'child',family.id,{nickname:'孩子'}),book=await core.createWordbook(actor,'book',child.id,{name:'词本'});
 return {pg,core,actor,child,book};
}
test('bulk text keeps phrases, respects model chunk size, and rejects 8001 rows without truncation',()=>{
 const rows=Array.from({length:8000},(_,i)=>`word${i}`),chunks=vocabularyImportChunks(rows.join('\n'));
 assert.equal(chunks.length,267);assert.equal(chunks.flatMap(chunk=>chunk.split('\n')).length,8000);
 assert(chunks.every(chunk=>chunk.split('\n').length<=30));assert.equal(vocabularyImportChunks('ice cream\nread a book')[0],'ice cream\nread a book');
 assert.throws(()=>vocabularyImportChunks([...rows,'extra'].join('\n')),/TOO_MANY_WORDS/);
 assert(vocabularyImportChunks(Array.from({length:100},()=> 'cat').join(' ')).every(chunk=>(chunk.match(/cat/g)??[]).length<=30));
});
const markdownWord=(i:number)=>'sample'+String.fromCharCode(97+Math.floor(i/26))+String.fromCharCode(97+i%26);
const markdownDocument=(count:number)=>'# 儿童课堂单词记录\n\n共 '+count+' 个单词；音标、释义和例句。\n\n'+Array.from({length:count},(_,i)=>`${i+1}. **${markdownWord(i)}** /test/ — 名词 — 测试\n\n   I can see a ${markdownWord(i)}.\n   我能看见它。`).join('\n\n');
test('a structured 156-word Markdown document produces six complete batches without importing headers or splitting examples',()=>{
 const chunks=vocabularyImportChunks(markdownDocument(156));assert.equal(chunks.length,6);assert(chunks.every(chunk=>[...chunk.matchAll(/^\d+\. \*\*/gm)].length<=30));
 assert.doesNotMatch(chunks.join('\n'),/儿童课堂单词记录|共 156 个单词/);
 for(let i=0;i<156;i++){const matches=chunks.filter(chunk=>chunk.includes(`**${markdownWord(i)}**`));assert.equal(matches.length,1);assert(matches[0].includes(`I can see a ${markdownWord(i)}.`));}
 const mixed='1. **apple** 苹果\n2. banana 香蕉';assert(vocabularyImportChunks(mixed).join('\n').includes('banana'));assert(vocabularyImportChunks('1. **apple**\n3. **pear**').join('\n').includes('pear'));
 const withNotes=markdownDocument(156)+'\n\n## 整理说明\n\n- colour 保留课堂原拼写；美式 color。\n- base 的词义结合原文语境。';const noted=vocabularyImportChunks(withNotes);assert.equal(noted.length,6);assert(noted[5].includes('colour 保留课堂原拼写'));
 const datedNotes=markdownDocument(156)+'\n\n注：保留课堂原词及读音。\n\n2026-10-22 第二次补充说明：沿用原词条。\n\n- colour 保留课堂原拼写；美式 color。';assert.equal(vocabularyImportChunks(datedNotes).length,6);
});
test('retry replans a legacy failed Markdown import without deleting its audit jobs or changing the import ID',async()=>{
 const calls:string[]=[];const f=await fixture({provider:'qwen',model:'test',promptVersion:'test',rawPromptVersion:'raw-test',generate:async words=>({items:words.map(result)}),generateRaw:async raw=>{calls.push(raw);return {error:null,items:[...raw.matchAll(/^\d+\. \*\*([^*]+)\*\*/gm)].map((m,i)=>result(m[1],i))};}});
 try{
  const job=await f.core.vocabulary.create(f.actor,'legacy-markdown',f.child.id,{wordbook_id:f.book.id,raw_text:markdownDocument(156)});
  await f.pg.query("UPDATE wordmate.generation_jobs SET payload=payload-'import_plan_version' WHERE id=$1",[job.id]);
  await f.pg.query("UPDATE wordmate.generation_jobs SET status='failed',error_code=CASE WHEN (payload->>'bulk_index')::int=0 THEN 'UPSTREAM_HTTP_ERROR' ELSE 'BULK_PAUSED' END,attempts=CASE WHEN (payload->>'bulk_index')::int=0 THEN 1 ELSE 0 END,payload=payload||jsonb_build_object('raw_text','old paragraph split') WHERE payload->>'bulk_parent_id'=$1",[job.id]);
  const oldIds=(await f.pg.query("SELECT id FROM wordmate.generation_jobs WHERE payload->>'bulk_parent_id'=$1",[job.id])).rows.map((r:any)=>r.id);
  const retried=await f.core.vocabulary.retry(f.actor,'retry-new-plan',job.id);assert.equal(retried.id,job.id);assert.equal(retried.bulk.total_parts,6);
  const archived=(await f.pg.query("SELECT id,status,payload->>'superseded_bulk_parent_id' parent FROM wordmate.generation_jobs WHERE id=ANY($1::uuid[])",[oldIds])).rows;assert.equal(archived.length,6);assert(archived.every((r:any)=>r.status==='cancelled'&&r.parent===job.id));
  for(let i=0;i<6;i++)await f.core.vocabulary.processOne();const done=await f.core.vocabulary.get(f.actor,job.id);assert.equal(done.status,'succeeded');assert.equal(done.saved_count,156);assert.equal(calls.length,6);assert.equal((await f.core.vocabulary.list(f.actor,f.child.id)).items.length,1);
 }finally{await f.pg.close();}
});
test('a failed chunk pauses the import and retry resumes without regenerating saved words',async()=>{
 let failing=true;const calls:string[][]=[];
 const f=await fixture({provider:'qwen',model:'test',promptVersion:'test',generate:async words=>{calls.push(words);if(failing&&words[0]==='word30')throw Object.assign(Error('offline'),{code:'UPSTREAM_NETWORK_OR_TIMEOUT'});return {items:words.map(result)};}});
 try{
  const words=Array.from({length:61},(_,i)=>`word${i}`),body={wordbook_id:f.book.id,words};
  const job=await f.core.vocabulary.create(f.actor,'create',f.child.id,body);assert.equal(job.is_bulk,true);assert.equal(job.bulk.total_parts,3);assert.equal((await f.core.vocabulary.create(f.actor,'duplicate',f.child.id,body)).id,job.id);
  assert.equal((await f.core.vocabulary.list(f.actor,f.child.id)).items.length,1);
  await f.core.vocabulary.processOne();await f.core.vocabulary.processOne();await f.core.vocabulary.processOne();let data=await f.core.vocabulary.get(f.actor,job.id);
  assert.equal(calls.length,2);assert.equal(data.saved_count,30);assert.equal(data.status,'partial');assert.equal(data.retryable,true);
  failing=false;await f.core.vocabulary.retry(f.actor,'retry',job.id);await f.core.vocabulary.processOne();await f.core.vocabulary.processOne();data=await f.core.vocabulary.get(f.actor,job.id);
  assert.equal(data.status,'succeeded');assert.equal(data.saved_count,61);assert.equal(data.bulk.completed_parts,3);assert.equal(calls.length,4);assert.equal(calls.filter(words=>words[0]==='word0').length,1);
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.sentences')).rows[0].n,61);
 }finally{await f.pg.close();}
});
test('raw text over 30 words is queued as one import and every chunk is generated',async()=>{
 const calls:string[]=[];const f=await fixture({provider:'qwen',model:'test',promptVersion:'test',rawPromptVersion:'raw-test',generate:async words=>({items:words.map(result)}),generateRaw:async raw=>{calls.push(raw);return {items:raw.split('\n').map(result),error:null};}});
 try{
  const raw=Array.from({length:65},(_,i)=>`word${i}`).join('\n'),job=await f.core.vocabulary.create(f.actor,'create',f.child.id,{wordbook_id:f.book.id,raw_text:raw});
  for(let i=0;i<3;i++)await f.core.vocabulary.processOne();const data=await f.core.vocabulary.get(f.actor,job.id);assert.equal(data.status,'succeeded');assert.equal(data.saved_count,65);assert.equal(calls.join('\n'),raw);assert.equal(data.items.length,60);
 }finally{await f.pg.close();}
});
test('only one chunk runs per import and another child can run before the next chunk',async()=>{
 let entered!:()=>void,release!:()=>void;const start=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve),calls:string[][]=[];
 const f=await fixture({provider:'qwen',model:'test',promptVersion:'test',generate:async words=>{calls.push(words);if(calls.length===1){entered();await gate;}return {items:words.map(result)};}});
 try{
  await f.core.vocabulary.create(f.actor,'bulk',f.child.id,{wordbook_id:f.book.id,words:Array.from({length:31},(_,i)=>`word${i}`)});
  const work=f.core.vocabulary.processOne();await start;await f.core.vocabulary.processOne();assert.equal(calls.length,1);
  const family=(await f.core.me(f.actor)).families[0],child=await f.core.createChild(f.actor,'second-child',family.id,{nickname:'另一个孩子'}),book=await f.core.createWordbook(f.actor,'second-book',child.id,{name:'另一个词本'});
  await f.core.vocabulary.create(f.actor,'other',child.id,{wordbook_id:book.id,words:['other']});release();await work;
  await f.core.vocabulary.processOne();assert.deepEqual(calls[1],['other']);await f.core.vocabulary.processOne();assert.deepEqual(calls[2],['word30']);
 }finally{release?.();await f.pg.close();}
});
test('8000 words are accepted as a durable import and 8001 are rejected before creating jobs',async()=>{
 const f=await fixture({provider:'qwen',model:'test',promptVersion:'test',generate:async words=>({items:words.map(result)})});
 try{
  const words=Array.from({length:8000},(_,i)=>`word${i}`),body={wordbook_id:f.book.id,words};
  await assert.rejects(f.core.vocabulary.create(f.actor,'oversize',f.child.id,{...body,words:[...words,'extra']}),{code:'INVALID_WORD_COUNT'});
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.generation_jobs')).rows[0].n,0);
  const job=await f.core.vocabulary.create(f.actor,'maximum',f.child.id,body);assert.equal(job.total_count,8000);assert.equal(job.bulk.total_parts,267);assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.batch_items')).rows[0].n,8000);
  for(let index=0;index<267;index++)await f.core.vocabulary.processOne();
  const completed=await f.core.vocabulary.get(f.actor,job.id);assert.equal(completed.status,'succeeded');assert.equal(completed.saved_count,8000);assert.equal(completed.bulk.completed_parts,267);
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.child_words')).rows[0].n,8000);
 }finally{await f.pg.close();}
});
