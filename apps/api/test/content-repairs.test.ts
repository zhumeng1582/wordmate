import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {fixture,response} from './ai-fixture.ts';
let answer:any;
async function setup(){const f=await fixture(async(_url,init)=>JSON.parse(String(init?.body)).response_format?.json_schema?.name==='content_repair_verify'?response({approved:true,reason:'独立校验通过'}):response(answer));for(const name of ['002_audio.sql','003_audio_preferences.sql','024_textbook_sources.sql','025_new_sailing.sql','026_textbook_volumes.sql','028_word_tutor.sql','029_tutor_learning.sql',...readdirSync('apps/api/migrations').filter(n=>Number(n.slice(0,3))>=34).sort()])await f.pg.exec(readFileSync('apps/api/migrations/'+name,'utf8'));await f.pg.query('UPDATE wordmate.ai_family_wallets SET balance_micros=100000000');let calls=0;const spoken:any[]=[];const runtime={profile:{provider:'cosyvoice',model:'cosyvoice-v3-flash'},voices:[{id:'gb',accent:'en-GB',gender:'Female'}],storageProfile:'mock',stores:{},spoolDir:'/tmp/unused-repair',pricePer10000Characters:'1',synthesize:async(input:any)=>{spoken.push(input);return {bytes:Buffer.from('ID3-repair-'+(++calls))};}};f.core.repairs.runtime=runtime;f.core.audio.runtime=runtime;f.core.poems.runtime=runtime;f.core.hanzi.runtime=runtime;
 const batch=await f.core.createBatch(f.dad,randomUUID(),f.child.id,{wordbook_id:f.book.id,words:['apple']});await f.core.confirmBatch(f.dad,randomUUID(),batch.id,{expected_version:1,selections:batch.items.map((item:any)=>({item_id:item.id,action:'select',candidate_id:item.candidates[0].candidate_id}))});const word=(await f.core.words(f.dad,f.child.id)).items[0],poem=await f.core.poems.create(f.dad,randomUUID(),f.child.id,{title:'春晓',author:'孟浩然',body:'春眠不觉晓。',annotations:'原注释',translation:'原译文'}),hanzi=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:'行',pinyin:'háng',meaning:'行走',strokes:6});const book=(await f.core.sentences.books(f.dad,f.child.id)).items[0];await f.core.sentences.save(f.dad,randomUUID(),f.child.id,{book_id:book.id,reviewed:true,items:[{text_en:'Good morning.',translation_zh:'早安。'}]});const sentence=(await f.core.sentences.list(f.dad,f.child.id,{book_id:book.id})).items[0];return {...f,word,poem,hanzi,sentence,sentenceBook:book,spoken};}
const result=(values:any,pronunciations:any[]=[])=>({values,pronunciations,note:'已按问题修复。',verified:true});
async function enqueue(f:any,kind:string,id:string,issue:string,extra:any={}){const latest=await f.core.repairs.latest(f.dad,f.child.id,kind,id);return f.core.repairs.create(f.dad,randomUUID(),f.child.id,{kind,target_id:id,issue,description:'请核对这个内容',expected_version:latest.version,...extra});}
test('all four repair types automatically apply and undo only selected content, preserving cards and marks',async()=>{const f=await setup();try{
 const cardBefore=await f.pg.query('SELECT to_jsonb(t) j FROM wordmate.review_cards t ORDER BY id');
 await f.core.patchWordAnnotations(f.dad,randomUUID(),f.word.id,{favorite:true,expected_version:0});
 for(const [kind,id,issue,patch] of [['words',f.word.id,'meaning',{part_of_speech:'noun',meaning_zh:'苹果果实'}],['sentences',f.sentence.sentence_id,'translation',{translation_zh:'早上好。'}],['poems',f.poem.id,'explanation',{annotations:'晓：早晨。',translation:'春天睡醒时天已大亮。'}],['hanzi',f.hanzi.id,'pinyin',{pinyin:'háng（行业）'}]] as const){
  answer=result(patch);const job=await enqueue(f,kind,id,issue);assert.equal(job.status,'queued');assert.equal(await f.core.repairs.processOne(),true);const done=await f.core.repairs.get(f.dad,f.child.id,job.id);assert.equal(done.status,'succeeded',JSON.stringify(done));assert(Object.keys(done.changes).every(key=>Object.hasOwn(patch,key)));assert(Object.keys(done.changes).length>0);const undo=await f.core.repairs.undo(f.dad,randomUUID(),f.child.id,job.id);assert.equal(undo.status,'undone');assert.equal((await f.core.repairs.undo(f.dad,randomUUID(),f.child.id,job.id)).status,'undone');
 }
 assert.equal((await f.core.wordAnnotations(f.dad,f.word.id)).favorite,true);assert.deepEqual((await f.pg.query('SELECT to_jsonb(t) j FROM wordmate.review_cards t ORDER BY id')).rows,cardBefore.rows);assert.equal((await f.core.sentences.progress(f.dad,f.child.id)).completed,0);
}finally{await f.close();}});
test('repair jobs deduplicate, reject outsiders and stale content, and never turn source changes into silent replacement',async()=>{const f=await setup();try{
 answer=result({pinyin:'xíng'});const job=await enqueue(f,'hanzi',f.hanzi.id,'pinyin');assert.equal((await enqueue(f,'hanzi',f.hanzi.id,'pinyin')).id,job.id);await assert.rejects(enqueue(f,'hanzi',f.hanzi.id,'meaning'),{code:'REPAIR_ALREADY_RUNNING'});await assert.rejects(f.core.repairs.get(f.mom,f.child.id,job.id),{code:'FAMILY_NOT_FOUND'});await assert.rejects(enqueue(f,'hanzi',f.hanzi.id,'source'),{code:'REPAIR_IDENTITY_CONFIRMATION_REQUIRED'});
 await f.core.hanzi.update(f.dad,f.child.id,f.hanzi.id,{pinyin:'xíng（用户修改）',expected_version:f.hanzi.version});await f.core.repairs.processOne();const failed=await f.core.repairs.get(f.dad,f.child.id,job.id);assert.equal(failed.status,'failed');assert.equal(failed.error_code,'REPAIR_CONTENT_CHANGED');assert.equal((await f.core.hanzi.get(f.dad,f.child.id,f.hanzi.id)).pinyin,'xíng（用户修改）');
 const good=await enqueue(f,'hanzi',f.hanzi.id,'pinyin');await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,f.child.id,good.id)).status,'succeeded');const fresh=await f.core.hanzi.get(f.dad,f.child.id,f.hanzi.id);await f.core.hanzi.update(f.dad,f.child.id,f.hanzi.id,{pinyin:'háng（再次修改）',expected_version:fresh.version});await assert.rejects(f.core.repairs.undo(f.dad,randomUUID(),f.child.id,good.id),{code:'REPAIR_CONTENT_CHANGED'});
}finally{await f.close();}});
test('unverified AI output preserves the original content and releases reserved quota',async()=>{const f=await setup();try{answer={...result({annotations:'未知',translation:'未知'}),verified:false};const job=await enqueue(f,'poems',f.poem.id,'explanation');await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,f.child.id,job.id)).error_code,'REPAIR_NOT_VERIFIED');assert.equal((await f.core.poems.get(f.dad,f.child.id,f.poem.id)).annotations,'原注释');assert.equal(Number((await f.pg.query('SELECT frozen_micros FROM wordmate.ai_family_wallets WHERE family_id=$1',[f.family.id])).rows[0].frozen_micros),0);}finally{await f.close();}});
test('all four audio repairs synthesize pronunciation-controlled new audio, serve it through normal playback and can undo',async()=>{const f=await setup();try{
 for(const [kind,id,text,alphabet,ph] of [['words',f.word.id,'apple','cmu','AE1 P AH0 L'],['sentences',f.sentence.sentence_id,'morning','cmu','M AO1 R N IH0 NG'],['poems',f.poem.id,'春','py','chun1'],['hanzi',f.hanzi.id,'行','py','hang2']] as const){
  answer=result({},[{text,alphabet,ph}]);const job=await enqueue(f,kind,id,'audio');await f.core.repairs.processOne();const done=await f.core.repairs.get(f.dad,f.child.id,job.id);assert.equal(done.status,'succeeded',JSON.stringify(done));assert.match(f.spoken.at(-1).ssml,/<phoneme/);assert.match((await f.core.repairs.audio(f.dad,f.child.id,job.id)).toString(),/^ID3-repair-/);
  const playback=kind==='words'||kind==='sentences'?await f.core.audio.create(f.dad,randomUUID(),{[kind==='words'?'word_id':'sentence_id']:id,content_version:1,accent:'en-GB',voice_id:'gb',speech_rate:1}):kind==='poems'?await f.core.poems.audio(f.dad,f.child.id,id):await f.core.hanzi.audio(f.dad,f.child.id,id,'character');assert.equal(playback.resource_path,done.resource_path);
  await f.core.repairs.undo(f.dad,randomUUID(),f.child.id,job.id);await assert.rejects(f.core.repairs.audio(f.dad,f.child.id,job.id),{code:'AUDIO_RESOURCE_NOT_FOUND'});
 }
 assert.equal(f.spoken.length,4);assert.equal((await f.pg.query("SELECT count(*)::int n FROM wordmate.ai_calls WHERE kind='audio' AND state='succeeded'")).rows[0].n,4);
}finally{await f.close();}});
test('a sentence repaired during an active round keeps the original question snapshot answerable',async()=>{const f=await setup();try{const round=await f.core.sentences.start(f.dad,randomUUID(),f.child.id,{source:'new',book_id:f.sentenceBook.id});answer=result({translation_zh:'早上好。'});const job=await enqueue(f,'sentences',f.sentence.sentence_id,'translation');await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,f.child.id,job.id)).status,'succeeded');assert.equal((await f.core.sentences.getRound(f.dad,f.child.id,round.id)).current.translation_zh,'早安。');const saved=await f.core.sentences.answer(f.dad,f.child.id,round.id,{event_id:randomUUID(),lease_id:round.lease_id,ordinal:1,rating:'good'});assert.equal(saved.today.completed,1);}finally{await f.close();}});
test('shared poem copies repair locally and deletion removes snapshots and speech without changing the published source',async()=>{const f=await setup();try{const original=(await f.core.poems.books.list(f.dad,f.child.id)).items[0],shared=await f.core.poems.books.share(f.dad,randomUUID(),f.child.id,original.id,{published:true,title:'古诗',author:'老师'}),other=await f.core.createChild(f.dad,randomUUID(),f.family.id,{nickname:'二宝'}),joined=await f.core.poems.books.join(f.dad,randomUUID(),other.id,shared.id),copy=(await f.core.poems.list(f.dad,other.id,0,'all','','active',joined.id)).items[0];answer=result({annotations:'晓：清晨。',translation:'春天睡醒时天已大亮。'});const latest=await f.core.repairs.latest(f.dad,other.id,'poems',copy.id),job=await f.core.repairs.create(f.dad,randomUUID(),other.id,{kind:'poems',target_id:copy.id,issue:'explanation',expected_version:latest.version});await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,other.id,job.id)).status,'succeeded');assert.equal((await f.core.poems.get(f.dad,f.child.id,f.poem.id)).annotations,'原注释');assert.equal((await f.core.poems.books.shared(f.mom,shared.id)).items[0].annotations,'原注释');await f.pg.query('DELETE FROM wordmate.poems WHERE id=$1',[copy.id]);assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.content_repairs WHERE id=$1',[job.id])).rows[0].n,0);}finally{await f.close();}});
test('unrelated sentence edits cannot bypass the active-round content-version check through repair history',async()=>{const f=await setup();try{const r=await f.core.sentences.start(f.dad,randomUUID(),f.child.id,{source:'new',book_id:f.sentenceBook.id});answer=result({translation_zh:'早上好。'});const job=await enqueue(f,'sentences',f.sentence.sentence_id,'translation');await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,f.child.id,job.id)).status,'succeeded');const fresh=(await f.core.sentences.list(f.dad,f.child.id,{book_id:f.sentenceBook.id})).items[0];await f.core.sentences.update(f.dad,f.child.id,f.sentence.sentence_id,{translation_zh:'用户自行编辑的新译文',expected_version:fresh.version});await assert.rejects(f.core.sentences.answer(f.dad,f.child.id,r.id,{event_id:randomUUID(),lease_id:r.lease_id,ordinal:1,rating:'good'}),{code:'SENTENCE_CHANGED'});}finally{await f.close();}});
test('unchanged text is reported as checked, and confirmed identity repairs reject duplicates and remain reversible',async()=>{const f=await setup();try{answer=result({pinyin:'háng'});const same=await enqueue(f,'hanzi',f.hanzi.id,'pinyin');await f.core.repairs.processOne();const checked=await f.core.repairs.get(f.dad,f.child.id,same.id);assert.equal(checked.status,'succeeded');assert.deepEqual(checked.changes,{});assert.match(checked.note,/未发现/);assert.equal((await f.core.hanzi.get(f.dad,f.child.id,f.hanzi.id)).version,f.hanzi.version);answer=result({character:'航'});const change=await enqueue(f,'hanzi',f.hanzi.id,'source',{identity_confirmed:true});await f.core.repairs.processOne();assert.equal((await f.core.hanzi.get(f.dad,f.child.id,f.hanzi.id)).character,'航');await f.core.repairs.undo(f.dad,randomUUID(),f.child.id,change.id);assert.equal((await f.core.hanzi.get(f.dad,f.child.id,f.hanzi.id)).character,'行');await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:'航'});const duplicate=await enqueue(f,'hanzi',f.hanzi.id,'source',{identity_confirmed:true});await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,f.child.id,duplicate.id)).error_code,'HANZI_EXISTS');}finally{await f.close();}});

test('invalid audio phonemes use repair-specific failure guidance and retain a safe stage diagnostic',async()=>{const f=await setup();try{
 answer=result({},[{text:'apple',alphabet:'py',ph:'a1'}]);const job=await enqueue(f,'words',f.word.id,'audio');await f.core.repairs.processOne();const failed=await f.core.repairs.get(f.dad,f.child.id,job.id);assert.equal(failed.status,'failed');assert.equal(failed.error_code,'REPAIR_NOT_VERIFIED');assert.equal(f.spoken.length,0);
 const stored=(await f.pg.query('SELECT result FROM wordmate.content_repairs WHERE id=$1',[job.id])).rows[0].result;assert.deepEqual(stored.diagnostic,{stage:'generation',field:'pronunciation_alphabet'});assert(!JSON.stringify(stored).includes('system-secret-key'));
 const charge=(await f.pg.query("SELECT coalesce(sum(charge_micros),0)::int charge FROM wordmate.ai_calls WHERE reference=$1",['content-repair:'+job.id])).rows[0].charge;assert.equal(charge,0);
}finally{await f.close();}});

test('a default poem audio repair uses lexical pronunciation and verification without an extra generation call',async()=>{const f=await setup();try{
 const latest=await f.core.repairs.latest(f.dad,f.child.id,'poems',f.poem.id),job=await f.core.repairs.create(f.dad,randomUUID(),f.child.id,{kind:'poems',target_id:f.poem.id,issue:'audio',description:'',expected_version:latest.version});await f.core.repairs.processOne();const done=await f.core.repairs.get(f.dad,f.child.id,job.id);assert.equal(done.status,'succeeded',JSON.stringify(done));assert.match(f.spoken.at(-1).ssml,/chun1 xiao3/);const calls=(await f.pg.query("SELECT reference FROM wordmate.ai_calls WHERE reference LIKE $1",['content-repair%'+job.id])).rows;assert(calls.some((r:any)=>r.reference==='content-repair-check:'+job.id));assert(!calls.some((r:any)=>r.reference==='content-repair:'+job.id));assert.equal((await f.core.poems.get(f.dad,f.child.id,f.poem.id)).body,'春眠不觉晓。');
}finally{await f.close();}});

test('word example repairs apply either field alone, preserve the other, refresh target offsets and undo',async()=>{const f=await setup();try{
 const read=async()=>((await f.pg.query('SELECT s.* FROM wordmate.sentences s JOIN wordmate.sentence_targets t ON t.sentence_id=s.id WHERE t.child_word_id=$1 ORDER BY s.created_at DESC,s.id DESC LIMIT 1',[f.word.id])).rows[0]);
 const exampleId=randomUUID();await f.pg.query("INSERT INTO wordmate.sentences(id,child_id,text_en,translation_zh,level,model,prompt_version,status,created_by) VALUES($1,$2,'I eat an apple.','我吃一个苹果。','primary','fixture','test','validated',$3)",[exampleId,f.child.id,f.dad]);await f.pg.query("INSERT INTO wordmate.sentence_targets(child_id,sentence_id,child_word_id,surface,start_utf16,end_utf16) VALUES($1,$2,$3,'apple',9,14)",[f.child.id,exampleId,f.word.id]);
 const original=await read();assert(original);
 answer=result({example_en:original.text_en,example_zh:'我喜欢这个苹果。'});const translation=await enqueue(f,'words',f.word.id,'example');await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,f.child.id,translation.id)).status,'succeeded');assert.equal((await read()).text_en,original.text_en);assert.equal((await read()).translation_zh,'我喜欢这个苹果。');await f.core.repairs.undo(f.dad,randomUUID(),f.child.id,translation.id);assert.equal((await read()).translation_zh,original.translation_zh);
 answer=result({example_en:'Today I eat an apple.',example_zh:original.translation_zh});const english=await enqueue(f,'words',f.word.id,'example');await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,f.child.id,english.id)).status,'succeeded');assert.equal((await read()).translation_zh,original.translation_zh);const target=(await f.pg.query('SELECT * FROM wordmate.sentence_targets WHERE sentence_id=$1 AND child_word_id=$2',[original.id,f.word.id])).rows[0];assert.equal(target.start_utf16,15);assert.equal(target.end_utf16,20);await f.core.repairs.undo(f.dad,randomUUID(),f.child.id,english.id);assert.equal((await read()).text_en,original.text_en);
 answer=result({example_en:'The pupil reads a book.',example_zh:'学生读书。'});const missing=await enqueue(f,'words',f.word.id,'example');await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,f.child.id,missing.id)).error_code,'REPAIR_NOT_VERIFIED');assert.equal((await read()).text_en,original.text_en);
 answer=result({},[{text:'apple',alphabet:'cmu',ph:'AE1 P AH0 L'}]);const audioJob=await enqueue(f,'words',f.word.id,'example_audio');await f.core.repairs.processOne();const audioDone=await f.core.repairs.get(f.dad,f.child.id,audioJob.id);assert.equal(audioDone.status,'succeeded');assert.equal((await f.core.audio.create(f.dad,randomUUID(),{sentence_id:original.id,content_version:(await read()).content_version,accent:'en-GB',voice_id:'gb',speech_rate:1})).resource_path,audioDone.resource_path);await f.core.repairs.undo(f.dad,randomUUID(),f.child.id,audioJob.id);
 assert.equal(Number((await f.pg.query('SELECT frozen_micros FROM wordmate.ai_family_wallets WHERE family_id=$1',[f.family.id])).rows[0].frozen_micros),0);
}finally{await f.close();}});

test('audio undo remains available after an unrelated content edit and never overwrites that edit',async()=>{const f=await setup();try{
 answer=result({},[{text:'行',alphabet:'py',ph:'hang2'}]);const job=await enqueue(f,'hanzi',f.hanzi.id,'audio');await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,f.child.id,job.id)).status,'succeeded');const current=await f.core.hanzi.get(f.dad,f.child.id,f.hanzi.id);await f.core.hanzi.update(f.dad,f.child.id,f.hanzi.id,{meaning:'用户补充的释义',expected_version:current.version});assert.equal((await f.core.repairs.undo(f.dad,randomUUID(),f.child.id,job.id)).status,'undone');assert.equal((await f.core.hanzi.get(f.dad,f.child.id,f.hanzi.id)).meaning,'用户补充的释义');await assert.rejects(f.core.repairs.audio(f.dad,f.child.id,job.id),{code:'AUDIO_RESOURCE_NOT_FOUND'});
}finally{await f.close();}});

test('remaining correction choices apply and undo through the worker, including a retry after rejected content',async()=>{const f=await setup();try{
 for(const [kind,id,issue,patch] of [
 ['words',f.word.id,'phonetic',{ipa_gb:'/ˈæpəl/',ipa_us:'/ˈæpəl/'}],['words',f.word.id,'source',{lemma:'pear'}],
 ['sentences',f.sentence.sentence_id,'source',{text_en:'Good morning!'}],
 ['poems',f.poem.id,'source',{title:'春晓',author:'孟浩然',dynasty:'唐',body:'春眠不觉晓，处处闻啼鸟。'}],
 ['hanzi',f.hanzi.id,'structure',{radical:'彳',strokes:'6'}],['hanzi',f.hanzi.id,'meaning',{meaning:'走；行业。'}],['hanzi',f.hanzi.id,'example',{words:'行走、行业',example:'我们一起步行回家。'}],
 ] as const){answer=result(patch);const job=await enqueue(f,kind,id,issue,{identity_confirmed:true});await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,f.child.id,job.id)).status,'succeeded',JSON.stringify(await f.core.repairs.get(f.dad,f.child.id,job.id)));assert.equal((await f.core.repairs.undo(f.dad,randomUUID(),f.child.id,job.id)).status,'undone');}
 answer=result({pinyin:'hǎn'});const rejected=await enqueue(f,'hanzi',f.hanzi.id,'pinyin');await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,f.child.id,rejected.id)).error_code,'REPAIR_NOT_VERIFIED');answer=result({pinyin:'xíng（行走）'});const retried=await enqueue(f,'hanzi',f.hanzi.id,'pinyin');assert.notEqual(retried.id,rejected.id);await f.core.repairs.processOne();assert.equal((await f.core.repairs.get(f.dad,f.child.id,retried.id)).status,'succeeded');await f.core.repairs.undo(f.dad,randomUUID(),f.child.id,retried.id);
 answer=result({words:'行走、行业',example:'我们一起步行回家。'});const example=await enqueue(f,'hanzi',f.hanzi.id,'example');await f.core.repairs.processOne();answer=result({},[{text:'行',alphabet:'py',ph:'xing2'}]);const audio=await enqueue(f,'hanzi',f.hanzi.id,'example_audio');await f.core.repairs.processOne();const done=await f.core.repairs.get(f.dad,f.child.id,audio.id);assert.equal(done.status,'succeeded');assert.match(f.spoken.at(-1).ssml,/xing2/);assert.equal((await f.core.hanzi.audio(f.dad,f.child.id,f.hanzi.id,'example')).resource_path,done.resource_path);await f.core.repairs.undo(f.dad,randomUUID(),f.child.id,audio.id);
}finally{await f.close();}});

test('a failed reservation release rolls back task failure and timeout recovery releases every remaining reservation', async () => {
  const f = await setup();
  try {
    answer = result({},[{text:'行',alphabet:'py',ph:'hang2'}]);
    f.core.repairs.runtime.synthesize = async () => {throw Error('INJECTED_SYNTHESIS_FAILURE');};
    const job = await enqueue(f,'hanzi',f.hanzi.id,'audio');
    const access = f.core.repairs.a;
    const transaction = access.tx.bind(access);
    let releases = 0;
    access.tx = (fn: (q: {query: (sql: string, params?: unknown[]) => Promise<unknown>}) => Promise<unknown>) => transaction(async (q: {query: (sql: string, params?: unknown[]) => Promise<unknown>}) => fn({
      query: async (sql: string, params?: unknown[]) => {
        if (sql.startsWith('UPDATE ai_calls SET state=') && params?.[2] === 'REPAIR_FAILED' && ++releases === 2) {
          throw Error('INJECTED_RELEASE_FAILURE');
        }
        return q.query(sql,params);
      },
    }));
    await assert.rejects(f.core.repairs.processOne(),/INJECTED_RELEASE_FAILURE/);
    assert.equal((await f.core.repairs.get(f.dad,f.child.id,job.id)).status,'running');
    const wallet = async () => Number((await f.pg.query('SELECT frozen_micros FROM wordmate.ai_family_wallets WHERE family_id=$1',[f.family.id])).rows[0].frozen_micros);
    assert((await wallet()) > 0);
    assert.equal((await f.core.hanzi.get(f.dad,f.child.id,f.hanzi.id)).pinyin,'háng');
    const activeCalls = (await f.pg.query("SELECT state FROM wordmate.ai_calls WHERE reference IN ($1,$2) OR id=(SELECT audio_billing_id FROM wordmate.content_repairs WHERE id=$3)",['content-repair:'+job.id,'content-repair-check:'+job.id,job.id])).rows;
    assert.equal(activeCalls.length,3);
    assert(activeCalls.every((call: {state:string}) => ['running','ready'].includes(call.state)));

    // Keep the AI calls fresh: recovery must come from the repair lease,
    // rather than rely on the separate ten-minute global billing sweep.
    await f.pg.query("UPDATE wordmate.content_repairs SET lease_until=now()-interval '1 second' WHERE id=$1",[job.id]);
    assert.equal(await f.core.repairs.processOne(),false);
    const failed = await f.core.repairs.get(f.dad,f.child.id,job.id);
    assert.equal(failed.status,'failed');
    assert.equal(failed.error_code,'REPAIR_TIMEOUT');
    assert.equal(await wallet(),0);
    const calls = (await f.pg.query('SELECT state,charge_micros FROM wordmate.ai_calls WHERE reference IN ($1,$2) OR id=(SELECT audio_billing_id FROM wordmate.content_repairs WHERE id=$3)',['content-repair:'+job.id,'content-repair-check:'+job.id,job.id])).rows;
    assert.equal(calls.length,3);
    assert(calls.every((call: {state:string;charge_micros:string}) => !['running','ready'].includes(call.state) && Number(call.charge_micros) === 0));
  } finally {
    await f.close();
  }
});

test('a repair returning a source label as the part of speech cannot overwrite the word', async () => {
  const f = await setup();
  try {
    answer = result({part_of_speech:'教材', meaning_zh:'苹果果实'});
    const job = await enqueue(f,'words',f.word.id,'meaning');
    await f.core.repairs.processOne();
    const failed = await f.core.repairs.get(f.dad,f.child.id,job.id);
    assert.equal(failed.status,'failed');
    assert.equal(failed.error_code,'REPAIR_NOT_VERIFIED');
    const word = await f.core.word(f.dad,f.child.id,f.word.id);
    assert.equal(word.part_of_speech,f.word.part_of_speech);
    assert.equal(word.meaning_zh,f.word.meaning_zh);
  } finally {
    await f.close();
  }
});
