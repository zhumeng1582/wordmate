import {ProviderError,type JsonRequest,type TextGenerator} from './index.ts';

export function hanziWordsRequest(character:string):JsonRequest<{words:string}>{
 if(!/^\p{Script=Han}$/u.test(character))throw new ProviderError('INVALID_TUTOR_INPUT');
 return {name:'hanzi_words',instructions:'为小学生列出该汉字组成的常用词语，优先选择简单、常见、适龄的二至四字词语；多音字尽量覆盖常见读音。每个词语必须包含该字，不能编造或给出无关词，不确定时返回空数组。只返回规定 JSON。',input:{character},schema:{type:'object',additionalProperties:false,required:['words'],properties:{words:{type:'array',maxItems:8,items:{type:'string'}}}},validate(v:unknown){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==1||!Array.isArray((v as any).words)||(v as any).words.length>8||!(v as any).words.every((w:unknown)=>typeof w==='string'&&/^\p{Script=Han}{2,4}$/u.test(w)&&w.includes(character)))throw new ProviderError('GENERATED_CONTENT_REJECTED');return {words:[...new Set((v as any).words as string[])].join('、')};}};
}
export function generateHanziWords(generator:TextGenerator,character:string){return generator.generate(hanziWordsRequest(character));}
