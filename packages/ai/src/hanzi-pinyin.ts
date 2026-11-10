import {ProviderError,type JsonRequest,type TextGenerator} from './index.ts';

export function hanziPinyinRequest(character:string):JsonRequest<{pinyin:string}>{
 if(!/^\p{Script=Han}$/u.test(character))throw new ProviderError('INVALID_TUTOR_INPUT');
 return {name:'hanzi_pinyin',instructions:'为小学生给这个汉字标注现代汉语普通话常用拼音，使用带声调的拼音字母。多音字列出常用读音，并在每个读音后用一个简短组词说明，如“háng（银行）；xíng（行走）”。单音字只返回拼音。不要输出生僻读音，不确定时返回空字符串，不要编造。只返回规定的 JSON。',input:{character},schema:{type:'object',additionalProperties:false,required:['pinyin'],properties:{pinyin:{type:'string',maxLength:200}}},validate(v:unknown){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==1||typeof (v as any).pinyin!=='string'||(v as any).pinyin.length>200||/[\u0000-\u001f\u007f]/.test((v as any).pinyin))throw new ProviderError('GENERATED_CONTENT_REJECTED');return {pinyin:(v as any).pinyin.trim()};}};
}
export function generateHanziPinyin(generator:TextGenerator,character:string){return generator.generate(hanziPinyinRequest(character));}
