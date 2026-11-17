import {test} from 'node:test';
import assert from 'node:assert/strict';
import {senseExercise,rejectUngroundedCloze} from '../src/teaching-quality.ts';
import {tutorRequest} from '../src/word-tutor.ts';
import {learningRequest} from '../src/learning-assistant.ts';
const shirt={lemma:'shirt',part_of_speech:'noun',meaning_zh:'衬衫'};
test('new cloze supplies an explicit meaning and masks only the matching target form',()=>{
 const question=senseExercise({sentence_en:'My shirt is red.',sentence_zh:'我的衬衫是红色的。',answer:'shirt'},shirt);
 assert.match(question,/中文：我的衬衫是红色的/);assert.match(question,/英文：My ____ is red\./);assert(!question.includes('shoe'));
 const plural=senseExercise({sentence_en:'Her shirts are blue.',sentence_zh:'她的衬衫是蓝色的。',answer:'shirts'},shirt);assert.match(plural,/Her ____ are blue/);
 const verb=senseExercise({sentence_en:'He went to school.',sentence_zh:'他去了学校。',answer:'went'},{lemma:'go',part_of_speech:'verb'});assert.match(verb,/He ____ to school/);
});
test('ambiguous legacy questions and malformed structured questions are rejected',()=>{
 assert.throws(()=>rejectUngroundedCloze('My __ is red. (shirt/shoe)'));
 for(const value of [{sentence_en:'My shoe is red.',sentence_zh:'我的鞋是红色的。',answer:'shoe'},{sentence_en:'My shirt is red.',sentence_zh:'My shirt is red.',answer:'shirt'},{sentence_en:'This shirt is like that shirt.',sentence_zh:'这件衬衫像那件衬衫。',answer:'shirt'},{sentence_en:'My __ is red.',sentence_zh:'我的衬衫是红色的。',answer:'shirt'}])assert.throws(()=>senseExercise(value,shirt));
});
test('first lesson uses structured exercise and still allows explaining why an old ambiguous question has multiple answers',()=>{
 const request=tutorRequest(shirt,[]);assert.equal((request.schema as any).properties.exercise.type,'object');
 const base={meaning:'衬衫是一种上衣。',usage:'描述穿着的衬衫。',example_en:'This is my shirt.',example_zh:'这是我的衬衫。'};
 const result=request.validate({...base,exercise:{sentence_en:'My shirt is red.',sentence_zh:'我的衬衫是红色的。',answer:'shirt'}});assert.match(result.answer,/中文[:：]我的衬衫是红色的/);
 assert.throws(()=>request.validate({...base,exercise:'My __ is red. (shirt/shoe)'}));
 const correction=tutorRequest(shirt,[{role:'assistant',text:'My __ is red. (shirt/shoe)'}],'shoe',true);assert.match(correction.instructions,/接受所有语法和语义合理的答案/);assert.match(correction.instructions,/不能把“正在学这个词”/);
 assert.equal(correction.validate({answer:'shirt 和 shoe 都可以。这道题条件不够，你的答案合理。'}).answer,'shirt 和 shoe 都可以。这道题条件不够，你的答案合理。'.normalize('NFKC'));
});
test('reading quizzes reject case/punctuation-equivalent alternatives and ungrounded cloze',()=>{
 const request=learningRequest('quiz',{article:{title:'A cat',paragraphs:[{en:'The cat is red.',zh:'猫是红色的。'}]}});
 const item={question:'What color is the cat?',options:['Red','Blue','Green'],answer:0,explanation:'文章说猫是红色的。'};
 assert.equal(request.validate({questions:[item,item,item]}).questions.length,3);
 assert.throws(()=>request.validate({questions:[{...item,options:['red','Red.','blue']},item,item]}));
 assert.throws(()=>request.validate({questions:[{...item,question:'My __ is red. (shirt/shoe)'},item,item]}));
});
