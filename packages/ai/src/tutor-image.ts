import {ProviderError} from './index.ts';
import {boundedAudio} from './oss-storage.ts';
type Env=Record<string,string|undefined>;
export function createTutorImage(env:Env,fetcher:typeof fetch=fetch){
 const key=env.TUTOR_IMAGE_API_KEY?.trim(),workspace=env.TUTOR_IMAGE_WORKSPACE_ID?.trim(),model=env.TUTOR_IMAGE_MODEL?.trim();
 if(!key||!workspace||!model)throw new ProviderError('IMAGE_NOT_CONFIGURED');
 if(env.TUTOR_IMAGE_SAFETY_INSPECTION!=='cip')throw new ProviderError('IMAGE_SAFETY_NOT_CONFIGURED');
 if(!/^[a-zA-Z0-9-]{1,100}$/.test(workspace)||!['qwen-image-3.0','qwen-image-3.0-pro'].includes(model))throw new ProviderError('INVALID_IMAGE_CONFIGURATION');
 const size=model==='qwen-image-3.0'?'1536x1536':'1024x1024',dimension=model==='qwen-image-3.0'?1536:1024,usageType=model==='qwen-image-3.0'?'qima_output_2k':'qima_output_1k';
 return {model,size,async generate(word:{lemma:string;meaning_zh:string}){
  if(!word.lemma?.trim()||word.lemma.length>120||!word.meaning_zh?.trim()||word.meaning_zh.length>500||/[\u0000-\u001f\u007f]/.test(word.lemma+word.meaning_zh))throw new ProviderError('INVALID_IMAGE_REQUEST');
  const prompt=`一幅清新儿童绘本风格插画。画面主题：${word.meaning_zh}。用一个直观的生活场景准确表现这个意思，让画面主体体现该词义。单一场景，主体大而清晰，背景简洁，色彩明快，细节精致。纯画面，无文字、字母、数字、标牌、边框、对话框或说明文字。适合儿童，不出现真实人物或个人信息。`;
  let response:Response;try{response=await fetcher(`https://${workspace}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/images/generations`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(240000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-DashScope-DataInspection':JSON.stringify({input:'cip',output:'cip'})},body:JSON.stringify({model,prompt,size,n:1,watermark:true,prompt_extend:false,negative_prompt:'模糊，低清晰度，主体太小，杂乱背景，多个场景，错误的单词含义，文字，字母，标志，广告，暴力，恐怖，色情，真实个人信息'})});}catch{throw new ProviderError('IMAGE_NETWORK_OR_TIMEOUT',true);}
  if(!response.ok)throw new ProviderError('IMAGE_UPSTREAM_ERROR',response.status===429||response.status>=500,response.status);
  let raw:any;try{const text=await response.text();if(text.length>65536)throw Error();raw=JSON.parse(text);}catch{throw new ProviderError('IMAGE_INVALID_RESPONSE');}
  if(!Array.isArray(raw?.data)||raw.data.length!==1||raw?.usage?.output_image_count!==1||raw?.usage?.output_image_type!==usageType)throw new ProviderError('IMAGE_USAGE_INVALID');
  let url:URL;try{url=new URL(raw.data[0].url);}catch{throw new ProviderError('IMAGE_INVALID_URL');}
  if(!['http:','https:'].includes(url.protocol)||!['dashscope-result-bj.oss-cn-beijing.aliyuncs.com','dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com','dashscope-a717.oss-accelerate.aliyuncs.com'].includes(url.hostname)||url.username||url.password||url.port||url.hash)throw new ProviderError('IMAGE_INVALID_URL');
  url.protocol='https:';let downloaded:Response;try{downloaded=await fetcher(url.href,{redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw new ProviderError('IMAGE_DOWNLOAD_FAILED',true);}if(!downloaded.ok)throw new ProviderError('IMAGE_DOWNLOAD_FAILED',true);
  let bytes:Uint8Array;try{bytes=await boundedAudio(downloaded,5*1024*1024);}catch{throw new ProviderError('IMAGE_INVALID_RESPONSE');}
  const b=Buffer.from(bytes);if(b.length<24||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||b.toString('ascii',12,16)!=='IHDR'||b.readUInt32BE(16)!==dimension||b.readUInt32BE(20)!==dimension)throw new ProviderError('IMAGE_INVALID_RESPONSE');
  const id=response.headers.get('x-request-id');return {bytes:b,request_id:id&&/^[A-Za-z0-9_.:-]{1,128}$/.test(id)?id:undefined};
 }};
}
