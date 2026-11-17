import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fixture,response} from './ai-fixture.ts';
const suggestions=['用生活里的例子说明','把刚才的解释再讲简单一点','根据这段内容考考我'];
test('recommendations save with word, poem and character replies, restore on read, replay once and cascade on delete',async()=>{
 let calls=0;const f=await fixture(async(_url,init)=>{calls++;const name=JSON.parse(String(init!.body)).response_format.json_schema.name;return response({...name==='word_tutor'?{meaning:'猫',usage:'描述一只猫。',example_en:'I see a cat.',example_zh:'我看到一只猫。',exercise:'猫用英语怎么说？'}:name==='poem_tutor'?{annotations:'春眠：春天睡觉。',translation:'春天睡得香。'}:{answer:'春表示春天。'},suggestions});});
 try{for(const name of ['009_child_profiles','028_word_tutor','029_tutor_learning','034_poems','035_poem_fields','040_hanzi','041_hanzi_order','043_library_archive','052_learning_assistant','053_tutor_suggestions'])await f.pg.exec(readFileSync(`apps/api/migrations/${name}.sql`,'utf8'));
 const w=(await f.pg.query("INSERT INTO wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source) VALUES($1,'cat','cat','noun','s','猫','test') RETURNING id",[f.child.id])).rows[0];const s=await f.core.tutor.open(f.dad,f.child.id,w.id),request=randomUUID();const word=await f.core.tutor.answer(f.dad,s.id,request);assert.deepEqual(word.messages.at(-1).suggestions,suggestions);await f.core.tutor.answer(f.dad,s.id,request);assert.equal(calls,1);assert.deepEqual((await f.core.tutor.get(f.dad,s.id)).messages.at(-1).suggestions,suggestions);
 const poem=await f.core.poems.create(f.dad,'poem',f.child.id,{title:'春晓',body:'春眠不觉晓。'}),ps=await f.core.poems.open(f.dad,f.child.id,poem.id);const pa=await f.core.poems.answer(f.dad,f.child.id,poem.id,ps.id,randomUUID());assert.deepEqual(pa.messages.at(-1).suggestions,suggestions);
 const hanzi=await f.core.hanzi.create(f.dad,'hanzi',f.child.id,{character:'春'}),hs=await f.core.hanzi.open(f.dad,f.child.id,hanzi.id),ha=await f.core.hanzi.answer(f.dad,f.child.id,hanzi.id,hs.id,randomUUID(),'解释一下');assert.deepEqual(ha.messages.at(-1).suggestions,suggestions);assert.equal(calls,3);
 await f.core.tutor.delete(f.dad,s.id);assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.tutor_reply_suggestions')).rows[0].n,2);
 await assert.rejects(f.core.poems.getSession(f.mom,f.child.id,poem.id,ps.id),{code:'FAMILY_NOT_FOUND'});
 }finally{await f.close();}
});
