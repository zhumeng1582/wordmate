import {ProviderError} from './index.ts';
import {locateVocabularyTarget} from './vocabulary-target.ts';
export const TEACHING_QUALITY_RULES=`教学质量要求：例句必须语法正确、搭配自然、符合当前词义，中文译文准确对应英文，不依赖图片或未提供的事实。出单选题前逐一代入所有选项，分别检查语法、语义和题干明确给出的上下文；只有恰好一个选项满足全部条件才能出题。不能把“正在学这个词”当作排除其他合理答案的证据。禁止只给颜色、大小、喜欢等通用属性就认定名词唯一，例如 My __ is red.（shirt/shoe）两个答案都合理，不能作为单选题；应补充明确含义或改为开放题。也不能声称鞋不能是红色等虚假理由来排除选项。不能编造常识以使预设答案正确。开放题、没有约束词义的填空题应接受所有语法和语义合理的答案。判题前先审查原题是否有多解、矛盾或缺少条件；若有，明确说明“这道题条件不够”，肯定孩子合理的答案，不能判错或责怪孩子，再换一道条件充分的题。若孩子指出另一个答案也成立，要重新检查题意，不机械坚持预设答案。`;
export const SENSE_EXERCISE_SCHEMA={type:'object',additionalProperties:false,required:['sentence_en','sentence_zh','answer'],properties:{sentence_en:{type:'string'},sentence_zh:{type:'string'},answer:{type:'string'}}};
export function senseExercise(value:unknown,word:{lemma:string;part_of_speech:string}):string{
 const reject=()=>{throw new ProviderError('GENERATED_CONTENT_REJECTED');};
 if(!value||typeof value!=='object'||Array.isArray(value))return reject();
 const v=value as any;if(Object.keys(v).length!==3||!['sentence_en','sentence_zh','answer'].every(key=>typeof v[key]==='string'&&v[key].trim()&&v[key].length<=160&&!/[\u0000-\u001f\u007f]/.test(v[key])))return reject();
 const en=v.sentence_en.trim(),zh=v.sentence_zh.trim(),answer=v.answer.trim();
 if(!/[\u3400-\u9fff]/.test(zh)||/[_＿]{2,}|\.{3}|…/.test(en))return reject();
 const match=locateVocabularyTarget(en,word.lemma,word.part_of_speech);
 if(!match||match.surface.toLowerCase()!==answer.toLowerCase()||locateVocabularyTarget(en.slice(match.end),word.lemma,word.part_of_speech))return reject();
 return `请根据中文意思，用本次学习的单词或正确词形填空。\n中文：${zh}\n英文：${en.slice(0,match.start)}____${en.slice(match.end)}`;
}
// Legacy free-form answers may still arrive from older/custom providers. Reject the
// ungrounded English-cloze shape instead of presenting a misleading single answer.
export function rejectUngroundedCloze(text:string){
 if(/[_＿]{2,}/.test(text)&&/[a-z]/i.test(text)&&!/[\u3400-\u9fff]/.test(text))throw new ProviderError('GENERATED_CONTENT_REJECTED');
}
