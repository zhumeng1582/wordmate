import test from 'node:test';
import assert from 'node:assert/strict';
import {vocabularyRequest,generateVocabulary} from '../src/vocabulary.ts';
import {createTextGenerator} from '../src/index.ts';
const item={input_index:0,input:'cat',status:'ok',lemma:'cat',part_of_speech:'noun',ipa_gb:'/kæt/',ipa_us:'/kæt/',meaning_zh:'猫',sentence_en:'The cat is on the bed.',sentence_zh:'猫在床上。',reason:null};
test('batch prompt and DeepSeek adapter return validated vocabulary',async()=>{
 const g=createTextGenerator({DEEPSEEK_API_KEY:'test',DEEPSEEK_MODEL:'test'},async(_url,init)=>{
  const body=JSON.parse(init!.body as string);assert.equal(JSON.parse(body.messages[1].content).theme,'宠物');assert(body.messages[0].content.includes('input_index'));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[item]})}}]});
 });assert.deepEqual((await generateVocabulary(g,['cat'],'宠物')).data,{items:[item]});
});
test('reject missing, mismatched, fabricated spelling and malformed vocabulary fields',()=>{
 const request=vocabularyRequest(['cat']);
 for(const output of [{items:[]},{items:[item,item]},{items:[{...item,input_index:1}]},{items:[{...item,input:'dog'}]},{items:[{...item,lemma:'dog'}]},{items:[{...item,ipa_gb:'cat'}]},{items:[{...item,meaning_zh:'cat'}]},{items:[{...item,sentence_en:'A dog.'}]},{items:[{...item,unknown:true}]}])assert.throws(()=>request.validate(output));
 assert.throws(()=>vocabularyRequest(['cat','Cat']));assert.throws(()=>vocabularyRequest([]));
});
test('unrecognized inputs are explicit invalid entries without invented content',()=>{
 const invalid={...item,input:'qzxxy',status:'invalid',reason:'无法识别该词'} as Record<string,unknown>;
 for(const key of ['lemma','part_of_speech','ipa_gb','ipa_us','meaning_zh','sentence_en','sentence_zh'])invalid[key]=null;
 assert.deepEqual(vocabularyRequest(['qzxxy']).validate({items:[invalid]}),{items:[invalid]});
 assert.throws(()=>vocabularyRequest(['qzxxy']).validate({items:[{...invalid,meaning_zh:'虚构释义'}]}));
});
