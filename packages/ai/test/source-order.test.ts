import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inSourceOrder} from '../src/source-order.ts';
import {hanziImportRequest} from '../src/hanzi-import.ts';
import {poemImportRequest} from '../src/poem-import.ts';
test('source positions reconcile reversed AI results without matching word fragments',()=>{
 assert.deepEqual(inSourceOrder('education\nbanana\ncat',['cat','banana'],x=>[x]),['banana','cat']);
 assert.deepEqual(inSourceOrder("can't, cat, can",['can','cat'],x=>[x]),['cat','can']);
 assert.deepEqual(inSourceOrder('1. Dog\n2. apple\n3. cat',['cat','apple','Dog'],x=>[x]),['Dog','apple','cat']);
 assert.deepEqual(inSourceOrder('1. **apple** 苹果\n例句：A dog sees an apple and a cat.\n2. **cat** 猫\n3. **dog** 狗',['dog','cat','apple'],x=>[x]),['apple','cat','dog']);
 assert.deepEqual(inSourceOrder('先翻译，再列 apple\ncat',['cat','translation','apple'],x=>[x]),['apple','translation','cat']);
});
test('hanzi candidates deduplicate and follow first source occurrence',()=>{
 const request=hanziImportRequest('生字：天地人天');
 assert.deepEqual(request.validate!({characters:['人','天','地','天'],incomplete:false}),{characters:['天','地','人'],incomplete:false});
});
test('poem extraction follows body positions even when the AI reverses works',()=>{
 const a={title:'春晓',author:'孟浩然',dynasty:'唐',body:'春眠不觉晓，处处闻啼鸟。',annotations:'解释春天的早晨。',translation:'春日里一觉睡到天亮，到处都听到鸟鸣。',issues:[]};
 const b={...a,title:'静夜思',author:'李白',body:'床前明月光，疑是地上霜。'};
 const result=poemImportRequest('目录：静夜思、春晓\n春晓\n春眠不觉晓，处处闻啼鸟。\n静夜思\n床前明月光，疑是地上霜。').validate!({items:[b,a],incomplete:false,overflow:false});
 assert.deepEqual(result.items.map(x=>x.title),['春晓','静夜思']);
});
