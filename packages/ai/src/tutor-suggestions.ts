import {ProviderError,type JsonRequest} from './index.ts';
export function withTutorSuggestions<T>(request:JsonRequest<T>):JsonRequest<T&{suggestions?:string[]}>{
 const schema=request.schema as any;
 return {...request,instructions:request.instructions+'\n同时返回 suggestions：根据这次回答和当前学习进度，给出3条孩子接下来可以直接发送的简短回复或问题。使用孩子的第一人称或直接提问，内容要具体贴合本次讲解，避免每次重复相同话术、不索取个人信息、不建议尚不支持的操作。每条不超过40字；正在练习时提供提示、解释或继续练习的选择，不泄露答案。',schema:{...schema,required:[...schema.required,'suggestions'],properties:{...schema.properties,suggestions:{type:'array',minItems:3,maxItems:3,items:{type:'string',minLength:1,maxLength:40}}}},validate(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ProviderError('GENERATED_CONTENT_REJECTED');
  const {suggestions,...content}=value as any;
  // Older providers/fixtures can omit suggestions; a valid answer remains usable.
  if(suggestions!==undefined&&(!Array.isArray(suggestions)||suggestions.length!==3||suggestions.some((s:any)=>typeof s!=='string'||!s.trim()||s.trim().length>40||/[\u0000-\u001f\u007f]/.test(s))||new Set(suggestions.map((s:string)=>s.trim())).size!==3))throw new ProviderError('GENERATED_CONTENT_REJECTED');
  return {...request.validate(content),...(suggestions?{suggestions:suggestions.map((s:string)=>s.trim())}:{})};
 }};
}
