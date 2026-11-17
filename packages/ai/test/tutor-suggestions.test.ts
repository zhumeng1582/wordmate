import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withTutorSuggestions} from '../src/tutor-suggestions.ts';
import {poemRequest} from '../src/poem-tutor.ts';
const request=withTutorSuggestions(poemRequest({title:'春晓',author:'孟浩然',dynasty:'唐',body:'春眠不觉晓'},[{role:'assistant',text:'讲解'}],'这句话是什么意思'));
test('suggestions share the response schema and preserve answer validation',()=>{
 assert((request.schema as any).required.includes('suggestions'));const suggestions=['解释一下春眠的意思','举个春天生活里的例子','用一道题考考我'];assert.deepEqual(request.validate({answer:'春天睡得香。',suggestions}),{answer:'春天睡得香。',suggestions});assert.deepEqual(request.validate({answer:'旧接口回复'}),{answer:'旧接口回复'});
 for(const invalid of [['重复','重复','不同'],['只有一条'],['正常','正常2','x'.repeat(41)],['正常','正常2','包含\n换行']])assert.throws(()=>request.validate({answer:'回复',suggestions:invalid}));assert.throws(()=>request.validate({answer:'',suggestions}));
});
